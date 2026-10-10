
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import "./Customers.css";

const API_URL = (
  import.meta.env.VITE_API_URL || "http://localhost:5000"
).replace(/\/+$/, "");

const EMPTY_FORM = {
  fullName: "",
  email: "",
  phone: "",
};

export default function Customers() {
  const [customers, setCustomers] = useState([]);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 0,
  });
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("active");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState("");
  const [deactivatingId, setDeactivatingId] = useState(null);

  const loadCustomers = useCallback(async () => {
    const token = sessionStorage.getItem("sersa_token");

    if (!token) {
      window.location.replace("/login");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const params = new URLSearchParams({
        search,
        status,
        page: String(pagination.page),
        limit: String(pagination.limit),
      });

      const response = await fetch(
        `${API_URL}/api/customers?${params.toString()}`,
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
        throw new Error(result.message || "Gagal memuat pelanggan.");
      }

      setCustomers(Array.isArray(result.data) ? result.data : []);
      setPagination((previous) => ({
        ...previous,
        ...(result.pagination || {}),
      }));
    } catch (err) {
      setError(err.message || "Tidak dapat mengambil data pelanggan.");
    } finally {
      setLoading(false);
    }
  }, [search, status, pagination.page, pagination.limit]);

  useEffect(() => {
    loadCustomers();
  }, [loadCustomers]);

  function handleSearch(event) {
    event.preventDefault();
    setPagination((previous) => ({ ...previous, page: 1 }));
    setSearch(searchInput.trim());
  }

  function openCreateForm() {
    setEditingCustomer(null);
    setForm(EMPTY_FORM);
    setFormError("");
    setFormOpen(true);
  }

  function openEditForm(customer) {
    setEditingCustomer(customer);
    setForm({
      fullName: customer.full_name || "",
      email: customer.email || "",
      phone: customer.phone || "",
    });
    setFormError("");
    setFormOpen(true);
  }

  function closeForm() {
    if (saving) return;
    setFormOpen(false);
    setEditingCustomer(null);
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

  async function handleSave(event) {
    event.preventDefault();
    setFormError("");

    const fullName = form.fullName.trim();
    const email = form.email.trim().toLowerCase();
    const phone = form.phone.trim();

    if (fullName.length < 2 || fullName.length > 150) {
      setFormError("Nama pelanggan harus terdiri dari 2–150 karakter.");
      return;
    }

    if (
      email &&
      (email.length > 255 ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    ) {
      setFormError("Format email tidak valid.");
      return;
    }

    if (phone.length > 30) {
      setFormError("Nomor telepon maksimal 30 karakter.");
      return;
    }

    const token = sessionStorage.getItem("sersa_token");

    if (!token) {
      window.location.replace("/login");
      return;
    }

    setSaving(true);

    try {
      const isEditing = Boolean(editingCustomer);
      const url = isEditing
        ? `${API_URL}/api/customers/${editingCustomer.id}`
        : `${API_URL}/api/customers`;

      const response = await fetch(url, {
        method: isEditing ? "PUT" : "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          fullName,
          email,
          phone,
        }),
      });

      const result = await response.json().catch(() => ({}));

      if (response.status === 401) {
        sessionStorage.removeItem("sersa_token");
        window.location.replace("/login");
        return;
      }

      if (!response.ok) {
        throw new Error(result.message || "Gagal menyimpan pelanggan.");
      }

      setFormOpen(false);
      setEditingCustomer(null);
      setForm(EMPTY_FORM);
      setNotice(
        result.message ||
          (isEditing
            ? "Pelanggan berhasil diperbarui."
            : "Pelanggan berhasil ditambahkan.")
      );

      setPagination((previous) => ({ ...previous, page: 1 }));
      setSearch("");
      setSearchInput("");
      await loadCustomers();
    } catch (err) {
      setFormError(err.message || "Terjadi kesalahan saat menyimpan.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeactivate(customer) {
    const confirmed = window.confirm(
      `Nonaktifkan pelanggan "${customer.full_name}"?`
    );

    if (!confirmed) return;

    const token = sessionStorage.getItem("sersa_token");

    if (!token) {
      window.location.replace("/login");
      return;
    }

    setDeactivatingId(customer.id);
    setError("");
    setNotice("");

    try {
      const response = await fetch(
        `${API_URL}/api/customers/${customer.id}/deactivate`,
        {
          method: "PATCH",
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
        throw new Error(result.message || "Gagal menonaktifkan pelanggan.");
      }

      setNotice(result.message || "Pelanggan berhasil dinonaktifkan.");
      await loadCustomers();
    } catch (err) {
      setError(err.message || "Terjadi kesalahan saat menonaktifkan.");
    } finally {
      setDeactivatingId(null);
    }
  }

  const startItem =
    pagination.total === 0 ? 0 : (pagination.page - 1) * pagination.limit + 1;

  const endItem = Math.min(
    pagination.page * pagination.limit,
    pagination.total
  );

  return (
    <section className="customers-page">
      <header className="customers-heading">
        <div>
          <span className="customers-eyebrow">CUSTOMER MANAGEMENT</span>
          <h2>Manajemen Pelanggan</h2>
          <p>Kelola informasi dan status pelanggan bisnis kamu.</p>
        </div>

        <button
          className="customers-primary-button"
          type="button"
          onClick={openCreateForm}
        >
          <span>＋</span> Tambah Pelanggan
        </button>
      </header>

      {notice && (
        <div className="customers-notice" role="status">
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice("")}>
            Tutup
          </button>
        </div>
      )}

      {error && (
        <div className="customers-error" role="alert">
          <span>{error}</span>
          <button type="button" onClick={loadCustomers}>
            Coba lagi
          </button>
        </div>
      )}

      <div className="customers-summary">
        <div>
          <span>Total sesuai filter</span>
          <strong>{loading ? "—" : pagination.total}</strong>
        </div>
        <div>
          <span>Status ditampilkan</span>
          <strong>
            {status === "all"
              ? "Semua"
              : status === "active"
                ? "Aktif"
                : "Nonaktif"}
          </strong>
        </div>
      </div>

      <section className="customers-panel">
        <form className="customers-toolbar" onSubmit={handleSearch}>
          <label className="customers-search">
            <span>⌕</span>
            <input
              type="search"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Cari nama, email, atau nomor telepon..."
              maxLength={255}
            />
          </label>

          <select
            className="customers-status-filter"
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              setPagination((previous) => ({ ...previous, page: 1 }));
            }}
            aria-label="Filter status pelanggan"
          >
            <option value="active">Pelanggan aktif</option>
            <option value="inactive">Pelanggan nonaktif</option>
            <option value="all">Semua pelanggan</option>
          </select>

          <button className="customers-secondary-button" type="submit">
            Cari
          </button>
        </form>

        <div className="customers-table-wrap">
          <table className="customers-table">
            <thead>
              <tr>
                <th>Pelanggan</th>
                <th>Kontak</th>
                <th>Status</th>
                <th>Terdaftar</th>
                <th>Aksi</th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} className="customers-empty">
                    Memuat data pelanggan...
                  </td>
                </tr>
              ) : customers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="customers-empty">
                    <strong>Belum ada pelanggan</strong>
                    <span>
                      Coba ubah filter atau tambahkan pelanggan baru.
                    </span>
                  </td>
                </tr>
              ) : (
                customers.map((customer) => (
                  <tr key={customer.id}>
                    <td>
                      <div className="customers-name">
                        <span className="customers-avatar">
                          {(customer.full_name || "?")
                            .trim()
                            .charAt(0)
                            .toUpperCase()}
                        </span>
                        <div>
                          <strong>{customer.full_name}</strong>
                          <small>ID #{customer.id}</small>
                        </div>
                      </div>
                    </td>

                    <td>
                      <div className="customers-contact">
                        <span>{customer.email || "—"}</span>
                        <small>{customer.phone || "Nomor belum tersedia"}</small>
                      </div>
                    </td>

                    <td>
                      <span
                        className={`customers-status customers-status-${customer.status}`}
                      >
                        {customer.status === "active" ? "Aktif" : "Nonaktif"}
                      </span>
                    </td>

                    <td>
                      {customer.created_at
                        ? new Date(customer.created_at).toLocaleDateString(
                            "id-ID",
                            {
                              day: "2-digit",
                              month: "short",
                              year: "numeric",
                            }
                          )
                        : "—"}
                    </td>

                    <td>
                      <div className="customers-actions">
                        <button
                          type="button"
                          className="customers-edit-button"
                          onClick={() => openEditForm(customer)}
                        >
                          Edit
                        </button>

                        {customer.status === "active" && (
                          <button
                            type="button"
                            className="customers-deactivate-button"
                            disabled={deactivatingId === customer.id}
                            onClick={() => handleDeactivate(customer)}
                          >
                            {deactivatingId === customer.id
                              ? "Memproses..."
                              : "Nonaktifkan"}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <footer className="customers-pagination">
          <span>
            Menampilkan {startItem}–{endItem} dari {pagination.total} pelanggan
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
          className="customers-modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeForm();
          }}
        >
          <section
            className="customers-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="customers-modal-title"
          >
            <header className="customers-modal-header">
              <div>
                <span className="customers-eyebrow">CUSTOMER DETAILS</span>
                <h3 id="customers-modal-title">
                  {editingCustomer ? "Edit Pelanggan" : "Tambah Pelanggan"}
                </h3>
              </div>

              <button
                type="button"
                className="customers-modal-close"
                onClick={closeForm}
                disabled={saving}
                aria-label="Tutup formulir"
              >
                ×
              </button>
            </header>

            <form className="customers-form" onSubmit={handleSave}>
              {formError && (
                <div className="customers-error" role="alert">
                  {formError}
                </div>
              )}

              <label>
                <span className="customers-label-text">Nama lengkap <span className="required">*</span></span>
                <input
                  name="fullName"
                  value={form.fullName}
                  onChange={handleFormChange}
                  minLength={2}
                  maxLength={150}
                  placeholder="Nama pelanggan"
                  autoComplete="name"
                  required
                />
              </label>

              <label>
                <span className="customers-label-text">Email</span>
                <input
                  type="email"
                  name="email"
                  value={form.email}
                  onChange={handleFormChange}
                  maxLength={255}
                  placeholder="pelanggan@email.com"
                  autoComplete="email"
                />
              </label>

              <label>
                <span className="customers-label-text">Nomor telepon</span>
                <input
                  type="tel"
                  name="phone"
                  value={form.phone}
                  onChange={handleFormChange}
                  maxLength={30}
                  placeholder="Contoh: 081234567890"
                  autoComplete="tel"
                />
              </label>

              <div className="customers-form-actions">
                <button
                  type="button"
                  className="customers-secondary-button"
                  onClick={closeForm}
                  disabled={saving}
                >
                  Batal
                </button>

                <button
                  type="submit"
                  className="customers-primary-button"
                  disabled={saving}
                >
                  {saving
                    ? "Menyimpan..."
                    : editingCustomer
                      ? "Simpan Perubahan"
                      : "Tambah Pelanggan"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </section>
  );
}
