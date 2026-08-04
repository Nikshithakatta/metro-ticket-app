const BASE = "/api";
const TOKEN_KEY = "metrocity_token";

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

async function request(path, options = {}) {
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };
  const token = getToken();
  if (token && !headers.Authorization) {
    headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return data;
}

export const api = {
  health: () => request("/health"),
  register: (body) =>
    request("/auth/register", { method: "POST", body: JSON.stringify(body) }),
  login: (body) =>
    request("/auth/login", { method: "POST", body: JSON.stringify(body) }),
  me: () => request("/auth/me"),
  stations: (q = "") =>
    request(`/stations${q ? `?q=${encodeURIComponent(q)}` : ""}`),
  lines: () => request("/lines"),
  crowd: (id) => request(`/stations/${id}/crowd`),
  nextTrains: (id, limit = 3) =>
    request(`/stations/${id}/next-trains?limit=${limit}`),
  journey: (from, to, ticketType = "single") =>
    request(
      `/journey?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&ticketType=${encodeURIComponent(ticketType)}`
    ),
  createBooking: (body) =>
    request("/bookings", { method: "POST", body: JSON.stringify(body) }),
  payBooking: (id) => request(`/bookings/${id}/pay`, { method: "POST", body: "{}" }),
  getTicket: (id) => request(`/tickets/${id}`),
  getSharedTicket: (token) => request(`/share/${token}`),
  listBookings: () => request("/bookings"),
  getFavorites: () => request("/me/favorites"),
  setFavorites: (body) =>
    request("/me/favorites", { method: "PUT", body: JSON.stringify(body) }),
  lastTrip: () => request("/me/last-trip"),
  validateTicket: (id) =>
    request(`/tickets/${id}/validate`, { method: "POST", body: "{}" }),
};
