
const express = require("express");
const bcrypt = require("bcrypt");
const pool = require("../config/database");
const {
  authenticateToken,
  authorizeRoles,
} = require("../middleware/auth.middleware");

const router = express.Router();

router.use(authenticateToken, authorizeRoles("admin"));

const allowedRoles = ["staff", "technician"];

async function logActivity(client, req, action, entityId, oldValues, newValues) {
  await client.query(
    `INSERT INTO activity_logs (
       tenant_id, actor_user_id, action, entity_type, entity_id,
       old_values, new_values, ip_address, user_agent
     )
     VALUES ($1, $2, $3, 'team_member', $4, $5, $6, $7, $8)`,
    [
      req.user.tenantId,
      req.user.id,
      action,
      entityId,
      oldValues ? JSON.stringify(oldValues) : null,
      newValues ? JSON.stringify(newValues) : null,
      req.ip || null,
      req.get("user-agent") || null,
    ]
  );
}

// GET /api/team
router.get("/", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT
         u.id,
         u.full_name AS "fullName",
         u.email,
         u.phone,
         u.status AS "userStatus",
         tm.role,
         tm.status AS "membershipStatus",
         tm.created_at AS "joinedAt"
       FROM tenant_memberships tm
       JOIN users u ON u.id = tm.user_id
       WHERE tm.tenant_id = $1
       ORDER BY tm.created_at DESC, u.full_name`,
      [req.user.tenantId]
    );

    return res.json({
      status: "success",
      data: result.rows,
    });
  } catch (error) {
    console.error("Get team failed:", error.message);
    return res.status(500).json({
      status: "error",
      message: "Daftar anggota tim gagal diambil.",
    });
  }
});

// POST /api/team
router.post("/", async (req, res) => {
  const fullName =
    typeof req.body?.fullName === "string"
      ? req.body.fullName.trim()
      : "";

  const email =
    typeof req.body?.email === "string"
      ? req.body.email.trim().toLowerCase()
      : "";

  const phone =
    typeof req.body?.phone === "string"
      ? req.body.phone.trim()
      : null;

  const password =
    typeof req.body?.password === "string"
      ? req.body.password
      : "";

  const role =
    typeof req.body?.role === "string"
      ? req.body.role.trim()
      : "";

  if (
    !fullName ||
    fullName.length > 150 ||
    !email ||
    email.length > 255 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    password.length < 10 ||
    password.length > 72 ||
    !allowedRoles.includes(role) ||
    (phone && phone.length > 30)
  ) {
    return res.status(400).json({
      status: "error",
      message:
        "Nama, email valid, password 10–72 karakter, dan role staff atau technician wajib diisi.",
    });
  }

  const client = await pool.connect();

  try {
    const passwordHash = await bcrypt.hash(password, 12);

    await client.query("BEGIN");

    const userResult = await client.query(
      `INSERT INTO users (full_name, email, password_hash, phone)
       VALUES ($1, $2, $3, $4)
       RETURNING id, full_name, email, phone, status`,
      [fullName, email, passwordHash, phone || null]
    );

    const user = userResult.rows[0];

    const membershipResult = await client.query(
      `INSERT INTO tenant_memberships (tenant_id, user_id, role)
       VALUES ($1, $2, $3)
       RETURNING role, status`,
      [req.user.tenantId, user.id, role]
    );

    await logActivity(
      client,
      req,
      "team_member.created",
      user.id,
      null,
      {
        fullName: user.full_name,
        email: user.email,
        role: membershipResult.rows[0].role,
      }
    );

    await client.query("COMMIT");

    return res.status(201).json({
      status: "success",
      message: "Anggota tim berhasil ditambahkan.",
      data: {
        id: user.id,
        fullName: user.full_name,
        email: user.email,
        phone: user.phone,
        userStatus: user.status,
        role: membershipResult.rows[0].role,
        membershipStatus: membershipResult.rows[0].status,
      },
    });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});

    if (error.code === "23505") {
      return res.status(409).json({
        status: "error",
        message:
          "Email sudah terdaftar. Gunakan email lain untuk anggota baru.",
      });
    }

    console.error("Create team member failed:", error.message);
    return res.status(500).json({
      status: "error",
      message: "Anggota tim gagal ditambahkan.",
    });
  } finally {
    client.release();
  }
});

// PATCH /api/team/:id/status
router.patch("/:id/status", async (req, res) => {
  const { id } = req.params;
  const status = req.body?.status;

  if (!/^\d+$/.test(id) || !["active", "inactive"].includes(status)) {
    return res.status(400).json({
      status: "error",
      message: "ID anggota atau status tidak valid.",
    });
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const memberResult = await client.query(
      `SELECT
         u.id,
         u.full_name,
         u.email,
         u.status AS user_status,
         tm.role,
         tm.status AS membership_status
       FROM tenant_memberships tm
       JOIN users u ON u.id = tm.user_id
       WHERE tm.tenant_id = $1
         AND tm.user_id = $2
       FOR UPDATE OF tm, u`,
      [req.user.tenantId, id]
    );

    if (!memberResult.rows.length) {
      await client.query("ROLLBACK");
      return res.status(404).json({
        status: "error",
        message: "Anggota tim tidak ditemukan.",
      });
    }

    const current = memberResult.rows[0];

    if (String(current.id) === String(req.user.id)) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        status: "error",
        message: "Admin tidak dapat mengubah status akunnya sendiri.",
      });
    }

    const updatedUser = await client.query(
      `UPDATE users
       SET status = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING status`,
      [status, id]
    );

    await client.query(
      `UPDATE tenant_memberships
       SET status = $1, updated_at = NOW()
       WHERE tenant_id = $2 AND user_id = $3`,
      [status, req.user.tenantId, id]
    );

    await logActivity(
      client,
      req,
      "team_member.status_changed",
      id,
      {
        userStatus: current.user_status,
        membershipStatus: current.membership_status,
      },
      {
        userStatus: updatedUser.rows[0].status,
        membershipStatus: status,
      }
    );

    await client.query("COMMIT");

    return res.json({
      status: "success",
      message: "Status anggota tim berhasil diperbarui.",
      data: {
        id: current.id,
        userStatus: updatedUser.rows[0].status,
        membershipStatus: status,
      },
    });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("Update team member failed:", error.message);

    return res.status(500).json({
      status: "error",
      message: "Status anggota tim gagal diperbarui.",
    });
  } finally {
    client.release();
  }
});

module.exports = router;
