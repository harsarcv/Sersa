
import { useCallback, useEffect, useState } from "react";
import "./Services.css";

const API_URL = (
  import.meta.env.VITE_API_URL || "http://localhost:5000"
).replace(/\/+$/, "");

const EMPTY_FORM = {
  name: "",
  description: "",
  basePrice: "",
  estimatedDurationMinutes: "",
  status: "active",
};

function formatCurrency(value) {
  const amount = Number(value);

  if (!Number.isFinite(amount)) return "—";

  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 2,
  }).format(amount);
}

function formatDuration(value) {
  if (value === null || value === undefined || value === "") {
    return "Belum ditentukan";
  }

  const minutes = Number(value);

  if (!Number.isFinite(minutes)) return "—";

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  if (hours && remainingMinutes) {
    return `${hours} jam ${remainingMinutes} menit`;
  }

  if (hours) return `${hours} jam`;

  return `${remainingMinutes} menit`;
}

export default function Services() {
  const [services, setServices] = useState([]);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 0,
  });

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [formOpen, setFormOpen] = useState(false);
  const [editingService, setEditingService] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [changingStatusId, setChangingStatusId] = useState(null);

  const loadServices = useCallback(async () => {
    const token = sessionStorage.getItem("sersa_token");

    if (!token) {
      window.location.replace("/login");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const params = new URLSearchParams({
        page: String(pagination.page),
        limit: String(pagination.limit),
        search,
        status,
      });

      const response = await fetch(
        `${API_URL}/api/services?${params.toString()}`,
        {
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${token}`,
          },
        }
      );

      const result = await response.json().catch(() => ({}));

      if (response.status === 401) {
        sessionStorage.removeItem("sersa_token");
        window.location.replace("/login");
        return;
      }

      if (!response.ok) {
        throw new Error(result.message || "Gagal memuat katalog layanan.");
      }

      setServices(Array.isArray(result.data) ? result.data : []);

      if (result.pagination) {
        setPagination((previous) => ({
          ...previous,
          ...result.pagination,
        }));
      }
    } catch (err) {
      setError(err.message || "Tidak dapat mengambil data layanan.");
    } finally {
      setLoading(false);
    }
  }, [pagination.page, pagination.limit, search, status]);

  useEffect(() => {
    loadServices();
  }, [loadServices]);

  function handleSearch(event) {
    event.preventDefault();
    setPagination((previous) => ({ ...previous, page: 1 }));
    setSearch(searchInput.trim());
  }

  function openCreateForm() {
    setEditingService(null);
    setForm(EMPTY_FORM);
    setFormError("");
    setFormOpen(true);
  }

  function openEditForm(service) {
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
    setFormError("");
    setFormOpen(true);
  }

  function closeForm() {
    if (saving) return;

    setFormOpen(false);
    setEditingService(null);
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

  function validateForm() {
    const name = form.name.trim();
    const description = form.description.trim();
    const priceText = form.basePrice.trim();
    const durationText = form.estimatedDurationMinutes.trim();

    if (!name || name.length > 150) {
      return "Nama layanan wajib diisi dan maksimal 150 karakter.";
    }

    if (
      description.length > 5000
    ) {
      return "Deskripsi maksimal 5.000 karakter.";
    }

    if (
      priceText === "" ||
      !/^\d+(\.\d{1,2})?$/.test(priceText) ||
      !Number.isFinite(Number(priceText)) ||
      Number(priceText) < 0
    ) {
      return "Harga wajib berupa angka nol atau lebih, maksimal dua angka desimal.";
    }

    if (
      durationText !== "" &&
      (!/^\d+$/.test(durationText) ||
        !Number.isSafeInteger(Number(durationText)) ||
        Number(durationText) <= 0)
    ) {
      return "Durasi harus berupa bilangan bulat lebih dari nol.";
    }

    if (!["active", "inactive"].includes(form.status)) {
      return "Status layanan tidak valid.";
    }

    return "";
  }

  async function handleSave(event) {
    event.preventDefault();
    setFormError("");

    const validationError = validateForm();

    if (validationError) {
      setFormError(validationError);
      return;
    }

    const token = sessionStorage.getItem("sersa_token");

    if (!token) {
      window.location.replace("/login");
      return;
    }

    const isEditing = Boolean(editingService);

    const payload = {
      name: form.name.trim(),
      description: form.description.trim(),
      basePrice: form.basePrice.trim(),
      estimatedDurationMinutes:
        form.estimatedDurationMinutes.trim() === ""
          ? null
          : Number(form.estimatedDurationMinutes),
      status: form.status,
    };

    setSaving(true);

    try {
      const response = await fetch(
        isEditing
          ? `${API_URL}/api/services/${editingService.id}`
          : `${API_URL}/api/services`,
        {
          method: isEditing ? "PUT" : "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(payload),
        }
      );

      const result = await response.json().catch(() => ({}));

      if (response.status === 401) {
        sessionStorage.removeItem("sersa_token");
        window.location.replace("/login");
        return;
      }

      if (!response.ok) {
        const validationMessages = result.errors
          ? Object.values(result.errors).join(" ")
          : "";

        throw new Error(
          validationMessages || result.message || "Gagal menyimpan layanan."
        );
      }

      setFormOpen(false);
      setEditingService(null);
      setForm(EMPTY_FORM);
      setNotice(
        result.message ||
          (isEditing
            ? "Layanan berhasil diperbarui."
            : "Layanan berhasil ditambahkan.")
      );

      setPagination((previous) => ({ ...previous, page: 1 }));
      setSearch("");
      setSearchInput("");
      setStatus("all");

      // Muat ulang langsung jika filter dan halaman tidak berubah.
      if (
        pagination.page === 1 &&
        search === "" &&
        status === "all"
      ) {
        await loadServices();
      }
    } catch (err) {
      setFormError(err.message || "Terjadi kesalahan saat menyimpan layanan.");
    } finally {
      setSaving(false);
    }
  }

  async function handleStatusChange(service) {
    const nextStatus =
      service.status === "active" ? "inactive" : "active";

    const confirmed = window.confirm(
      `${nextStatus === "inactive" ? "Nonaktifkan" : "Aktifkan"} layanan "${service.name}"?`
    );

    if (!confirmed) return;

    const token = sessionStorage.getItem("sersa_token");

    if (!token) {
      window.location.replace("/login");
      return;
    }

    setChangingStatusId(service.id);
    setError("");
    setNotice("");

    try {
      const response = await fetch(
        `${API_URL}/api/services/${service.id}/status`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ status: nextStatus }),
        }
      );

      const result = await response.json().catch(() => ({}));

      if (response.status === 401) {
        sessionStorage.removeItem("sersa_token");
        window.location.replace("/login");
        return;
      }

      if (!response.ok) {
        throw new Error(result.message || "Gagal mengubah status layanan.");
      }

      setNotice(result.message || "Status layanan berhasil diperbarui.");
      await loadServices();
    } catch (err) {
      setError(err.message || "Terjadi kesalahan saat mengubah status.");
    } finally {
      setChangingStatusId(null);
    }
  }

  const startItem =
    pagination.total === 0
      ? 0
      : (pagination.page - 1) * pagination.limit + 1;

  const endItem = Math.min(
    pagination.page * pagination.limit,
    pagination.total
  );

  return (
    <section className="services-page">
      <header className="services-heading">
        <div>
          <span className="services-eyebrow">SERVICE MANAGEMENT</span>
          <h2>Katalog Layanan</h2>
          <p>Kelola layanan, harga, estimasi durasi, dan statusnya.</p>
        </div>

        <button
          className="services-primary-button"
          type="button"
          onClick={openCreateForm}
        >
          <span>＋</span> Tambah Layanan
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
          <button type="button" onClick={loadServices}>
            Coba lagi
          </button>
        </div>
      )}

      <section className="services-summary">
        <div>
          <span>Total sesuai filter</span>
          <strong>{loading ? "—" : pagination.total}</strong>
        </div>
        <div>
          <span>Filter status</span>
          <strong>
            {status === "all"
              ? "Semua"
              : status === "active"
                ? "Aktif"
                : "Nonaktif"}
          </strong>
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
              placeholder="Cari nama atau deskripsi layanan..."
              maxLength={150}
            />
          </label>

          <select
            className="services-status-filter"
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              setPagination((previous) => ({ ...previous, page: 1 }));
            }}
            aria-label="Filter status layanan"
          >
            <option value="all">Semua layanan</option>
            <option value="active">Layanan aktif</option>
            <option value="inactive">Layanan nonaktif</option>
          </select>

          <button className="services-secondary-button" type="submit">
            Cari
          </button>
        </form>

        <div className="services-table-wrap">
          <table className="services-table">
            <thead>
              <tr>
                <th>Layanan</th>
                <th>Harga dasar</th>
                <th>Estimasi durasi</th>
                <th>Status</th>
                <th>Aksi</th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} className="services-empty">
                    Memuat katalog layanan...
                  </td>
                </tr>
              ) : services.length === 0 ? (
                <tr>
                  <td colSpan={5} className="services-empty">
                    <strong>Belum ada layanan</strong>
                    <span>
                      Ubah filter atau tambahkan layanan baru untuk memulai.
                    </span>
                  </td>
                </tr>
              ) : (
                services.map((service) => (
                  <tr key={service.id}>
                    <td>
                      <div className="services-name">
                        <span className="services-avatar">◇</span>
                        <div>
                          <strong>{service.name}</strong>
                          <small>
                            {service.description || "Tidak ada deskripsi"}
                          </small>
                          <small>ID #{service.id}</small>
                        </div>
                      </div>
                    </td>

                    <td className="services-price">
                      {formatCurrency(service.base_price)}
                    </td>

                    <td>
                      {formatDuration(service.estimated_duration_minutes)}
                    </td>

                    <td>
                      <span
                        className={`services-status services-status-${service.status}`}
                      >
                        {service.status === "active" ? "Aktif" : "Nonaktif"}
                      </span>
                    </td>

                    <td>
                      <div className="services-actions">
                        <button
                          type="button"
                          className="services-edit-button"
                          onClick={() => openEditForm(service)}
                        >
                          Edit
                        </button>

                        <button
                          type="button"
                          className={
                            service.status === "active"
                              ? "services-deactivate-button"
                              : "services-activate-button"
                          }
                          disabled={changingStatusId === service.id}
                          onClick={() => handleStatusChange(service)}
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

        <footer className="services-pagination">
          <span>
            Menampilkan {startItem}–{endItem} dari {pagination.total} layanan
          </span>

          <div>
            <button
              type="button"
              disabled={loading || pagination.page <= 1}
              onClick={() =>
                setPagination((previous) => ({
                  ...previous,
                  page: previous.page - 1,
                }))
              }
            >
              Sebelumnya
            </button>

            <span>
              {pagination.page} / {Math.max(1, pagination.totalPages)}
            </span>

            <button
              type="button"
              disabled={
                loading ||
                pagination.page >= pagination.totalPages
              }
              onClick={() =>
                setPagination((previous) => ({
                  ...previous,
                  page: previous.page + 1,
                }))
              }
            >
              Berikutnya
            </button>
          </div>
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
            className="services-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="services-modal-title"
          >
            <header className="services-modal-header">
              <div>
                <span className="services-eyebrow">SERVICE DETAILS</span>
                <h3 id="services-modal-title">
                  {editingService ? "Edit Layanan" : "Tambah Layanan"}
                </h3>
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

            <form className="services-form" onSubmit={handleSave}>
              {formError && (
                <div className="services-error" role="alert">
                  {formError}
                </div>
              )}

              <label>
                <span className="services-label-text">Nama layanan <span className="required">*</span></span>
                <input
                  name="name"
                  value={form.name}
                  onChange={handleFormChange}
                  maxLength={150}
                  placeholder="Contoh: Servis AC"
                  required
                />
              </label>

              <label>
                Deskripsi
                <textarea
                  name="description"
                  value={form.description}
                  onChange={handleFormChange}
                  maxLength={5000}
                  rows={3}
                  placeholder="Jelaskan layanan yang ditawarkan..."
                />
              </label>

              <label>
                <span className="services-label-text">Harga dasar (Rupiah) <span className="required">*</span></span>
                <input
                  type="number"
                  name="basePrice"
                  value={form.basePrice}
                  onChange={handleFormChange}
                  min="0"
                  step="0.01"
                  placeholder="150000"
                  required
                />
              </label>

              <label>
                Estimasi durasi (menit)
                <input
                  type="number"
                  name="estimatedDurationMinutes"
                  value={form.estimatedDurationMinutes}
                  onChange={handleFormChange}
                  min="1"
                  step="1"
                  placeholder="60"
                />
                <small>Kosongkan jika durasi belum ditentukan.</small>
              </label>

              <label>
                Status layanan
                <select
                  name="status"
                  value={form.status}
                  onChange={handleFormChange}
                >
                  <option value="active">Aktif</option>
                  <option value="inactive">Nonaktif</option>
                </select>
              </label>

              <div className="services-form-actions">
                <button
                  type="button"
                  className="services-secondary-button"
                  onClick={closeForm}
                  disabled={saving}
                >
                  Batal
                </button>

                <button
                  type="submit"
                  className="services-primary-button"
                  disabled={saving}
                >
                  {saving
                    ? "Menyimpan..."
                    : editingService
                      ? "Simpan Perubahan"
                      : "Tambah Layanan"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </section>
  );
}
