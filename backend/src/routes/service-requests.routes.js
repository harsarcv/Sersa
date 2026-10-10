
const express = require("express");
const pool = require("../config/database");
const {
  authenticateToken,
  authorizeRoles,
} = require("../middleware/auth.middleware");

const router = express.Router();

router.use(
  authenticateToken,
  authorizeRoles("admin", "staff")
);

function parsePositiveInteger(value) {
  if (!/^[1-9]\d*$/.test(String(value ?? ""))) {
    return null;
  }

  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function isValidDate(value) {
  if (typeof value !== "string") return false;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const date = new Date(`${value}T00:00:00.000Z`);

  return (
    !Number.isNaN(date.getTime()) &&
    date.toISOString().slice(0, 10) === value
  );
}

const REQUEST_FIELDS = `
  sr.id,
  sr.tenant_id,
  sr.customer_id,
  sr.service_id,
  sr.address_id,
  sr.description,
  sr.preferred_date,
  sr.status,
  sr.reviewed_by,
  sr.reviewed_at,
  sr.rejection_reason,
  sr.created_at,
  sr.updated_at,
  c.full_name AS customer_name,
  sc.name AS service_name,
  sc.base_price,
  ca.label AS address_label,
  ca.address AS service_address
`;

// GET /api/service-requests
router.get("/", async (req, res) => {
  const page = parsePositiveInteger(req.query.page ?? "1");
  const limit = parsePositiveInteger(req.query.limit ?? "10");
  const search =
    typeof req.query.search === "string"
      ? req.query.search.trim()
      : "";
  const status = req.query.status ?? "all";

  if (!page || !limit || limit > 100) {
    return res.status(400).json({
      status: "error",
      message: "Parameter pagination tidak valid.",
    });
  }

  if (search.length > 150) {
    return res.status(400).json({
      status: "error",
      message: "Pencarian maksimal 150 karakter.",
    });
  }

  const allowedStatuses = [
    "all",
    "requested",
    "approved",
    "rejected",
    "cancelled",
  ];

  if (!allowedStatuses.includes(status)) {
    return res.status(400).json({
      status: "error",
      message: "Filter status permintaan tidak valid.",
    });
  }

  const offset = (page - 1) * limit;

  if (!Number.isSafeInteger(offset)) {
    return res.status(400).json({
      status: "error",
      message: "Nomor halaman terlalu besar.",
    });
  }

  try {
    const values = [req.user.tenantId];
    const filters = ["sr.tenant_id = $1"];

    if (status !== "all") {
      values.push(status);
      filters.push(`sr.status = $${values.length}`);
    }

    if (search) {
      values.push(`%${search}%`);
      filters.push(`(
        c.full_name ILIKE $${values.length}
        OR sc.name ILIKE $${values.length}
        OR sr.description ILIKE $${values.length}
      )`);
    }

    const whereClause = filters.join(" AND ");

    const countResult = await pool.query(
      `SELECT COUNT(*)::int AS total
       FROM service_requests sr
       JOIN customers c
         ON c.id = sr.customer_id
        AND c.tenant_id = sr.tenant_id
       JOIN service_catalog sc
         ON sc.id = sr.service_id
        AND sc.tenant_id = sr.tenant_id
       WHERE ${whereClause}`,
      values
    );

    const total = countResult.rows[0].total;

    const dataResult = await pool.query(
      `SELECT ${REQUEST_FIELDS}
       FROM service_requests sr
       JOIN customers c
         ON c.id = sr.customer_id
        AND c.tenant_id = sr.tenant_id
       JOIN service_catalog sc
         ON sc.id = sr.service_id
        AND sc.tenant_id = sr.tenant_id
       JOIN customer_addresses ca
         ON ca.id = sr.address_id
        AND ca.customer_id = sr.customer_id
        AND ca.tenant_id = sr.tenant_id
       WHERE ${whereClause}
       ORDER BY sr.created_at DESC, sr.id DESC
       LIMIT $${values.length + 1}
       OFFSET $${values.length + 2}`,
      [...values, limit, offset]
    );

    return res.status(200).json({
      status: "success",
      data: dataResult.rows,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("List service requests failed:", error.message);

    return res.status(500).json({
      status: "error",
      message: "Daftar permintaan layanan gagal dimuat.",
    });
  }
});

// POST /api/service-requests
router.post("/", async (req, res) => {
  const customerId = parsePositiveInteger(req.body?.customerId);
  const serviceId = parsePositiveInteger(req.body?.serviceId);
  const addressId = parsePositiveInteger(req.body?.addressId);

  const description =
    typeof req.body?.description === "string"
      ? req.body.description.trim()
      : "";

  const preferredDate = req.body?.preferredDate ?? null;

  if (!customerId || !serviceId || !addressId) {
    return res.status(400).json({
      status: "error",
      message: "Pelanggan, layanan, dan alamat wajib dipilih.",
    });
  }

  if (description.length < 5 || description.length > 5000) {
    return res.status(400).json({
      status: "error",
      message: "Deskripsi harus terdiri dari 5–5000 karakter.",
    });
  }

  if (
    preferredDate !== null &&
    (!isValidDate(preferredDate))
  ) {
    return res.status(400).json({
      status: "error",
      message: "Tanggal pilihan tidak valid.",
    });
  }

  try {
    // Pastikan semua data terkait berada dalam tenant yang sama.
    const validationResult = await pool.query(
      `SELECT
         c.id AS customer_id,
         sc.id AS service_id,
         ca.id AS address_id
       FROM customers c
       JOIN service_catalog sc
         ON sc.id = $2
        AND sc.tenant_id = c.tenant_id
        AND sc.status = 'active'
       JOIN customer_addresses ca
         ON ca.id = $3
        AND ca.customer_id = c.id
        AND ca.tenant_id = c.tenant_id
       WHERE c.id = $1
         AND c.tenant_id = $4
         AND c.status = 'active'`,
      [
        customerId,
        serviceId,
        addressId,
        req.user.tenantId,
      ]
    );

    if (validationResult.rows.length === 0) {
      return res.status(400).json({
        status: "error",
        message:
          "Pelanggan, layanan aktif, atau alamat tidak valid.",
      });
    }

    const result = await pool.query(
      `INSERT INTO service_requests (
         tenant_id,
         customer_id,
         service_id,
         address_id,
         description,
         preferred_date
       )
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        req.user.tenantId,
        customerId,
        serviceId,
        addressId,
        description,
        preferredDate,
      ]
    );

    const request = result.rows[0];

    return res.status(201).json({
      status: "success",
      message: "Permintaan layanan berhasil dibuat.",
      data: request,
    });
  } catch (error) {
    console.error("Create service request failed:", error.message);

    return res.status(500).json({
      status: "error",
      message: "Permintaan layanan gagal dibuat.",
    });
  }
});

// PATCH /api/service-requests/:id/review

router.patch("/:id/review", async (req, res) => {
  const id = parsePositiveInteger(req.params.id);
  const { status, rejectionReason } = req.body ?? {};

  if (!id) {
    return res.status(400).json({
      status: "error",
      message: "ID permintaan tidak valid.",
    });
  }

  if (!["approved", "rejected"].includes(status)) {
    return res.status(400).json({
      status: "error",
      message: "Status review harus approved atau rejected.",
    });
  }

  const reason =
    typeof rejectionReason === "string"
      ? rejectionReason.trim()
      : "";

  if (status === "rejected" && !reason) {
    return res.status(400).json({
      status: "error",
      message: "Alasan penolakan wajib diisi.",
    });
  }

  if (reason.length > 2000) {
    return res.status(400).json({
      status: "error",
      message: "Alasan penolakan maksimal 2000 karakter.",
    });
  }

  let client;
  let transactionStarted = false;

  try {
    client = await pool.connect();
    await client.query("BEGIN");
    transactionStarted = true;

    const existingResult = await client.query(
      `SELECT id, status, reviewed_by, reviewed_at,
              rejection_reason
       FROM service_requests
       WHERE id = $1 AND tenant_id = $2
       FOR UPDATE`,
      [id, req.user.tenantId]
    );

    if (existingResult.rows.length === 0) {
      await client.query("ROLLBACK");
      transactionStarted = false;

      return res.status(404).json({
        status: "error",
        message: "Permintaan layanan tidak ditemukan.",
      });
    }

    const existing = existingResult.rows[0];

    if (existing.status !== "requested") {
      await client.query("ROLLBACK");
      transactionStarted = false;

      return res.status(409).json({
        status: "error",
        message: "Permintaan ini sudah ditinjau atau tidak dapat ditinjau lagi.",
      });
    }

    const updatedResult = await client.query(
      `UPDATE service_requests
       SET status = $1,
           reviewed_by = $2,
           reviewed_at = NOW(),
           rejection_reason = $3,
           updated_at = NOW()
       WHERE id = $4 AND tenant_id = $5
       RETURNING *`,
      [
        status,
        req.user.id,
        status === "rejected" ? reason : null,
        id,
        req.user.tenantId,
      ]
    );

    const updated = updatedResult.rows[0];

    await client.query(
      `INSERT INTO activity_logs (
         tenant_id,
         actor_user_id,
         action,
         entity_type,
         entity_id,
         old_values,
         new_values,
         ip_address,
         user_agent
       )
       VALUES (
         $1, $2, $3, $4, $5,
         $6::jsonb, $7::jsonb, $8, $9
       )`,
      [
        req.user.tenantId,
        req.user.id,
        status === "approved"
          ? "service_request.approved"
          : "service_request.rejected",
        "service_request",
        id,
        JSON.stringify({
          status: existing.status,
          reviewed_by: existing.reviewed_by,
          reviewed_at: existing.reviewed_at,
          rejection_reason: existing.rejection_reason,
        }),
        JSON.stringify({
          status: updated.status,
          reviewed_by: updated.reviewed_by,
          reviewed_at: updated.reviewed_at,
          rejection_reason: updated.rejection_reason,
        }),
        req.ip || null,
        req.get("user-agent") || null,
      ]
    );

    await client.query("COMMIT");
    transactionStarted = false;

    return res.status(200).json({
      status: "success",
      message:
        status === "approved"
          ? "Permintaan berhasil disetujui."
          : "Permintaan berhasil ditolak.",
      data: updated,
    });
  } catch (error) {
    if (client && transactionStarted) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        console.error(
          "Service request review rollback failed:",
          rollbackError.message
        );
      }
    }

    console.error("Review service request failed:", error.message);

    return res.status(500).json({
      status: "error",
      message: "Review permintaan gagal diproses.",
    });
  } finally {
    if (client) {
      client.release();
    }
  }
});


module.exports = router;
