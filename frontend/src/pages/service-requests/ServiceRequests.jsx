
import { useCallback, useEffect, useState } from "react";
import "../services/Services.css";
import "./ServiceRequests.css";

const API_URL = (
  import.meta.env.VITE_API_URL || "http://localhost:5000"
).replace(/\/+$/, "");

const EMPTY_FORM = {
  customerId: "",
  serviceId: "",
  addressId: "",
  description: "",
  preferredDate: "",
};

const EMPTY_PAGINATION = {
  page: 1,
  limit: 10,
  total: 0,
  totalPages: 0,
};

const STATUS_LABELS = {
  requested: "Menunggu Review",
  approved: "Disetujui",
  rejected: "Ditolak",
  cancelled: "Dibatalkan",
};

function formatDate(value) {
  if (!value) return "Tidak ditentukan";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "—";

  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function formatCurrency(value) {
  const amount = Number(value);

  if (!Number.isFinite(amount)) return "—";

  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 2,
  }).format(amount);
}

async function readResponse(response) {
  const result = await response.json().catch(() => ({}));

  if (response.status === 401) {
    sessionStorage.removeItem("sersa_token");
    window.location.replace("/login");
    throw new Error("Sesi login berakhir.");
  }

  if (!response.ok) {
    throw new Error(
      result.message || "Permintaan ke server gagal."
    );
  }

  return result;
}

export default function ServiceRequests() {
  const [requests, setRequests] = useState([]);
  const [pagination, setPagination] = useState(EMPTY_PAGINATION);

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  const [customers, setCustomers] = useState([]);
  const [services, setServices] = useState([]);
  const [addresses, setAddresses] = useState([]);
  const [loadingOptions, setLoadingOptions] = useState(false);

  const [reviewingId, setReviewingId] = useState(null);
  const [rejectingRequest, setRejectingRequest] = useState(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [reviewError, setReviewError] = useState("");

  const loadRequests = useCallback(async () => {
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
        `${API_URL}/api/service-requests?${params}`,
        {
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${token}`,
          },
        }
      );

      const result = await readResponse(response);

      setRequests(Array.isArray(result.data) ? result.data : []);

      if (result.pagination) {
        setPagination((previous) => ({
          ...previous,
          ...result.pagination,
        }));
      }
    } catch (err) {
      setError(err.message || "Gagal memuat permintaan layanan.");
    } finally {
      setLoading(false);
    }
  }, [pagination.page, pagination.limit, search, status]);

  useEffect(() => {
    loadRequests();
  }, [loadRequests]);

  async function openCreateForm() {
    const token = sessionStorage.getItem("sersa_token");

    if (!token) {
      window.location.replace("/login");
      return;
    }

    setForm(EMPTY_FORM);
    setFormError("");
    setAddresses([]);
    setFormOpen(true);
    setLoadingOptions(true);

    try {
      const headers = {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
      };

      const [customerResponse, serviceResponse] = await Promise.all([
        fetch(
          `${API_URL}/api/customers?status=active&limit=100&page=1`,
          { headers }
        ),
        fetch(
          `${API_URL}/api/services?status=active&limit=100&page=1`,
          { headers }
        ),
      ]);

      const [customerResult, serviceResult] = await Promise.all([
        readResponse(customerResponse),
        readResponse(serviceResponse),
      ]);

      setCustomers(
        Array.isArray(customerResult.data) ? customerResult.data : []
      );

      setServices(
        Array.isArray(serviceResult.data) ? serviceResult.data : []
      );
    } catch (err) {
      setFormError(
        err.message || "Gagal memuat pilihan pelanggan dan layanan."
      );
    } finally {
      setLoadingOptions(false);
    }
  }

  async function handleCustomerChange(event) {
    const customerId = event.target.value;

    setForm((previous) => ({
      ...previous,
      customerId,
      addressId: "",
    }));

    setAddresses([]);
    setFormError("");

    if (!customerId) return;

    const token = sessionStorage.getItem("sersa_token");

    if (!token) {
      window.location.replace("/login");
      return;
    }

    try {
      const response = await fetch(
        `${API_URL}/api/customers/${customerId}/addresses`,
        {
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${token}`,
          },
        }
      );

      const result = await readResponse(response);

      const addressList = Array.isArray(result.data)
        ? result.data
        : [];

      setAddresses(addressList);

      if (addressList.length === 0) {
        setFormError(
          "Pelanggan ini belum memiliki alamat. Tambahkan alamat melalui menu Pelanggan terlebih dahulu."
        );
      }
    } catch (err) {
      setFormError(err.message || "Gagal memuat alamat pelanggan.");
    }
  }

  function handleFormChange(event) {
    const { name, value } = event.target;

    setForm((previous) => ({
      ...previous,
      [name]: value,
    }));
  }

  function validateForm() {
    if (!form.customerId || !form.serviceId || !form.addressId) {
      return "Pelanggan, layanan, dan alamat wajib dipilih.";
    }

    if (
      form.description.trim().length < 5 ||
      form.description.trim().length > 5000
    ) {
      return "Deskripsi harus terdiri dari 5–5000 karakter.";
    }

    if (form.preferredDate) {
      const selected = new Date(`${form.preferredDate}T00:00:00`);
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      if (
        Number.isNaN(selected.getTime()) ||
        selected < today
      ) {
        return "Tanggal pilihan tidak boleh sebelum hari ini.";
      }
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

    setSaving(true);

    try {
      const response = await fetch(
        `${API_URL}/api/service-requests`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            customerId: Number(form.customerId),
            serviceId: Number(form.serviceId),
            addressId: Number(form.addressId),
            description: form.description.trim(),
            preferredDate: form.preferredDate || null,
          }),
        }
      );

      const result = await readResponse(response);

      setFormOpen(false);
      setForm(EMPTY_FORM);
      setNotice(
        result.message || "Permintaan layanan berhasil dibuat."
      );

      setPagination((previous) => ({
        ...previous,
        page: 1,
      }));
      setSearch("");
      setSearchInput("");
      setStatus("all");

      if (
        pagination.page === 1 &&
        search === "" &&
        status === "all"
      ) {
        await loadRequests();
      }
    } catch (err) {
      setFormError(
        err.message || "Gagal membuat permintaan layanan."
      );
    } finally {
      setSaving(false);
    }
  }

  async function submitReview(request, nextStatus, reason = "") {
    const token = sessionStorage.getItem("sersa_token");

    if (!token) {
      window.location.replace("/login");
      return;
    }

    setReviewingId(request.id);
    setReviewError("");
    setError("");
    setNotice("");

    try {
      const response = await fetch(
        `${API_URL}/api/service-requests/${request.id}/review`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            status: nextStatus,
            rejectionReason: reason,
          }),
        }
      );

      const result = await readResponse(response);

      setRejectingRequest(null);
      setRejectionReason("");
      setNotice(
        result.message || "Review permintaan berhasil diproses."
      );

      await loadRequests();
    } catch (err) {
      setReviewError(
        err.message || "Review permintaan gagal diproses."
      );
    } finally {
      setReviewingId(null);
    }
  }

  function handleSearch(event) {
    event.preventDefault();
    setPagination((previous) => ({
      ...previous,
      page: 1,
    }));
    setSearch(searchInput.trim());
  }

  function closeForm() {
    if (saving) return;

    setFormOpen(false);
    setForm(EMPTY_FORM);
    setFormError("");
  }

  const requestedCount = requests.filter(
    (request) => request.status === "requested"
  ).length;

  const startItem =
    pagination.total === 0
      ? 0
      : (pagination.page - 1) * pagination.limit + 1;

  const endItem = Math.min(
    pagination.page * pagination.limit,
    pagination.total
  );

  return (
    <section className="services-page request-page">
      <header className="services-heading">
        <div>
          <span className="services-eyebrow">
            SERVICE OPERATIONS
          </span>
          <h2>Permintaan Layanan</h2>
          <p>
            Kelola permintaan pelanggan, periksa detail, dan
            proses persetujuan layanan.
          </p>
        </div>

        <button
          className="services-primary-button"
          type="button"
          onClick={openCreateForm}
        >
          <span>＋</span> Buat Permintaan
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
          <button type="button" onClick={loadRequests}>
            Coba lagi
          </button>
        </div>
      )}

      {reviewError && (
        <div className="services-error" role="alert">
          <span>{reviewError}</span>
          <button type="button" onClick={() => setReviewError("")}>
            Tutup
          </button>
        </div>
      )}

      <section className="services-summary">
        <div>
          <span>Total sesuai filter</span>
          <strong>{loading ? "—" : pagination.total}</strong>
        </div>
        <div>
          <span>Menunggu review di halaman ini</span>
          <strong>{loading ? "—" : requestedCount}</strong>
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
              placeholder="Cari pelanggan, layanan, atau deskripsi..."
              maxLength={150}
            />
          </label>

          <select
            className="services-status-filter"
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              setPagination((previous) => ({
                ...previous,
                page: 1,
              }));
            }}
            aria-label="Filter status permintaan"
          >
            <option value="all">Semua status</option>
            <option value="requested">Menunggu review</option>
            <option value="approved">Disetujui</option>
            <option value="rejected">Ditolak</option>
            <option value="cancelled">Dibatalkan</option>
          </select>

          <button className="services-secondary-button" type="submit">
            Cari
          </button>
        </form>

        <div className="services-table-wrap">
          <table className="services-table request-table">
            <thead>
              <tr>
                <th>Permintaan</th>
                <th>Pelanggan</th>
                <th>Layanan</th>
                <th>Tanggal pilihan</th>
                <th>Status</th>
                <th>Aksi</th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="services-empty">
                    Memuat permintaan layanan...
                  </td>
                </tr>
              ) : requests.length === 0 ? (
                <tr>
                  <td colSpan={6} className="services-empty">
                    <strong>Belum ada permintaan layanan</strong>
                    <span>
                      Ubah filter atau buat permintaan baru.
                    </span>
                  </td>
                </tr>
              ) : (
                requests.map((request) => (
                  <tr key={request.id}>
                    <td>
                      <div className="services-name">
                        <span className="services-avatar">◇</span>
                        <div>
                          <strong>Request #{request.id}</strong>
                          <small>
                            {request.description || "Tanpa deskripsi"}
                          </small>
                          <small>
                            Dibuat {formatDate(request.created_at)}
                          </small>
                          {request.rejection_reason && (
                            <small className="request-rejection">
                              Alasan: {request.rejection_reason}
                            </small>
                          )}
                        </div>
                      </div>
                    </td>

                    <td>
                      <strong className="request-customer">
                        {request.customer_name || "—"}
                      </strong>
                      <small className="request-subtext">
                        {request.address_label || "Alamat"}
                      </small>
                    </td>

                    <td>
                      <strong className="request-customer">
                        {request.service_name || "—"}
                      </strong>
                      <small className="request-subtext">
                        {formatCurrency(request.base_price)}
                      </small>
                    </td>

                    <td>{formatDate(request.preferred_date)}</td>

                    <td>
                      <span
                        className={`services-status services-status-${request.status}`}
                      >
                        {STATUS_LABELS[request.status] || request.status}
                      </span>
                    </td>

                    <td>
                      {request.status === "requested" ? (
                        <div className="services-actions request-actions">
                          <button
                            type="button"
                            className="services-activate-button"
                            disabled={reviewingId === request.id}
                            onClick={() => {
                              const confirmed = window.confirm(
                                `Setujui permintaan #${request.id}?`
                              );

                              if (confirmed) {
                                submitReview(request, "approved");
                              }
                            }}
                          >
                            Setujui
                          </button>

                          <button
                            type="button"
                            className="services-deactivate-button"
                            disabled={reviewingId === request.id}
                            onClick={() => {
                              setRejectingRequest(request);
                              setRejectionReason("");
                              setReviewError("");
                            }}
                          >
                            Tolak
                          </button>
                        </div>
                      ) : (
                        <span className="request-no-action">—</span>
                      )}

                      {reviewingId === request.id && (
                        <small className="request-subtext">
                          Memproses...
                        </small>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <footer className="services-pagination">
          <span>
            Menampilkan {startItem}–{endItem} dari{" "}
            {pagination.total} permintaan
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
            className="services-modal request-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="request-modal-title"
          >
            <header className="services-modal-header">
              <div>
                <span className="services-eyebrow">
                  REQUEST DETAILS
                </span>
                <h3 id="request-modal-title">
                  Buat Permintaan Layanan
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

              {loadingOptions ? (
                <p className="request-loading-options">
                  Memuat data pelanggan dan layanan...
                </p>
              ) : (
                <>
                  <label>
                    <span className="services-label-text">Pelanggan <span className="required">*</span></span>
                    <select
                      name="customerId"
                      value={form.customerId}
                      onChange={handleCustomerChange}
                      required
                    >
                      <option value="">Pilih pelanggan</option>
                      {customers.map((customer) => (
                        <option key={customer.id} value={customer.id}>
                          {customer.full_name}
                        </option>
                      ))}
                    </select>
                    {customers.length === 0 && (
                      <small>
                        Belum ada pelanggan aktif. Tambahkan melalui menu
                        Pelanggan terlebih dahulu.
                      </small>
                    )}
                  </label>

                  <label>
                    <span className="services-label-text">Layanan <span className="required">*</span></span>
                    <select
                      name="serviceId"
                      value={form.serviceId}
                      onChange={handleFormChange}
                      required
                    >
                      <option value="">Pilih layanan aktif</option>
                      {services.map((service) => (
                        <option key={service.id} value={service.id}>
                          {service.name} — {formatCurrency(service.base_price)}
                        </option>
                      ))}
                    </select>
                    {services.length === 0 && (
                      <small>
                        Belum ada layanan aktif di katalog.
                      </small>
                    )}
                  </label>

                  <label>
                    <span className="services-label-text">Alamat pelanggan <span className="required">*</span></span>
                    <select
                      name="addressId"
                      value={form.addressId}
                      onChange={handleFormChange}
                      required
                      disabled={!form.customerId || addresses.length === 0}
                    >
                      <option value="">Pilih alamat</option>
                      {addresses.map((address) => (
                        <option key={address.id} value={address.id}>
                          {address.label || "Alamat"} — {address.address}
                          {address.is_default ? " (Utama)" : ""}
                        </option>
                      ))}
                    </select>
                    <small>
                      Pilih pelanggan terlebih dahulu untuk memuat alamatnya.
                    </small>
                  </label>

                  <label>
                    <span className="services-label-text">Deskripsi kebutuhan <span className="required">*</span></span>
                    <textarea
                      name="description"
                      value={form.description}
                      onChange={handleFormChange}
                      minLength={5}
                      maxLength={5000}
                      rows={4}
                      placeholder="Jelaskan masalah atau kebutuhan pelanggan..."
                      required
                    />
                    <small>
                      Minimal 5 dan maksimal 5.000 karakter.
                    </small>
                  </label>

                  <label>
                    Tanggal pilihan
                    <input
                      type="date"
                      name="preferredDate"
                      value={form.preferredDate}
                      onChange={handleFormChange}
                      min={new Date().toLocaleDateString("en-CA")}
                    />
                    <small>
                      Opsional. Tanggal ini belum merupakan jadwal yang
                      dikonfirmasi.
                    </small>
                  </label>
                </>
              )}

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
                  disabled={saving || loadingOptions}
                >
                  {saving ? "Menyimpan..." : "Buat Permintaan"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {rejectingRequest && (
        <div
          className="services-modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setRejectingRequest(null);
              setRejectionReason("");
              setReviewError("");
            }
          }}
        >
          <section
            className="services-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="reject-modal-title"
          >
            <header className="services-modal-header">
              <div>
                <span className="services-eyebrow">REVIEW REQUEST</span>
                <h3 id="reject-modal-title">
                  Tolak Request #{rejectingRequest.id}
                </h3>
              </div>

              <button
                type="button"
                className="services-modal-close"
                onClick={() => setRejectingRequest(null)}
                disabled={reviewingId !== null}
                aria-label="Tutup formulir"
              >
                ×
              </button>
            </header>

            <form
              className="services-form"
              onSubmit={(event) => {
                event.preventDefault();

                const reason = rejectionReason.trim();

                if (!reason) {
                  setReviewError("Alasan penolakan wajib diisi.");
                  return;
                }

                if (reason.length > 2000) {
                  setReviewError(
                    "Alasan penolakan maksimal 2.000 karakter."
                  );
                  return;
                }

                submitReview(
                  rejectingRequest,
                  "rejected",
                  reason
                );
              }}
            >
              {reviewError && (
                <div className="services-error" role="alert">
                  {reviewError}
                </div>
              )}

              <label>
                Alasan penolakan <span>*</span>
                <textarea
                  value={rejectionReason}
                  onChange={(event) =>
                    setRejectionReason(event.target.value)
                  }
                  minLength={1}
                  maxLength={2000}
                  rows={4}
                  placeholder="Jelaskan alasan penolakan secara jelas..."
                  required
                />
              </label>

              <div className="services-form-actions">
                <button
                  type="button"
                  className="services-secondary-button"
                  onClick={() => {
                    setRejectingRequest(null);
                    setRejectionReason("");
                    setReviewError("");
                  }}
                  disabled={reviewingId !== null}
                >
                  Batal
                </button>

                <button
                  type="submit"
                  className="services-primary-button request-reject-submit"
                  disabled={reviewingId !== null}
                >
                  {reviewingId !== null
                    ? "Memproses..."
                    : "Konfirmasi Penolakan"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </section>
  );
}
