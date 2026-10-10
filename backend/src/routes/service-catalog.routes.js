
const express = require("express");

const pool = require("../config/database");
const {
  authenticateToken,
  authorizeRoles,
} = require("../middleware/auth.middleware");

const router = express.Router();

router.use(authenticateToken, authorizeRoles("admin", "staff"));

const SERVICE_FIELDS = `
  id,
  tenant_id,
  name,
  description,
  base_price,
  estimated_duration_minutes,
  status,
  created_at,
  updated_at
`;

function parsePositiveInteger(value) {
  if (!/^[1-9]\d*$/.test(String(value))) {
    return null;
  }

  const number = Number(value);

  return Number.isSafeInteger(number) ? number : null;
}

function validateService(body, partial = false) {
  const errors = {};
  const data = {};

  if (!partial || body.name !== undefined) {
    if (typeof body.name !== "string" || !body.name.trim()) {
      errors.name = "Nama layanan wajib diisi.";
    } else if (body.name.trim().length > 150) {
      errors.name = "Nama layanan maksimal 150 karakter.";
    } else {
      data.name = body.name.trim();
    }
  }

  if (!partial || body.description !== undefined) {
    if (
      body.description !== undefined &&
      body.description !== null &&
      typeof body.description !== "string"
    ) {
      errors.description = "Deskripsi harus berupa teks.";
    } else {
      data.description =
        typeof body.description === "string"
          ? body.description.trim() || null
          : null;
    }
  }

  if (!partial || body.basePrice !== undefined) {
    const price = body.basePrice;

    if (
      price === undefined ||
      price === null ||
      price === "" ||
      !Number.isFinite(Number(price)) ||
      Number(price) < 0
    ) {
      errors.basePrice = "Harga harus berupa angka nol atau lebih.";
    } else if (
      !/^\d+(\.\d{1,2})?$/.test(String(price).trim())
    ) {
      errors.basePrice = "Harga maksimal memiliki dua angka desimal.";
    } else {
      data.base_price = Number(price);
    }
  }

  if (!partial || body.estimatedDurationMinutes !== undefined) {
    const duration = body.estimatedDurationMinutes;

    if (
      duration === undefined ||
      duration === null ||
      duration === ""
    ) {
      data.estimated_duration_minutes = null;
    } else if (
      !Number.isSafeInteger(Number(duration)) ||
      Number(duration) <= 0
    ) {
      errors.estimatedDurationMinutes =
        "Durasi harus berupa bilangan bulat lebih dari nol.";
    } else {
      data.estimated_duration_minutes = Number(duration);
    }
  }

  if (!partial || body.status !== undefined) {
    const status = body.status ?? "active";

    if (!["active", "inactive"].includes(status)) {
      errors.status = "Status harus active atau inactive.";
    } else {
      data.status = status;
    }
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
    data,
  };
}

// GET /api/services
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

  if (
    typeof req.query.search === "string" &&
    search.length > 150
  ) {
    return res.status(400).json({
      status: "error",
      message: "Pencarian maksimal 150 karakter.",
    });
  }

  if (!["all", "active", "inactive"].includes(status)) {
    return res.status(400).json({
      status: "error",
      message: "Filter status tidak valid.",
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
    const filters = ["tenant_id = $1"];
    const values = [req.user.tenantId];

    if (search) {
      values.push(`%${search}%`);
      filters.push(`(name ILIKE $${values.length} OR description ILIKE $${values.length})`);
    }

    if (status !== "all") {
      values.push(status);
      filters.push(`status = $${values.length}`);
    }

    const whereClause = filters.join(" AND ");

    const countResult = await pool.query(
      `SELECT COUNT(*)::int AS total
       FROM service_catalog
       WHERE ${whereClause}`,
      values
    );

    const total = countResult.rows[0].total;
    const totalPages = Math.ceil(total / limit);

    const dataResult = await pool.query(
      `SELECT ${SERVICE_FIELDS}
       FROM service_catalog
       WHERE ${whereClause}
       ORDER BY created_at DESC, id DESC
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
        totalPages,
      },
    });
  } catch (error) {
    console.error("Get service catalog failed:", error.message);

    return res.status(500).json({
      status: "error",
      message: "Daftar layanan gagal dimuat.",
    });
  }
});

// GET /api/services/:id
router.get("/:id", async (req, res) => {
  const id = parsePositiveInteger(req.params.id);

  if (!id) {
    return res.status(400).json({
      status: "error",
      message: "ID layanan tidak valid.",
    });
  }

  try {
    const result = await pool.query(
      `SELECT ${SERVICE_FIELDS}
       FROM service_catalog
       WHERE id = $1 AND tenant_id = $2`,
      [id, req.user.tenantId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        status: "error",
        message: "Layanan tidak ditemukan.",
      });
    }

    return res.status(200).json({
      status: "success",
      data: result.rows[0],
    });
  } catch (error) {
    console.error("Get service detail failed:", error.message);

    return res.status(500).json({
      status: "error",
      message: "Detail layanan gagal dimuat.",
    });
  }
});

// POST /api/services
router.post("/", async (req, res) => {
  const validation = validateService(req.body || {});

  if (!validation.valid) {
    return res.status(400).json({
      status: "error",
      message: "Data layanan tidak valid.",
      errors: validation.errors,
    });
  }

  const {
    name,
    description,
    base_price,
    estimated_duration_minutes,
    status,
  } = validation.data;

  try {
    const result = await pool.query(
      `INSERT INTO service_catalog (
         tenant_id,
         name,
         description,
         base_price,
         estimated_duration_minutes,
         status
       )
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING ${SERVICE_FIELDS}`,
      [
        req.user.tenantId,
        name,
        description,
        base_price,
        estimated_duration_minutes,
        status,
      ]
    );

    return res.status(201).json({
      status: "success",
      message: "Layanan berhasil dibuat.",
      data: result.rows[0],
    });
  } catch (error) {
    if (error.code === "23505") {
      return res.status(409).json({
        status: "error",
        message: "Nama layanan sudah digunakan dalam bisnis ini.",
      });
    }

    console.error("Create service failed:", error.message);

    return res.status(500).json({
      status: "error",
      message: "Layanan gagal dibuat.",
    });
  }
});

// PUT /api/services/:id
router.put("/:id", async (req, res) => {
  const id = parsePositiveInteger(req.params.id);

  if (!id) {
    return res.status(400).json({
      status: "error",
      message: "ID layanan tidak valid.",
    });
  }

  const validation = validateService(req.body || {});

  if (!validation.valid) {
    return res.status(400).json({
      status: "error",
      message: "Data layanan tidak valid.",
      errors: validation.errors,
    });
  }

  const {
    name,
    description,
    base_price,
    estimated_duration_minutes,
    status,
  } = validation.data;

  try {
    const result = await pool.query(
      `UPDATE service_catalog
       SET name = $1,
           description = $2,
           base_price = $3,
           estimated_duration_minutes = $4,
           status = $5,
           updated_at = NOW()
       WHERE id = $6 AND tenant_id = $7
       RETURNING ${SERVICE_FIELDS}`,
      [
        name,
        description,
        base_price,
        estimated_duration_minutes,
        status,
        id,
        req.user.tenantId,
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        status: "error",
        message: "Layanan tidak ditemukan.",
      });
    }

    return res.status(200).json({
      status: "success",
      message: "Layanan berhasil diperbarui.",
      data: result.rows[0],
    });
  } catch (error) {
    if (error.code === "23505") {
      return res.status(409).json({
        status: "error",
        message: "Nama layanan sudah digunakan dalam bisnis ini.",
      });
    }

    console.error("Update service failed:", error.message);

    return res.status(500).json({
      status: "error",
      message: "Layanan gagal diperbarui.",
    });
  }
});

// PATCH /api/services/:id/status
router.patch("/:id/status", async (req, res) => {
  const id = parsePositiveInteger(req.params.id);
  const { status } = req.body || {};

  if (!id) {
    return res.status(400).json({
      status: "error",
      message: "ID layanan tidak valid.",
    });
  }

  if (!["active", "inactive"].includes(status)) {
    return res.status(400).json({
      status: "error",
      message: "Status harus active atau inactive.",
    });
  }

  try {
    const result = await pool.query(
      `UPDATE service_catalog
       SET status = $1,
           updated_at = NOW()
       WHERE id = $2 AND tenant_id = $3
       RETURNING ${SERVICE_FIELDS}`,
      [status, id, req.user.tenantId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        status: "error",
        message: "Layanan tidak ditemukan.",
      });
    }

    return res.status(200).json({
      status: "success",
      message:
        status === "inactive"
          ? "Layanan berhasil dinonaktifkan."
          : "Layanan berhasil diaktifkan.",
      data: result.rows[0],
    });
  } catch (error) {
    console.error("Update service status failed:", error.message);

    return res.status(500).json({
      status: "error",
      message: "Status layanan gagal diperbarui.",
    });
  }
});

module.exports = router;
