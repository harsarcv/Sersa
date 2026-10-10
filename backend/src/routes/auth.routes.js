
const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const crypto = require("node:crypto");
const { authenticateToken, authorizeRoles } = require("../middleware/auth.middleware");


const pool = require("../config/database");
const { validateBusinessRegistration } = require("../validators/auth.validators");

const router = express.Router();

router.post("/register-business", async (req, res) => {
  const validation = validateBusinessRegistration(req.body || {});

  if (!validation.valid) {
    return res.status(400).json({
      status: "error",
      message: "Data registrasi tidak valid.",
      errors: validation.errors,
    });
  }

  const { businessName, fullName, email, password } = validation.data;

  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    return res.status(500).json({
      status: "error",
      message: "Konfigurasi autentikasi server belum tersedia.",
    });
  }

  const client = await pool.connect();

  try {
    const passwordHash = await bcrypt.hash(password, 12);

    const slugBase =
      businessName
        .toLowerCase()
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 130) || "business";

    const slug = `${slugBase}-${crypto.randomBytes(4).toString("hex")}`;

    await client.query("BEGIN");

    const userResult = await client.query(
      `INSERT INTO users (full_name, email, password_hash)
       VALUES ($1, $2, $3)
       RETURNING id, full_name, email`,
      [fullName, email, passwordHash]
    );

    const user = userResult.rows[0];

    const tenantResult = await client.query(
      `INSERT INTO tenants (name, slug, email)
       VALUES ($1, $2, $3)
       RETURNING id, name, slug`,
      [businessName, slug, email]
    );

    const tenant = tenantResult.rows[0];

    await client.query(
      `INSERT INTO tenant_memberships (tenant_id, user_id, role)
       VALUES ($1, $2, 'admin')`,
      [tenant.id, user.id]
    );

    await client.query("COMMIT");

    const token = jwt.sign(
      {
        sub: String(user.id),
        tenantId: String(tenant.id),
        role: "admin",
      },
      process.env.JWT_SECRET,
      { expiresIn: "2h", issuer: "sersa-api" }
    );

    return res.status(201).json({
      status: "success",
      message: "Bisnis dan akun Admin berhasil dibuat.",
      data: {
        user,
        tenant,
        role: "admin",
        token,
      },
    });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});

    if (error.code === "23505") {
      return res.status(409).json({
        status: "error",
        message: "Email tersebut sudah terdaftar.",
      });
    }

    console.error("Business registration failed:", error.message);

    return res.status(500).json({
      status: "error",
      message: "Registrasi gagal diproses.",
    });
  } finally {
    client.release();
  }
});


router.post("/login", async (req, res) => {
  const email =
    typeof req.body?.email === "string"
      ? req.body.email.trim().toLowerCase()
      : "";

  const password =
    typeof req.body?.password === "string"
      ? req.body.password
      : "";

  if (!email || !password) {
    return res.status(400).json({
      status: "error",
      message: "Email dan password wajib diisi.",
    });
  }

  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    return res.status(500).json({
      status: "error",
      message: "Konfigurasi autentikasi server belum tersedia.",
    });
  }

  try {
    const result = await pool.query(
      `SELECT
         u.id,
         u.full_name,
         u.email,
         u.password_hash,
         u.status AS user_status,
         t.id AS tenant_id,
         t.name AS tenant_name,
         t.slug AS tenant_slug,
         t.status AS tenant_status,
         tm.role
       FROM users u
       JOIN tenant_memberships tm ON tm.user_id = u.id
       JOIN tenants t ON t.id = tm.tenant_id
       WHERE u.email = $1
         AND u.status = 'active'
         AND tm.status = 'active'
         AND t.status = 'active'
       ORDER BY t.id
       LIMIT 1`,
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        status: "error",
        message: "Email atau password salah.",
      });
    }

    const account = result.rows[0];
    const passwordMatches = await bcrypt.compare(
      password,
      account.password_hash
    );

    if (!passwordMatches) {
      return res.status(401).json({
        status: "error",
        message: "Email atau password salah.",
      });
    }

    const token = jwt.sign(
      {
        sub: String(account.id),
        tenantId: String(account.tenant_id),
        role: account.role,
      },
      process.env.JWT_SECRET,
      {
        expiresIn: "2h",
        issuer: "sersa-api",
      }
    );

    return res.status(200).json({
      status: "success",
      message: "Login berhasil.",
      data: {
        user: {
          id: account.id,
          fullName: account.full_name,
          email: account.email,
        },
        tenant: {
          id: account.tenant_id,
          name: account.tenant_name,
          slug: account.tenant_slug,
        },
        role: account.role,
        token,
      },
    });
  } catch (error) {
    console.error("Login failed:", error.message);

    return res.status(500).json({
      status: "error",
      message: "Login gagal diproses.",
    });
  }
});



router.get("/me", authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT
         u.id,
         u.full_name,
         u.email,
         tm.role,
         t.id AS tenant_id,
         t.name AS tenant_name,
         t.slug AS tenant_slug
       FROM users u
       JOIN tenant_memberships tm ON tm.user_id = u.id
       JOIN tenants t ON t.id = tm.tenant_id
       WHERE u.id = $1
         AND t.id = $2
         AND u.status = 'active'
         AND tm.status = 'active'
         AND t.status = 'active'
       LIMIT 1`,
      [req.user.id, req.user.tenantId]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        status: "error",
        message: "Akun atau keanggotaan bisnis tidak aktif.",
      });
    }

    const account = result.rows[0];

    if (account.role !== req.user.role) {
      return res.status(401).json({
        status: "error",
        message: "Informasi role pada token sudah tidak berlaku.",
      });
    }

    return res.status(200).json({
      status: "success",
      message: "Profil berhasil diambil.",
      data: {
        user: {
          id: account.id,
          fullName: account.full_name,
          email: account.email,
        },
        tenant: {
          id: account.tenant_id,
          name: account.tenant_name,
          slug: account.tenant_slug,
        },
        role: account.role,
      },
    });
  } catch (error) {
    console.error("Get profile failed:", error.message);

    return res.status(500).json({
      status: "error",
      message: "Profil gagal diambil.",
    });
  }
});

module.exports = router;
