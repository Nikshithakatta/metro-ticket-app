const BASE = "/api";

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return data;
}

export const api = {
  health: () => request("/health"),
  stations: (q = "") => request(`/stations${q ? `?q=${encodeURIComponent(q)}` : ""}`),
  lines: () => request("/lines"),
  journey: (from, to) =>
    request(`/journey?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`),
  createBooking: (body) =>
    request("/bookings", { method: "POST", body: JSON.stringify(body) }),
  payBooking: (id) => request(`/bookings/${id}/pay`, { method: "POST", body: "{}" }),
  getTicket: (id) => request(`/tickets/${id}`),
  listBookings: () => request("/bookings"),
  validateTicket: (id) =>
    request(`/tickets/${id}/validate`, { method: "POST", body: "{}" }),
};
