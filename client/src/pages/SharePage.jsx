import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api.js";

export default function SharePage() {
  const { token } = useParams();
  const [ticket, setTicket] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .getSharedTicket(token)
      .then(setTicket)
      .catch((e) => setError(e.message));
  }, [token]);

  if (error) {
    return (
      <section className="section">
        <p className="error">{error}</p>
        <Link to="/">Book a ticket</Link>
      </section>
    );
  }

  if (!ticket) {
    return (
      <section className="section">
        <p className="muted">Loading shared ticket…</p>
      </section>
    );
  }

  const b = ticket.booking;

  function downloadQr() {
    const a = document.createElement("a");
    a.href = ticket.qrDataUrl;
    a.download = `metrocity-${ticket.id}.png`;
    a.click();
  }

  return (
    <section className="section fade-in">
      <div className="ticket-card">
        <h1 style={{ marginTop: 0, fontFamily: "var(--font-display)" }}>
          Shared ticket
        </h1>
        <div className="ticket-hero">
          <img src={ticket.qrDataUrl} alt="Ticket QR code" />
          <div>
            <div style={{ fontSize: "1.35rem", fontWeight: 700 }}>
              {b.from.name} → {b.to.name}
            </div>
            <p className="muted" style={{ margin: "0.35rem 0 0" }}>
              {b.passengerName} · {b.fareDisplay} · {ticket.status}
            </p>
            <p className="muted" style={{ margin: "0.35rem 0 0" }}>
              Valid until {new Date(ticket.validTo).toLocaleString()}
            </p>
          </div>
        </div>
        <div className="actions">
          <button type="button" className="btn btn-primary" style={{ width: "auto" }} onClick={downloadQr}>
            Download QR
          </button>
          <Link className="btn btn-ghost" to="/">
            Book your own
          </Link>
        </div>
      </div>
    </section>
  );
}
