import { db } from "./db.js";

/** BFS shortest path by hops; returns station ids or null. */
export function findPath(fromId, toId) {
  if (fromId === toId) return [fromId];

  const edges = db
    .prepare("SELECT from_id, to_id, minutes FROM edges")
    .all();
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
  // Base ₹10 + ₹5 per hop after first
  if (hops <= 0) return 1000;
  const rupees = 10 + Math.max(0, hops - 1) * 5;
  return rupees * 100;
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
    const prevLines = new Set(enriched[i - 1].lines.map((l) => l.id));
    const nextLines = new Set(enriched[i + 1].lines.map((l) => l.id));
    const here = enriched[i].lines.map((l) => l.id);
    const connectsPrev = here.some((id) => prevLines.has(id));
    const connectsNext = here.some((id) => nextLines.has(id));
    const shared = here.filter((id) => prevLines.has(id) && nextLines.has(id));
    if (connectsPrev && connectsNext && shared.length === 0 && here.length > 1) {
      transfers.push(enriched[i].id);
    } else if (enriched[i].id === "central") {
      // Interchange hub: transfer if arriving and leaving on different lines
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
