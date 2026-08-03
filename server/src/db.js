import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, "..", "data");
fs.mkdirSync(dataDir, { recursive: true });
const dbPath = path.join(dataDir, "metro.db");

export const db = new Database(dbPath);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

export function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS lines (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      color TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS stations (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      zone INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS station_lines (
      station_id TEXT NOT NULL REFERENCES stations(id),
      line_id TEXT NOT NULL REFERENCES lines(id),
      seq INTEGER NOT NULL,
      PRIMARY KEY (station_id, line_id)
    );

    CREATE TABLE IF NOT EXISTS edges (
      from_id TEXT NOT NULL REFERENCES stations(id),
      to_id TEXT NOT NULL REFERENCES stations(id),
      minutes INTEGER NOT NULL DEFAULT 3,
      PRIMARY KEY (from_id, to_id)
    );

    CREATE TABLE IF NOT EXISTS bookings (
      id TEXT PRIMARY KEY,
      passenger_name TEXT NOT NULL,
      from_station_id TEXT NOT NULL REFERENCES stations(id),
      to_station_id TEXT NOT NULL REFERENCES stations(id),
      hops INTEGER NOT NULL,
      fare_paise INTEGER NOT NULL,
      path_json TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('pending','paid','cancelled')),
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tickets (
      id TEXT PRIMARY KEY,
      booking_id TEXT NOT NULL UNIQUE REFERENCES bookings(id),
      qr_payload TEXT NOT NULL,
      signature TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('active','used','expired')),
      valid_from TEXT NOT NULL,
      valid_to TEXT NOT NULL,
      used_at TEXT
    );
  `);
}
