import { NavLink, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./auth.jsx";
import Home from "./pages/Home.jsx";
import TicketPage from "./pages/TicketPage.jsx";
import HistoryPage from "./pages/HistoryPage.jsx";
import ValidatePage from "./pages/ValidatePage.jsx";
import LoginPage from "./pages/LoginPage.jsx";
import SharePage from "./pages/SharePage.jsx";

function Shell() {
  const { user, isLoggedIn, logout } = useAuth();

  return (
    <div className="app-shell">
      <header className="topnav">
        <NavLink to="/" className="brand">
          <div className="brand-mark">M</div>
          <div>
            <div className="brand-name">MetroCity</div>
            <span className="brand-sub">Tickets</span>
          </div>
        </NavLink>
        <nav className="nav-links">
          <NavLink to="/" end>
            Book
          </NavLink>
          <NavLink to="/history">My tickets</NavLink>
          <NavLink to="/validate">Gate</NavLink>
          {isLoggedIn ? (
            <button type="button" className="nav-user" onClick={logout}>
              {user?.name?.split(" ")[0] || "Account"} · Out
            </button>
          ) : (
            <NavLink to="/login">Sign in</NavLink>
          )}
        </nav>
      </header>

      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/ticket/:id" element={<TicketPage />} />
        <Route path="/share/:token" element={<SharePage />} />
        <Route path="/history" element={<HistoryPage />} />
        <Route path="/validate" element={<ValidatePage />} />
        <Route path="/login" element={<LoginPage />} />
      </Routes>

      <footer className="footer">
        MetroCity demo · mock payments · single / return / day pass
      </footer>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Shell />
    </AuthProvider>
  );
}
