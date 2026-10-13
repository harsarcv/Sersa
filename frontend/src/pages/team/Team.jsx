import { useCallback, useEffect, useMemo, useState } from "react";
import "../services/Services.css";
import "./Team.css";

const API_URL = (
  import.meta.env.VITE_API_URL || "http://localhost:5000"
).replace(/\/+$/, "");

const EMPTY_FORM = {
  fullName: "",
  email: "",
  phone: "",
  password: "",
  role: "technician",
};

async function apiRequest(path, options = {}) {
  const token = sessionStorage.getItem("sersa_token");

  if (!token) {
    window.location.replace("/login");
    throw new Error("Sesi login tidak ditemukan.");
  }

  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  });

  const result = await response.json().catch(() => ({}));

  if (response.status === 401) {
    sessionStorage.removeItem("sersa_token");
    window.location.replace("/login");
    throw new Error("Sesi login berakhir. Silakan login kembali.");
  }

  if (!response.ok) {
    throw new Error(
      result.message ||
        (response.status === 403
          ? "Hanya admin yang dapat mengelola anggota tim."
          : `Permintaan gagal (${response.status}).`)
    );
  }

  return result;
}

function formatDate(value) {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "—";

  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function roleLabel(role) {
  if (role === "admin") return "Admin";
  if (role === "technician") return "Teknisi";
  return "Staff";
}

export default function Team() {
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [changingId, setChangingId] = useState(null);

  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [formOpen, setFormOpen] = useState(false);
  const [formError, setFormError] = useState("");
  const [form, setForm] = useState(EMPTY_FORM);

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const loadMembers = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const result = await apiRequest("/api/team");
      setMembers(Array.isArray(result.data) ? result.data : []);
    } catch (err) {
      setError(err.message || "Gagal memuat anggota tim.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMembers();
  }, [loadMembers]);

  const filteredMembers = useMemo(() => {
    const keyword = search.toLowerCase();

    return members.filter((member) => {
      const matchesSearch =
        !keyword ||
        [member.fullName, member.email, member.phone]
          .filter(Boolean)
          .some((value) => value.toLowerCase().includes(keyword));

      const matchesRole =
        roleFilter === "all" || member.role === roleFilter;

      const matchesStatus =
        statusFilter === "all" ||
        member.membershipStatus === statusFilter;

      return matchesSearch && matchesRole && matchesStatus;
    });
  }, [members, search, roleFilter, statusFilter]);

  const activeCount = members.filter(
    (member) => member.membershipStatus === "active"
  ).length;

  const technicianCount = members.filter(
    (member) =>
      member.role === "technician" &&
      member.membershipStatus === "active"
  ).length;

  function handleSearch(event) {
    event.preventDefault();
    setSearch(searchInput.trim().toLowerCase());
  }

  function openForm() {
    setForm(EMPTY_FORM);
    setFormError("");
    setNotice("");
    setError("");
    setFormOpen(true);
  }

  function closeForm() {
    if (saving) return;

    setFormOpen(false);
    setForm(EMPTY_FORM);
    setFormError("");
  }

  function handleFormChange(event) {
    const { name, value } = event.target;

    setForm((previous) => ({
      ...previous,
      [name]: value,
    }));
  }

  async function handleCreate(event) {
    event.preventDefault();
    setFormError("");
    setNotice("");

    const fullName = form.fullName.trim();
    const email = form.email.trim().toLowerCase();
    const phone = form.phone.trim();
    const password = form.password;

    if (fullName.length < 2 || fullName.length > 150) {
      setFormError("Nama harus terdiri dari 2–150 karakter.");
      return;
    }

    if (
      email.length > 255 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    ) {
      setFormError("Masukkan alamat email yang valid.");
      return;
    }

    if (password.length < 10 || password.length > 72) {
      setFormError("Password harus terdiri dari 10–72 karakter.");
      return;
    }

    if (phone.length > 30) {
      setFormError("Nomor telepon maksimal 30 karakter.");
      return;
    }

    setSaving(true);

    try {
      const result = await apiRequest("/api/team", {
        method: "POST",
        body: JSON.stringify({
          fullName,
          email,
          phone,
          password,
          role: form.role,
        }),
      });

      setFormOpen(false);
      setForm(EMPTY_FORM);
      setNotice(result.message || "Anggota tim berhasil ditambahkan.");

      await loadMembers();
    } catch (err) {
      setFormError(err.message || "Gagal menambahkan anggota tim.");
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleStatus(member) {
    if (member.role === "admin") {
      setError("Status akun admin tidak dapat diubah melalui halaman ini.");
      return;
    }

    const nextStatus =
      member.membershipStatus === "active" ? "inactive" : "active";

    const confirmed = window.confirm(
      `${nextStatus === "inactive" ? "Nonaktifkan" : "Aktifkan"} anggota ${member.fullName}?`
    );

    if (!confirmed) return;

    setChangingId(member.id);
    setError("");
    setNotice("");

    try {
      const result = await apiRequest(
        `/api/team/${encodeURIComponent(member.id)}/status`,
        {
          method: "PATCH",
          body: JSON.stringify({ status: nextStatus }),
        }
      );

      setNotice(
        result.message ||
          `Status anggota berhasil diubah menjadi ${nextStatus}.`
      );

      await loadMembers();
    } catch (err) {
      setError(err.message || "Gagal mengubah status anggota.");
    } finally {
      setChangingId(null);
    }
  }

  return (
    <section className="services-page team-page">
      <header className="services-heading">
        <div>
          <span className="services-eyebrow">PEOPLE & ACCESS</span>
          <h2>Manajemen Tim</h2>
          <p>
            Kelola anggota, pembagian role, dan status akses tim bisnis kamu.
          </p>
        </div>

        <button
          className="services-primary-button"
          type="button"
          onClick={openForm}
        >
          <span>＋</span> Tambah Anggota
        </button>
      </header>

      {notice && (
        <div className="services-notice" role="status">
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice("")}>
            Tutup
          </button>
        </div>
      )}

      {error && (
        <div className="services-error" role="alert">
          <span>{error}</span>
          <button type="button" onClick={loadMembers}>
            Coba lagi
          </button>
        </div>
      )}

      <section className="services-summary team-summary">
        <div>
          <span>Total anggota</span>
          <strong>{loading ? "—" : members.length}</strong>
        </div>
        <div>
          <span>Anggota aktif</span>
          <strong>{loading ? "—" : activeCount}</strong>
        </div>
        <div>
          <span>Teknisi aktif</span>
          <strong>{loading ? "—" : technicianCount}</strong>
        </div>
      </section>

      <section className="services-panel">
        <form className="services-toolbar" onSubmit={handleSearch}>
          <label className="services-search">
            <span>⌕</span>
            <input
              type="search"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Cari nama, email, atau telepon..."
              maxLength={150}
            />
          </label>

          <select
            className="services-status-filter"
            aria-label="Filter role anggota"
            value={roleFilter}
            onChange={(event) => setRoleFilter(event.target.value)}
          >
            <option value="all">Semua role</option>
            <option value="admin">Admin</option>
            <option value="staff">Staff</option>
            <option value="technician">Teknisi</option>
          </select>

          <select
            className="services-status-filter"
            aria-label="Filter status anggota"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
          >
            <option value="all">Semua status</option>
            <option value="active">Aktif</option>
            <option value="inactive">Nonaktif</option>
          </select>

          <button className="services-secondary-button" type="submit">
            Cari
          </button>
        </form>

        <div className="team-table-toolbar">
          <span>
            {loading
              ? "Memuat anggota tim..."
              : `${filteredMembers.length} anggota ditemukan`}
          </span>

          <button
            className="services-secondary-button"
            type="button"
            onClick={loadMembers}
            disabled={loading}
          >
            ↻ Muat Ulang
          </button>
        </div>

        <div className="services-table-wrap">
          <table className="services-table team-table">
            <thead>
              <tr>
                <th>Anggota</th>
                <th>Role</th>
                <th>Status</th>
                <th>Bergabung</th>
                <th>Aksi</th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} className="services-empty">
                    Memuat anggota tim...
                  </td>
                </tr>
              ) : filteredMembers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="services-empty">
                    <strong>
                      {error
                        ? "Data anggota belum tersedia"
                        : "Tidak ada anggota yang cocok"}
                    </strong>
                    <span>
                      {error
                        ? "Periksa koneksi backend lalu coba lagi."
                        : "Ubah pencarian atau filter yang digunakan."}
                    </span>
                  </td>
                </tr>
              ) : (
                filteredMembers.map((member) => (
                  <tr key={member.id}>
                    <td>
                      <div className="services-name team-member-name">
                        <span className="services-avatar">
                          {(member.fullName || "?")
                            .trim()
                            .charAt(0)
                            .toUpperCase()}
                        </span>

                        <div>
                          <strong>{member.fullName}</strong>
                          <small>{member.email}</small>
                          {member.phone && <small>{member.phone}</small>}
                        </div>
                      </div>
                    </td>

                    <td>
                      <span
                        className={`team-role team-role-${member.role}`}
                      >
                        {roleLabel(member.role)}
                      </span>
                    </td>

                    <td>
                      <span
                        className={`services-status ${
                          member.membershipStatus === "active"
                            ? "team-status-active"
                            : "team-status-inactive"
                        }`}
                      >
                        {member.membershipStatus === "active"
                          ? "Aktif"
                          : "Nonaktif"}
                      </span>
                    </td>

                    <td>{formatDate(member.joinedAt)}</td>

                    <td>
                      {member.role === "admin" ? (
                        <span className="team-protected-label">
                          Akun admin
                        </span>
                      ) : (
                        <div className="services-actions team-actions">
                          <button
                            className={
                              member.membershipStatus === "active"
                                ? "services-deactivate-button"
                                : "services-activate-button"
                            }
                            type="button"
                            disabled={changingId === member.id}
                            onClick={() => handleToggleStatus(member)}
                          >
                            {changingId === member.id
                              ? "Memproses..."
                              : member.membershipStatus === "active"
                                ? "Nonaktifkan"
                                : "Aktifkan"}
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <footer className="services-pagination team-table-footer">
          <span>
            Status anggota mengatur aksesnya di workspace bisnis.
          </span>
        </footer>
      </section>

      {formOpen && (
        <div
          className="services-modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeForm();
          }}
        >
          <section
            className="services-modal team-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="team-modal-title"
          >
            <header className="services-modal-header">
              <div>
                <span className="services-eyebrow">NEW TEAM MEMBER</span>
                <h3 id="team-modal-title">Tambah Anggota</h3>
              </div>

              <button
                type="button"
                className="services-modal-close"
                onClick={closeForm}
                disabled={saving}
                aria-label="Tutup formulir"
              >
                ×
              </button>
            </header>

            <form className="services-form" onSubmit={handleCreate}>
              {formError && (
                <div className="services-error" role="alert">
                  {formError}
                </div>
              )}

              <label>
                <span className="services-label-text">
                  Nama lengkap <span className="required">*</span>
                </span>
                <input
                  name="fullName"
                  value={form.fullName}
                  onChange={handleFormChange}
                  placeholder="Nama lengkap anggota"
                  minLength={2}
                  maxLength={150}
                  autoComplete="name"
                  required
                />
              </label>

              <label>
                <span className="services-label-text">
                  Email <span className="required">*</span>
                </span>
                <input
                  name="email"
                  type="email"
                  value={form.email}
                  onChange={handleFormChange}
                  placeholder="nama@perusahaan.com"
                  maxLength={255}
                  autoComplete="email"
                  required
                />
                <small>
                  Email harus belum terdaftar pada sistem Sersa.
                </small>
              </label>

              <label>
                <span className="services-label-text">Nomor telepon</span>
                <input
                  name="phone"
                  type="tel"
                  value={form.phone}
                  onChange={handleFormChange}
                  placeholder="08xxxxxxxxxx"
                  maxLength={30}
                  autoComplete="tel"
                />
              </label>

              <label>
                <span className="services-label-text">
                  Role <span className="required">*</span>
                </span>
                <select
                  name="role"
                  value={form.role}
                  onChange={handleFormChange}
                  required
                >
                  <option value="technician">Teknisi</option>
                  <option value="staff">Staff</option>
                </select>
              </label>

              <label>
                <span className="services-label-text">
                  Password awal <span className="required">*</span>
                </span>
                <input
                  name="password"
                  type="password"
                  value={form.password}
                  onChange={handleFormChange}
                  placeholder="Minimal 10 karakter"
                  minLength={10}
                  maxLength={72}
                  autoComplete="new-password"
                  required
                />
                <small>
                  Berikan password awal kepada anggota secara pribadi.
                </small>
              </label>

              <div className="services-form-actions">
                <button
                  className="services-secondary-button"
                  type="button"
                  onClick={closeForm}
                  disabled={saving}
                >
                  Batal
                </button>

                <button
                  className="services-primary-button"
                  type="submit"
                  disabled={saving}
                >
                  {saving ? "Menyimpan..." : "Buat Anggota"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </section>
  );
}