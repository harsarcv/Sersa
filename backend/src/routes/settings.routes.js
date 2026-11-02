
const express = require("express");
const pool = require("../config/database");
const {
  authenticateToken,
  authorizeRoles,
} = require("../middleware/auth.middleware");

const router = express.Router();

router.use(authenticateToken, authorizeRoles("admin"));

function getBusinessData(row) {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    email: row.email,
    phone: row.phone,
    address: row.address,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// GET /api/settings/business
router.get("/business", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, name, slug, email, phone, address,
              status, created_at, updated_at
       FROM tenants
       WHERE id = $1
       LIMIT 1`,
      [req.user.tenantId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        status: "error",
        message: "Data bisnis tidak ditemukan.",
      });
    }

    return res.json({
      status: "success",
      data: getBusinessData(result.rows[0]),
    });
  } catch (error) {
    console.error("Get business settings failed:", error.message);

    return res.status(500).json({
      status: "error",
      message: "Pengaturan bisnis gagal diambil.",
    });
  }
});

// PUT /api/settings/business
router.put("/business", async (req, res) => {
  const name =
    typeof req.body?.name === "string" ? req.body.name.trim() : "";

  const email =
    typeof req.body?.email === "string"
      ? req.body.email.trim().toLowerCase()
      : "";

  const phone =
    typeof req.body?.phone === "string"
      ? req.body.phone.trim()
      : "";

  const address =
    typeof req.body?.address === "string"
      ? req.body.address.trim()
      : "";

  if (!name || !email) {
    return res.status(400).json({
      status: "error",
      message: "Nama bisnis dan email wajib diisi.",
    });
  }

  if (name.length > 150) {
    return res.status(400).json({
      status: "error",
      message: "Nama bisnis maksimal 150 karakter.",
    });
  }

  if (email.length > 255 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({
      status: "error",
      message: "Format email bisnis tidak valid.",
    });
  }

  if (phone.length > 30) {
    return res.status(400).json({
      status: "error",
      message: "Nomor telepon maksimal 30 karakter.",
    });
  }

  if (address.length > 5000) {
    return res.status(400).json({
      status: "error",
      message: "Alamat bisnis terlalu panjang.",
    });
  }

  try {
    const result = await pool.query(
      `UPDATE tenants
       SET name = $1,
           email = $2,
           phone = NULLIF($3, ''),
           address = NULLIF($4, ''),
           updated_at = NOW()
       WHERE id = $5
       RETURNING id, name, slug, email, phone, address,
                 status, created_at, updated_at`,
      [name, email, phone, address, req.user.tenantId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        status: "error",
        message: "Data bisnis tidak ditemukan.",
      });
    }

    return res.json({
      status: "success",
      message: "Pengaturan bisnis berhasil diperbarui.",
      data: getBusinessData(result.rows[0]),
    });
  } catch (error) {
    console.error("Update business settings failed:", error.message);

    return res.status(500).json({
      status: "error",
      message: "Pengaturan bisnis gagal diperbarui.",
    });
  }
});

module.exports = router;
