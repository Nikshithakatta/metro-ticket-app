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
  fareForType,
  validityForType,
  enrichPath,
  detectTransfers,
  crowdHint,
  nextTrains,
} from "./journey.js";
import {
  signTicket,
  verifyTicketSignature,
  buildQrPayload,
} from "./tickets.js";
import {
  registerUser,
  loginUser,
  issueToken,
  authOptional,
  authRequired,
} from "./auth.js";

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
app.use(authOptional);

const TICKET_TYPES = new Set(["single", "return", "day_pass"]);

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, city: "MetroCity" });
});

app.post("/api/auth/register", (req, res) => {
  try {
    const user = registerUser(req.body || {});
    const token = issueToken(user);
    res.status(201).json({ user, token });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

app.post("/api/auth/login", (req, res) => {
  try {
    const user = loginUser(req.body || {});
    const token = issueToken(user);
    res.json({ user, token });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

app.get("/api/auth/me", authRequired, (req, res) => {
  res.json({ user: req.user });
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

app.get("/api/stations/:id/crowd", (req, res) => {
  const hint = crowdHint(req.params.id);
  if (!hint) return res.status(404).json({ error: "Unknown station" });
  res.json(hint);
});

app.get("/api/stations/:id/next-trains", (req, res) => {
  const station = db
    .prepare("SELECT id FROM stations WHERE id = ?")
    .get(req.params.id);
  if (!station) return res.status(404).json({ error: "Unknown station" });
  const limit = Math.min(Number(req.query.limit) || 3, 8);
  res.json({ stationId: req.params.id, trains: nextTrains(req.params.id, limit) });
});

app.get("/api/journey", (req, res) => {
  const from = (req.query.from || "").toString();
  const to = (req.query.to || "").toString();
  const ticketType = normalizeTicketType(req.query.ticketType || req.query.type);

  if (!from || !to) {
    return res.status(400).json({ error: "from and to are required" });
  }
  if (ticketType !== "day_pass" && from === to) {
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
  const farePaise = fareForType(hops, ticketType);
  const stations = enrichPath(result.path);
  const transfers = detectTransfers(stations);
  const validity = validityForType(ticketType);

  res.json({
    from: fromS,
    to: toS,
    ticketType,
    path: result.path,
    stations,
    hops,
    minutes: result.minutes + transfers.length * 4,
    transfers,
    farePaise,
    fareDisplay: `₹${(farePaise / 100).toFixed(0)}`,
    validMinutes:
      ticketType === "day_pass"
        ? null
        : Math.round((validity.validTo - validity.validFrom) / 60000),
    maxUses: validity.maxUses,
  });
});

app.post("/api/bookings", (req, res) => {
  const { from, to, passengerName, ticketType: rawType } = req.body || {};
  const ticketType = normalizeTicketType(rawType);
  const name =
    (passengerName || req.user?.name || "Guest").toString().trim().slice(0, 80) ||
    "Guest";

  if (!from || !to) {
    return res.status(400).json({ error: "from and to are required" });
  }
  if (ticketType !== "day_pass" && from === to) {
    return res.status(400).json({ error: "from and to must differ" });
  }

  const result = findPath(from, to);
  if (!result) {
    return res.status(404).json({ error: "No route found" });
  }

  const hops = Math.max(0, result.path.length - 1);
  const farePaise = fareForType(hops, ticketType);
  const id = `bk_${nanoid(10)}`;
  const createdAt = new Date().toISOString();
  const userId = req.user?.id || null;

  db.prepare(
    `
    INSERT INTO bookings
      (id, user_id, passenger_name, ticket_type, from_station_id, to_station_id,
       hops, fare_paise, path_json, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)
  `
  ).run(
    id,
    userId,
    name,
    ticketType,
    from,
    to,
    hops,
    farePaise,
    JSON.stringify(result.path),
    createdAt
  );

  res.status(201).json(getBooking(id));
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
    const existingId = getTicketIdByBooking(booking.id);
    return res.json({
      booking: getBooking(booking.id),
      ticket: await formatTicket(existingId),
    });
  }
  if (booking.status !== "pending") {
    return res
      .status(400)
      .json({ error: `Cannot pay booking in status ${booking.status}` });
  }

  const ticketType = booking.ticket_type || "single";
  const { validFrom, validTo, maxUses } = validityForType(ticketType);
  const ticketId = `tk_${nanoid(10)}`;
  const shareToken = nanoid(16);
  const signature = signTicket(ticketId, validTo.toISOString());
  const ticketRow = {
    id: ticketId,
    booking_id: booking.id,
    ticket_type: ticketType,
    share_token: shareToken,
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
        (id, booking_id, ticket_type, share_token, qr_payload, signature, status,
         max_uses, uses_count, valid_from, valid_to)
      VALUES (?, ?, ?, ?, ?, ?, 'active', ?, 0, ?, ?)
    `
    ).run(
      ticketId,
      booking.id,
      ticketType,
      shareToken,
      qrPayload,
      signature,
      maxUses,
      validFrom.toISOString(),
      validTo.toISOString()
    );
  });
  tx();

  res.json({
    booking: getBooking(booking.id),
    ticket: await formatTicket(ticketId),
  });
});

app.get("/api/tickets/:id", async (req, res) => {
  const ticket = await formatTicket(req.params.id);
  if (!ticket) return res.status(404).json({ error: "Ticket not found" });
  res.json(ticket);
});

app.get("/api/share/:token", async (req, res) => {
  const row = db
    .prepare("SELECT id FROM tickets WHERE share_token = ?")
    .get(req.params.token);
  if (!row) return res.status(404).json({ error: "Shared ticket not found" });
  res.json(await formatTicket(row.id));
});

app.get("/api/bookings", authRequired, (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 20, 50);
  const rows = db
    .prepare(
      `
      SELECT b.*, t.id AS ticket_id, t.status AS ticket_status, t.share_token
      FROM bookings b
      LEFT JOIN tickets t ON t.booking_id = b.id
      WHERE b.user_id = ?
      ORDER BY b.created_at DESC
      LIMIT ?
    `
    )
    .all(req.user.id, limit);

  res.json(
    rows.map((r) => ({
      ...shapeBooking(r),
      ticketId: r.ticket_id || null,
      ticketStatus: r.ticket_status || null,
      shareToken: r.share_token || null,
    }))
  );
});

/** Gate simulator: consume one use; mark used when max reached. */
app.post("/api/tickets/:id/validate", (req, res) => {
  const row = db.prepare("SELECT * FROM tickets WHERE id = ?").get(req.params.id);
  if (!row) return res.status(404).json({ error: "Ticket not found" });

  const now = new Date();
  if (new Date(row.valid_to) < now) {
    db.prepare(
      "UPDATE tickets SET status = 'expired' WHERE id = ? AND status = 'active'"
    ).run(row.id);
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

  const maxUses = row.max_uses ?? 1;
  const usesCount = (row.uses_count || 0) + 1;
  const usedAt = now.toISOString();
  const exhausted = usesCount >= maxUses;

  db.prepare(
    `
    UPDATE tickets
    SET uses_count = ?, status = ?, used_at = ?
    WHERE id = ?
  `
  ).run(usesCount, exhausted ? "used" : "active", usedAt, row.id);

  res.json({
    ok: true,
    ticketId: row.id,
    usedAt,
    usesCount,
    maxUses,
    remainingUses: Math.max(0, maxUses - usesCount),
    status: exhausted ? "used" : "active",
  });
});

function normalizeTicketType(raw) {
  const t = (raw || "single").toString();
  return TICKET_TYPES.has(t) ? t : "single";
}

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
    userId: row.user_id || null,
    passengerName: row.passenger_name,
    ticketType: row.ticket_type || "single",
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

function getTicketIdByBooking(bookingId) {
  const row = db
    .prepare("SELECT id FROM tickets WHERE booking_id = ?")
    .get(bookingId);
  return row ? row.id : null;
}

async function formatTicket(id) {
  if (!id) return null;
  const row = db.prepare("SELECT * FROM tickets WHERE id = ?").get(id);
  if (!row) return null;

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

  const sharePath = `/share/${row.share_token}`;

  return {
    id: row.id,
    bookingId: row.booking_id,
    ticketType: row.ticket_type || booking?.ticketType || "single",
    status: row.status,
    maxUses: row.max_uses ?? 1,
    usesCount: row.uses_count || 0,
    remainingUses: Math.max(0, (row.max_uses ?? 1) - (row.uses_count || 0)),
    validFrom: row.valid_from,
    validTo: row.valid_to,
    usedAt: row.used_at,
    shareToken: row.share_token,
    sharePath,
    qrPayload: row.qr_payload,
    qrDataUrl,
    booking,
  };
}

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
