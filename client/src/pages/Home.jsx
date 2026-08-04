import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api.js";
import { useAuth } from "../auth.jsx";
import StationSearch from "../components/StationSearch.jsx";

const TICKET_TYPES = [
  {
    id: "single",
    label: "Single",
    hint: "1 ride · 120 min",
  },
  {
    id: "return",
    label: "Return",
    hint: "2 rides · 240 min · 1.8×",
  },
  {
    id: "day_pass",
    label: "Day pass",
    hint: "Unlimited · ₹80 · until midnight",
  },
];

export default function Home() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, isLoggedIn } = useAuth();
  const [stations, setStations] = useState([]);
  const [lines, setLines] = useState([]);
  const [from, setFrom] = useState("university");
  const [to, setTo] = useState("airport");
  const [ticketType, setTicketType] = useState("single");
  const [name, setName] = useState("");
  const [journey, setJourney] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [paying, setPaying] = useState(false);
  const [crowd, setCrowd] = useState(null);
  const [trains, setTrains] = useState([]);
  const [favorites, setFavorites] = useState({ home: null, work: null });
  const [lastTrip, setLastTrip] = useState(null);
  const [favBusy, setFavBusy] = useState("");

  useEffect(() => {
    if (user?.name) setName(user.name);
  }, [user]);

  useEffect(() => {
    Promise.all([api.stations(), api.lines()])
      .then(([s, l]) => {
        setStations(s);
        setLines(l);
      })
      .catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    const qFrom = searchParams.get("from");
    const qTo = searchParams.get("to");
    const qType = searchParams.get("ticketType");
    if (!qFrom && !qTo && !qType) return;
    if (qFrom) setFrom(qFrom);
    if (qTo) setTo(qTo);
    if (qType && ["single", "return", "day_pass"].includes(qType)) {
      setTicketType(qType);
    }
    setJourney(null);
    setSearchParams({}, { replace: true });
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    if (!isLoggedIn) {
      setFavorites({ home: null, work: null });
      setLastTrip(null);
      return;
    }
    let cancelled = false;
    Promise.all([api.getFavorites(), api.lastTrip()])
      .then(([fav, last]) => {
        if (cancelled) return;
        setFavorites(fav);
        setLastTrip(last.trip || null);
      })
      .catch(() => {
        if (!cancelled) {
          setFavorites({ home: null, work: null });
          setLastTrip(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [isLoggedIn]);

  useEffect(() => {
    if (!from) return;
    let cancelled = false;
    Promise.all([api.crowd(from), api.nextTrains(from, 4)])
      .then(([c, n]) => {
        if (cancelled) return;
        setCrowd(c);
        setTrains(n.trains || []);
      })
      .catch(() => {
        if (!cancelled) {
          setCrowd(null);
          setTrains([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [from]);

  const canPlan =
    from &&
    to &&
    (ticketType === "day_pass" || from !== to);

  function applyTrip(tripFrom, tripTo, type = "single") {
    setFrom(tripFrom);
    setTo(tripTo);
    setTicketType(type);
    setJourney(null);
    setError("");
  }

  async function saveFavorite(slot) {
    if (!isLoggedIn) return;
    const stationId = slot === "home" ? from : to;
    setFavBusy(slot);
    setError("");
    try {
      const next = await api.setFavorites({ [slot]: stationId });
      setFavorites(next);
    } catch (err) {
      setError(err.message);
    } finally {
      setFavBusy("");
    }
  }

  async function planJourney(e) {
    e?.preventDefault();
    if (!canPlan) return;
    setError("");
    setLoading(true);
    setJourney(null);
    try {
      const j = await api.journey(from, to, ticketType);
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
        passengerName: name || user?.name || "Guest",
        ticketType,
      });
      const { ticket } = await api.payBooking(booking.id);
      if (isLoggedIn) {
        api.lastTrip().then((r) => setLastTrip(r.trip || null)).catch(() => {});
      }
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
              Search stations, pick single / return / day pass, and carry a
              signed QR ticket at the gate.
            </p>
            <div className="track-visual" aria-hidden="true">
              <span />
            </div>
          </div>

          <form className="panel fade-in" onSubmit={planJourney}>
            <h2>Book a journey</h2>
            {!isLoggedIn && (
              <p className="muted" style={{ marginTop: 0, fontSize: "0.88rem" }}>
                Guest checkout works.{" "}
                <Link to="/login" style={{ color: "var(--cyan-deep)" }}>
                  Sign in
                </Link>{" "}
                to save favorites and rebook trips.
              </p>
            )}
            <div className="ticket-type-row" role="radiogroup" aria-label="Ticket type">
              {TICKET_TYPES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className={`ticket-type${ticketType === t.id ? " active" : ""}`}
                  onClick={() => {
                    setTicketType(t.id);
                    setJourney(null);
                  }}
                  aria-pressed={ticketType === t.id}
                >
                  <strong>{t.label}</strong>
                  <span>{t.hint}</span>
                </button>
              ))}
            </div>

            {isLoggedIn && (
              <div className="quick-actions">
                <div className="quick-row">
                  <span className="muted quick-label">Favorites</span>
                  <button
                    type="button"
                    className="chip-btn"
                    disabled={!favorites.home}
                    onClick={() =>
                      favorites.home && applyTrip(favorites.home.id, to, ticketType)
                    }
                    title={favorites.home ? favorites.home.name : "Not set"}
                  >
                    Home{favorites.home ? `: ${favorites.home.name}` : ""}
                  </button>
                  <button
                    type="button"
                    className="chip-btn"
                    disabled={!favorites.work}
                    onClick={() =>
                      favorites.work && applyTrip(from, favorites.work.id, ticketType)
                    }
                    title={favorites.work ? favorites.work.name : "Not set"}
                  >
                    Work{favorites.work ? `: ${favorites.work.name}` : ""}
                  </button>
                  <button
                    type="button"
                    className="chip-btn chip-accent"
                    disabled={!favorites.home || !favorites.work}
                    onClick={() =>
                      favorites.home &&
                      favorites.work &&
                      applyTrip(favorites.home.id, favorites.work.id, "single")
                    }
                  >
                    Home → Work
                  </button>
                </div>
                <div className="quick-row">
                  <button
                    type="button"
                    className="chip-btn"
                    disabled={favBusy === "home" || !from}
                    onClick={() => saveFavorite("home")}
                  >
                    {favBusy === "home" ? "Saving…" : "Save From as Home"}
                  </button>
                  <button
                    type="button"
                    className="chip-btn"
                    disabled={favBusy === "work" || !to}
                    onClick={() => saveFavorite("work")}
                  >
                    {favBusy === "work" ? "Saving…" : "Save To as Work"}
                  </button>
                  {lastTrip && (
                    <button
                      type="button"
                      className="chip-btn chip-accent"
                      onClick={() =>
                        applyTrip(
                          lastTrip.from.id,
                          lastTrip.to.id,
                          lastTrip.ticketType
                        )
                      }
                    >
                      Rebook last: {lastTrip.from.name} → {lastTrip.to.name}
                    </button>
                  )}
                </div>
              </div>
            )}

            <div className="row-2">
              <StationSearch
                id="from"
                label="From"
                value={from}
                onChange={(id) => {
                  setFrom(id);
                  setJourney(null);
                }}
                stations={stations}
              />
              <StationSearch
                id="to"
                label="To"
                value={to}
                onChange={(id) => {
                  setTo(id);
                  setJourney(null);
                }}
                stations={stations}
              />
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
        {(crowd || trains.length > 0) && (
          <div className="live-strip fade-in">
            {crowd && (
              <div className={`crowd-chip crowd-${crowd.level}`}>
                <span className="muted">Crowd at {crowd.stationName}</span>
                <strong>{crowd.label}</strong>
              </div>
            )}
            <div className="next-trains">
              <span className="muted">Next trains</span>
              <ul>
                {trains.map((t, i) => (
                  <li key={`${t.lineId}-${t.departure}-${i}`}>
                    <span
                      className="line-chip"
                      style={{ background: t.lineColor }}
                    >
                      {t.lineName}
                    </span>
                    <strong>{t.departure}</strong>
                    <span className="muted">in {t.minutesUntil} min</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

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
                  {journey.ticketType.replace("_", " ")} · {journey.hops} hops · ~
                  {journey.minutes} min
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
              Payment is mocked.{" "}
              {ticketType === "day_pass"
                ? "Day pass valid until midnight."
                : ticketType === "return"
                  ? "Return: 2 gate entries within 240 minutes."
                  : "Single: 1 entry within 120 minutes."}
            </p>
          </div>
        )}

        <div style={{ marginTop: "2rem" }}>
          <h2
            style={{
              fontFamily: "var(--font-display)",
              letterSpacing: "-0.03em",
            }}
          >
            Network map
          </h2>
          <p className="muted">Two lines meet at Central.</p>
          <div className="map-strip">
            {lines.map((line) => (
              <div
                key={line.id}
                className="line-card"
                style={{ color: line.color }}
              >
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
