
const express = require("express");
const pool = require("../config/database");
const {
  authenticateToken,
  authorizeRoles,
} = require("../middleware/auth.middleware");

const router = express.Router();

router.use(authenticateToken, authorizeRoles("admin"));

function isValidDate(value) {
  if (typeof value !== "string") return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;

  const date = new Date(`${value}T00:00:00.000Z`);

  return (
    !Number.isNaN(date.getTime()) &&
    date.toISOString().slice(0, 10) === value
  );
}

// GET /api/reports/overview
router.get("/overview", async (req, res) => {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const firstDay = `${today.slice(0, 7)}-01`;

  const from = req.query.from || firstDay;
  const to = req.query.to || today;

  if (!isValidDate(from) || !isValidDate(to)) {
    return res.status(400).json({
      status: "error",
      message: "Format tanggal harus YYYY-MM-DD.",
    });
  }

  if (from > to) {
    return res.status(400).json({
      status: "error",
      message: "Tanggal awal tidak boleh melewati tanggal akhir.",
    });
  }

  try {
    const tenantId = req.user.tenantId;
    const params = [tenantId, from, to];

    const [
      summaryResult,
      workOrderResult,
      invoiceResult,
      monthlyResult,
      serviceResult,
    ] = await Promise.all([
      // Ringkasan pelanggan, permintaan, dan pekerjaan.
      pool.query(
        `SELECT
           (
             SELECT COUNT(*)::int
             FROM customers
             WHERE tenant_id = $1
               AND created_at >= $2::date
               AND created_at < ($3::date + INTERVAL '1 day')
           ) AS "newCustomers",

           (
             SELECT COUNT(*)::int
             FROM service_requests
             WHERE tenant_id = $1
               AND created_at >= $2::date
               AND created_at < ($3::date + INTERVAL '1 day')
           ) AS "serviceRequests",

           (
             SELECT COUNT(*)::int
             FROM work_orders
             WHERE tenant_id = $1
               AND created_at >= $2::date
               AND created_at < ($3::date + INTERVAL '1 day')
           ) AS "totalWorkOrders",

           (
             SELECT COUNT(*)::int
             FROM work_orders
             WHERE tenant_id = $1
               AND status = 'completed'
               AND completed_at >= $2::date
               AND completed_at < ($3::date + INTERVAL '1 day')
           ) AS "completedWorkOrders"`,
        params
      ),

      // Work Order berdasarkan status.
      pool.query(
        `SELECT
           status,
           COUNT(*)::int AS total
         FROM work_orders
         WHERE tenant_id = $1
           AND created_at >= $2::date
           AND created_at < ($3::date + INTERVAL '1 day')
         GROUP BY status
         ORDER BY status`,
        params
      ),

      // Ringkasan invoice dan pembayaran.
      pool.query(
        `SELECT
           COUNT(*)::int AS "totalInvoices",
           COALESCE(SUM(total), 0)::numeric(16, 2) AS "totalBilled",
           COUNT(*) FILTER (WHERE status = 'paid')::int AS "paidInvoices",
           COUNT(*) FILTER (WHERE status = 'unpaid')::int AS "unpaidInvoices",
           COUNT(*) FILTER (
             WHERE status = 'partially_paid'
           )::int AS "partialInvoices",
           COUNT(*) FILTER (WHERE status = 'void')::int AS "voidInvoices"
         FROM invoices
         WHERE tenant_id = $1
           AND issued_at >= $2::date
           AND issued_at < ($3::date + INTERVAL '1 day')`,
        params
      ),

      // Pembayaran per bulan pada periode terpilih.
      pool.query(
        `SELECT
           TO_CHAR(
             DATE_TRUNC('month', payment_date),
             'YYYY-MM'
           ) AS month,
           COALESCE(SUM(amount), 0)::numeric(16, 2) AS revenue,
           COUNT(*)::int AS transactions
         FROM payments
         WHERE tenant_id = $1
           AND payment_date >= $2::date
           AND payment_date < ($3::date + INTERVAL '1 day')
         GROUP BY DATE_TRUNC('month', payment_date)
         ORDER BY DATE_TRUNC('month', payment_date)`,
        params
      ),

      // Layanan paling banyak diminta.
      pool.query(
        `SELECT
           sc.id,
           sc.name AS "serviceName",
           COUNT(sr.id)::int AS "totalRequests"
         FROM service_requests sr
         JOIN service_catalog sc
           ON sc.id = sr.service_id
          AND sc.tenant_id = sr.tenant_id
         WHERE sr.tenant_id = $1
           AND sr.created_at >= $2::date
           AND sr.created_at < ($3::date + INTERVAL '1 day')
         GROUP BY sc.id, sc.name
         ORDER BY COUNT(sr.id) DESC, sc.name ASC
         LIMIT 5`,
        params
      ),
    ]);

    const paymentResult = await pool.query(
      `SELECT
         COALESCE(SUM(amount), 0)::numeric(16, 2) AS "totalPayments",
         COUNT(*)::int AS "totalTransactions"
       FROM payments
       WHERE tenant_id = $1
         AND payment_date >= $2::date
         AND payment_date < ($3::date + INTERVAL '1 day')`,
      params
    );

    return res.json({
      status: "success",
      data: {
        period: {
          from,
          to,
        },
        summary: {
          ...summaryResult.rows[0],
          ...invoiceResult.rows[0],
          ...paymentResult.rows[0],
        },
        workOrders: workOrderResult.rows,
        monthlyPayments: monthlyResult.rows,
        topServices: serviceResult.rows,
      },
    });
  } catch (error) {
    console.error("Get business reports failed:", error.message);

    return res.status(500).json({
      status: "error",
      message: "Laporan bisnis gagal diambil.",
    });
  }
});

module.exports = router;
