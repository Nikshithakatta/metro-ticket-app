import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { db, initSchema } from "./db.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, "..", "data");
fs.mkdirSync(dataDir, { recursive: true });

initSchema();

db.exec(`
  DELETE FROM tickets;
  DELETE FROM bookings;
  DELETE FROM edges;
  DELETE FROM station_lines;
  DELETE FROM stations;
  DELETE FROM lines;
`);

const lines = [
  { id: "blue", name: "Blue Line", color: "#1B6CA8" },
  { id: "green", name: "Green Line", color: "#1F7A4D" },
];

const stations = [
  // Blue line (seq 1..8), Central is interchange
  { id: "northgate", name: "Northgate", zone: 1 },
  { id: "lakeview", name: "Lakeview", zone: 1 },
  { id: "museum", name: "Museum", zone: 1 },
  { id: "central", name: "Central", zone: 1 },
  { id: "riverside", name: "Riverside", zone: 2 },
  { id: "techpark", name: "Tech Park", zone: 2 },
  { id: "airport", name: "Airport", zone: 3 },
  { id: "harbor", name: "Harbor", zone: 3 },
  // Green line extras
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

const tx = db.transaction(() => {
  for (const l of lines) insertLine.run(l);
  for (const s of stations) insertStation.run(s);
  blueSeq.forEach((id, i) => insertSL.run(id, "blue", i + 1));
  greenSeq.forEach((id, i) => insertSL.run(id, "green", i + 1));

  function linkChain(seq) {
    for (let i = 0; i < seq.length - 1; i++) {
      const a = seq[i];
      const b = seq[i + 1];
      insertEdge.run(a, b, 3);
      insertEdge.run(b, a, 3);
    }
  }
  linkChain(blueSeq);
  linkChain(greenSeq);
});

tx();

console.log(
  `Seeded MetroCity: ${stations.length} stations, ${lines.length} lines.`
);
