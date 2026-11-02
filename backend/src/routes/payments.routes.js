
const express = require("express");
const pool = require("../config/database");
const {
  authenticateToken,
  authorizeRoles,
} = require("../middleware/auth.middleware");

const router = express.Router();

router.use(authenticateToken, authorizeRoles("staff"));

const PAYMENT_METHODS = [
  "cash",
  "bank_transfer",
  "card",
  "other",
];

// GET /api/payments
router.get("/", async (req, res) => {
  const page = Math.max(
    1,
    Number.parseInt(req.query.page, 10) || 1
  );

  const limit = Math.min(
    100,
    Math.max(1, Number.parseInt(req.query.limit, 10) || 10)
  );

  const offset = (page - 1) * limit;

  try {
    const result = await pool.query(
      `SELECT
         p.id,
         p.invoice_id AS "invoiceId",
         i.invoice_number AS "invoiceNumber",
         c.full_name AS "customerName",
         p.amount,
         p.payment_date AS "paymentDate",
         p.method,
         p.reference,
         p.notes,
         u.full_name AS "recordedBy"
       FROM payments p
       JOIN invoices i
         ON i.id = p.invoice_id
        AND i.tenant_id = p.tenant_id
       JOIN work_orders wo
         ON wo.id = i.work_order_id
        AND wo.tenant_id = i.tenant_id
       JOIN service_requests sr
         ON sr.id = wo.service_request_id
        AND sr.tenant_id = wo.tenant_id
       JOIN customers c
         ON c.id = sr.customer_id
        AND c.tenant_id = sr.tenant_id
       JOIN users u ON u.id = p.recorded_by
       WHERE p.tenant_id = $1
       ORDER BY p.payment_date DESC, p.id DESC
       LIMIT $2 OFFSET $3`,
      [req.user.tenantId, limit, offset]
    );

    const countResult = await pool.query(
      `SELECT COUNT(*)::int AS total
       FROM payments
       WHERE tenant_id = $1`,
      [req.user.tenantId]
    );

    const total = countResult.rows[0].total;

    return res.json({
      status: "success",
      data: result.rows,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Get payments failed:", error.message);

    return res.status(500).json({
      status: "error",
      message: "Daftar pembayaran gagal diambil.",
    });
  }
});

// POST /api/payments
router.post("/", async (req, res) => {
  const invoiceId = req.body?.invoiceId;
  const amount = req.body?.amount;
  const method = req.body?.method;
  const reference =
    typeof req.body?.reference === "string"
      ? req.body.reference.trim()
      : null;
  const notes =
    typeof req.body?.notes === "string"
      ? req.body.notes.trim()
      : null;

  if (!/^\d+$/.test(String(invoiceId ?? ""))) {
    return res.status(400).json({
      status: "error",
      message: "Invoice wajib dipilih.",
    });
  }

  if (
    typeof amount !== "number" &&
    typeof amount !== "string"
  ) {
    return res.status(400).json({
      status: "error",
      message: "Jumlah pembayaran tidak valid.",
    });
  }

  const amountString = String(amount);

  if (!/^\d+(\.\d{1,2})?$/.test(amountString)) {
    return res.status(400).json({
      status: "error",
      message: "Jumlah pembayaran harus berupa angka positif dengan maksimal 2 desimal.",
    });
  }

  if (Number(amountString) <= 0) {
    return res.status(400).json({
      status: "error",
      message: "Jumlah pembayaran harus lebih dari nol.",
    });
  }

  if (!PAYMENT_METHODS.includes(method)) {
    return res.status(400).json({
      status: "error",
      message: "Metode pembayaran tidak valid.",
    });
  }

  if (reference && reference.length > 150) {
    return res.status(400).json({
      status: "error",
      message: "Referensi maksimal 150 karakter.",
    });
  }

  if (notes && notes.length > 2000) {
    return res.status(400).json({
      status: "error",
      message: "Catatan maksimal 2000 karakter.",
    });
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const invoiceResult = await client.query(
      `SELECT id, invoice_number, total, status
       FROM invoices
       WHERE id = $1
         AND tenant_id = $2
       FOR UPDATE`,
      [invoiceId, req.user.tenantId]
    );

    if (!invoiceResult.rows.length) {
      await client.query("ROLLBACK");

      return res.status(404).json({
        status: "error",
        message: "Invoice tidak ditemukan.",
      });
    }

    const invoice = invoiceResult.rows[0];

    if (invoice.status === "void") {
      await client.query("ROLLBACK");

      return res.status(409).json({
        status: "error",
        message: "Invoice yang dibatalkan tidak dapat menerima pembayaran.",
      });
    }

    if (invoice.status === "paid") {
      await client.query("ROLLBACK");

      return res.status(409).json({
        status: "409",
        message: "Invoice sudah lunas.",
      });
    }

    const paymentSummary = await client.query(
      `SELECT
         COALESCE(SUM(amount), 0)::numeric(14, 2) AS paid_amount
       FROM payments
       WHERE tenant_id = $1
         AND invoice_id = $2`,
      [req.user.tenantId, invoiceId]
    );

    const paidAmount = Number(
      paymentSummary.rows[0].paid_amount
    );

    const totalAmount = Number(invoice.total);
    const remainingAmount = totalAmount - paidAmount;
    const paymentAmount = Number(amountString);

    if (paymentAmount > remainingAmount) {
      await client.query("ROLLBACK");

      return res.status(409).json({
        status: "error",
        message: "Jumlah pembayaran melebihi sisa tagihan.",
        data: {
          remainingAmount: remainingAmount.toFixed(2),
        },
      });
    }

    const newPaidAmount = paidAmount + paymentAmount;

    const newStatus =
      newPaidAmount >= totalAmount
        ? "paid"
        : "partially_paid";

    const paymentResult = await client.query(
      `INSERT INTO payments (
         tenant_id,
         invoice_id,
         amount,
         method,
         reference,
         notes,
         recorded_by
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING
         id,
         invoice_id AS "invoiceId",
         amount,
         payment_date AS "paymentDate",
         method,
         reference,
         notes`,
      [
        req.user.tenantId,
        invoiceId,
        amountString,
        method,
        reference || null,
        notes || null,
        req.user.id,
      ]
    );

    await client.query(
      `UPDATE invoices
       SET status = $1,
           updated_at = NOW()
       WHERE id = $2
         AND tenant_id = $3`,
      [newStatus, invoiceId, req.user.tenantId]
    );

    await client.query(
      `INSERT INTO activity_logs (
         tenant_id,
         actor_user_id,
         action,
         entity_type,
         entity_id,
         new_values,
         ip_address,
         user_agent
       )
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8)`,
      [
        req.user.tenantId,
        req.user.id,
        "payment.created",
        "payment",
        paymentResult.rows[0].id,
        JSON.stringify({
          invoiceId,
          invoiceNumber: invoice.invoice_number,
          amount: amountString,
          method,
          invoiceStatus: newStatus,
        }),
        req.ip || null,
        req.get("user-agent") || null,
      ]
    );

    await client.query("COMMIT");

    return res.status(201).json({
      status: "success",
      message: "Pembayaran berhasil dicatat.",
      data: {
        ...paymentResult.rows[0],
        invoiceNumber: invoice.invoice_number,
        invoiceStatus: newStatus,
        paidAmount: newPaidAmount.toFixed(2),
        remainingAmount: (
          totalAmount - newPaidAmount
        ).toFixed(2),
      },
    });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});

    console.error("Create payment failed:", error.message);

    return res.status(500).json({
      status: "error",
      message: "Pembayaran gagal dicatat.",
    });
  } finally {
    client.release();
  }
});

module.exports = router;
