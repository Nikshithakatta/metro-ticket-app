import { useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { api } from "../api.js";
import { useAuth } from "../auth.jsx";

function typeLabel(t) {
  if (t === "return") return "Return";
  if (t === "day_pass") return "Day pass";
  return "Single";
}

export default function HistoryPage() {
  const { ready, isLoggedIn } = useAuth();
  const [rows, setRows] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isLoggedIn) return;
    api
      .listBookings()
      .then(setRows)
      .catch((e) => setError(e.message));
  }, [isLoggedIn]);

  if (!ready) {
    return (
      <section className="section">
        <p className="muted">Loading…</p>
      </section>
    );
  }

  if (!isLoggedIn) {
    return <Navigate to="/login" replace state={{ from: "/history" }} />;
  }

  return (
    <section className="section fade-in">
      <h1 style={{ fontFamily: "var(--font-display)", letterSpacing: "-0.03em" }}>
        My tickets
      </h1>
      <p className="muted">Your personal booking history.</p>
      {error && <p className="error">{error}</p>}

      <div className="list-card" style={{ marginTop: "1.25rem" }}>
        {rows.length === 0 && !error && (
          <p className="muted" style={{ margin: 0 }}>
            No bookings yet.{" "}
            <Link to="/" style={{ color: "var(--cyan-deep)" }}>
              Book a journey
            </Link>
          </p>
        )}
        {rows.map((b) => (
          <div className="history-item" key={b.id}>
            <div>
              <strong>
                {b.from.name} → {b.to.name}
              </strong>
              <div className="muted" style={{ fontSize: "0.88rem" }}>
                {typeLabel(b.ticketType)} · {b.passengerName} · {b.fareDisplay} ·{" "}
                {new Date(b.createdAt).toLocaleString()}
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <span className={`status-badge status-${b.status}`}>{b.status}</span>
              {b.ticketId && (
                <div style={{ marginTop: "0.45rem" }}>
                  <Link
                    to={`/ticket/${b.ticketId}`}
                    style={{ color: "var(--cyan-deep)", fontWeight: 600 }}
                  >
                    View ticket
                  </Link>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
