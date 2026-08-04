#!/usr/bin/env node
/**
 * API smoke checks for CI / local verification.
 * Expects the server to already be listening (BASE_URL).
 */
const BASE = (process.env.BASE_URL || "http://127.0.0.1:4040").replace(/\/$/, "");

async function req(path, options = {}) {
  const { headers: extraHeaders, ...rest } = options;
  const res = await fetch(`${BASE}${path}`, {
    ...rest,
    headers: {
      "Content-Type": "application/json",
      ...(extraHeaders || {}),
    },
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

  const stations = await req("/api/stations?q=cent");
  assert(Array.isArray(stations) && stations.some((s) => s.id === "central"), "station search");

  const crowd = await req("/api/stations/central/crowd");
  assert(crowd.level, "crowd hint");

  const next = await req("/api/stations/central/next-trains");
  assert(Array.isArray(next.trains) && next.trains.length > 0, "next trains");

  const journey = await req("/api/journey?from=university&to=airport&ticketType=return");
  assert(journey.farePaise > 0, "journey fare");
  assert(journey.ticketType === "return", "return type");
  assert(journey.path?.includes("central"), "journey via central");

  const email = `ci_${Date.now()}@metrocity.local`;
  const registered = await req("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({
      email,
      password: "ci123456",
      name: "CI Rider",
    }),
  });
  assert(registered.token, "register token");
  const auth = { Authorization: `Bearer ${registered.token}` };

  const booking = await req("/api/bookings", {
    method: "POST",
    headers: auth,
    body: JSON.stringify({
      from: "university",
      to: "airport",
      passengerName: "CI Rider",
      ticketType: "return",
    }),
  });
  assert(booking.id?.startsWith("bk_"), "booking id");
  assert(booking.ticketType === "return", "booking return");
  assert(booking.status === "pending", "booking pending");

  const paid = await req(`/api/bookings/${booking.id}/pay`, {
    method: "POST",
    headers: auth,
    body: "{}",
  });
  assert(paid.ticket?.id?.startsWith("tk_"), "ticket id");
  assert(paid.ticket.status === "active", "ticket active");
  assert(paid.ticket.maxUses === 2, "return max uses");
  assert(paid.ticket.shareToken, "share token");
  assert(paid.booking.status === "paid", "booking paid");

  const shared = await req(`/api/share/${paid.ticket.shareToken}`);
  assert(shared.id === paid.ticket.id, "share lookup");

  const v1 = await req(`/api/tickets/${paid.ticket.id}/validate`, {
    method: "POST",
    body: "{}",
  });
  assert(v1.ok === true && v1.remainingUses === 1, "first validate");

  const v2 = await req(`/api/tickets/${paid.ticket.id}/validate`, {
    method: "POST",
    body: "{}",
  });
  assert(v2.ok === true && v2.status === "used", "second validate uses up");

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

  const history = await req("/api/bookings", { headers: auth });
  assert(Array.isArray(history) && history.some((b) => b.id === booking.id), "personal history");

  const favEmpty = await req("/api/me/favorites", { headers: auth });
  assert(favEmpty.home === null && favEmpty.work === null, "favorites start empty");

  const favSaved = await req("/api/me/favorites", {
    method: "PUT",
    headers: auth,
    body: JSON.stringify({ home: "university", work: "airport" }),
  });
  assert(favSaved.home?.id === "university", "home favorite");
  assert(favSaved.work?.id === "airport", "work favorite");

  const last = await req("/api/me/last-trip", { headers: auth });
  assert(last.trip?.from?.id === "university", "last trip from");
  assert(last.trip?.to?.id === "airport", "last trip to");
  assert(last.trip?.ticketType === "return", "last trip type");

  const day = await req("/api/bookings", {
    method: "POST",
    headers: auth,
    body: JSON.stringify({
      from: "central",
      to: "central",
      ticketType: "day_pass",
      passengerName: "CI Rider",
    }),
  });
  assert(day.ticketType === "day_pass", "day pass booking");
  assert(day.farePaise === 8000, "day pass fare");

  console.log("Smoke OK");
}

main().catch((err) => {
  console.error("Smoke FAILED:", err.message);
  process.exit(1);
});
