
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import "./AuthForm.css";

const API_URL = (
    import.meta.env.VITE_API_URL || "http://localhost:5000"
).replace(/\/+$/, "");

export default function Login() {
    const navigate = useNavigate();

    const [form, setForm] = useState({
        email: "",
        password: "",
    });

    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    function handleChange(event) {
        const { name, value } = event.target;

        setForm((previous) => ({
            ...previous,
            [name]: value,
        }));
    }

    async function handleSubmit(event) {
        event.preventDefault();
        setError("");

        const email = form.email.trim().toLowerCase();

        if (!email || !form.password) {
            setError("Email dan password wajib diisi.");
            return;
        }

        setLoading(true);

        try {
            const response = await fetch(`${API_URL}/api/auth/login`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Accept: "application/json",
                },
                body: JSON.stringify({
                    email,
                    password: form.password,
                }),
            });

            const result = await response.json().catch(() => ({}));

            if (!response.ok) {
                throw new Error(result.message || "Login gagal. Periksa akunmu.");
            }


            const token = result.data?.token;

            if (!token) {
                throw new Error("Token login tidak ditemukan dari server.");
            }

            sessionStorage.setItem("sersa_token", token);


            navigate("/dashboard", { replace: true });
        } catch (err) {
            setError(
                err.message || "Tidak dapat terhubung ke server Sersa."
            );
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="auth-form-page">
            <header className="auth-form-heading">
                <h2>Selamat datang</h2>
                <p>Masuk ke workspace bisnis Sersa milikmu.</p>
            </header>

            <form className="auth-form" onSubmit={handleSubmit}>
                {error && (
                    <div className="auth-form-message auth-form-error" role="alert">
                        {error}
                    </div>
                )}

                <label className="auth-field">
                    Email bisnis
                    <input
                        type="email"
                        name="email"
                        value={form.email}
                        onChange={handleChange}
                        placeholder="nama@perusahaan.com"
                        autoComplete="username"
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
                            placeholder="Masukkan password"
                            autoComplete="current-password"
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

                <button
                    type="submit"
                    className="auth-submit"
                    disabled={loading}
                >
                    {loading ? "Memverifikasi..." : "Masuk ke Workspace"}
                    {!loading && <span>→</span>}
                </button>
            </form>

            <p className="auth-switch">
                Belum punya akun bisnis?{" "}
                <Link to="/register">Daftarkan bisnis</Link>
            </p>

            <div className="auth-security">
                <span>◇</span>
                <p>
                    Akses workspace menggunakan autentikasi server dan sesi akun
                    yang terverifikasi.
                </p>
            </div>
        </div>
    );
}
