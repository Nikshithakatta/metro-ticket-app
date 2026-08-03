#!/usr/bin/env node
/**
 * API smoke checks for CI / local verification.
 * Expects the server to already be listening (BASE_URL).
 */
const BASE = (process.env.BASE_URL || "http://127.0.0.1:4040").replace(/\/$/, "");

async function req(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  if (!res.ok) {
    throw new Error(`${options.method || "GET"} ${path} -> ${res.status}: ${text}`);
  }
  return data;
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function main() {
  console.log(`Smoke against ${BASE}`);

  const health = await req("/api/health");
  assert(health.ok === true, "health.ok");

  const stations = await req("/api/stations");
  assert(Array.isArray(stations) && stations.length >= 2, "stations list");

  const journey = await req("/api/journey?from=university&to=airport");
  assert(journey.farePaise > 0, "journey fare");
  assert(journey.path?.includes("central"), "journey via central");

  const booking = await req("/api/bookings", {
    method: "POST",
    body: JSON.stringify({
      from: "university",
      to: "airport",
      passengerName: "CI Rider",
    }),
  });
  assert(booking.id?.startsWith("bk_"), "booking id");
  assert(booking.status === "pending", "booking pending");

  const paid = await req(`/api/bookings/${booking.id}/pay`, {
    method: "POST",
    body: "{}",
  });
  assert(paid.ticket?.id?.startsWith("tk_"), "ticket id");
  assert(paid.ticket.status === "active", "ticket active");
  assert(paid.booking.status === "paid", "booking paid");

  const validated = await req(`/api/tickets/${paid.ticket.id}/validate`, {
    method: "POST",
    body: "{}",
  });
  assert(validated.ok === true, "validate ok");

  let reuseRejected = false;
  try {
    await req(`/api/tickets/${paid.ticket.id}/validate`, {
      method: "POST",
      body: "{}",
    });
  } catch {
    reuseRejected = true;
  }
  assert(reuseRejected, "reuse must be rejected");

  console.log("Smoke OK");
}

main().catch((err) => {
  console.error("Smoke FAILED:", err.message);
  process.exit(1);
});
