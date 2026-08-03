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

export function resetSchema() {
  db.exec(`
    DROP TABLE IF EXISTS ticket_scans;
    DROP TABLE IF EXISTS tickets;
    DROP TABLE IF EXISTS bookings;
    DROP TABLE IF EXISTS schedules;
    DROP TABLE IF EXISTS edges;
    DROP TABLE IF EXISTS station_lines;
    DROP TABLE IF EXISTS stations;
    DROP TABLE IF EXISTS lines;
    DROP TABLE IF EXISTS users;
  `);
  initSchema();
}

export function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

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

    CREATE TABLE IF NOT EXISTS schedules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      line_id TEXT NOT NULL REFERENCES lines(id),
      station_id TEXT NOT NULL REFERENCES stations(id),
      headway_minutes INTEGER NOT NULL DEFAULT 6,
      first_minute INTEGER NOT NULL DEFAULT 330,
      last_minute INTEGER NOT NULL DEFAULT 1380
    );

    CREATE TABLE IF NOT EXISTS bookings (
      id TEXT PRIMARY KEY,
      user_id TEXT REFERENCES users(id),
      passenger_name TEXT NOT NULL,
      ticket_type TEXT NOT NULL CHECK (ticket_type IN ('single','return','day_pass')),
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
      ticket_type TEXT NOT NULL,
      share_token TEXT NOT NULL UNIQUE,
      qr_payload TEXT NOT NULL,
      signature TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('active','used','expired')),
      max_uses INTEGER NOT NULL DEFAULT 1,
      uses_count INTEGER NOT NULL DEFAULT 0,
      valid_from TEXT NOT NULL,
      valid_to TEXT NOT NULL,
      used_at TEXT
    );
  `);

  // Lightweight migrations for DBs created before this schema
  migrateColumns("bookings", {
    user_id: "TEXT",
    ticket_type: "TEXT NOT NULL DEFAULT 'single'",
  });
  migrateColumns("tickets", {
    ticket_type: "TEXT NOT NULL DEFAULT 'single'",
    share_token: "TEXT",
    max_uses: "INTEGER NOT NULL DEFAULT 1",
    uses_count: "INTEGER NOT NULL DEFAULT 0",
  });
}

function migrateColumns(table, cols) {
  const existing = new Set(
    db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name)
  );
  for (const [name, ddl] of Object.entries(cols)) {
    if (!existing.has(name)) {
      try {
        db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${ddl}`);
      } catch {
        /* ignore */
      }
    }
  }
}
