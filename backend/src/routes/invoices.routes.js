
const express = require("express");
const crypto = require("node:crypto");
const pool = require("../config/database");
const {
  authenticateToken,
  authorizeRoles,
} = require("../middleware/auth.middleware");

const router = express.Router();

router.use(authenticateToken, authorizeRoles("staff"));

const invoiceSelect = `
  SELECT
    i.id,
    i.work_order_id AS "workOrderId",
    i.invoice_number AS "invoiceNumber",
    i.status,
    i.subtotal,
    i.total,
    i.issued_at AS "issuedAt",
    i.due_at AS "dueAt",
    i.notes,
    i.created_at AS "createdAt",
    c.full_name AS "customerName",
    sc.name AS "serviceName",
    COALESCE(SUM(p.amount), 0)::numeric(14, 2) AS "paidAmount",
    (i.total - COALESCE(SUM(p.amount), 0))::numeric(14, 2)
      AS "remainingAmount"
  FROM invoices i
  JOIN work_orders wo
    ON wo.id = i.work_order_id
   AND wo.tenant_id = i.tenant_id
  JOIN service_requests sr
    ON sr.id = wo.service_request_id
   AND sr.tenant_id = wo.tenant_id
  JOIN customers c
    ON c.id = sr.customer_id
   AND c.tenant_id = sr.tenant_id
  JOIN service_catalog sc
    ON sc.id = sr.service_id
   AND sc.tenant_id = sr.tenant_id
  LEFT JOIN payments p
    ON p.invoice_id = i.id
   AND p.tenant_id = i.tenant_id
`;

// GET /api/invoices
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
  const status =
    typeof req.query.status === "string"
      ? req.query.status.trim()
      : "";

  const allowedStatuses = [
    "unpaid",
    "partially_paid",
    "paid",
    "void",
  ];

  if (status && !allowedStatuses.includes(status)) {
    return res.status(400).json({
      status: "error",
      message: "Filter status invoice tidak valid.",
    });
  }

  try {
    const result = await pool.query(
      `${invoiceSelect}
       WHERE i.tenant_id = $1
         AND ($2 = '' OR i.status = $2)
       GROUP BY i.id, c.full_name, sc.name
       ORDER BY i.issued_at DESC, i.id DESC
       LIMIT $3 OFFSET $4`,
      [req.user.tenantId, status, limit, offset]
    );

    const countResult = await pool.query(
      `SELECT COUNT(*)::int AS total
       FROM invoices
       WHERE tenant_id = $1
         AND ($2 = '' OR status = $2)`,
      [req.user.tenantId, status]
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
    console.error("Get invoices failed:", error.message);

    return res.status(500).json({
      status: "error",
      message: "Daftar invoice gagal diambil.",
    });
  }
});

// GET /api/invoices/:id
router.get("/:id", async (req, res) => {
  if (!/^\d+$/.test(req.params.id)) {
    return res.status(400).json({
      status: "error",
      message: "ID invoice tidak valid.",
    });
  }

  try {
    const invoiceResult = await pool.query(
      `${invoiceSelect}
       WHERE i.tenant_id = $1
         AND i.id = $2
       GROUP BY i.id, c.full_name, sc.name`,
      [req.user.tenantId, req.params.id]
    );

    if (!invoiceResult.rows.length) {
      return res.status(404).json({
        status: "error",
        message: "Invoice tidak ditemukan.",
      });
    }

    const invoice = invoiceResult.rows[0];

    const itemsResult = await pool.query(
      `SELECT
         id,
         description,
         quantity,
         unit_price AS "unitPrice",
         line_total AS "lineTotal"
       FROM invoice_items
       WHERE tenant_id = $1
         AND invoice_id = $2
       ORDER BY id`,
      [req.user.tenantId, req.params.id]
    );

    const paymentsResult = await pool.query(
      `SELECT
         id,
         amount,
         payment_date AS "paymentDate",
         method,
         reference,
         notes
       FROM payments
       WHERE tenant_id = $1
         AND invoice_id = $2
       ORDER BY payment_date DESC`,
      [req.user.tenantId, req.params.id]
    );

    return res.json({
      status: "success",
      data: {
        ...invoice,
        items: itemsResult.rows,
        payments: paymentsResult.rows,
      },
    });
  } catch (error) {
    console.error("Get invoice detail failed:", error.message);

    return res.status(500).json({
      status: "error",
      message: "Detail invoice gagal diambil.",
    });
  }
});

// POST /api/invoices
router.post("/", async (req, res) => {
  const workOrderId = req.body?.workOrderId;

  const dueAt =
    typeof req.body?.dueAt === "string" && req.body.dueAt.trim()
      ? req.body.dueAt.trim()
      : null;

  const notes =
    typeof req.body?.notes === "string"
      ? req.body.notes.trim()
      : null;

  if (!/^\d+$/.test(String(workOrderId ?? ""))) {
    return res.status(400).json({
      status: "error",
      message: "Work Order wajib dipilih.",
    });
  }

  if (dueAt && Number.isNaN(Date.parse(dueAt))) {
    return res.status(400).json({
      status: "error",
      message: "Tanggal jatuh tempo tidak valid.",
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

    const workOrderResult = await client.query(
      `SELECT
         wo.id,
         wo.status,
         sr.service_id,
         sc.name AS service_name,
         sc.base_price,
         c.full_name AS customer_name
       FROM work_orders wo
       JOIN service_requests sr
         ON sr.id = wo.service_request_id
        AND sr.tenant_id = wo.tenant_id
       JOIN service_catalog sc
         ON sc.id = sr.service_id
        AND sc.tenant_id = sr.tenant_id
       JOIN customers c
         ON c.id = sr.customer_id
        AND c.tenant_id = sr.tenant_id
       WHERE wo.id = $1
         AND wo.tenant_id = $2
       FOR UPDATE OF wo`,
      [workOrderId, req.user.tenantId]
    );

    if (!workOrderResult.rows.length) {
      await client.query("ROLLBACK");

      return res.status(404).json({
        status: "error",
        message: "Work Order tidak ditemukan.",
      });
    }

    const workOrder = workOrderResult.rows[0];

    if (workOrder.status !== "completed") {
      await client.query("ROLLBACK");

      return res.status(409).json({
        status: "error",
        message: "Invoice hanya dapat dibuat dari Work Order yang selesai.",
      });
    }

    const existingInvoice = await client.query(
      `SELECT id
       FROM invoices
       WHERE tenant_id = $1
         AND work_order_id = $2`,
      [req.user.tenantId, workOrderId]
    );

    if (existingInvoice.rows.length) {
      await client.query("ROLLBACK");

      return res.status(409).json({
        status: "error",
        message: "Work Order ini sudah memiliki invoice.",
      });
    }

    const subtotal = Number(workOrder.base_price);

    const invoiceNumber =
      `INV-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;

    const invoiceResult = await client.query(
      `INSERT INTO invoices (
         tenant_id,
         work_order_id,
         invoice_number,
         subtotal,
         total,
         due_at,
         notes,
         created_by
       )
       VALUES ($1, $2, $3, $4, $4, $5, $6, $7)
       RETURNING
         id,
         work_order_id AS "workOrderId",
         invoice_number AS "invoiceNumber",
         status,
         subtotal,
         total,
         issued_at AS "issuedAt",
         due_at AS "dueAt",
         notes`,
      [
        req.user.tenantId,
        workOrderId,
        invoiceNumber,
        subtotal,
        dueAt,
        notes || null,
        req.user.id,
      ]
    );

    const invoice = invoiceResult.rows[0];

    await client.query(
      `INSERT INTO invoice_items (
         tenant_id,
         invoice_id,
         description,
         quantity,
         unit_price
       )
       VALUES ($1, $2, $3, 1, $4)`,
      [
        req.user.tenantId,
        invoice.id,
        workOrder.service_name,
        subtotal,
      ]
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
        "invoice.created",
        "invoice",
        invoice.id,
        JSON.stringify({
          invoiceNumber,
          workOrderId,
          total: invoice.total,
        }),
        req.ip || null,
        req.get("user-agent") || null,
      ]
    );

    await client.query("COMMIT");

    return res.status(201).json({
      status: "success",
      message: "Invoice berhasil dibuat.",
      data: {
        ...invoice,
        customerName: workOrder.customer_name,
        serviceName: workOrder.service_name,
      },
    });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});

    if (error.code === "23505") {
      return res.status(409).json({
        status: "error",
        message: "Invoice untuk Work Order ini sudah tersedia.",
      });
    }

    console.error("Create invoice failed:", error.message);

    return res.status(500).json({
      status: "error",
      message: "Invoice gagal dibuat.",
    });
  } finally {
    client.release();
  }
});

module.exports = router;
