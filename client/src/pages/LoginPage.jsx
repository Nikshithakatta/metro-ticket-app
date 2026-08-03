import { useEffect, useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../auth.jsx";

export default function LoginPage() {
  const { login, register, isLoggedIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("demo@metrocity.local");
  const [password, setPassword] = useState("demo1234");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const next = location.state?.from || "/history";

  useEffect(() => {
    if (isLoggedIn) navigate(next, { replace: true });
  }, [isLoggedIn, navigate, next]);

  async function onSubmit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (mode === "login") await login(email, password);
      else await register(email, password, name);
      navigate(next, { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="section fade-in">
      <div className="auth-card">
        <h1 style={{ fontFamily: "var(--font-display)", marginTop: 0 }}>
          {mode === "login" ? "Sign in" : "Create account"}
        </h1>
        <p className="muted">
          {mode === "login"
            ? "Already have an account? Enter your email and password below."
            : "New to MetroCity? Register to save your ticket history."}{" "}
          Demo: demo@metrocity.local / demo1234
        </p>
        <form onSubmit={onSubmit}>
          {mode === "register" && (
            <div className="field">
              <label htmlFor="name">Name</label>
              <input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
              />
            </div>
          )}
          <div className="field">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          {error && <p className="error">{error}</p>}
          <button className="btn btn-primary" disabled={busy}>
            {busy
              ? "Please wait…"
              : mode === "login"
                ? "Sign in"
                : "Register"}
          </button>
        </form>
        <p className="muted" style={{ marginBottom: 0 }}>
          {mode === "login" ? (
            <>
              New here?{" "}
              <button
                type="button"
                className="linkish"
                onClick={() => setMode("register")}
              >
                Create an account
              </button>
            </>
          ) : (
            <>
              Have an account?{" "}
              <button
                type="button"
                className="linkish"
                onClick={() => setMode("login")}
              >
                Sign in
              </button>
            </>
          )}
          {" · "}
          <Link to="/" style={{ color: "var(--cyan-deep)" }}>
            Back
          </Link>
        </p>
      </div>
    </section>
  );
}
