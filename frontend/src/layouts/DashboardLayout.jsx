
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import "./DashboardLayout.css";


const navigation = [
  { label: "Dashboard", path: "/dashboard", icon: "▦", end: true },
  { label: "Pelanggan", path: "/customers", icon: "♙" },
  { label: "Katalog Layanan", path: "/services", icon: "◇" },
  { label: "Permintaan Layanan", path: "/service-requests", icon: "▤" },
];

export default function DashboardLayout() {
  const navigate = useNavigate();

  function handleLogout() {
    sessionStorage.removeItem("sersa_token");
    navigate("/login", { replace: true });
  }

  return (
    <div className="dashboard-layout">
      <aside className="dashboard-sidebar">
        <NavLink to="/dashboard" className="dashboard-brand">
          <span className="dashboard-brand-icon">S</span>
          <span>
            <strong>Sersa</strong>
            <small>Business Management</small>
          </span>
        </NavLink>

        <div className="dashboard-nav-label">MENU UTAMA</div>

        <nav className="dashboard-navigation">
          {navigation.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.end}
              className={({ isActive }) =>
                `dashboard-nav-link ${isActive ? "active" : ""}`
              }
            >
              <span className="dashboard-nav-icon">{item.icon}</span>
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="dashboard-sidebar-bottom">
          <div className="dashboard-status">
            <span className="dashboard-status-dot" />
            <span>
              <strong>Sersa Workspace</strong>
              <small>Workspace aktif</small>
            </span>
          </div>

          <button
            className="dashboard-logout"
            type="button"
            onClick={handleLogout}
          >
            <span>↪</span>
            Keluar
          </button>
        </div>
      </aside>

      <div className="dashboard-main">
        <header className="dashboard-header">
          <div>
            <span className="dashboard-header-eyebrow">
              BUSINESS MANAGEMENT
            </span>
            <h1>Workspace</h1>
          </div>

          <div className="dashboard-header-right">
            <div className="dashboard-header-indicator">
              <span className="dashboard-status-dot" />
              Sistem aktif
            </div>
            <div className="dashboard-avatar">S</div>
          </div>
        </header>

        <main className="dashboard-content">
          <Outlet />
        </main>

        <footer className="dashboard-footer">
          Sersa · Business Management Platform
        </footer>
      </div>
    </div>
  );
}
