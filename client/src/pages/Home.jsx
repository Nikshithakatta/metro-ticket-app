import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api.js";

export default function Home() {
  const navigate = useNavigate();
  const [stations, setStations] = useState([]);
  const [lines, setLines] = useState([]);
  const [from, setFrom] = useState("university");
  const [to, setTo] = useState("airport");
  const [name, setName] = useState("Guest Rider");
  const [journey, setJourney] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [paying, setPaying] = useState(false);

  useEffect(() => {
    Promise.all([api.stations(), api.lines()])
      .then(([s, l]) => {
        setStations(s);
        setLines(l);
      })
      .catch((e) => setError(e.message));
  }, []);

  const canPlan = from && to && from !== to;

  async function planJourney(e) {
    e?.preventDefault();
    if (!canPlan) return;
    setError("");
    setLoading(true);
    setJourney(null);
    try {
      const j = await api.journey(from, to);
      setJourney(j);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function bookAndPay() {
    if (!journey) return;
    setPaying(true);
    setError("");
    try {
      const booking = await api.createBooking({
        from,
        to,
        passengerName: name,
      });
      const { ticket } = await api.payBooking(booking.id);
      navigate(`/ticket/${ticket.id}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setPaying(false);
    }
  }

  const transferSet = useMemo(
    () => new Set(journey?.transfers || []),
    [journey]
  );

  return (
    <>
      <section className="hero">
        <div className="hero-inner">
          <div className="hero-copy fade-in">
            <h1>MetroCity</h1>
            <p>
              Plan a ride across Blue and Green lines, pay in one tap, and carry
              a signed QR ticket at the gate.
            </p>
            <div className="track-visual" aria-hidden="true">
              <span />
            </div>
          </div>

          <form className="panel fade-in" onSubmit={planJourney}>
            <h2>Book a journey</h2>
            <div className="row-2">
              <div className="field">
                <label htmlFor="from">From</label>
                <select
                  id="from"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                >
                  {stations.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="to">To</label>
                <select
                  id="to"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                >
                  {stations.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="field">
              <label htmlFor="passenger">Passenger name</label>
              <input
                id="passenger"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
              />
            </div>
            <button className="btn btn-primary" disabled={!canPlan || loading}>
              {loading ? "Finding route…" : "Show fare & route"}
            </button>
            {error && <p className="error">{error}</p>}
          </form>
        </div>
      </section>

      <section className="section">
        {journey && (
          <div className="journey-card fade-in">
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: "1rem",
                flexWrap: "wrap",
                alignItems: "center",
              }}
            >
              <div>
                <h2 style={{ margin: 0, fontFamily: "var(--font-display)" }}>
                  {journey.from.name} → {journey.to.name}
                </h2>
                <p className="muted" style={{ margin: "0.35rem 0 0" }}>
                  {journey.hops} hops · ~{journey.minutes} min
                  {journey.transfers.length
                    ? ` · ${journey.transfers.length} transfer`
                    : ""}
                </p>
              </div>
              <span className="fare-pill">{journey.fareDisplay}</span>
            </div>

            <ul className="path-list">
              {journey.stations.map((s) => (
                <li key={s.id}>
                  <span
                    className={`dot${transferSet.has(s.id) ? " transfer" : ""}`}
                  />
                  <div>
                    <strong>{s.name}</strong>
                    <div className="muted" style={{ fontSize: "0.85rem" }}>
                      Zone {s.zone}
                      {transferSet.has(s.id) ? " · change trains" : ""}
                      <div style={{ marginTop: "0.25rem" }}>
                        {s.lines.map((l) => (
                          <span
                            key={l.id}
                            className="line-chip"
                            style={{ background: l.color }}
                          >
                            {l.name}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>

            <div className="actions">
              <button
                className="btn btn-primary"
                style={{ width: "auto", minWidth: 200 }}
                disabled={paying}
                onClick={bookAndPay}
              >
                {paying ? "Issuing ticket…" : "Pay & get QR ticket"}
              </button>
              <button className="btn btn-ghost" onClick={() => setJourney(null)}>
                Clear
              </button>
            </div>
            <p className="muted" style={{ marginBottom: 0, fontSize: "0.85rem" }}>
              Payment is mocked for this demo. Ticket stays valid for 120 minutes.
            </p>
          </div>
        )}

        <div style={{ marginTop: "2rem" }}>
          <h2 style={{ fontFamily: "var(--font-display)", letterSpacing: "-0.03em" }}>
            Network map
          </h2>
          <p className="muted">Two lines meet at Central.</p>
          <div className="map-strip">
            {lines.map((line) => (
              <div key={line.id} className="line-card" style={{ color: line.color }}>
                <h3 style={{ color: line.color }}>{line.name}</h3>
                {line.stations.map((s) => (
                  <div key={s.id} className="station-mini">
                    {s.name}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
