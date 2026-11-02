
import { useCallback, useEffect, useMemo, useState } from "react";
import "./Reports.css";

const API_URL = (
  import.meta.env.VITE_API_URL || "http://localhost:5000"
).replace(/\/+$/, "");

const WORK_ORDER_LABELS = {
  assigned: "Ditugaskan",
  in_progress: "Dalam Pengerjaan",
  completed: "Selesai",
  cancelled: "Dibatalkan",
};

function getLocalDate() {
  const now = new Date();
  const offset = now.getTimezoneOffset();

  return new Date(now.getTime() - offset * 60000)
    .toISOString()
    .slice(0, 10);
}

function formatCurrency(value) {
  const amount = Number(value || 0);

  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatMonth(value) {
  if (!value) return "—";

  const [year, month] = value.split("-").map(Number);

  return new Intl.DateTimeFormat("id-ID", {
    month: "short",
    year: "numeric",
  }).format(new Date(year, month - 1, 1));
}

function formatNumber(value) {
  return new Intl.NumberFormat("id-ID").format(Number(value || 0));
}

export default function Reports() {
  const today = getLocalDate();

  const [from, setFrom] = useState(
    `${today.slice(0, 7)}-01`
  );
  const [to, setTo] = useState(today);

  const [appliedPeriod, setAppliedPeriod] = useState({
    from: `${today.slice(0, 7)}-01`,
    to: today,
  });

  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadReport = useCallback(async () => {
    const token = sessionStorage.getItem("sersa_token");

    if (!token) {
      window.location.replace("/login");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const params = new URLSearchParams({
        from: appliedPeriod.from,
        to: appliedPeriod.to,
      });

      const response = await fetch(
        `${API_URL}/api/reports/overview?${params.toString()}`,
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
        throw new Error(
          result.message || "Gagal mengambil laporan bisnis."
        );
      }

      setReport(result.data);
    } catch (err) {
      setError(err.message || "Terjadi kesalahan saat memuat laporan.");
    } finally {
      setLoading(false);
    }
  }, [appliedPeriod]);

  useEffect(() => {
    loadReport();
  }, [loadReport]);

  function handleApplyFilter(event) {
    event.preventDefault();

    if (!from || !to) {
      setError("Tanggal awal dan akhir wajib diisi.");
      return;
    }

    if (from > to) {
      setError("Tanggal awal tidak boleh melewati tanggal akhir.");
      return;
    }

    setAppliedPeriod({ from, to });
  }

  function handleResetFilter() {
    const currentDate = getLocalDate();
    const firstDay = `${currentDate.slice(0, 7)}-01`;

    setFrom(firstDay);
    setTo(currentDate);
    setAppliedPeriod({
      from: firstDay,
      to: currentDate,
    });
  }

  const summary = report?.summary || {};

  const monthlyPayments = report?.monthlyPayments || [];
  const topServices = report?.topServices || [];
  const workOrders = report?.workOrders || [];

  const maxRevenue = useMemo(() => {
    return Math.max(
      ...monthlyPayments.map((item) => Number(item.revenue || 0)),
      1
    );
  }, [monthlyPayments]);

  function handleExportCSV() {
    if (!report) return;

    const rows = [
      ["LAPORAN BISNIS SERSA"],
      [`Periode: ${report.period.from} sampai ${report.period.to}`],
      [],
      ["RINGKASAN"],
      ["Metrik", "Nilai"],
      ["Pelanggan Baru", summary.newCustomers],
      ["Permintaan Layanan", summary.serviceRequests],
      ["Total Work Orders", summary.totalWorkOrders],
      ["Work Orders Selesai", summary.completedWorkOrders],
      ["Total Invoice", summary.totalInvoices],
      ["Total Tagihan", summary.totalBilled],
      ["Total Pembayaran Diterima", summary.totalPayments],
      ["Jumlah Transaksi", summary.totalTransactions],
      [],
      ["STATUS WORK ORDER"],
      ["Status", "Jumlah"],
      ...workOrders.map((item) => [
        WORK_ORDER_LABELS[item.status] || item.status,
        item.total,
      ]),
      [],
      ["PEMBAYARAN BULANAN"],
      ["Bulan", "Pendapatan", "Transaksi"],
      ...monthlyPayments.map((item) => [
        item.month,
        item.revenue,
        item.transactions,
      ]),
      [],
      ["LAYANAN TERPOPULER"],
      ["Layanan", "Jumlah Permintaan"],
      ...topServices.map((item) => [
        item.serviceName,
        item.totalRequests,
      ]),
    ];

    const csv = rows
      .map((row) =>
        row
          .map((cell) => {
            const value = String(cell ?? "");
            return `"${value.replace(/"/g, '""')}"`;
          })
          .join(",")
      )
      .join("\r\n");

    const blob = new Blob(["\uFEFF" + csv], {
      type: "text/csv;charset=utf-8;",
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = `sersa-laporan-${report.period.from}-${report.period.to}.csv`;

    document.body.appendChild(link);
    link.click();
    link.remove();

    URL.revokeObjectURL(url);
  }

  return (
    <section className="reports-page">
      <header className="reports-heading">
        <div>
          <span className="reports-eyebrow">BUSINESS INTELLIGENCE</span>
          <h2>Laporan Bisnis</h2>
          <p>
            Pantau performa operasional dan keuangan bisnis Sersa.
          </p>
        </div>

        <button
          className="reports-export-button"
          type="button"
          onClick={handleExportCSV}
          disabled={!report || loading}
        >
          ↓ Export CSV
        </button>
      </header>

      <section className="reports-filter">
        <form onSubmit={handleApplyFilter}>
          <label>
            <span>Tanggal Awal</span>
            <input
              type="date"
              value={from}
              max={to || today}
              onChange={(event) => setFrom(event.target.value)}
            />
          </label>

          <label>
            <span>Tanggal Akhir</span>
            <input
              type="date"
              value={to}
              min={from}
              max={today}
              onChange={(event) => setTo(event.target.value)}
            />
          </label>

          <button type="submit" disabled={loading}>
            Terapkan Filter
          </button>

          <button
            className="reports-reset-button"
            type="button"
            onClick={handleResetFilter}
            disabled={loading}
          >
            Reset
          </button>
        </form>

        <span>
          Periode laporan: {appliedPeriod.from} — {appliedPeriod.to}
        </span>
      </section>

      {error && (
        <div className="reports-error" role="alert">
          <span>{error}</span>
          <button type="button" onClick={loadReport}>
            Coba lagi
          </button>
        </div>
      )}

      {loading ? (
        <div className="reports-loading">
          Memuat laporan bisnis...
        </div>
      ) : report ? (
        <>
          <section className="reports-section">
            <div className="reports-section-heading">
              <div>
                <h3>Ringkasan Operasional</h3>
                <p>Aktivitas bisnis selama periode terpilih.</p>
              </div>
            </div>

            <div className="reports-metric-grid">
              <article className="reports-metric">
                <span>Pelanggan Baru</span>
                <strong>{formatNumber(summary.newCustomers)}</strong>
                <small>Pelanggan terdaftar</small>
              </article>

              <article className="reports-metric">
                <span>Permintaan Layanan</span>
                <strong>{formatNumber(summary.serviceRequests)}</strong>
                <small>Total permintaan masuk</small>
              </article>

              <article className="reports-metric">
                <span>Total Work Orders</span>
                <strong>{formatNumber(summary.totalWorkOrders)}</strong>
                <small>Seluruh pekerjaan dibuat</small>
              </article>

              <article className="reports-metric">
                <span>Work Orders Selesai</span>
                <strong>{formatNumber(summary.completedWorkOrders)}</strong>
                <small>Pekerjaan telah diselesaikan</small>
              </article>
            </div>
          </section>

          <section className="reports-section">
            <div className="reports-section-heading">
              <div>
                <h3>Ringkasan Keuangan</h3>
                <p>Tagihan dan pembayaran yang tercatat.</p>
              </div>
            </div>

            <div className="reports-finance-grid">
              <article className="reports-finance-card">
                <span>Total Invoice</span>
                <strong>{formatNumber(summary.totalInvoices)}</strong>
                <small>Invoice diterbitkan</small>
              </article>

              <article className="reports-finance-card">
                <span>Total Tagihan</span>
                <strong>{formatCurrency(summary.totalBilled)}</strong>
                <small>Nilai invoice diterbitkan</small>
              </article>

              <article className="reports-finance-card reports-revenue-card">
                <span>Pembayaran Diterima</span>
                <strong>{formatCurrency(summary.totalPayments)}</strong>
                <small>{formatNumber(summary.totalTransactions)} transaksi</small>
              </article>
            </div>

            <div className="reports-invoice-status">
              <div>
                <span>Invoice Lunas</span>
                <strong>{formatNumber(summary.paidInvoices)}</strong>
              </div>
              <div>
                <span>Belum Dibayar</span>
                <strong>{formatNumber(summary.unpaidInvoices)}</strong>
              </div>
              <div>
                <span>Dibayar Sebagian</span>
                <strong>{formatNumber(summary.partialInvoices)}</strong>
              </div>
              <div>
                <span>Dibatalkan</span>
                <strong>{formatNumber(summary.voidInvoices)}</strong>
              </div>
            </div>
          </section>

          <div className="reports-two-columns">
            <section className="reports-panel">
              <div className="reports-section-heading">
                <div>
                  <h3>Tren Pembayaran</h3>
                  <p>Penerimaan pembayaran per bulan.</p>
                </div>
              </div>

              {monthlyPayments.length === 0 ? (
                <p className="reports-empty">
                  Belum ada pembayaran pada periode ini.
                </p>
              ) : (
                <div className="reports-chart">
                  {monthlyPayments.map((item) => {
                    const revenue = Number(item.revenue || 0);
                    const height = Math.max(
                      (revenue / maxRevenue) * 100,
                      3
                    );

                    return (
                      <div
                        className="reports-chart-column"
                        key={item.month}
                      >
                        <strong>{formatCurrency(revenue)}</strong>

                        <div className="reports-chart-track">
                          <div
                            className="reports-chart-bar"
                            style={{ height: `${height}%` }}
                          />
                        </div>

                        <span>{formatMonth(item.month)}</span>
                        <small>{item.transactions} transaksi</small>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            <section className="reports-panel">
              <div className="reports-section-heading">
                <div>
                  <h3>Status Work Order</h3>
                  <p>Distribusi pekerjaan berdasarkan status.</p>
                </div>
              </div>

              {workOrders.length === 0 ? (
                <p className="reports-empty">
                  Belum ada Work Order pada periode ini.
                </p>
              ) : (
                <div className="reports-status-list">
                  {workOrders.map((item) => (
                    <div
                      className="reports-status-row"
                      key={item.status}
                    >
                      <span>
                        {WORK_ORDER_LABELS[item.status] || item.status}
                      </span>
                      <strong>{formatNumber(item.total)}</strong>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>

          <section className="reports-panel reports-top-services">
            <div className="reports-section-heading">
              <div>
                <h3>Layanan Terpopuler</h3>
                <p>Lima layanan dengan permintaan terbanyak.</p>
              </div>
            </div>

            {topServices.length === 0 ? (
              <p className="reports-empty">
                Belum ada permintaan layanan pada periode ini.
              </p>
            ) : (
              <div className="reports-service-list">
                {topServices.map((service, index) => (
                  <div
                    className="reports-service-row"
                    key={service.id}
                  >
                    <span className="reports-service-rank">
                      {index + 1}
                    </span>

                    <div>
                      <strong>{service.serviceName}</strong>
                      <small>Jumlah permintaan layanan</small>
                    </div>

                    <strong className="reports-service-count">
                      {formatNumber(service.totalRequests)}
                    </strong>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      ) : (
        <div className="reports-empty">
          Data laporan belum tersedia.
        </div>
      )}
    </section>
  );
}
