import { useState } from "react";
import { api } from "../api.js";

export default function ValidatePage() {
  const [ticketId, setTicketId] = useState("");
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onValidate(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const res = await api.validateTicket(ticketId.trim());
      setResult(res);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="section fade-in">
      <h1 style={{ fontFamily: "var(--font-display)", letterSpacing: "-0.03em" }}>
        Gate validator
      </h1>
      <p className="muted">
        Simulate a station gate. Paste a ticket id. Single = 1 use, return = 2,
        day pass = many until midnight.
      </p>

      <form
        className="list-card"
        style={{ marginTop: "1.25rem", maxWidth: 520 }}
        onSubmit={onValidate}
      >
        <div className="field">
          <label htmlFor="tid">Ticket ID</label>
          <input
            id="tid"
            value={ticketId}
            onChange={(e) => setTicketId(e.target.value)}
            placeholder="tk_..."
            required
          />
        </div>
        <button className="btn btn-primary" disabled={busy || !ticketId.trim()}>
          {busy ? "Checking…" : "Validate & mark used"}
        </button>
        {error && <p className="error">{error}</p>}
        {result?.ok && (
          <p style={{ color: "var(--ok)", fontWeight: 600, marginBottom: 0 }}>
            Access granted · {result.remainingUses} use(s) left ·{" "}
            {new Date(result.usedAt).toLocaleString()}
          </p>
        )}
      </form>
    </section>
  );
}
