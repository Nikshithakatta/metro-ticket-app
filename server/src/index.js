import express from "express";
import cors from "cors";
import { nanoid } from "nanoid";
import QRCode from "qrcode";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { db, initSchema } from "./db.js";
import {
  findPath,
  hopsFarePaise,
  enrichPath,
  detectTransfers,
} from "./journey.js";
import {
  signTicket,
  verifyTicketSignature,
  buildQrPayload,
} from "./tickets.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

fs.mkdirSync(path.join(__dirname, "..", "data"), { recursive: true });
initSchema();

const stationCount = db.prepare("SELECT COUNT(*) AS c FROM stations").get().c;
if (stationCount === 0) {
  console.log("No stations found — run: npm run seed");
}

const app = express();
const PORT = process.env.PORT || 4040;
const clientDist = path.resolve(__dirname, "../../client/dist");

app.use(cors());
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, city: "MetroCity" });
});

app.get("/api/stations", (req, res) => {
  const q = (req.query.q || "").toString().trim().toLowerCase();
  let rows = db
    .prepare(
      `
      SELECT s.id, s.name, s.zone,
        GROUP_CONCAT(l.name, '|') AS line_names,
        GROUP_CONCAT(l.color, '|') AS line_colors,
        GROUP_CONCAT(l.id, '|') AS line_ids
      FROM stations s
      JOIN station_lines sl ON sl.station_id = s.id
      JOIN lines l ON l.id = sl.line_id
      GROUP BY s.id
      ORDER BY s.name
    `
    )
    .all();

  if (q) {
    rows = rows.filter(
      (r) => r.name.toLowerCase().includes(q) || r.id.includes(q)
    );
  }

  res.json(
    rows.map((r) => ({
      id: r.id,
      name: r.name,
      zone: r.zone,
      lines: r.line_ids.split("|").map((id, i) => ({
        id,
        name: r.line_names.split("|")[i],
        color: r.line_colors.split("|")[i],
      })),
    }))
  );
});

app.get("/api/lines", (_req, res) => {
  const lines = db.prepare("SELECT id, name, color FROM lines ORDER BY name").all();
  const result = lines.map((line) => {
    const stations = db
      .prepare(
        `
        SELECT s.id, s.name, s.zone, sl.seq
        FROM station_lines sl
        JOIN stations s ON s.id = sl.station_id
        WHERE sl.line_id = ?
        ORDER BY sl.seq
      `
      )
      .all(line.id);
    return { ...line, stations };
  });
  res.json(result);
});

app.get("/api/journey", (req, res) => {
  const from = (req.query.from || "").toString();
  const to = (req.query.to || "").toString();
  if (!from || !to) {
    return res.status(400).json({ error: "from and to are required" });
  }
  if (from === to) {
    return res.status(400).json({ error: "from and to must differ" });
  }

  const fromS = db.prepare("SELECT * FROM stations WHERE id = ?").get(from);
  const toS = db.prepare("SELECT * FROM stations WHERE id = ?").get(to);
  if (!fromS || !toS) {
    return res.status(404).json({ error: "Unknown station" });
  }

  const result = findPath(from, to);
  if (!result) {
    return res.status(404).json({ error: "No route found" });
  }

  const hops = Math.max(0, result.path.length - 1);
  const farePaise = hopsFarePaise(hops);
  const stations = enrichPath(result.path);
  const transfers = detectTransfers(stations);

  res.json({
    from: fromS,
    to: toS,
    path: result.path,
    stations,
    hops,
    minutes: result.minutes + transfers.length * 4,
    transfers,
    farePaise,
    fareDisplay: `₹${(farePaise / 100).toFixed(0)}`,
  });
});

app.post("/api/bookings", (req, res) => {
  const { from, to, passengerName } = req.body || {};
  const name = (passengerName || "Guest").toString().trim().slice(0, 80) || "Guest";
  if (!from || !to) {
    return res.status(400).json({ error: "from and to are required" });
  }
  if (from === to) {
    return res.status(400).json({ error: "from and to must differ" });
  }

  const result = findPath(from, to);
  if (!result) {
    return res.status(404).json({ error: "No route found" });
  }

  const hops = Math.max(0, result.path.length - 1);
  const farePaise = hopsFarePaise(hops);
  const id = `bk_${nanoid(10)}`;
  const createdAt = new Date().toISOString();

  db.prepare(
    `
    INSERT INTO bookings
      (id, passenger_name, from_station_id, to_station_id, hops, fare_paise, path_json, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?)
  `
  ).run(
    id,
    name,
    from,
    to,
    hops,
    farePaise,
    JSON.stringify(result.path),
    createdAt
  );

  const booking = getBooking(id);
  res.status(201).json(booking);
});

app.get("/api/bookings/:id", (req, res) => {
  const booking = getBooking(req.params.id);
  if (!booking) return res.status(404).json({ error: "Booking not found" });
  res.json(booking);
});

app.post("/api/bookings/:id/pay", async (req, res) => {
  const booking = db
    .prepare("SELECT * FROM bookings WHERE id = ?")
    .get(req.params.id);
  if (!booking) return res.status(404).json({ error: "Booking not found" });
  if (booking.status === "paid") {
    const existing = getTicketByBooking(booking.id);
    return res.json({ booking: getBooking(booking.id), ticket: existing });
  }
  if (booking.status !== "pending") {
    return res.status(400).json({ error: `Cannot pay booking in status ${booking.status}` });
  }

  // Mock payment always succeeds
  const ticketId = `tk_${nanoid(10)}`;
  const validFrom = new Date();
  const validTo = new Date(validFrom.getTime() + 120 * 60 * 1000); // 120 minutes
  const signature = signTicket(ticketId, validTo.toISOString());
  const ticketRow = {
    id: ticketId,
    booking_id: booking.id,
    signature,
    status: "active",
    valid_from: validFrom.toISOString(),
    valid_to: validTo.toISOString(),
  };
  const qrPayload = buildQrPayload(ticketRow);

  const tx = db.transaction(() => {
    db.prepare("UPDATE bookings SET status = 'paid' WHERE id = ?").run(booking.id);
    db.prepare(
      `
      INSERT INTO tickets
        (id, booking_id, qr_payload, signature, status, valid_from, valid_to)
      VALUES (?, ?, ?, ?, 'active', ?, ?)
    `
    ).run(
      ticketId,
      booking.id,
      qrPayload,
      signature,
      validFrom.toISOString(),
      validTo.toISOString()
    );
  });
  tx();

  const ticket = await formatTicket(ticketId);
  res.json({ booking: getBooking(booking.id), ticket });
});

app.get("/api/tickets/:id", async (req, res) => {
  const ticket = await formatTicket(req.params.id);
  if (!ticket) return res.status(404).json({ error: "Ticket not found" });
  res.json(ticket);
});

app.get("/api/bookings", (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 20, 50);
  const rows = db
    .prepare(
      `
      SELECT b.*, t.id AS ticket_id, t.status AS ticket_status
      FROM bookings b
      LEFT JOIN tickets t ON t.booking_id = b.id
      ORDER BY b.created_at DESC
      LIMIT ?
    `
    )
    .all(limit);

  res.json(
    rows.map((r) => ({
      ...shapeBooking(r),
      ticketId: r.ticket_id || null,
      ticketStatus: r.ticket_status || null,
    }))
  );
});

/** Gate simulator: mark ticket used once. */
app.post("/api/tickets/:id/validate", (req, res) => {
  const row = db.prepare("SELECT * FROM tickets WHERE id = ?").get(req.params.id);
  if (!row) return res.status(404).json({ error: "Ticket not found" });

  const now = new Date();
  if (new Date(row.valid_to) < now) {
    db.prepare("UPDATE tickets SET status = 'expired' WHERE id = ? AND status = 'active'").run(
      row.id
    );
    return res.status(400).json({ ok: false, error: "Ticket expired" });
  }

  if (!verifyTicketSignature(row.id, row.valid_to, row.signature)) {
    return res.status(400).json({ ok: false, error: "Invalid signature" });
  }

  if (row.status === "used") {
    return res.status(409).json({ ok: false, error: "Ticket already used" });
  }
  if (row.status !== "active") {
    return res.status(400).json({ ok: false, error: `Ticket is ${row.status}` });
  }

  const usedAt = now.toISOString();
  db.prepare("UPDATE tickets SET status = 'used', used_at = ? WHERE id = ?").run(
    usedAt,
    row.id
  );

  res.json({ ok: true, ticketId: row.id, usedAt });
});

function getBooking(id) {
  const row = db.prepare("SELECT * FROM bookings WHERE id = ?").get(id);
  if (!row) return null;
  return shapeBooking(row);
}

function shapeBooking(row) {
  const from = db
    .prepare("SELECT id, name, zone FROM stations WHERE id = ?")
    .get(row.from_station_id);
  const to = db
    .prepare("SELECT id, name, zone FROM stations WHERE id = ?")
    .get(row.to_station_id);
  return {
    id: row.id,
    passengerName: row.passenger_name,
    from,
    to,
    hops: row.hops,
    farePaise: row.fare_paise,
    fareDisplay: `₹${(row.fare_paise / 100).toFixed(0)}`,
    path: JSON.parse(row.path_json),
    status: row.status,
    createdAt: row.created_at,
  };
}

function getTicketByBooking(bookingId) {
  const row = db
    .prepare("SELECT id FROM tickets WHERE booking_id = ?")
    .get(bookingId);
  return row ? row.id : null;
}

async function formatTicket(id) {
  const row = db.prepare("SELECT * FROM tickets WHERE id = ?").get(id);
  if (!row) return null;

  // Lazy expire
  if (row.status === "active" && new Date(row.valid_to) < new Date()) {
    db.prepare("UPDATE tickets SET status = 'expired' WHERE id = ?").run(id);
    row.status = "expired";
  }

  const booking = getBooking(row.booking_id);
  const qrDataUrl = await QRCode.toDataURL(row.qr_payload, {
    errorCorrectionLevel: "M",
    margin: 1,
    width: 280,
  });

  return {
    id: row.id,
    bookingId: row.booking_id,
    status: row.status,
    validFrom: row.valid_from,
    validTo: row.valid_to,
    usedAt: row.used_at,
    qrPayload: row.qr_payload,
    qrDataUrl,
    booking,
  };
}

// Production: serve built React app when client/dist exists
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get(/^\/(?!api).*/, (_req, res) => {
    res.sendFile(path.join(clientDist, "index.html"));
  });
} else {
  app.get("/", (_req, res) => {
    res
      .status(200)
      .type("text")
      .send(
        "MetroCity API is running. UI: npm run dev in client/ (http://localhost:5173) or build client then restart."
      );
  });
}

app.listen(PORT, "0.0.0.0", () => {
  console.log(`MetroCity API listening on http://0.0.0.0:${PORT}`);
  if (fs.existsSync(clientDist)) {
    console.log(`Serving UI from ${clientDist}`);
  }
});
