
import { useCallback, useEffect, useState } from "react";
import "./Dashboard.css";

const API_URL = (
  import.meta.env.VITE_API_URL || "http://localhost:5000"
).replace(/\/+$/, "");

export default function Dashboard() {
  const [profile, setProfile] = useState(null);
  const [customers, setCustomers] = useState(null);
  const [services, setServices] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadDashboard = useCallback(async () => {
    const token = sessionStorage.getItem("sersa_token");

    if (!token) {
      setError("Sesi login tidak ditemukan. Silakan login kembali.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");

    try {
      const headers = {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
      };

      const [profileResponse, customersResponse, servicesResponse] =
        await Promise.all([
          fetch(`${API_URL}/api/auth/me`, { headers }),
          fetch(`${API_URL}/api/customers?limit=1`, { headers }),
          fetch(`${API_URL}/api/services`, { headers }),
        ]);

      const profileResult = await profileResponse.json().catch(() => ({}));
      const customersResult = await customersResponse.json().catch(() => ({}));
      const servicesResult = await servicesResponse.json().catch(() => ({}));

      if (profileResponse.status === 401) {
        sessionStorage.removeItem("sersa_token");
        window.location.replace("/login");
        return;
      }

      if (!profileResponse.ok) {
        throw new Error(
          profileResult.message || "Gagal memuat profil bisnis."
        );
      }

      setProfile(profileResult.data);

      if (customersResponse.ok) {
        setCustomers(customersResult);
      }

      if (servicesResponse.ok) {
        setServices(servicesResult);
      }
    } catch (err) {
      setError(
        err.message || "Tidak dapat mengambil data dari server Sersa."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  function getCount(result) {
    if (!result) return null;

    const candidates = [
      result.total,
      result.totalCount,
      result.pagination?.total,
      result.data?.total,
      result.data?.pagination?.total,
    ];

    const count = candidates.find(
      (value) => typeof value === "number" && Number.isFinite(value)
    );

    if (count !== undefined) return count;

    const rows = Array.isArray(result.data)
      ? result.data
      : Array.isArray(result.items)
        ? result.items
        : Array.isArray(result.customers)
          ? result.customers
          : Array.isArray(result.services)
            ? result.services
            : null;

    return rows && !result.pagination ? rows.length : null;
  }

  const customerCount = getCount(customers);
  const serviceCount = getCount(services);

  return (
    <div className="business-dashboard">
      <section className="dashboard-welcome">
        <div>
          <span className="dashboard-section-label">OVERVIEW</span>
          <h2>
            Selamat datang
            {profile?.user?.fullName
              ? `, ${profile.user.fullName}`
              : ""}
          </h2>
          <p>
            Pantau aktivitas dan informasi bisnis kamu melalui workspace Sersa.
          </p>
        </div>

        <button
          className="dashboard-refresh"
          type="button"
          onClick={loadDashboard}
          disabled={loading}
        >
          {loading ? "Memuat..." : "↻ Perbarui data"}
        </button>
      </section>

      {error && (
        <div className="dashboard-alert" role="alert">
          <span>{error}</span>
          <button type="button" onClick={loadDashboard}>
            Coba lagi
          </button>
        </div>
      )}

      <section className="dashboard-stats">
        <article className="dashboard-stat-card">
          <div className="dashboard-stat-top">
            <span>Total Pelanggan</span>
            <span className="dashboard-stat-icon">♙</span>
          </div>
          <strong>
            {loading ? "—" : customerCount ?? "Belum tersedia"}
          </strong>
          <p>Data pelanggan bisnis</p>
        </article>

        <article className="dashboard-stat-card">
          <div className="dashboard-stat-top">
            <span>Katalog Layanan</span>
            <span className="dashboard-stat-icon">◇</span>
          </div>
          <strong>
            {loading ? "—" : serviceCount ?? "Belum tersedia"}
          </strong>
          <p>Layanan yang terdaftar</p>
        </article>

        <article className="dashboard-stat-card">
          <div className="dashboard-stat-top">
            <span>Pengguna</span>
            <span className="dashboard-stat-icon">◎</span>
          </div>
          <strong>{profile?.user?.fullName || "—"}</strong>
          <p>{profile?.user?.email || "Informasi akun"}</p>
        </article>
      </section>

      <section className="dashboard-section">
        <div className="dashboard-section-heading">
          <div>
            <span className="dashboard-section-label">WORKSPACE</span>
            <h3>Ringkasan bisnis</h3>
          </div>
        </div>

        <div className="dashboard-overview-card">
          <div className="dashboard-overview-mark">S</div>
          <div>
            <h4>{profile?.tenant?.name || "Workspace Sersa"}</h4>
            <p>
              {profile?.tenant?.slug
                ? `Identitas workspace: ${profile.tenant.slug}`
                : "Informasi workspace bisnis kamu"}
            </p>
            <span className="dashboard-role">
              Role: {profile?.role || "Memuat..."}
            </span>
          </div>
        </div>
      </section>

      {!loading && !error && (customers === null || services === null) && (
        <p className="dashboard-note">
          Sebagian ringkasan belum tersedia. Pastikan endpoint pelanggan dan
          layanan mengembalikan data dengan format yang sesuai.
        </p>
      )}
    </div>
  );
}
