
import { useCallback, useEffect, useMemo, useState } from "react";
import "../services/Services.css";
import "./Appointments.css";

const API_URL = (
  import.meta.env.VITE_API_URL || "http://localhost:5000"
).replace(/\/+$/, "");

const STATUS_LABELS = {
  scheduled: "Terjadwal",
  rescheduled: "Dijadwalkan ulang",
  completed: "Selesai",
  cancelled: "Dibatalkan",
};

const EMPTY_FORM = {
  serviceRequestId: "",
  technicianId: "",
  scheduledStart: "",
  scheduledEnd: "",
  notes: "",
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

function toLocalDateTimeInput(value) {
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function statusClass(status) {
  return `appointment-status appointment-status-${status}`;
}

export default function Appointments() {
  const [appointments, setAppointments] = useState([]);
  const [technicians, setTechnicians] = useState([]);
  const [eligibleRequests, setEligibleRequests] = useState([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const [formOpen, setFormOpen] = useState(false);
  const [formError, setFormError] = useState("");
  const [form, setForm] = useState(EMPTY_FORM);

  const [selectedAppointment, setSelectedAppointment] = useState(null);

  const loadAppointments = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const [appointmentResult, technicianResult, requestResult] =
        await Promise.all([
          apiRequest("/api/appointments"),
          apiRequest("/api/appointments/technicians"),
          apiRequest("/api/appointments/eligible-requests"),
        ]);

      setAppointments(
        Array.isArray(appointmentResult.data) ? appointmentResult.data : []
      );
      setTechnicians(
        Array.isArray(technicianResult.data) ? technicianResult.data : []
      );
      setEligibleRequests(
        Array.isArray(requestResult.data) ? requestResult.data : []
      );
    } catch (err) {
      setError(err.message || "Gagal memuat data penjadwalan.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAppointments();
  }, [loadAppointments]);

  const filteredAppointments = useMemo(() => {
    const keyword = search.toLowerCase();

    return appointments.filter((appointment) => {
      const matchesStatus =
        statusFilter === "all" || appointment.status === statusFilter;

      const searchable = [
        appointment.id,
        appointment.customerName,
        appointment.serviceName,
        appointment.technicianName,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return matchesStatus && (!keyword || searchable.includes(keyword));
    });
  }, [appointments, search, statusFilter]);

  const summary = useMemo(
    () => ({
      total: appointments.length,
      scheduled: appointments.filter(
        (item) =>
          item.status === "scheduled" || item.status === "rescheduled"
      ).length,
      completed: appointments.filter((item) => item.status === "completed")
        .length,
      cancelled: appointments.filter((item) => item.status === "cancelled")
        .length,
    }),
    [appointments]
  );

  function handleSearch(event) {
    event.preventDefault();
    setSearch(searchInput.trim().toLowerCase());
  }

  function openForm() {
    setForm(EMPTY_FORM);
    setFormError("");
    setError("");
    setNotice("");
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
    setForm((previous) => ({ ...previous, [name]: value }));
  }

  async function handleCreate(event) {
    event.preventDefault();
    setFormError("");
    setNotice("");

    if (
      !form.serviceRequestId ||
      !form.technicianId ||
      !form.scheduledStart ||
      !form.scheduledEnd
    ) {
      setFormError("Lengkapi permintaan, teknisi, dan jadwal.");
      return;
    }

    const start = new Date(form.scheduledStart);
    const end = new Date(form.scheduledEnd);

    if (
      Number.isNaN(start.getTime()) ||
      Number.isNaN(end.getTime()) ||
      end <= start
    ) {
      setFormError("Waktu selesai harus setelah waktu mulai.");
      return;
    }

    setSaving(true);

    try {
      const result = await apiRequest("/api/appointments", {
        method: "POST",
        body: JSON.stringify({
          serviceRequestId: form.serviceRequestId,
          technicianId: form.technicianId,
          scheduledStart: start.toISOString(),
          scheduledEnd: end.toISOString(),
          notes: form.notes.trim(),
        }),
      });

      setFormOpen(false);
      setForm(EMPTY_FORM);
      setNotice(result.message || "Jadwal berhasil dibuat.");
      await loadAppointments();
    } catch (err) {
      setFormError(err.message || "Gagal membuat jadwal.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="services-page appointments-page">
      <header className="services-heading">
        <div>
          <span className="services-eyebrow">SCHEDULING & DISPATCH</span>
          <h2>Penjadwalan Layanan</h2>
          <p>
            Atur jadwal layanan, pilih teknisi, dan pantau pelaksanaan
            appointment.
          </p>
        </div>

        <button
          className="services-primary-button"
          type="button"
          onClick={openForm}
          disabled={loading}
        >
          ＋ Buat Jadwal
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
          <button type="button" onClick={loadAppointments}>
            Coba lagi
          </button>
        </div>
      )}

      <section className="services-summary appointments-summary">
        <div>
          <span>Total appointment</span>
          <strong>{loading ? "—" : summary.total}</strong>
        </div>
        <div>
          <span>Terjadwal</span>
          <strong>{loading ? "—" : summary.scheduled}</strong>
        </div>
        <div>
          <span>Selesai</span>
          <strong>{loading ? "—" : summary.completed}</strong>
        </div>
        <div>
          <span>Dibatalkan</span>
          <strong>{loading ? "—" : summary.cancelled}</strong>
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
            aria-label="Filter status appointment"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
          >
            <option value="all">Semua status</option>
            <option value="scheduled">Terjadwal</option>
            <option value="rescheduled">Dijadwalkan ulang</option>
            <option value="completed">Selesai</option>
            <option value="cancelled">Dibatalkan</option>
          </select>

          <button className="services-secondary-button" type="submit">
            Cari
          </button>
        </form>

        <div className="appointments-table-toolbar">
          <span>
            {loading
              ? "Memuat jadwal..."
              : `${filteredAppointments.length} jadwal ditemukan`}
          </span>

          <button
            className="services-secondary-button"
            type="button"
            onClick={loadAppointments}
            disabled={loading}
          >
            ↻ Muat Ulang
          </button>
        </div>

        <div className="services-table-wrap">
          <table className="services-table appointments-table">
            <thead>
              <tr>
                <th>Appointment</th>
                <th>Pelanggan & Layanan</th>
                <th>Teknisi</th>
                <th>Waktu Mulai</th>
                <th>Waktu Selesai</th>
                <th>Status</th>
                <th>Aksi</th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="services-empty">
                    Memuat jadwal...
                  </td>
                </tr>
              ) : filteredAppointments.length === 0 ? (
                <tr>
                  <td colSpan={7} className="services-empty">
                    <strong>
                      {error ? "Jadwal belum tersedia" : "Tidak ada jadwal"}
                    </strong>
                    <span>
                      {error
                        ? "Periksa koneksi backend."
                        : "Ubah pencarian atau buat jadwal baru."}
                    </span>
                  </td>
                </tr>
              ) : (
                filteredAppointments.map((appointment) => (
                  <tr key={appointment.id}>
                    <td>
                      <div className="services-name appointment-name">
                        <span className="services-avatar">▦</span>
                        <div>
                          <strong>APT-{appointment.id}</strong>
                          <small>
                            Permintaan #{appointment.serviceRequestId}
                          </small>
                        </div>
                      </div>
                    </td>

                    <td>
                      <strong className="appointment-main-text">
                        {appointment.customerName || "—"}
                      </strong>
                      <small className="appointment-secondary-text">
                        {appointment.serviceName || "—"}
                      </small>
                    </td>

                    <td>{appointment.technicianName || "—"}</td>
                    <td>{formatDateTime(appointment.scheduledStart)}</td>
                    <td>{formatDateTime(appointment.scheduledEnd)}</td>

                    <td>
                      <span className={statusClass(appointment.status)}>
                        {STATUS_LABELS[appointment.status] ||
                          appointment.status}
                      </span>
                    </td>

                    <td>
                      <button
                        className="services-edit-button"
                        type="button"
                        onClick={() => setSelectedAppointment(appointment)}
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
      </section>

      {formOpen && (
        <div
          className="services-modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeForm();
          }}
        >
          <section
            className="services-modal appointment-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="appointment-modal-title"
          >
            <header className="services-modal-header">
              <div>
                <span className="services-eyebrow">NEW APPOINTMENT</span>
                <h3 id="appointment-modal-title">Buat Jadwal Layanan</h3>
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
                  Permintaan layanan <span className="required">*</span>
                </span>
                <select
                  name="serviceRequestId"
                  value={form.serviceRequestId}
                  onChange={handleFormChange}
                  required
                >
                  <option value="">Pilih permintaan yang disetujui</option>
                  {eligibleRequests.map((request) => (
                    <option key={request.id} value={request.id}>
                      #{request.id} — {request.customerName || "Pelanggan"} ·{" "}
                      {request.serviceName || "Layanan"}
                    </option>
                  ))}
                </select>
                {eligibleRequests.length === 0 && (
                  <small>
                    Tidak ada permintaan yang siap dijadwalkan. Pastikan ada
                    permintaan berstatus approved.
                  </small>
                )}
              </label>

              <label>
                <span className="services-label-text">
                  Teknisi <span className="required">*</span>
                </span>
                <select
                  name="technicianId"
                  value={form.technicianId}
                  onChange={handleFormChange}
                  required
                >
                  <option value="">Pilih teknisi aktif</option>
                  {technicians.map((technician) => (
                    <option key={technician.id} value={technician.id}>
                      {technician.fullName}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                <span className="services-label-text">
                  Waktu mulai <span className="required">*</span>
                </span>
                <input
                  type="datetime-local"
                  name="scheduledStart"
                  value={form.scheduledStart}
                  onChange={handleFormChange}
                  required
                />
              </label>

              <label>
                <span className="services-label-text">
                  Waktu selesai <span className="required">*</span>
                </span>
                <input
                  type="datetime-local"
                  name="scheduledEnd"
                  value={form.scheduledEnd}
                  onChange={handleFormChange}
                  min={form.scheduledStart || undefined}
                  required
                />
              </label>

              <label>
                <span className="services-label-text">Catatan jadwal</span>
                <textarea
                  name="notes"
                  value={form.notes}
                  onChange={handleFormChange}
                  rows={3}
                  maxLength={1000}
                  placeholder="Catatan tambahan untuk pelaksanaan layanan..."
                />
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
                  disabled={
                    saving ||
                    eligibleRequests.length === 0 ||
                    technicians.length === 0
                  }
                >
                  {saving ? "Menyimpan..." : "Buat Jadwal"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {selectedAppointment && (
        <div
          className="services-modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setSelectedAppointment(null);
            }
          }}
        >
          <section
            className="services-modal appointment-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="appointment-detail-title"
          >
            <header className="services-modal-header">
              <div>
                <span className="services-eyebrow">APPOINTMENT DETAIL</span>
                <h3 id="appointment-detail-title">
                  APT-{selectedAppointment.id}
                </h3>
              </div>
              <button
                type="button"
                className="services-modal-close"
                onClick={() => setSelectedAppointment(null)}
                aria-label="Tutup detail"
              >
                ×
              </button>
            </header>

            <div className="appointment-detail">
              <div>
                <span>Status</span>
                <strong className={statusClass(selectedAppointment.status)}>
                  {STATUS_LABELS[selectedAppointment.status] ||
                    selectedAppointment.status}
                </strong>
              </div>
              <div>
                <span>Pelanggan</span>
                <strong>{selectedAppointment.customerName || "—"}</strong>
              </div>
              <div>
                <span>Layanan</span>
                <strong>{selectedAppointment.serviceName || "—"}</strong>
              </div>
              <div>
                <span>Teknisi</span>
                <strong>{selectedAppointment.technicianName || "—"}</strong>
              </div>
              <div>
                <span>Waktu mulai</span>
                <strong>
                  {formatDateTime(selectedAppointment.scheduledStart)}
                </strong>
              </div>
              <div>
                <span>Waktu selesai</span>
                <strong>
                  {formatDateTime(selectedAppointment.scheduledEnd)}
                </strong>
              </div>
              <div>
                <span>Catatan</span>
                <p>{selectedAppointment.notes || "Tidak ada catatan."}</p>
              </div>
            </div>

            <div className="services-form-actions">
              <button
                className="services-secondary-button"
                type="button"
                onClick={() => setSelectedAppointment(null)}
              >
                Tutup
              </button>
            </div>
          </section>
        </div>
      )}
    </section>
  );
}
