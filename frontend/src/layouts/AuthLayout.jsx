
import { Link, Outlet } from "react-router-dom";
import "./AuthLayout.css";

export default function AuthLayout() {
  return (
    <main className="auth-shell">
      <section className="auth-showcase">
        <Link to="/login" className="auth-brand">
          <span className="auth-brand-mark">S</span>

          <span className="auth-brand-copy">
            <strong>Sersa</strong>
            <small>Service Management</small>
          </span>
        </Link>

        <div className="auth-hero">

          <h1>
            Kelola layanan.
            <br />
            <span>Lebih terstruktur.</span>
          </h1>

          <p>
            Satu workspace untuk mengelola pelanggan, permintaan layanan,
            penjadwalan, pekerjaan teknisi, dan tagihan bisnis.
          </p>

          <div className="auth-features">
            <div className="auth-feature">
              <span>◇</span>
              <p>Manajemen pelanggan dalam satu tempat</p>
            </div>

            <div className="auth-feature">
              <span>⌘</span>
              <p>Alur pekerjaan yang lebih terorganisir</p>
            </div>

            <div className="auth-feature">
              <span>▤</span>
              <p>Ringkasan operasional bisnis</p>
            </div>
          </div>
        </div>

        <footer className="auth-showcase-footer">
          SERSA · SERVICE MANAGEMENT WORKSPACE
        </footer>
      </section>

      <section className="auth-panel">
        <div className="auth-panel-inner">
          <Outlet />
        </div>
      </section>
    </main>
  );
}
