import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api.js";

export default function TicketPage() {
  const { id } = useParams();
  const [ticket, setTicket] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .getTicket(id)
      .then(setTicket)
      .catch((e) => setError(e.message));
  }, [id]);

  if (error) {
    return (
      <section className="section">
        <p className="error">{error}</p>
        <Link to="/">Back to booking</Link>
      </section>
    );
  }

  if (!ticket) {
    return (
      <section className="section">
        <p className="muted">Loading ticket…</p>
      </section>
    );
  }

  const b = ticket.booking;

  return (
    <section className="section fade-in">
      <div className="ticket-card">
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "1rem",
            flexWrap: "wrap",
          }}
        >
          <h1 style={{ margin: 0, fontFamily: "var(--font-display)" }}>
            Your ticket
          </h1>
          <span className={`status-badge status-${ticket.status}`}>
            {ticket.status}
          </span>
        </div>

        <div className="ticket-hero">
          <img src={ticket.qrDataUrl} alt="Ticket QR code" />
          <div>
            <div style={{ fontSize: "1.35rem", fontWeight: 700 }}>
              {b.from.name} → {b.to.name}
            </div>
            <p className="muted" style={{ margin: "0.35rem 0 0" }}>
              {b.passengerName} · {b.fareDisplay} · {b.hops} hops
            </p>
          </div>
        </div>

        <div className="row-2" style={{ marginTop: "0.5rem" }}>
          <div>
            <div className="muted" style={{ fontSize: "0.78rem" }}>
              TICKET ID
            </div>
            <code>{ticket.id}</code>
          </div>
          <div>
            <div className="muted" style={{ fontSize: "0.78rem" }}>
              VALID UNTIL
            </div>
            <div>{new Date(ticket.validTo).toLocaleString()}</div>
          </div>
        </div>

        <div className="actions">
          <Link className="btn btn-primary" style={{ width: "auto" }} to="/">
            Book another
          </Link>
          <Link className="btn btn-ghost" to="/validate">
            Open gate validator
          </Link>
        </div>
      </div>
    </section>
  );
}
