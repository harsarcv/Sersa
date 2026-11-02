
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import "./DashboardLayout.css";

// Navigation berdasarkan role pengguna
const navigation = [
  // Semua role
  {
    label: "Dashboard",
    path: "/dashboard",
    icon: "▦",
    roles: ["admin", "staff", "technician"],
    end: true,
  },

  // Admin
  {
    label: "Manajemen Tim",
    path: "/team",
    icon: "♧",
    roles: ["admin"],
  },
  {
    label: "Katalog Layanan",
    path: "/services",
    icon: "◇",
    roles: ["admin"],
  },
  {
    label: "Laporan Bisnis",
    path: "/reports",
    icon: "▤",
    roles: ["admin"],
  },
  {
    label: "Pengaturan Bisnis",
    path: "/settings",
    icon: "⚙",
    roles: ["admin"],
  },

  // Staff
  {
    label: "Pelanggan",
    path: "/customers",
    icon: "♙",
    roles: ["staff"],
  },
  {
    label: "Permintaan Layanan",
    path: "/service-requests",
    icon: "▤",
    roles: ["staff"],
  },
  {
    label: "Penjadwalan",
    path: "/appointments",
    icon: "▦",
    roles: ["staff"],
  },
  {
    label: "Invoice",
    path: "/invoices",
    icon: "▣",
    roles: ["staff"],
  },
  {
    label: "Pembayaran",
    path: "/payments",
    icon: "💳",
    roles: ["staff"],
  },

  // Technician
  {
    label: "Work Orders",
    path: "/work-orders",
    icon: "⚒",
    roles: ["technician"],
  },
];

// Membaca role dari JWT
function getUserRole() {
  try {
    const token = sessionStorage.getItem("sersa_token");

    if (!token) return null;

    const payload = token.split(".")[1];

    if (!payload) return null;

    const base64 = payload
      .replace(/-/g, "+")
      .replace(/_/g, "/");

    const decoded = JSON.parse(
      atob(base64)
    );

    return decoded.role?.toLowerCase() || null;
  } catch (error) {
    console.error("Gagal membaca role pengguna:", error);
    return null;
  }
}

export default function DashboardLayout() {
  const navigate = useNavigate();

  const role = getUserRole();

  // Menampilkan menu sesuai role
  const filteredNavigation = navigation.filter((item) =>
    item.roles.includes(role)
  );

  // Logout
  function handleLogout() {
    sessionStorage.removeItem("sersa_token");
    navigate("/login", { replace: true });
  }

  return (
    <div className="dashboard-layout">

      {/* Sidebar */}
      <aside className="dashboard-sidebar">

        {/* Brand */}
        <NavLink to="/dashboard" className="dashboard-brand">
          <span className="dashboard-brand-icon">S</span>

          <span>
            <strong>Sersa</strong>
            <small>Business Management</small>
          </span>
        </NavLink>

        {/* Navigation Label */}
        <div className="dashboard-nav-label">
          MENU UTAMA
        </div>

        {/* Navigation Menu */}
        <nav className="dashboard-navigation">
          {filteredNavigation.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.end}
              className={({ isActive }) =>
                `dashboard-nav-link ${
                  isActive ? "active" : ""
                }`
              }
            >
              <span className="dashboard-nav-icon">
                {item.icon}
              </span>

              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        {/* Sidebar Bottom */}
        <div className="dashboard-sidebar-bottom">

          <div className="dashboard-status">
            <span className="dashboard-status-dot" />

            <span>
              <strong>Sersa Workspace</strong>
              <small>
                {role
                  ? `${role.charAt(0).toUpperCase()}${role.slice(1)} Account`
                  : "Workspace aktif"}
              </small>
            </span>
          </div>

          {/* Logout */}
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

      {/* Main Content */}
      <div className="dashboard-main">

        {/* Header */}
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

            <div className="dashboard-avatar">
              {role
                ? role.charAt(0).toUpperCase()
                : "S"}
            </div>

          </div>
        </header>

        {/* Page Content */}
        <main className="dashboard-content">
          <Outlet />
        </main>

        {/* Footer */}
        <footer className="dashboard-footer">
          Sersa · Business Management Platform
        </footer>

      </div>
    </div>
  );
}
