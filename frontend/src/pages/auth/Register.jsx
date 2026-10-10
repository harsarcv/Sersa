
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import "./Register.css";

const API_URL = (
  import.meta.env.VITE_API_URL || "http://localhost:5000"
).replace(/\/+$/, "");

export default function Register() {
  const navigate = useNavigate();

  const [form, setForm] = useState({
    businessName: "",
    fullName: "",
    email: "",
    password: "",
    confirmPassword: "",
  });

  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  function handleChange(event) {
    const { name, value } = event.target;

    setForm((previous) => ({ ...previous, [name]: value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setSuccess("");

    const businessName = form.businessName.trim();
    const fullName = form.fullName.trim();
    const email = form.email.trim().toLowerCase();

    if (businessName.length < 2 || businessName.length > 150) {
      setError("Nama bisnis harus terdiri dari 2–150 karakter.");
      return;
    }

    if (fullName.length < 2 || fullName.length > 150) {
      setError("Nama lengkap harus terdiri dari 2–150 karakter.");
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError("Masukkan alamat email yang valid.");
      return;
    }

    if (form.password.length < 8) {
      setError("Password minimal 8 karakter.");
      return;
    }

    if (form.password !== form.confirmPassword) {
      setError("Konfirmasi password tidak cocok.");
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(
        `${API_URL}/api/auth/register-business`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({
            businessName,
            fullName,
            email,
            password: form.password,
          }),
        }
      );

      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          result.message || "Pendaftaran bisnis gagal."
        );
      }

      setSuccess(
        result.message ||
          "Pendaftaran berhasil. Silakan masuk menggunakan akunmu."
      );

      window.setTimeout(() => {
        navigate("/login", { replace: true });
      }, 1200);
    } catch (err) {
      setError(err.message || "Tidak dapat terhubung ke server Sersa.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-form-page">
      <header className="auth-form-heading">
        <h2>Daftarkan bisnis</h2>
        <p>Buat workspace baru untuk mengelola operasional bisnismu.</p>
      </header>

      <form className="auth-form" onSubmit={handleSubmit}>
        {error && (
          <div className="auth-form-message auth-form-error" role="alert">
            {error}
          </div>
        )}

        {success && (
          <div
            className="auth-form-message auth-form-success"
            role="status"
          >
            {success}
          </div>
        )}

        <label className="auth-field">
          Nama bisnis
          <input
            name="businessName"
            value={form.businessName}
            onChange={handleChange}
            placeholder="Nama bisnis"
            autoComplete="organization"
            minLength={2}
            maxLength={150}
            required
          />
        </label>

        <label className="auth-field">
          Nama lengkap pemilik
          <input
            name="fullName"
            value={form.fullName}
            onChange={handleChange}
            placeholder="Nama lengkap"
            autoComplete="name"
            minLength={2}
            maxLength={150}
            required
          />
        </label>

        <label className="auth-field">
          Email bisnis
          <input
            type="email"
            name="email"
            value={form.email}
            onChange={handleChange}
            placeholder="nama@perusahaan.com"
            autoComplete="email"
            maxLength={255}
            required
          />
        </label>

        <label className="auth-field">
          Password
          <div className="auth-password">
            <input
              type={showPassword ? "text" : "password"}
              name="password"
              value={form.password}
              onChange={handleChange}
              placeholder="Minimal 8 karakter"
              autoComplete="new-password"
              minLength={8}
              required
            />

            <button
              type="button"
              onClick={() => setShowPassword((value) => !value)}
            >
              {showPassword ? "Sembunyikan" : "Lihat"}
            </button>
          </div>
        </label>

        <label className="auth-field">
          Konfirmasi password
          <input
            type={showPassword ? "text" : "password"}
            name="confirmPassword"
            value={form.confirmPassword}
            onChange={handleChange}
            placeholder="Ulangi password"
            autoComplete="new-password"
            required
          />
        </label>

        <button
          type="submit"
          className="auth-submit"
          disabled={loading}
        >
          {loading ? "Membuat workspace..." : "Daftarkan Bisnis"}
          {!loading && <span>→</span>}
        </button>
      </form>

      <p className="auth-switch">
        Sudah punya akun? <Link to="/login">Masuk ke Sersa</Link>
      </p>
    </div>
  );
}
