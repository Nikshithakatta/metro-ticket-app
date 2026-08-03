import { useEffect, useRef, useState } from "react";
import { api } from "../api.js";

/** Searchable station picker with typeahead dropdown. */
export default function StationSearch({
  id,
  label,
  value,
  onChange,
  stations: allStations = [],
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState([]);
  const wrapRef = useRef(null);

  const selected = allStations.find((s) => s.id === value);

  useEffect(() => {
    if (!open) return;
    const q = query.trim();
    let cancelled = false;
    const t = setTimeout(() => {
      api
        .stations(q)
        .then((rows) => {
          if (!cancelled) setResults(rows);
        })
        .catch(() => {
          if (!cancelled) {
            setResults(
              allStations.filter(
                (s) =>
                  !q ||
                  s.name.toLowerCase().includes(q.toLowerCase()) ||
                  s.id.includes(q.toLowerCase())
              )
            );
          }
        });
    }, 120);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query, open, allStations]);

  useEffect(() => {
    function onDoc(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  function pick(station) {
    onChange(station.id);
    setQuery("");
    setOpen(false);
  }

  return (
    <div className="field station-search" ref={wrapRef}>
      <label htmlFor={id}>{label}</label>
      <button
        type="button"
        id={id}
        className="station-trigger"
        onClick={() => {
          setOpen(true);
          setQuery("");
        }}
        aria-expanded={open}
      >
        {selected ? (
          <>
            <strong>{selected.name}</strong>
            <span className="muted">Zone {selected.zone}</span>
          </>
        ) : (
          <span className="muted">Search station…</span>
        )}
      </button>
      {open && (
        <div className="station-dropdown">
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type to search…"
            aria-label={`Search ${label}`}
          />
          <ul>
            {results.map((s) => (
              <li key={s.id}>
                <button type="button" onClick={() => pick(s)}>
                  <span>
                    <strong>{s.name}</strong>
                    <span className="muted"> · Zone {s.zone}</span>
                  </span>
                  <span className="station-lines">
                    {(s.lines || []).map((l) => (
                      <span
                        key={l.id}
                        className="line-dot"
                        style={{ background: l.color }}
                        title={l.name}
                      />
                    ))}
                  </span>
                </button>
              </li>
            ))}
            {results.length === 0 && (
              <li className="muted" style={{ padding: "0.65rem 0.75rem" }}>
                No stations match
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
