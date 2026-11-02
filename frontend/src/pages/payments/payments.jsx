
import { useCallback, useEffect, useMemo, useState } from "react";
import "../services/Services.css";
import "./Payments.css";

const API_URL = (
  import.meta.env.VITE_API_URL || "http://localhost:5000"
).replace(/\/+$/, "");

const EMPTY_FORM = {
  invoiceId: "",
  amount: "",
  method: "cash",
  reference: "",
  notes: "",
};

const PAYMENT_METHODS = {
  cash: "Cash",
  bank_transfer: "Bank Transfer",
  card: "Card",
  other: "Other",
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

function formatDate(value) {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "—";

  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

async function apiRequest(url, options = {}) {
  const token = sessionStorage.getItem("sersa_token");

  if (!token) {
    window.location.replace("/login");
    throw new Error("Sesi login tidak ditemukan.");
  }

  const response = await fetch(url, {
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
    throw new Error("Sesi login berakhir.");
  }

  if (!response.ok) {
    throw new Error(result.message || "Permintaan ke server gagal.");
  }

  return result;
}

export default function Payments() {
  const [payments, setPayments] = useState([]);
  const [invoices, setInvoices] = useState([]);

  const [pagination, setPagination] = useState({
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 0,
  });

  const [loading, setLoading] = useState(true);
  const [loadingInvoices, setLoadingInvoices] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  const loadPayments = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const params = new URLSearchParams({
        page: String(pagination.page),
        limit: String(pagination.limit),
      });

      const result = await apiRequest(
        `${API_URL}/api/payments?${params.toString()}`
      );

      setPayments(Array.isArray(result.data) ? result.data : []);

      if (result.pagination) {
        setPagination((previous) => ({
          ...previous,
          ...result.pagination,
        }));
      }
    } catch (err) {
      setError(err.message || "Gagal memuat pembayaran.");
    } finally {
      setLoading(false);
    }
  }, [pagination.page, pagination.limit]);

  useEffect(() => {
    loadPayments();
  }, [loadPayments]);

  const summary = useMemo(() => {
    return payments.reduce(
      (result, payment) => {
        result.count += 1;
        result.total += Number(payment.amount || 0);

        if (payment.method === "cash") {
          result.cash += Number(payment.amount || 0);
        }

        if (payment.method === "bank_transfer") {
          result.transfer += Number(payment.amount || 0);
        }

        return result;
      },
      {
        count: 0,
        total: 0,
        cash: 0,
        transfer: 0,
      }
    );
  }, [payments]);

  async function openCreateForm() {
    setForm(EMPTY_FORM);
    setFormError("");
    setFormOpen(true);
    setLoadingInvoices(true);

    try {
      const result = await apiRequest(
        `${API_URL}/api/invoices?page=1&limit=100`
      );

      const availableInvoices = (result.data || []).filter(
        (invoice) =>
          ["unpaid", "partially_paid"].includes(invoice.status) &&
          Number(invoice.remainingAmount) > 0
      );

      setInvoices(availableInvoices);
    } catch (err) {
      setInvoices([]);
      setFormError(err.message || "Gagal mengambil daftar invoice.");
    } finally {
      setLoadingInvoices(false);
    }
  }

  function closeForm() {
    if (saving) return;

    setFormOpen(false);
    setForm(EMPTY_FORM);
    setFormError("");
  }

  function handleChange(event) {
    const { name, value } = event.target;

    setForm((previous) => ({
      ...previous,
      [name]: value,
    }));
  }

  const selectedInvoice = invoices.find(
    (invoice) => String(invoice.id) === String(form.invoiceId)
  );

  const remainingAmount = selectedInvoice
    ? Number(selectedInvoice.remainingAmount)
    : 0;

  async function handleSubmit(event) {
    event.preventDefault();
    setFormError("");

    if (!form.invoiceId) {
      setFormError("Pilih invoice terlebih dahulu.");
      return;
    }

    const amountText = form.amount.trim();

    if (!/^\d+(\.\d{1,2})?$/.test(amountText)) {
      setFormError("Jumlah pembayaran harus berupa angka positif dengan maksimal 2 desimal.");
      return;
    }

    const amount = Number(amountText);

    if (!Number.isFinite(amount) || amount <= 0) {
      setFormError("Jumlah pembayaran harus lebih dari nol.");
      return;
    }

    if (amount > remainingAmount) {
      setFormError("Jumlah pembayaran melebihi sisa tagihan.");
      return;
    }

    if (!Object.hasOwn(PAYMENT_METHODS, form.method)) {
      setFormError("Metode pembayaran tidak valid.");
      return;
    }

    if (form.reference.trim().length > 150) {
      setFormError("Referensi maksimal 150 karakter.");
      return;
    }

    if (form.notes.trim().length > 2000) {
      setFormError("Catatan maksimal 2000 karakter.");
      return;
    }

    setSaving(true);

    try {
      const result = await apiRequest(
        `${API_URL}/api/payments`,
        {
          method: "POST",
          body: JSON.stringify({
            invoiceId: Number(form.invoiceId),
            amount: amountText,
            method: form.method,
            reference: form.reference.trim(),
            notes: form.notes.trim(),
          }),
        }
      );

      setFormOpen(false);
      setForm(EMPTY_FORM);

      setNotice(
        result.message || "Pembayaran berhasil dicatat."
      );

      setPagination((previous) => ({
        ...previous,
        page: 1,
      }));

      if (pagination.page === 1) {
        await loadPayments();
      }
    } catch (err) {
      setFormError(err.message || "Pembayaran gagal dicatat.");
    } finally {
      setSaving(false);
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
    <section className="services-page payment-page">
      <header className="services-heading">
        <div>
          <span className="services-eyebrow">FINANCIAL OPERATIONS</span>
          <h2>Pembayaran</h2>
          <p>
            Catat pembayaran pelanggan dan pantau riwayat transaksi invoice.
          </p>
        </div>

        <button
          className="services-primary-button"
          type="button"
          onClick={openCreateForm}
        >
          <span>＋</span> Catat Pembayaran
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
          <button type="button" onClick={loadPayments}>
            Coba lagi
          </button>
        </div>
      )}

      <section className="payment-summary">
        <div>
          <span>Jumlah Transaksi (halaman ini)</span>
          <strong>{summary.count}</strong>
        </div>

        <div>
          <span>Total Pembayaran (halaman ini)</span>
          <strong>{formatCurrency(summary.total)}</strong>
        </div>

        <div>
          <span>Pembayaran Cash</span>
          <strong>{formatCurrency(summary.cash)}</strong>
        </div>

        <div>
          <span>Bank Transfer</span>
          <strong>{formatCurrency(summary.transfer)}</strong>
        </div>
      </section>

      <section className="services-panel">
        <div className="services-toolbar">
          <div className="payment-toolbar-title">
            <strong>Riwayat Pembayaran</strong>
            <span>{pagination.total} transaksi tercatat</span>
          </div>
        </div>

        <div className="services-table-wrap">
          <table className="services-table payment-table">
            <thead>
              <tr>
                <th>Invoice</th>
                <th>Pelanggan</th>
                <th>Tanggal Pembayaran</th>
                <th>Metode</th>
                <th>Referensi</th>
                <th>Jumlah</th>
                <th>Dicatat Oleh</th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="services-empty">
                    Memuat riwayat pembayaran...
                  </td>
                </tr>
              ) : payments.length === 0 ? (
                <tr>
                  <td colSpan={7} className="services-empty">
                    Belum ada transaksi pembayaran.
                  </td>
                </tr>
              ) : (
                payments.map((payment) => (
                  <tr key={payment.id}>
                    <td>
                      <strong className="payment-invoice-number">
                        {payment.invoiceNumber}
                      </strong>
                    </td>

                    <td>{payment.customerName || "—"}</td>
                    <td>{formatDate(payment.paymentDate)}</td>

                    <td>
                      <span className="payment-method">
                        {PAYMENT_METHODS[payment.method] || payment.method}
                      </span>
                    </td>

                    <td>{payment.reference || "—"}</td>

                    <td className="payment-amount">
                      {formatCurrency(payment.amount)}
                    </td>

                    <td>{payment.recordedBy || "—"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <footer className="services-pagination">
          <span>
            Menampilkan {startItem}–{endItem} dari {pagination.total} transaksi
          </span>

          <div>
            <button
              className="services-secondary-button"
              type="button"
              disabled={pagination.page <= 1 || loading}
              onClick={() =>
                setPagination((previous) => ({
                  ...previous,
                  page: previous.page - 1,
                }))
              }
            >
              Sebelumnya
            </button>

            <span className="payment-page-number">
              {pagination.page} / {Math.max(pagination.totalPages, 1)}
            </span>

            <button
              className="services-secondary-button"
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
        <div className="services-modal-backdrop">
          <section
            className="services-modal payment-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="payment-form-title"
          >
            <header className="services-modal-header">
              <div>
                <span className="services-eyebrow">NEW TRANSACTION</span>
                <h3 id="payment-form-title">Catat Pembayaran</h3>
                <p>
                  Masukkan pembayaran yang diterima dari pelanggan.
                </p>
              </div>

              <button
                className="services-modal-close"
                type="button"
                onClick={closeForm}
                disabled={saving}
              >
                ×
              </button>
            </header>

            <form className="services-form" onSubmit={handleSubmit}>
              {formError && (
                <div className="services-error" role="alert">
                  {formError}
                </div>
              )}

              {loadingInvoices ? (
                <p className="payment-loading">
                  Memuat invoice yang belum lunas...
                </p>
              ) : (
                <label>
                  <span className="services-label-text">
                    Invoice <span className="required">*</span>
                  </span>

                  <select
                    name="invoiceId"
                    value={form.invoiceId}
                    onChange={(event) => {
                      handleChange(event);
                      setFormError("");
                    }}
                    required
                  >
                    <option value="">Pilih Invoice</option>

                    {invoices.map((invoice) => (
                      <option key={invoice.id} value={invoice.id}>
                        {invoice.invoiceNumber} — {invoice.customerName}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              {!loadingInvoices && invoices.length === 0 && (
                <p className="payment-help">
                  Tidak ada invoice yang menunggu pembayaran.
                  Buat invoice terlebih dahulu melalui halaman Invoice.
                </p>
              )}

              {selectedInvoice && (
                <div className="payment-invoice-info">
                  <div>
                    <span>Total Tagihan</span>
                    <strong>{formatCurrency(selectedInvoice.total)}</strong>
                  </div>

                  <div>
                    <span>Sudah Dibayar</span>
                    <strong>
                      {formatCurrency(selectedInvoice.paidAmount)}
                    </strong>
                  </div>

                  <div>
                    <span>Sisa Tagihan</span>
                    <strong className="payment-remaining">
                      {formatCurrency(remainingAmount)}
                    </strong>
                  </div>
                </div>
              )}

              <label>
                <span className="services-label-text">
                  Jumlah Pembayaran <span className="required">*</span>
                </span>

                <input
                  type="number"
                  name="amount"
                  min="0.01"
                  max={remainingAmount || undefined}
                  step="0.01"
                  value={form.amount}
                  onChange={handleChange}
                  placeholder="Masukkan jumlah pembayaran"
                  required
                />

                {selectedInvoice && (
                  <small className="payment-field-help">
                    Maksimal {formatCurrency(remainingAmount)}
                  </small>
                )}
              </label>

              <label>
                <span className="services-label-text">
                  Metode Pembayaran <span className="required">*</span>
                </span>

                <select
                  name="method"
                  value={form.method}
                  onChange={handleChange}
                  required
                >
                  <option value="cash">Cash</option>
                  <option value="bank_transfer">Bank Transfer</option>
                  <option value="card">Card</option>
                  <option value="other">Other</option>
                </select>
              </label>

              <label>
                <span className="services-label-text">
                  Referensi Transaksi
                </span>

                <input
                  type="text"
                  name="reference"
                  maxLength={150}
                  value={form.reference}
                  onChange={handleChange}
                  placeholder="Nomor referensi atau bukti transaksi"
                />
              </label>

              <label>
                <span className="services-label-text">Catatan</span>

                <textarea
                  name="notes"
                  rows={3}
                  maxLength={2000}
                  value={form.notes}
                  onChange={handleChange}
                  placeholder="Catatan tambahan..."
                />
              </label>

              <div className="payment-info">
                <strong>Informasi pembayaran</strong>
                <p>
                  Pembayaran akan langsung memperbarui status invoice.
                  Jika jumlah pembayaran belum mencukupi, status menjadi
                  Dibayar Sebagian.
                </p>
              </div>

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
                  disabled={
                    saving ||
                    loadingInvoices ||
                    invoices.length === 0
                  }
                >
                  {saving ? "Menyimpan..." : "Simpan Pembayaran"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </section>
  );
}
