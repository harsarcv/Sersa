
const express = require("express");
const pool = require("../config/database");
const { authenticateToken, authorizeRoles } = require("../middleware/auth.middleware");

const router = express.Router();

const allowedRoles = authorizeRoles("admin", "staff");

router.get("/", authenticateToken, allowedRoles, async (req, res) => {
    const search =
        typeof req.query.search === "string"
            ? req.query.search.trim()
            : "";


    const status =
        typeof req.query.status === "string"
            ? req.query.status
            : "active";

    if (!["active", "inactive", "all"].includes(status)) {
        return res.status(400).json({
            status: "error",
            message: "Filter status pelanggan tidak valid.",
        });
    }


    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.min(
        100,
        Math.max(1, Number.parseInt(req.query.limit, 10) || 10)
    );
    const offset = (page - 1) * limit;

    try {

        const result = await pool.query(
            `SELECT id, full_name, email, phone, status, created_at
   FROM customers
   WHERE tenant_id = $1
     AND ($2 = 'all' OR status = $2)
     AND (
       full_name ILIKE $3
       OR COALESCE(email, '') ILIKE $3
       OR COALESCE(phone, '') ILIKE $3
     )
   ORDER BY created_at DESC, id DESC
   LIMIT $4 OFFSET $5`,
            [req.user.tenantId, status, `%${search}%`, limit, offset]
        );



        const countResult = await pool.query(
            `SELECT COUNT(*)::int AS total
   FROM customers
   WHERE tenant_id = $1
     AND ($2 = 'all' OR status = $2)
     AND (
       full_name ILIKE $3
       OR COALESCE(email, '') ILIKE $3
       OR COALESCE(phone, '') ILIKE $3
     )`,
            [req.user.tenantId, status, `%${search}%`]
        );


        return res.status(200).json({
            status: "success",
            data: result.rows,
            pagination: {
                page,
                limit,
                total: countResult.rows[0].total,
                totalPages: Math.ceil(countResult.rows[0].total / limit),
            },
        });
    } catch (error) {
        console.error("List customers failed:", error.message);

        return res.status(500).json({
            status: "error",
            message: "Data pelanggan gagal diambil.",
        });
    }
});


router.get("/:id", authenticateToken, allowedRoles, async (req, res) => {
    const customerId = Number.parseInt(req.params.id, 10);

    if (!Number.isSafeInteger(customerId) || customerId < 1) {
        return res.status(400).json({
            status: "error",
            message: "ID pelanggan tidak valid.",
        });
    }

    try {
        const result = await pool.query(
            `SELECT id, full_name, email, phone, status, created_at
       FROM customers
       WHERE id = $1 AND tenant_id = $2`,
            [customerId, req.user.tenantId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                status: "error",
                message: "Pelanggan tidak ditemukan.",
            });
        }

        return res.status(200).json({
            status: "success",
            data: result.rows[0],
        });
    } catch (error) {
        console.error("Get customer detail failed:", error.message);

        return res.status(500).json({
            status: "error",
            message: "Detail pelanggan gagal diambil.",
        });
    }
});


router.put("/:id", authenticateToken, allowedRoles, async (req, res) => {
    const customerId = Number.parseInt(req.params.id, 10);

    if (!Number.isSafeInteger(customerId) || customerId < 1) {
        return res.status(400).json({
            status: "error",
            message: "ID pelanggan tidak valid.",
        });
    }

    const { fullName, email, phone } = req.body ?? {};

    if (
        typeof fullName !== "string" ||
        fullName.trim().length < 2 ||
        fullName.trim().length > 150
    ) {
        return res.status(400).json({
            status: "error",
            message: "Nama pelanggan harus terdiri dari 2 sampai 150 karakter.",
        });
    }

    const normalizedEmail =
        typeof email === "string" ? email.trim().toLowerCase() : null;
    const normalizedPhone =
        typeof phone === "string" ? phone.trim() : null;

    if (
        normalizedEmail &&
        (normalizedEmail.length > 255 ||
            !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail))
    ) {
        return res.status(400).json({
            status: "error",
            message: "Format email tidak valid.",
        });
    }

    if (normalizedPhone && normalizedPhone.length > 30) {
        return res.status(400).json({
            status: "error",
            message: "Nomor telepon maksimal 30 karakter.",
        });
    }

    try {
        const result = await pool.query(
            `UPDATE customers
       SET full_name = $1,
           email = $2,
           phone = $3,
           updated_at = NOW()
       WHERE id = $4 AND tenant_id = $5
       RETURNING id, full_name, email, phone, status, created_at`,
            [
                fullName.trim(),
                normalizedEmail || null,
                normalizedPhone || null,
                customerId,
                req.user.tenantId,
            ]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                status: "error",
                message: "Pelanggan tidak ditemukan.",
            });
        }

        return res.status(200).json({
            status: "success",
            message: "Pelanggan berhasil diperbarui.",
            data: result.rows[0],
        });
    } catch (error) {
        console.error("Update customer failed:", error.message);

        return res.status(500).json({
            status: "error",
            message: "Pelanggan gagal diperbarui.",
        });
    }
});

router.post("/", authenticateToken, allowedRoles, async (req, res) => {
    const fullName =
        typeof req.body?.fullName === "string"
            ? req.body.fullName.trim()
            : "";

    const email =
        typeof req.body?.email === "string"
            ? req.body.email.trim().toLowerCase()
            : null;

    const phone =
        typeof req.body?.phone === "string"
            ? req.body.phone.trim()
            : null;

    if (fullName.length < 2 || fullName.length > 150) {
        return res.status(400).json({
            status: "error",
            message: "Nama pelanggan harus 2–150 karakter.",
        });
    }

    if (email && (
        email.length > 255 ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    )) {
        return res.status(400).json({
            status: "error",
            message: "Format email tidak valid.",
        });
    }

    if (phone && phone.length > 30) {
        return res.status(400).json({
            status: "error",
            message: "Nomor telepon maksimal 30 karakter.",
        });
    }

    try {
        const result = await pool.query(
            `INSERT INTO customers (tenant_id, full_name, email, phone)
       VALUES ($1, $2, $3, $4)
       RETURNING id, full_name, email, phone, status, created_at`,
            [
                req.user.tenantId,
                fullName,
                email || null,
                phone || null,
            ]
        );

        return res.status(201).json({
            status: "success",
            message: "Pelanggan berhasil ditambahkan.",
            data: result.rows[0],
        });
    } catch (error) {
        console.error("Create customer failed:", error.message);

        return res.status(500).json({
            status: "error",
            message: "Pelanggan gagal ditambahkan.",
        });
    }
});


router.patch("/:id/deactivate", authenticateToken, allowedRoles, async (req, res) => {
    const customerId = Number.parseInt(req.params.id, 10);

    if (!Number.isSafeInteger(customerId) || customerId < 1) {
        return res.status(400).json({
            status: "error",
            message: "ID pelanggan tidak valid.",
        });
    }

    try {
        const result = await pool.query(
            `UPDATE customers
       SET status = 'inactive',
           updated_at = NOW()
       WHERE id = $1
         AND tenant_id = $2
         AND status = 'active'
       RETURNING id, full_name, email, phone, status, updated_at`,
            [customerId, req.user.tenantId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                status: "error",
                message: "Pelanggan aktif tidak ditemukan.",
            });
        }

        return res.status(200).json({
            status: "success",
            message: "Pelanggan berhasil dinonaktifkan.",
            data: result.rows[0],
        });
    } catch (error) {
        console.error("Deactivate customer failed:", error.message);

        return res.status(500).json({
            status: "error",
            message: "Pelanggan gagal dinonaktifkan.",
        });
    }
});


module.exports = router;
