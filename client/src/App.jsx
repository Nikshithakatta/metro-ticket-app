import { NavLink, Route, Routes } from "react-router-dom";
import Home from "./pages/Home.jsx";
import TicketPage from "./pages/TicketPage.jsx";
import HistoryPage from "./pages/HistoryPage.jsx";
import ValidatePage from "./pages/ValidatePage.jsx";

export default function App() {
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
        </nav>
      </header>

      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/ticket/:id" element={<TicketPage />} />
        <Route path="/history" element={<HistoryPage />} />
        <Route path="/validate" element={<ValidatePage />} />
      </Routes>

      <footer className="footer">
        MetroCity demo · mock payments · tickets valid 120 minutes
      </footer>
    </div>
  );
}
