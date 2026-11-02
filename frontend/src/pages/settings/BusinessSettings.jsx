
import { useEffect, useState } from "react";
import "./BusinessSettings.css";

const API_URL = (
  import.meta.env.VITE_API_URL || "http://localhost:5000"
).replace(/\/+$/, "");

const initialForm = {
  name: "",
  email: "",
  phone: "",
  address: "",
};

export default function BusinessSettings() {
  const [form, setForm] = useState(initialForm);
  const [workspace, setWorkspace] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function requestSettings(method = "GET", body = null) {
    const token = sessionStorage.getItem("sersa_token");

    if (!token) {
      window.location.replace("/login");
      throw new Error("Sesi login tidak ditemukan.");
    }

    const response = await fetch(`${API_URL}/api/settings/business`, {
      method,
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });

    const result = await response.json().catch(() => ({}));

    if (response.status === 401) {
      sessionStorage.removeItem("sersa_token");
      window.location.replace("/login");
      throw new Error("Sesi login telah berakhir.");
    }

    if (!response.ok) {
      throw new Error(
        result.message || "Permintaan pengaturan bisnis gagal."
      );
    }

    return result;
  }

  async function loadSettings() {
    setLoading(true);
    setError("");

    try {
      const result = await requestSettings();

      setWorkspace(result.data);
      setForm({
        name: result.data.name || "",
        email: result.data.email || "",
        phone: result.data.phone || "",
        address: result.data.address || "",
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadSettings();
  }, []);

  function handleChange(event) {
    const { name, value } = event.target;

    setForm((previous) => ({
      ...previous,
      [name]: value,
    }));

    setSuccess("");
    setError("");
  }

  async function handleSubmit(event) {
    event.preventDefault();

    setError("");
    setSuccess("");

    if (!form.name.trim() || !form.email.trim()) {
      setError("Nama bisnis dan email wajib diisi.");
      return;
    }

    setSaving(true);

    try {
      const result = await requestSettings("PUT", {
        name: form.name,
        email: form.email,
        phone: form.phone,
        address: form.address,
      });

      setWorkspace(result.data);
      setForm({
        name: result.data.name || "",
        email: result.data.email || "",
        phone: result.data.phone || "",
        address: result.data.address || "",
      });

      setSuccess(result.message);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  function handleReset() {
    if (!workspace) return;

    setForm({
      name: workspace.name || "",
      email: workspace.email || "",
      phone: workspace.phone || "",
      address: workspace.address || "",
    });

    setError("");
    setSuccess("");
  }

  if (loading) {
    return (
      <div className="business-settings-loading">
        Memuat pengaturan bisnis...
      </div>
    );
  }

  return (
    <section className="business-settings-page">
      <header className="business-settings-heading">
        <div>
          <span className="business-settings-eyebrow">
            WORKSPACE CONFIGURATION
          </span>
          <h2>Pengaturan Bisnis</h2>
          <p>
            Kelola identitas dan informasi kontak bisnis Anda.
          </p>
        </div>
      </header>

      {error && (
        <div className="business-settings-alert error" role="alert">
          {error}
        </div>
      )}

      {success && (
        <div className="business-settings-alert success" role="status">
          {success}
        </div>
      )}

      <div className="business-settings-grid">
        <form
          className="business-settings-card"
          onSubmit={handleSubmit}
        >
          <div className="business-settings-card-heading">
            <div className="business-settings-icon">▣</div>
            <div>
              <h3>Informasi Bisnis</h3>
              <p>Informasi utama yang digunakan workspace Sersa.</p>
            </div>
          </div>

          <div className="business-settings-fields">
            <label>
              <span>Nama Bisnis *</span>
              <input
                type="text"
                name="name"
                value={form.name}
                onChange={handleChange}
                maxLength={150}
                placeholder="Masukkan nama bisnis"
                required
              />
            </label>

            <label>
              <span>Email Bisnis *</span>
              <input
                type="email"
                name="email"
                value={form.email}
                onChange={handleChange}
                maxLength={255}
                placeholder="bisnis@email.com"
                required
              />
            </label>

            <label>
              <span>Nomor Telepon</span>
              <input
                type="tel"
                name="phone"
                value={form.phone}
                onChange={handleChange}
                maxLength={30}
                placeholder="Masukkan nomor telepon"
              />
            </label>

            <label>
              <span>Alamat Bisnis</span>
              <textarea
                name="address"
                value={form.address}
                onChange={handleChange}
                maxLength={5000}
                rows={4}
                placeholder="Masukkan alamat lengkap bisnis"
              />
            </label>
          </div>

          <div className="business-settings-actions">
            <button
              type="button"
              className="business-settings-reset"
              onClick={handleReset}
              disabled={saving}
            >
              Batalkan Perubahan
            </button>

            <button
              type="submit"
              className="business-settings-save"
              disabled={saving}
            >
              {saving ? "Menyimpan..." : "Simpan Perubahan"}
            </button>
          </div>
        </form>

        <aside className="business-settings-card workspace-card">
          <div className="business-settings-card-heading">
            <div className="business-settings-icon">◇</div>
            <div>
              <h3>Informasi Workspace</h3>
              <p>Informasi identitas workspace Anda.</p>
            </div>
          </div>

          <div className="workspace-details">
            <div>
              <span>ID Workspace</span>
              <strong>#{workspace?.id ?? "—"}</strong>
            </div>

            <div>
              <span>Slug Workspace</span>
              <strong>{workspace?.slug || "—"}</strong>
            </div>

            <div>
              <span>Status Workspace</span>
              <strong
                className={
                  workspace?.status === "active"
                    ? "workspace-active"
                    : "workspace-inactive"
                }
              >
                {workspace?.status === "active"
                  ? "Aktif"
                  : workspace?.status || "—"}
              </strong>
            </div>

            <div>
              <span>Dibuat Pada</span>
              <strong>
                {workspace?.createdAt
                  ? new Date(workspace.createdAt).toLocaleDateString(
                      "id-ID",
                      {
                        day: "2-digit",
                        month: "long",
                        year: "numeric",
                      }
                    )
                  : "—"}
              </strong>
            </div>

            <div>
              <span>Terakhir Diperbarui</span>
              <strong>
                {workspace?.updatedAt
                  ? new Date(workspace.updatedAt).toLocaleString("id-ID")
                  : "—"}
              </strong>
            </div>
          </div>

          <div className="workspace-note">
            <strong>Informasi</strong>
            <p>
              ID dan slug workspace merupakan identitas sistem.
              Keduanya tidak dapat diubah melalui halaman ini.
            </p>
          </div>
        </aside>
      </div>
    </section>
  );
}
