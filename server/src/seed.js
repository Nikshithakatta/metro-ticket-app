import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import bcrypt from "bcryptjs";
import { nanoid } from "nanoid";
import { db, resetSchema } from "./db.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
fs.mkdirSync(path.join(__dirname, "..", "data"), { recursive: true });

resetSchema();

const lines = [
  { id: "blue", name: "Blue Line", color: "#1B6CA8" },
  { id: "green", name: "Green Line", color: "#1F7A4D" },
];

const stations = [
  { id: "northgate", name: "Northgate", zone: 1 },
  { id: "lakeview", name: "Lakeview", zone: 1 },
  { id: "museum", name: "Museum", zone: 1 },
  { id: "central", name: "Central", zone: 1 },
  { id: "riverside", name: "Riverside", zone: 2 },
  { id: "techpark", name: "Tech Park", zone: 2 },
  { id: "airport", name: "Airport", zone: 3 },
  { id: "harbor", name: "Harbor", zone: 3 },
  { id: "university", name: "University", zone: 1 },
  { id: "market", name: "Market Square", zone: 1 },
  { id: "stadium", name: "Stadium", zone: 2 },
  { id: "eastend", name: "East End", zone: 2 },
  { id: "hillside", name: "Hillside", zone: 3 },
  { id: "meadows", name: "Meadows", zone: 3 },
];

const blueSeq = [
  "northgate",
  "lakeview",
  "museum",
  "central",
  "riverside",
  "techpark",
  "airport",
  "harbor",
];
const greenSeq = [
  "university",
  "market",
  "stadium",
  "central",
  "eastend",
  "hillside",
  "meadows",
];

const insertLine = db.prepare(
  "INSERT INTO lines (id, name, color) VALUES (@id, @name, @color)"
);
const insertStation = db.prepare(
  "INSERT INTO stations (id, name, zone) VALUES (@id, @name, @zone)"
);
const insertSL = db.prepare(
  "INSERT INTO station_lines (station_id, line_id, seq) VALUES (?, ?, ?)"
);
const insertEdge = db.prepare(
  "INSERT INTO edges (from_id, to_id, minutes) VALUES (?, ?, ?)"
);
const insertSched = db.prepare(
  `INSERT INTO schedules (line_id, station_id, headway_minutes, first_minute, last_minute)
   VALUES (?, ?, ?, ?, ?)`
);

const tx = db.transaction(() => {
  for (const l of lines) insertLine.run(l);
  for (const s of stations) insertStation.run(s);
  blueSeq.forEach((id, i) => insertSL.run(id, "blue", i + 1));
  greenSeq.forEach((id, i) => insertSL.run(id, "green", i + 1));

  function linkChain(seq) {
    for (let i = 0; i < seq.length - 1; i++) {
      insertEdge.run(seq[i], seq[i + 1], 3);
      insertEdge.run(seq[i + 1], seq[i], 3);
    }
  }
  linkChain(blueSeq);
  linkChain(greenSeq);

  // Headways: blue every 5 min, green every 6 min; service ~05:30–23:00
  for (const id of blueSeq) insertSched.run("blue", id, 5, 330, 1380);
  for (const id of greenSeq) insertSched.run("green", id, 6, 330, 1380);

  const demoId = `usr_${nanoid(8)}`;
  db.prepare(
    `INSERT INTO users (id, email, password_hash, name, created_at) VALUES (?, ?, ?, ?, ?)`
  ).run(
    demoId,
    "demo@metrocity.local",
    bcrypt.hashSync("demo1234", 10),
    "Demo Rider",
    new Date().toISOString()
  );
});

tx();

console.log(
  `Seeded MetroCity: ${stations.length} stations, ${lines.length} lines, schedules + demo user demo@metrocity.local / demo1234`
);
