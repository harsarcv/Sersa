
import { useCallback, useEffect, useMemo, useState } from "react";
import "./App.css";

const API_URL = (import.meta.env.VITE_API_URL || "").replace(/\/+$/, "");
const TOKEN_KEY = "sersa_token";

const EMPTY_FORM = {
  name: "",
  description: "",
  basePrice: "",
  estimatedDurationMinutes: "",
  status: "active",
};

function formatRupiah(value) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
}

function formatDate(value) {
  if (!value) return "-";

  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

async function apiRequest(path, token, options = {}) {
  if (!API_URL) {
    throw new Error(
      "VITE_API_URL belum diatur. Periksa environment frontend."
    );
  }

  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error(
        "Sesi tidak valid atau berakhir. Masukkan token login yang valid."
      );
    }

    if (response.status === 403) {
      throw new Error(
        "Akun kamu tidak memiliki izin mengelola katalog layanan."
      );
    }

    throw new Error(
      data.message || `Permintaan gagal dengan status ${response.status}.`
    );
  }

  return data;
}

function App() {
  const [token, setToken] = useState(
    () => sessionStorage.getItem(TOKEN_KEY) || ""
  );
  const [tokenInput, setTokenInput] = useState("");
  const [services, setServices] = useState([]);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 0,
  });
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [loading, setLoading] = useState(false);
  const [pageError, setPageError] = useState("");
  const [notice, setNotice] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingService, setEditingService] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formErrors, setFormErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [changingStatusId, setChangingStatusId] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const [showToken, setShowToken] = useState(false);

  const activeCount = useMemo(
    () => services.filter((service) => service.status === "active").length,
    [services]
  );

  const loadServices = useCallback(async () => {
    if (!token) {
      setServices([]);
      setPagination({
        page: 1,
        limit: 10,
        total: 0,
        totalPages: 0,
      });
      setLoading(false);
      return;
    }

    setLoading(true);
    setPageError("");

    try {
      const params = new URLSearchParams({
        page: String(pagination.page),
        limit: String(pagination.limit),
        status: statusFilter,
      });

      if (search) params.set("search", search);

      const result = await apiRequest(
        `/api/services?${params.toString()}`,
        token
      );

      setServices(result.data || []);
      setPagination(
        result.pagination || {
          page: 1,
          limit: 10,
          total: 0,
          totalPages: 0,
        }
      );
    } catch (error) {
      setPageError(error.message || "Gagal memuat katalog layanan.");
      setServices([]);
    } finally {
      setLoading(false);
    }
  }, [token, pagination.page, pagination.limit, statusFilter, search]);

  useEffect(() => {
    loadServices();
  }, [loadServices, refreshKey]);

  function connectWithToken(event) {
    event.preventDefault();

    const value = tokenInput.trim();

    if (!value) {
      setPageError("Masukkan token autentikasi terlebih dahulu.");
      return;
    }

    sessionStorage.setItem(TOKEN_KEY, value);
    setToken(value);
    setPagination((current) => ({ ...current, page: 1 }));
    setPageError("");
    setNotice("Token sesi berhasil disimpan.");
  }

  function disconnect() {
    sessionStorage.removeItem(TOKEN_KEY);
    setToken("");
    setTokenInput("");
    setServices([]);
    setPageError("");
    setNotice("Sesi katalog telah diakhiri.");
    closeModal();
  }

  function openCreateModal() {
    setEditingService(null);
    setForm({ ...EMPTY_FORM });
    setFormErrors({});
    setModalOpen(true);
  }

  function openEditModal(service) {
    setEditingService(service);
    setForm({
      name: service.name || "",
      description: service.description || "",
      basePrice: String(service.base_price ?? ""),
      estimatedDurationMinutes:
        service.estimated_duration_minutes == null
          ? ""
          : String(service.estimated_duration_minutes),
      status: service.status || "active",
    });
    setFormErrors({});
    setModalOpen(true);
  }

  function closeModal() {
    if (saving) return;
    setModalOpen(false);
    setEditingService(null);
    setForm({ ...EMPTY_FORM });
    setFormErrors({});
  }

  function updateForm(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
    setFormErrors((current) => ({ ...current, [field]: "" }));
  }

  function validateForm() {
    const errors = {};

    if (!form.name.trim()) {
      errors.name = "Nama layanan wajib diisi.";
    } else if (form.name.trim().length > 150) {
      errors.name = "Nama layanan maksimal 150 karakter.";
    }

    if (
      form.basePrice === "" ||
      !Number.isFinite(Number(form.basePrice)) ||
      Number(form.basePrice) < 0 ||
      !/^\d+(\.\d{1,2})?$/.test(form.basePrice.trim())
    ) {
      errors.basePrice = "Masukkan harga yang valid, maksimal 2 desimal.";
    }

    if (
      form.estimatedDurationMinutes !== "" &&
      (!Number.isSafeInteger(Number(form.estimatedDurationMinutes)) ||
        Number(form.estimatedDurationMinutes) <= 0)
    ) {
      errors.estimatedDurationMinutes =
        "Durasi harus berupa bilangan bulat lebih dari nol.";
    }

    if (!["active", "inactive"].includes(form.status)) {
      errors.status = "Pilih status layanan yang valid.";
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function saveService(event) {
    event.preventDefault();

    if (!validateForm()) return;

    setSaving(true);
    setNotice("");
    setPageError("");

    const payload = {
      name: form.name.trim(),
      description: form.description.trim(),
      basePrice: Number(form.basePrice),
      estimatedDurationMinutes:
        form.estimatedDurationMinutes === ""
          ? null
          : Number(form.estimatedDurationMinutes),
      status: form.status,
    };

    try {
      const isEditing = Boolean(editingService);
      const path = isEditing
        ? `/api/services/${editingService.id}`
        : "/api/services";

      const result = await apiRequest(path, token, {
        method: isEditing ? "PUT" : "POST",
        body: JSON.stringify(payload),
      });

      setNotice(
        result.message ||
          (isEditing
            ? "Layanan berhasil diperbarui."
            : "Layanan berhasil dibuat.")
      );

      setModalOpen(false);
      setEditingService(null);
      setForm({ ...EMPTY_FORM });
      setFormErrors({});
      setRefreshKey((value) => value + 1);
    } catch (error) {
      setPageError(error.message || "Gagal menyimpan layanan.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleServiceStatus(service) {
    const nextStatus =
      service.status === "active" ? "inactive" : "active";

    const confirmed = window.confirm(
      nextStatus === "inactive"
        ? `Nonaktifkan layanan "${service.name}"?`
        : `Aktifkan kembali layanan "${service.name}"?`
    );

    if (!confirmed) return;

    setChangingStatusId(service.id);
    setPageError("");
    setNotice("");

    try {
      const result = await apiRequest(
        `/api/services/${service.id}/status`,
        token,
        {
          method: "PATCH",
          body: JSON.stringify({ status: nextStatus }),
        }
      );

      setNotice(result.message || "Status layanan berhasil diperbarui.");
      setRefreshKey((value) => value + 1);
    } catch (error) {
      setPageError(error.message || "Gagal memperbarui status layanan.");
    } finally {
      setChangingStatusId(null);
    }
  }

  function applySearch(event) {
    event.preventDefault();
    setPagination((current) => ({ ...current, page: 1 }));
    setSearch(searchInput.trim());
  }

  function changeStatusFilter(value) {
    setStatusFilter(value);
    setPagination((current) => ({ ...current, page: 1 }));
  }

  function changePage(nextPage) {
    if (
      nextPage < 1 ||
      nextPage > pagination.totalPages ||
      nextPage === pagination.page
    ) {
      return;
    }

    setPagination((current) => ({ ...current, page: nextPage }));
  }

  return (
    <main className="sersa-app">
      <aside className="sidebar">
        <a className="brand" href="#home" aria-label="Sersa">
          <span className="brand-mark">S</span>
          <span>
            <strong>Sersa</strong>
            <small>Service Management</small>
          </span>
        </a>

        <div className="sidebar-label">WORKSPACE</div>

        <nav className="navigation" aria-label="Navigasi utama">
          <a className="nav-item" href="#home">
            <span className="nav-icon">▦</span>
            Dashboard
          </a>
          <a className="nav-item" href="#customers">
            <span className="nav-icon">♙</span>
            Pelanggan
          </a>
          <a className="nav-item selected" href="#services">
            <span className="nav-icon">◇</span>
            Katalog layanan
          </a>
          <a className="nav-item disabled" href="#requests" aria-disabled="true">
            <span className="nav-icon">▤</span>
            Permintaan layanan
            <span className="nav-soon">Segera</span>
          </a>
          <a className="nav-item disabled" href="#appointments" aria-disabled="true">
            <span className="nav-icon">▦</span>
            Jadwal
            <span className="nav-soon">Segera</span>
          </a>
          <a className="nav-item disabled" href="#invoices" aria-disabled="true">
            <span className="nav-icon">▧</span>
            Invoice
            <span className="nav-soon">Segera</span>
          </a>
        </nav>

        <div className="sidebar-bottom">
          <div className="connection-card">
            <span className={`connection-dot ${token ? "connected" : ""}`} />
            <div>
              <strong>{token ? "Sesi tersedia" : "Belum terhubung"}</strong>
              <small>
                {token ? "Token tersedia di sesi ini" : "API memerlukan token"}
              </small>
            </div>
          </div>
          {token && (
            <button className="sidebar-logout" onClick={disconnect}>
              Keluar dari katalog
            </button>
          )}
          <p className="sidebar-version">Sersa · MVP</p>
        </div>
      </aside>

      <section className="main-panel" id="services">
        <header className="topbar">
          <div className="breadcrumb">
            Workspace <span>/</span> <strong>Katalog layanan</strong>
          </div>
          <div className="topbar-user">
            <span className="avatar">S</span>
            <div>
              <strong>Workspace</strong>
              <small>Manajemen layanan</small>
            </div>
          </div>
        </header>

        <div className="page-content">
          <div className="page-heading">
            <div>
              <div className="eyebrow">OPERASIONAL</div>
              <h1>Katalog layanan</h1>
              <p>
                Kelola jenis layanan, tarif, durasi pengerjaan, dan status
                layanan bisnismu.
              </p>
            </div>
            <button
              className="button button-primary"
              onClick={openCreateModal}
              disabled={!token}
            >
              <span>＋</span> Tambah layanan
            </button>
          </div>

          {!token && (
            <section className="token-panel">
              <div className="token-symbol">↗</div>
              <div className="token-copy">
                <h2>Hubungkan sesi API</h2>
                <p>
                  Masukkan token autentikasi dari proses login Sersa untuk
                  memuat dan mengelola data layanan dari database.
                </p>
                <form className="token-form" onSubmit={connectWithToken}>
                  <label className="sr-only" htmlFor="api-token">
                    Token autentikasi
                  </label>
                  <input
                    id="api-token"
                    type={showToken ? "text" : "password"}
                    autoComplete="off"
                    placeholder="Tempel token autentikasi di sini"
                    value={tokenInput}
                    onChange={(event) => setTokenInput(event.target.value)}
                  />
                  <button
                    className="button button-secondary"
                    type="button"
                    onClick={() => setShowToken((value) => !value)}
                  >
                    {showToken ? "Sembunyikan" : "Lihat"}
                  </button>
                  <button className="button button-primary" type="submit">
                    Hubungkan
                  </button>
                </form>
                <small className="form-help">
                  Token hanya disimpan di sessionStorage tab browser ini.
                  Jangan masukkan token ke komputer bersama.
                </small>
              </div>
            </section>
          )}

          {notice && (
            <div className="alert alert-success" role="status">
              <span>✓</span>
              {notice}
              <button onClick={() => setNotice("")} aria-label="Tutup notifikasi">
                ×
              </button>
            </div>
          )}

          {pageError && (
            <div className="alert alert-error" role="alert">
              <span>!</span>
              {pageError}
              <button onClick={() => setPageError("")} aria-label="Tutup pesan">
                ×
              </button>
            </div>
          )}

          <div className="metrics-grid">
            <article className="metric-card">
              <div className="metric-top">
                <span>Total layanan</span>
                <span className="metric-icon purple">◇</span>
              </div>
              <strong>{token && !loading ? pagination.total : "—"}</strong>
              <small>Hasil sesuai filter saat ini</small>
            </article>
            <article className="metric-card">
              <div className="metric-top">
                <span>Layanan aktif di halaman</span>
                <span className="metric-icon green">✓</span>
              </div>
              <strong>{token && !loading ? activeCount : "—"}</strong>
              <small>Layanan yang dapat dipilih</small>
            </article>
            <article className="metric-card">
              <div className="metric-top">
                <span>Halaman</span>
                <span className="metric-icon blue">▤</span>
              </div>
              <strong>
                {token && !loading
                  ? `${pagination.page} / ${Math.max(pagination.totalPages, 1)}`
                  : "—"}
              </strong>
              <small>Maksimal 100 data per halaman</small>
            </article>
          </div>

          <section className="catalog-card">
            <div className="catalog-header">
              <div>
                <h2>Semua layanan</h2>
                <p>Daftar layanan yang tersimpan di database.</p>
              </div>
              <button
                className="button button-secondary refresh-button"
                onClick={() => setRefreshKey((value) => value + 1)}
                disabled={!token || loading}
              >
                <span className={loading ? "refresh-spin" : ""}>↻</span>
                Segarkan
              </button>
            </div>

            <div className="toolbar">
              <form className="search-form" onSubmit={applySearch}>
                <span aria-hidden="true">⌕</span>
                <input
                  type="search"
                  placeholder="Cari nama atau deskripsi layanan..."
                  value={searchInput}
                  onChange={(event) => setSearchInput(event.target.value)}
                  disabled={!token}
                  aria-label="Cari layanan"
                />
                <button type="submit" disabled={!token}>
                  Cari
                </button>
              </form>

              <label className="filter-control">
                <span>Status</span>
                <select
                  value={statusFilter}
                  onChange={(event) => changeStatusFilter(event.target.value)}
                  disabled={!token}
                >
                  <option value="all">Semua status</option>
                  <option value="active">Aktif</option>
                  <option value="inactive">Nonaktif</option>
                </select>
              </label>
            </div>

            <div className="table-wrap">
              <table className="service-table">
                <thead>
                  <tr>
                    <th>LAYANAN</th>
                    <th>TARIF DASAR</th>
                    <th>DURASI</th>
                    <th>STATUS</th>
                    <th>TERAKHIR DIPERBARUI</th>
                    <th className="action-heading">AKSI</th>
                  </tr>
                </thead>
                <tbody>
                  {!token ? (
                    <tr>
                      <td colSpan="6">
                        <div className="empty-state">
                          <span className="empty-icon">◇</span>
                          <strong>Hubungkan sesi terlebih dahulu</strong>
                          <p>
                            Data layanan akan dimuat setelah token autentikasi
                            tersedia.
                          </p>
                        </div>
                      </td>
                    </tr>
                  ) : loading ? (
                    <tr>
                      <td colSpan="6">
                        <div className="empty-state">
                          <span className="loading-spinner" />
                          <strong>Memuat katalog layanan...</strong>
                          <p>Mengambil data dari API Sersa.</p>
                        </div>
                      </td>
                    </tr>
                  ) : services.length === 0 ? (
                    <tr>
                      <td colSpan="6">
                        <div className="empty-state">
                          <span className="empty-icon">◇</span>
                          <strong>
                            {search || statusFilter !== "all"
                              ? "Layanan tidak ditemukan"
                              : "Belum ada layanan"}
                          </strong>
                          <p>
                            {search || statusFilter !== "all"
                              ? "Ubah kata pencarian atau filter status."
                              : "Tambahkan layanan pertama untuk memulai katalog."}
                          </p>
                          {!search && statusFilter === "all" && (
                            <button
                              className="button button-primary"
                              onClick={openCreateModal}
                            >
                              ＋ Tambah layanan
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ) : (
                    services.map((service) => (
                      <tr key={service.id}>
                        <td>
                          <div className="service-name">
                            <span className="service-avatar">
                              {service.name?.trim().charAt(0).toUpperCase() || "L"}
                            </span>
                            <div>
                              <strong>{service.name}</strong>
                              <small>{service.description || "Tanpa deskripsi"}</small>
                            </div>
                          </div>
                        </td>
                        <td className="price-cell">
                          {formatRupiah(service.base_price)}
                        </td>
                        <td>
                          {service.estimated_duration_minutes
                            ? `${service.estimated_duration_minutes} menit`
                            : "Tidak ditentukan"}
                        </td>
                        <td>
                          <span
                            className={`status-badge ${
                              service.status === "active" ? "status-active" : "status-inactive"
                            }`}
                          >
                            <span />
                            {service.status === "active" ? "Aktif" : "Nonaktif"}
                          </span>
                        </td>
                        <td className="date-cell">
                          {formatDate(service.updated_at)}
                        </td>
                        <td>
                          <div className="row-actions">
                            <button
                              className="action-button"
                              onClick={() => openEditModal(service)}
                              disabled={changingStatusId === service.id}
                            >
                              Edit
                            </button>
                            <button
                              className={`action-button ${
                                service.status === "active"
                                  ? "action-danger"
                                  : "action-enable"
                              }`}
                              onClick={() => toggleServiceStatus(service)}
                              disabled={changingStatusId === service.id}
                            >
                              {changingStatusId === service.id
                                ? "Memproses..."
                                : service.status === "active"
                                  ? "Nonaktifkan"
                                  : "Aktifkan"}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <footer className="pagination-bar">
              <span>
                {token
                  ? `Menampilkan ${services.length ? (pagination.page - 1) * pagination.limit + 1 : 0}–${(pagination.page - 1) * pagination.limit + services.length} dari ${pagination.total} layanan`
                  : "Belum ada data"}
              </span>
              <div className="pagination-controls">
                <button
                  className="page-button"
                  onClick={() => changePage(pagination.page - 1)}
                  disabled={!token || loading || pagination.page <= 1}
                >
                  ← Sebelumnya
                </button>
                <span className="page-number">
                  {pagination.page}
                </span>
                <button
                  className="page-button"
                  onClick={() => changePage(pagination.page + 1)}
                  disabled={
                    !token ||
                    loading ||
                    pagination.page >= pagination.totalPages
                  }
                >
                  Berikutnya →
                </button>
              </div>
            </footer>
          </section>

          <footer className="page-footer">
            <span>Sersa Service Business Management</span>
            <span>Data ditampilkan dari API, bukan data contoh.</span>
          </footer>
        </div>
      </section>

      {modalOpen && (
        <div
          className="modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeModal();
          }}
        >
          <section
            className="service-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-title"
          >
            <header className="modal-header">
              <div>
                <div className="eyebrow">
                  KATALOG LAYANAN
                </div>
                <h2 id="modal-title">
                  {editingService ? "Edit layanan" : "Tambah layanan"}
                </h2>
                <p>
                  Isi informasi layanan yang akan ditawarkan kepada pelanggan.
                </p>
              </div>
              <button
                className="modal-close"
                onClick={closeModal}
                disabled={saving}
                aria-label="Tutup formulir"
              >
                ×
              </button>
            </header>

            <form className="service-form" onSubmit={saveService}>
              <label className="field">
                <span>Nama layanan <b>*</b></span>
                <input
                  autoFocus
                  type="text"
                  maxLength={150}
                  placeholder="Contoh: Servis AC"
                  value={form.name}
                  onChange={(event) => updateForm("name", event.target.value)}
                  aria-invalid={Boolean(formErrors.name)}
                />
                {formErrors.name && (
                  <small className="field-error">{formErrors.name}</small>
                )}
              </label>

              <label className="field">
                <span>Deskripsi</span>
                <textarea
                  rows={3}
                  maxLength={2000}
                  placeholder="Jelaskan cakupan layanan..."
                  value={form.description}
                  onChange={(event) =>
                    updateForm("description", event.target.value)
                  }
                />
              </label>

              <div className="form-grid">
                <label className="field">
                  <span>Tarif dasar (Rp) <b>*</b></span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="150000"
                    value={form.basePrice}
                    onChange={(event) =>
                      updateForm("basePrice", event.target.value)
                    }
                    aria-invalid={Boolean(formErrors.basePrice)}
                  />
                  {formErrors.basePrice && (
                    <small className="field-error">
                      {formErrors.basePrice}
                    </small>
                  )}
                </label>

                <label className="field">
                  <span>Durasi (menit)</span>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    placeholder="60"
                    value={form.estimatedDurationMinutes}
                    onChange={(event) =>
                      updateForm(
                        "estimatedDurationMinutes",
                        event.target.value
                      )
                    }
                    aria-invalid={Boolean(formErrors.estimatedDurationMinutes)}
                  />
                  {formErrors.estimatedDurationMinutes && (
                    <small className="field-error">
                      {formErrors.estimatedDurationMinutes}
                    </small>
                  )}
                </label>
              </div>

              <label className="field">
                <span>Status</span>
                <select
                  value={form.status}
                  onChange={(event) => updateForm("status", event.target.value)}
                >
                  <option value="active">Aktif</option>
                  <option value="inactive">Nonaktif</option>
                </select>
              </label>

              <div className="form-note">
                <span>ⓘ</span>
                Tarif yang dimasukkan adalah tarif dasar. Biaya akhir suatu
                pekerjaan dapat berbeda sesuai layanan yang diberikan.
              </div>

              <footer className="modal-actions">
                <button
                  className="button button-secondary"
                  type="button"
                  onClick={closeModal}
                  disabled={saving}
                >
                  Batal
                </button>
                <button
                  className="button button-primary"
                  type="submit"
                  disabled={saving}
                >
                  {saving
                    ? "Menyimpan..."
                    : editingService
                      ? "Simpan perubahan"
                      : "Simpan layanan"}
                </button>
              </footer>
            </form>
          </section>
        </div>
      )}
    </main>
  );
}

export default App;
