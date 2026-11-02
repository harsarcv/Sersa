
import { useCallback, useEffect, useMemo, useState } from "react";
import "../services/Services.css";
import "./Invoices.css";

const API_URL = (
  import.meta.env.VITE_API_URL || "http://localhost:5000"
).replace(/\/+$/, "");

const EMPTY_PAGINATION = {
  page: 1,
  limit: 10,
  total: 0,
  totalPages: 0,
};

const STATUS_LABELS = {
  unpaid: "Belum Dibayar",
  partially_paid: "Dibayar Sebagian",
  paid: "Lunas",
  void: "Dibatalkan",
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
  }).format(date);
}

function getTodayDate() {
  const date = new Date();
  const offset = date.getTimezoneOffset();

  return new Date(date.getTime() - offset * 60000)
    .toISOString()
    .slice(0, 10);
}

async function readResponse(response) {
  const result = await response.json().catch(() => ({}));

  if (response.status === 401) {
    sessionStorage.removeItem("sersa_token");
    window.location.replace("/login");
    throw new Error("Sesi login berakhir. Silakan login kembali.");
  }

  if (!response.ok) {
    throw new Error(result.message || "Permintaan ke server gagal.");
  }

  return result;
}

export default function Invoices() {
  const [invoices, setInvoices] = useState([]);
  const [pagination, setPagination] = useState(EMPTY_PAGINATION);
  const [status, setStatus] = useState("");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [formOpen, setFormOpen] = useState(false);
  const [workOrders, setWorkOrders] = useState([]);
  const [loadingWorkOrders, setLoadingWorkOrders] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  const [form, setForm] = useState({
    workOrderId: "",
    dueAt: "",
    notes: "",
  });

  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const loadInvoices = useCallback(async () => {
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
      });

      if (status) params.set("status", status);

      const response = await fetch(
        `${API_URL}/api/invoices?${params.toString()}`,
        {
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${token}`,
          },
        }
      );

      const result = await readResponse(response);

      setInvoices(Array.isArray(result.data) ? result.data : []);

      setPagination((previous) => ({
        ...previous,
        ...(result.pagination || {}),
      }));
    } catch (err) {
      setError(err.message || "Gagal memuat daftar invoice.");
    } finally {
      setLoading(false);
    }
  }, [pagination.page, pagination.limit, status]);

  useEffect(() => {
    loadInvoices();
  }, [loadInvoices]);

  const summary = useMemo(() => {
    return invoices.reduce(
      (result, invoice) => {
        result.total += 1;
        result.revenue += Number(invoice.total || 0);
        result.paid += Number(invoice.paidAmount || 0);
        result.remaining += Number(invoice.remainingAmount || 0);
        return result;
      },
      {
        total: 0,
        revenue: 0,
        paid: 0,
        remaining: 0,
      }
    );
  }, [invoices]);

  async function openCreateForm() {
    const token = sessionStorage.getItem("sersa_token");

    if (!token) {
      window.location.replace("/login");
      return;
    }

    setForm({
      workOrderId: "",
      dueAt: "",
      notes: "",
    });

    setFormError("");
    setFormOpen(true);
    setLoadingWorkOrders(true);

    try {
      const response = await fetch(
        `${API_URL}/api/work-orders?status=completed&page=1&limit=100`,
        {
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${token}`,
          },
        }
      );

      const result = await readResponse(response);

      setWorkOrders(Array.isArray(result.data) ? result.data : []);
    } catch (err) {
      setFormError(
        err.message || "Gagal mengambil Work Order yang selesai."
      );
    } finally {
      setLoadingWorkOrders(false);
    }
  }

  function closeForm() {
    if (saving) return;

    setFormOpen(false);
    setFormError("");
    setForm({
      workOrderId: "",
      dueAt: "",
      notes: "",
    });
  }

  function handleFormChange(event) {
    const { name, value } = event.target;

    setForm((previous) => ({
      ...previous,
      [name]: value,
    }));
  }

  async function handleCreateInvoice(event) {
    event.preventDefault();
    setFormError("");

    if (!form.workOrderId) {
      setFormError("Pilih Work Order terlebih dahulu.");
      return;
    }

    if (form.dueAt) {
      const dueDate = new Date(`${form.dueAt}T00:00:00`);
      const today = new Date(`${getTodayDate()}T00:00:00`);

      if (
        Number.isNaN(dueDate.getTime()) ||
        dueDate < today
      ) {
        setFormError("Tanggal jatuh tempo tidak boleh sebelum hari ini.");
        return;
      }
    }

    if (form.notes.trim().length > 2000) {
      setFormError("Catatan maksimal 2000 karakter.");
      return;
    }

    const token = sessionStorage.getItem("sersa_token");

    if (!token) {
      window.location.replace("/login");
      return;
    }

    setSaving(true);

    try {
      const dueAt = form.dueAt
        ? `${form.dueAt}T23:59:59`
        : null;

      const response = await fetch(`${API_URL}/api/invoices`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          workOrderId: Number(form.workOrderId),
          dueAt,
          notes: form.notes.trim(),
        }),
      });

      const result = await readResponse(response);

      setFormOpen(false);
      setForm({
        workOrderId: "",
        dueAt: "",
        notes: "",
      });

      setNotice(result.message || "Invoice berhasil dibuat.");

      setPagination((previous) => ({
        ...previous,
        page: 1,
      }));

      if (pagination.page === 1) {
        await loadInvoices();
      }
    } catch (err) {
      setFormError(err.message || "Gagal membuat invoice.");
    } finally {
      setSaving(false);
    }
  }

  async function openInvoiceDetail(invoice) {
    const token = sessionStorage.getItem("sersa_token");

    if (!token) {
      window.location.replace("/login");
      return;
    }

    setSelectedInvoice(invoice);
    setLoadingDetail(true);

    try {
      const response = await fetch(
        `${API_URL}/api/invoices/${invoice.id}`,
        {
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${token}`,
          },
        }
      );

      const result = await readResponse(response);

      setSelectedInvoice(result.data);
    } catch (err) {
      setError(err.message || "Gagal memuat detail invoice.");
      setSelectedInvoice(null);
    } finally {
      setLoadingDetail(false);
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
    <section className="services-page invoice-page">
      <header className="services-heading">
        <div>
          <span className="services-eyebrow">FINANCIAL OPERATIONS</span>
          <h2>Invoice</h2>
          <p>
            Kelola tagihan pelanggan berdasarkan Work Order yang
            telah diselesaikan.
          </p>
        </div>

        <button
          className="services-primary-button"
          type="button"
          onClick={openCreateForm}
        >
          <span>＋</span> Buat Invoice
        </button>
      </header>

      {notice && (
        <div className="services-notice" role="status">
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice("")}>
            ×
          </button>
        </div>
      )}

      {error && (
        <div className="services-error" role="alert">
          <span>{error}</span>
          <button type="button" onClick={() => setError("")}>
            ×
          </button>
        </div>
      )}

      <section className="invoice-summary">
        <div>
          <span>Total Invoice (halaman ini)</span>
          <strong>{summary.total}</strong>
        </div>

        <div>
          <span>Total Tagihan (halaman ini)</span>
          <strong>{formatCurrency(summary.revenue)}</strong>
        </div>

        <div>
          <span>Sudah Dibayar</span>
          <strong className="invoice-paid">
            {formatCurrency(summary.paid)}
          </strong>
        </div>

        <div>
          <span>Sisa Tagihan</span>
          <strong className="invoice-remaining">
            {formatCurrency(summary.remaining)}
          </strong>
        </div>
      </section>

      <section className="services-panel">
        <div className="services-toolbar">
          <div className="invoice-toolbar-title">
            <strong>Daftar Invoice</strong>
            <span>{pagination.total} invoice tercatat</span>
          </div>

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
          >
            <option value="">Semua Status</option>
            <option value="unpaid">Belum Dibayar</option>
            <option value="partially_paid">Dibayar Sebagian</option>
            <option value="paid">Lunas</option>
            <option value="void">Dibatalkan</option>
          </select>
        </div>

        <div className="services-table-wrap">
          <table className="services-table invoice-table">
            <thead>
              <tr>
                <th>Nomor Invoice</th>
                <th>Pelanggan</th>
                <th>Layanan</th>
                <th>Tanggal Terbit</th>
                <th>Total</th>
                <th>Dibayar</th>
                <th>Status</th>
                <th>Aksi</th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} className="services-empty">
                    Memuat data invoice...
                  </td>
                </tr>
              ) : invoices.length === 0 ? (
                <tr>
                  <td colSpan={8} className="services-empty">
                    Belum ada invoice pada halaman ini.
                  </td>
                </tr>
              ) : (
                invoices.map((invoice) => (
                  <tr key={invoice.id}>
                    <td>
                      <strong className="invoice-number">
                        {invoice.invoiceNumber}
                      </strong>
                      <small className="invoice-subtext">
                        WO #{invoice.workOrderId}
                      </small>
                    </td>

                    <td>{invoice.customerName || "—"}</td>
                    <td>{invoice.serviceName || "—"}</td>
                    <td>{formatDate(invoice.issuedAt)}</td>
                    <td className="services-price">
                      {formatCurrency(invoice.total)}
                    </td>
                    <td className="invoice-paid">
                      {formatCurrency(invoice.paidAmount)}
                    </td>

                    <td>
                      <span
                        className={`services-status invoice-status-${invoice.status}`}
                      >
                        {STATUS_LABELS[invoice.status] || invoice.status}
                      </span>
                    </td>

                    <td>
                      <button
                        className="services-edit-button"
                        type="button"
                        onClick={() => openInvoiceDetail(invoice)}
                      >
                        Detail
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <footer className="services-pagination">
          <span>
            Menampilkan {startItem}–{endItem} dari {pagination.total} invoice
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

            <span className="invoice-page-number">
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
            className="services-modal invoice-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="invoice-form-title"
          >
            <header className="services-modal-header">
              <div>
                <span className="services-eyebrow">NEW BILLING</span>
                <h3 id="invoice-form-title">Buat Invoice</h3>
                <p>
                  Pilih Work Order yang telah diselesaikan untuk
                  membuat tagihan.
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

            <form
              className="services-form"
              onSubmit={handleCreateInvoice}
            >
              {formError && (
                <div className="services-error" role="alert">
                  {formError}
                </div>
              )}

              {loadingWorkOrders ? (
                <p className="invoice-loading">
                  Memuat Work Order yang selesai...
                </p>
              ) : (
                <label>
                  <span className="services-label-text">
                    Work Order <span className="required">*</span>
                  </span>

                  <select
                    name="workOrderId"
                    value={form.workOrderId}
                    onChange={handleFormChange}
                    required
                  >
                    <option value="">Pilih Work Order</option>

                    {workOrders.map((workOrder) => (
                      <option
                        key={workOrder.id}
                        value={workOrder.id}
                      >
                        WO #{workOrder.id} — {workOrder.customerName}
                        {" · "}
                        {workOrder.serviceName}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              {!loadingWorkOrders && workOrders.length === 0 && (
                <p className="invoice-help">
                  Tidak ada Work Order selesai yang belum dibuatkan
                  invoice, atau belum ada pekerjaan yang selesai.
                </p>
              )}

              <label>
                <span className="services-label-text">
                  Tanggal Jatuh Tempo
                </span>
                <input
                  type="date"
                  name="dueAt"
                  min={getTodayDate()}
                  value={form.dueAt}
                  onChange={handleFormChange}
                />
              </label>

              <label>
                <span className="services-label-text">Catatan</span>
                <textarea
                  name="notes"
                  rows={4}
                  maxLength={2000}
                  value={form.notes}
                  onChange={handleFormChange}
                  placeholder="Tambahkan catatan untuk invoice..."
                />
              </label>

              <div className="invoice-info">
                <span>Perhitungan tagihan</span>
                <strong>
                  Harga diambil otomatis dari katalog layanan.
                </strong>
                <small>
                  Satu Work Order hanya dapat memiliki satu invoice.
                </small>
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
                    loadingWorkOrders ||
                    workOrders.length === 0
                  }
                >
                  {saving ? "Menyimpan..." : "Buat Invoice"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {selectedInvoice && (
        <div
          className="services-modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !loadingDetail) {
              setSelectedInvoice(null);
            }
          }}
        >
          <section
            className="services-modal invoice-detail-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="invoice-detail-title"
          >
            <header className="services-modal-header">
              <div>
                <span className="services-eyebrow">INVOICE DETAIL</span>
                <h3 id="invoice-detail-title">
                  {selectedInvoice.invoiceNumber}
                </h3>
                <p>Informasi tagihan dan riwayat pembayaran.</p>
              </div>

              <button
                className="services-modal-close"
                type="button"
                onClick={() => setSelectedInvoice(null)}
                disabled={loadingDetail}
              >
                ×
              </button>
            </header>

            {loadingDetail ? (
              <p className="invoice-loading">Memuat detail invoice...</p>
            ) : (
              <div className="invoice-detail-content">
                <div className="invoice-detail-grid">
                  <div>
                    <span>Pelanggan</span>
                    <strong>{selectedInvoice.customerName || "—"}</strong>
                  </div>
                  <div>
                    <span>Layanan</span>
                    <strong>{selectedInvoice.serviceName || "—"}</strong>
                  </div>
                  <div>
                    <span>Tanggal Terbit</span>
                    <strong>{formatDate(selectedInvoice.issuedAt)}</strong>
                  </div>
                  <div>
                    <span>Jatuh Tempo</span>
                    <strong>{formatDate(selectedInvoice.dueAt)}</strong>
                  </div>
                </div>

                <div className="invoice-detail-section">
                  <h4>Rincian Tagihan</h4>

                  <div className="services-table-wrap">
                    <table className="services-table">
                      <thead>
                        <tr>
                          <th>Deskripsi</th>
                          <th>Qty</th>
                          <th>Harga</th>
                          <th>Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(selectedInvoice.items || []).map((item) => (
                          <tr key={item.id}>
                            <td>{item.description}</td>
                            <td>{item.quantity}</td>
                            <td>{formatCurrency(item.unitPrice)}</td>
                            <td>{formatCurrency(item.lineTotal)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="invoice-total-box">
                  <div>
                    <span>Subtotal</span>
                    <strong>{formatCurrency(selectedInvoice.subtotal)}</strong>
                  </div>
                  <div>
                    <span>Total Tagihan</span>
                    <strong>{formatCurrency(selectedInvoice.total)}</strong>
                  </div>
                  <div>
                    <span>Sudah Dibayar</span>
                    <strong className="invoice-paid">
                      {formatCurrency(selectedInvoice.paidAmount)}
                    </strong>
                  </div>
                  <div>
                    <span>Sisa Tagihan</span>
                    <strong className="invoice-remaining">
                      {formatCurrency(selectedInvoice.remainingAmount)}
                    </strong>
                  </div>
                </div>

                <div className="invoice-detail-section">
                  <h4>Riwayat Pembayaran</h4>

                  {(selectedInvoice.payments || []).length === 0 ? (
                    <p className="invoice-help">
                      Belum ada pembayaran tercatat.
                    </p>
                  ) : (
                    <div className="services-table-wrap">
                      <table className="services-table">
                        <thead>
                          <tr>
                            <th>Tanggal</th>
                            <th>Metode</th>
                            <th>Referensi</th>
                            <th>Jumlah</th>
                          </tr>
                        </thead>
                        <tbody>
                          {selectedInvoice.payments.map((payment) => (
                            <tr key={payment.id}>
                              <td>{formatDate(payment.paymentDate)}</td>
                              <td>{payment.method}</td>
                              <td>{payment.reference || "—"}</td>
                              <td className="services-price">
                                {formatCurrency(payment.amount)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {selectedInvoice.notes && (
                  <div className="invoice-notes">
                    <span>Catatan</span>
                    <p>{selectedInvoice.notes}</p>
                  </div>
                )}

                <div className="services-form-actions">
                  <button
                    className="services-secondary-button"
                    type="button"
                    onClick={() => setSelectedInvoice(null)}
                  >
                    Tutup
                  </button>
                </div>
              </div>
            )}
          </section>
        </div>
      )}
    </section>
  );
}
