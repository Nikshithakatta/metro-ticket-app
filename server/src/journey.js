import { db } from "./db.js";

/** BFS shortest path by hops; returns station ids or null. */
export function findPath(fromId, toId) {
  if (fromId === toId) return { path: [fromId], minutes: 0 };

  const edges = db.prepare("SELECT from_id, to_id, minutes FROM edges").all();
  const graph = new Map();
  for (const e of edges) {
    if (!graph.has(e.from_id)) graph.set(e.from_id, []);
    graph.get(e.from_id).push({ to: e.to_id, minutes: e.minutes });
  }

  const queue = [fromId];
  const prev = new Map([[fromId, null]]);
  const distMin = new Map([[fromId, 0]]);

  while (queue.length) {
    const cur = queue.shift();
    if (cur === toId) break;
    for (const { to, minutes } of graph.get(cur) || []) {
      if (prev.has(to)) continue;
      prev.set(to, cur);
      distMin.set(to, (distMin.get(cur) || 0) + minutes);
      queue.push(to);
    }
  }

  if (!prev.has(toId)) return null;

  const path = [];
  for (let at = toId; at; at = prev.get(at)) path.push(at);
  path.reverse();
  return { path, minutes: distMin.get(toId) || 0 };
}

export function hopsFarePaise(hops) {
  if (hops <= 0) return 1000;
  const rupees = 10 + Math.max(0, hops - 1) * 5;
  return rupees * 100;
}

/** @param {'single'|'return'|'day_pass'} ticketType */
export function fareForType(hops, ticketType) {
  if (ticketType === "day_pass") return 8000; // ₹80 flat
  const single = hopsFarePaise(hops);
  if (ticketType === "return") return Math.round(single * 1.8);
  return single;
}

export function validityForType(ticketType, fromDate = new Date()) {
  const validFrom = new Date(fromDate);
  let validTo;
  let maxUses = 1;
  if (ticketType === "return") {
    validTo = new Date(validFrom.getTime() + 240 * 60 * 1000);
    maxUses = 2;
  } else if (ticketType === "day_pass") {
    validTo = new Date(validFrom);
    validTo.setHours(23, 59, 59, 999);
    maxUses = 999;
  } else {
    validTo = new Date(validFrom.getTime() + 120 * 60 * 1000);
    maxUses = 1;
  }
  return { validFrom, validTo, maxUses };
}

export function enrichPath(stationIds) {
  const getStation = db.prepare("SELECT id, name, zone FROM stations WHERE id = ?");
  const getLines = db.prepare(`
    SELECT l.id, l.name, l.color, sl.seq
    FROM station_lines sl
    JOIN lines l ON l.id = sl.line_id
    WHERE sl.station_id = ?
  `);

  return stationIds.map((id) => {
    const s = getStation.get(id);
    const lines = getLines.all(id);
    return { ...s, lines };
  });
}

export function detectTransfers(enriched) {
  const transfers = [];
  for (let i = 1; i < enriched.length - 1; i++) {
    if (enriched[i].id === "central") {
      const arriveLine = enriched[i - 1].lines.find((l) =>
        enriched[i].lines.some((x) => x.id === l.id)
      );
      const leaveLine = enriched[i + 1].lines.find((l) =>
        enriched[i].lines.some((x) => x.id === l.id)
      );
      if (arriveLine && leaveLine && arriveLine.id !== leaveLine.id) {
        transfers.push(enriched[i].id);
      }
    }
  }
  return [...new Set(transfers)];
}

/** Demo crowd level from hour + zone */
export function crowdHint(stationId) {
  const station = db.prepare("SELECT * FROM stations WHERE id = ?").get(stationId);
  if (!station) return null;
  const hour = new Date().getHours();
  let level = "moderate";
  let label = "Steady";
  if ((hour >= 8 && hour <= 10) || (hour >= 17 && hour <= 20)) {
    level = station.zone >= 2 ? "busy" : "very_busy";
    label = level === "very_busy" ? "Very busy now" : "Busy now";
  } else if (hour >= 11 && hour <= 16) {
    level = "moderate";
    label = "Moderate";
  } else {
    level = "low";
    label = "Quiet now";
  }
  return { stationId, stationName: station.name, zone: station.zone, level, label, hour };
}

/** Next departures from a station using seeded headways */
export function nextTrains(stationId, limit = 3) {
  const rows = db
    .prepare(
      `
      SELECT sch.*, l.name AS line_name, l.color AS line_color, s.name AS station_name
      FROM schedules sch
      JOIN lines l ON l.id = sch.line_id
      JOIN stations s ON s.id = sch.station_id
      WHERE sch.station_id = ?
    `
    )
    .all(stationId);
  if (!rows.length) return [];

  const now = new Date();
  const minuteOfDay = now.getHours() * 60 + now.getMinutes();
  const results = [];

  for (const row of rows) {
    const times = [];
    for (let m = row.first_minute; m <= row.last_minute; m += row.headway_minutes) {
      if (m >= minuteOfDay) times.push(m);
      if (times.length >= limit) break;
    }
    // wrap to next day morning if needed
    if (times.length < limit) {
      for (let m = row.first_minute; times.length < limit; m += row.headway_minutes) {
        times.push(m + 24 * 60);
      }
    }
    for (const m of times.slice(0, limit)) {
      const abs = m % (24 * 60);
      const hh = String(Math.floor(abs / 60)).padStart(2, "0");
      const mm = String(abs % 60).padStart(2, "0");
      const minsUntil = m - minuteOfDay;
      results.push({
        lineId: row.line_id,
        lineName: row.line_name,
        lineColor: row.line_color,
        stationId: row.station_id,
        stationName: row.station_name,
        departure: `${hh}:${mm}`,
        minutesUntil: minsUntil < 0 ? minsUntil + 24 * 60 : minsUntil,
        headwayMinutes: row.headway_minutes,
      });
    }
  }

  return results.sort((a, b) => a.minutesUntil - b.minutesUntil).slice(0, limit);
}
