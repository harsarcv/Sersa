
import { useCallback, useEffect, useMemo, useState } from "react";
import "../services/Services.css";
import "./WorkOrders.css";

const API_URL = (
  import.meta.env.VITE_API_URL || "http://localhost:5000"
).replace(/\/+$/, "");

const STATUS_LABELS = {
  assigned: "Ditugaskan",
  in_progress: "Sedang dikerjakan",
  completed: "Selesai",
  cancelled: "Dibatalkan",
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
    throw new Error("Sesi berakhir. Silakan login kembali.");
  }

  if (!response.ok) {
    throw new Error(result.message || `Permintaan gagal (${response.status}).`);
  }

  return result;
}

function formatDateTime(value) {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "—";

  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function statusClass(status) {
  return `work-order-status work-order-status-${status}`;
}

function getNextAction(status) {
  if (status === "assigned") {
    return { status: "in_progress", label: "Mulai Pekerjaan" };
  }

  if (status === "in_progress") {
    return { status: "completed", label: "Selesaikan Pekerjaan" };
  }

  return null;
}

export default function WorkOrders() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [updatingId, setUpdatingId] = useState(null);

  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const [selectedOrder, setSelectedOrder] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");

  const loadOrders = useCallback(async (silent = false) => {
    if (silent) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    setError("");

    try {
      const result = await apiRequest("/api/work-orders");
      setOrders(Array.isArray(result.data) ? result.data : []);
    } catch (err) {
      setError(err.message || "Gagal memuat Work Orders.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  const filteredOrders = useMemo(() => {
    const keyword = search.toLowerCase();

    return orders.filter((order) => {
      const matchesStatus =
        statusFilter === "all" || order.status === statusFilter;

      const searchable = [
        order.id,
        order.customerName,
        order.serviceName,
        order.technicianName,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return matchesStatus && (!keyword || searchable.includes(keyword));
    });
  }, [orders, search, statusFilter]);

  const summary = useMemo(
    () => ({
      total: orders.length,
      assigned: orders.filter((order) => order.status === "assigned").length,
      inProgress: orders.filter((order) => order.status === "in_progress").length,
      completed: orders.filter((order) => order.status === "completed").length,
    }),
    [orders]
  );

  function handleSearch(event) {
    event.preventDefault();
    setSearch(searchInput.trim().toLowerCase());
  }

  async function openDetail(order) {
    setSelectedOrder(order);
    setDetailLoading(true);
    setDetailError("");

    try {
      const result = await apiRequest(
        `/api/work-orders/${encodeURIComponent(order.id)}`
      );
      setSelectedOrder(result.data);
    } catch (err) {
      setDetailError(err.message || "Gagal memuat detail pekerjaan.");
    } finally {
      setDetailLoading(false);
    }
  }

  async function updateStatus(order) {
    const action = getNextAction(order.status);
    if (!action || updatingId !== null) return;

    let workNotes = "";
    let completionNotes = "";

    if (action.status === "in_progress") {
      workNotes = window.prompt(
        "Masukkan catatan awal pekerjaan:",
        order.workNotes || ""
      );

      if (workNotes === null) return;

      if (workNotes.trim().length < 3) {
        setError("Catatan pekerjaan minimal 3 karakter.");
        return;
      }
    }

    if (action.status === "completed") {
      workNotes = window.prompt(
        "Perbarui catatan pekerjaan:",
        order.workNotes || ""
      );

      if (workNotes === null) return;

      completionNotes = window.prompt(
        "Masukkan catatan penyelesaian (minimal 3 karakter):",
        order.completionNotes || ""
      );

      if (completionNotes === null) return;

      if (completionNotes.trim().length < 3) {
        setError("Catatan penyelesaian minimal 3 karakter.");
        return;
      }
    }

    setUpdatingId(order.id);
    setError("");
    setNotice("");

    try {
      const body = {
        status: action.status,
        ...(workNotes.trim() ? { workNotes: workNotes.trim() } : {}),
        ...(completionNotes.trim()
          ? { completionNotes: completionNotes.trim() }
          : {}),
      };

      const result = await apiRequest(
        `/api/work-orders/${encodeURIComponent(order.id)}/status`,
        {
          method: "PATCH",
          body: JSON.stringify(body),
        }
      );

      setNotice(result.message || "Status pekerjaan berhasil diperbarui.");

      await loadOrders(true);

      if (selectedOrder?.id === order.id) {
        await openDetail({ ...order, status: action.status });
      }
    } catch (err) {
      setError(err.message || "Gagal memperbarui status pekerjaan.");
    } finally {
      setUpdatingId(null);
    }
  }

  return (
    <section className="services-page work-orders-page">
      <header className="services-heading">
        <div>
          <span className="services-eyebrow">OPERATIONS & EXECUTION</span>
          <h2>Work Orders</h2>
          <p>
            Pantau penugasan teknisi, progres pekerjaan, dan hasil penyelesaian
            layanan.
          </p>
        </div>

        <button
          className="services-secondary-button"
          type="button"
          onClick={() => loadOrders(true)}
          disabled={loading || refreshing}
        >
          ↻ {refreshing ? "Memuat..." : "Muat Ulang"}
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
          <button type="button" onClick={() => setError("")}>
            Tutup
          </button>
        </div>
      )}

      <section className="services-summary work-orders-summary">
        <div>
          <span>Total pekerjaan</span>
          <strong>{loading ? "—" : summary.total}</strong>
        </div>
        <div>
          <span>Ditugaskan</span>
          <strong>{loading ? "—" : summary.assigned}</strong>
        </div>
        <div>
          <span>Sedang dikerjakan</span>
          <strong>{loading ? "—" : summary.inProgress}</strong>
        </div>
        <div>
          <span>Selesai</span>
          <strong>{loading ? "—" : summary.completed}</strong>
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
              placeholder="Cari pelanggan, layanan, teknisi, atau ID..."
              maxLength={150}
            />
          </label>

          <select
            className="services-status-filter"
            aria-label="Filter status pekerjaan"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
          >
            <option value="all">Semua status</option>
            <option value="assigned">Ditugaskan</option>
            <option value="in_progress">Sedang dikerjakan</option>
            <option value="completed">Selesai</option>
            <option value="cancelled">Dibatalkan</option>
          </select>

          <button className="services-secondary-button" type="submit">
            Cari
          </button>
        </form>

        <div className="work-orders-table-toolbar">
          <span>
            {loading
              ? "Memuat pekerjaan..."
              : `${filteredOrders.length} pekerjaan ditemukan`}
          </span>
        </div>

        <div className="services-table-wrap">
          <table className="services-table work-orders-table">
            <thead>
              <tr>
                <th>Pekerjaan</th>
                <th>Pelanggan</th>
                <th>Teknisi</th>
                <th>Jadwal</th>
                <th>Status</th>
                <th>Aksi</th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="services-empty">
                    Memuat Work Orders...
                  </td>
                </tr>
              ) : filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan={6} className="services-empty">
                    <strong>
                      {error
                        ? "Data pekerjaan belum tersedia"
                        : "Tidak ada pekerjaan yang cocok"}
                    </strong>
                    <span>
                      {error
                        ? "Periksa koneksi backend lalu muat ulang."
                        : "Coba ubah pencarian atau filter status."}
                    </span>
                  </td>
                </tr>
              ) : (
                filteredOrders.map((order) => {
                  const action = getNextAction(order.status);

                  return (
                    <tr key={order.id}>
                      <td>
                        <div className="services-name work-order-name">
                          <span className="services-avatar">⚙</span>
                          <div>
                            <strong>WO-{order.id}</strong>
                            <small>{order.serviceName || "Layanan"}</small>
                          </div>
                        </div>
                      </td>

                      <td>{order.customerName || "—"}</td>
                      <td>{order.technicianName || "Belum ditentukan"}</td>
                      <td>{formatDateTime(order.scheduledStart)}</td>

                      <td>
                        <span className={statusClass(order.status)}>
                          {STATUS_LABELS[order.status] || order.status}
                        </span>
                      </td>

                      <td>
                        <div className="work-order-actions">
                          <button
                            className="services-edit-button"
                            type="button"
                            onClick={() => openDetail(order)}
                          >
                            Detail
                          </button>

                          {action && (
                            <button
                              className="services-activate-button"
                              type="button"
                              disabled={updatingId !== null}
                              onClick={() => updateStatus(order)}
                            >
                              {updatingId === order.id
                                ? "Memproses..."
                                : action.label}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <footer className="services-pagination">
          <span>
            Status dan transisi pekerjaan tetap divalidasi oleh backend.
          </span>
        </footer>
      </section>

      {selectedOrder && (
        <div
          className="services-modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !detailLoading) {
              setSelectedOrder(null);
            }
          }}
        >
          <section
            className="services-modal work-order-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="work-order-modal-title"
          >
            <header className="services-modal-header">
              <div>
                <span className="services-eyebrow">WORK ORDER DETAIL</span>
                <h3 id="work-order-modal-title">
                  WO-{selectedOrder.id}
                </h3>
              </div>

              <button
                type="button"
                className="services-modal-close"
                onClick={() => setSelectedOrder(null)}
                aria-label="Tutup detail"
              >
                ×
              </button>
            </header>

            {detailLoading ? (
              <p className="work-order-detail-message">
                Memuat detail pekerjaan...
              </p>
            ) : detailError ? (
              <div className="services-error" role="alert">
                {detailError}
              </div>
            ) : (
              <div className="work-order-detail">
                <div className="work-order-detail-status">
                  <span>Status</span>
                  <strong className={statusClass(selectedOrder.status)}>
                    {STATUS_LABELS[selectedOrder.status] ||
                      selectedOrder.status}
                  </strong>
                </div>

                <div className="work-order-detail-grid">
                  <div>
                    <span>Pelanggan</span>
                    <strong>{selectedOrder.customerName || "—"}</strong>
                  </div>
                  <div>
                    <span>Layanan</span>
                    <strong>{selectedOrder.serviceName || "—"}</strong>
                  </div>
                  <div>
                    <span>Teknisi</span>
                    <strong>{selectedOrder.technicianName || "—"}</strong>
                  </div>
                  <div>
                    <span>Appointment</span>
                    <strong>
                      {selectedOrder.appointmentId
                        ? `#${selectedOrder.appointmentId}`
                        : "—"}
                    </strong>
                  </div>
                  <div>
                    <span>Jadwal mulai</span>
                    <strong>
                      {formatDateTime(selectedOrder.scheduledStart)}
                    </strong>
                  </div>
                  <div>
                    <span>Jadwal selesai</span>
                    <strong>
                      {formatDateTime(selectedOrder.scheduledEnd)}
                    </strong>
                  </div>
                  <div>
                    <span>Waktu mulai aktual</span>
                    <strong>{formatDateTime(selectedOrder.startedAt)}</strong>
                  </div>
                  <div>
                    <span>Waktu selesai aktual</span>
                    <strong>{formatDateTime(selectedOrder.completedAt)}</strong>
                  </div>
                </div>

                <div className="work-order-notes">
                  <span>Catatan pekerjaan</span>
                  <p>{selectedOrder.workNotes || "Belum ada catatan."}</p>
                </div>

                <div className="work-order-notes">
                  <span>Catatan penyelesaian</span>
                  <p>
                    {selectedOrder.completionNotes ||
                      "Belum ada catatan penyelesaian."}
                  </p>
                </div>

                <div className="services-form-actions">
                  <button
                    className="services-secondary-button"
                    type="button"
                    onClick={() => setSelectedOrder(null)}
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
