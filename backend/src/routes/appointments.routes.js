
const express = require("express");
const pool = require("../config/database");
const {
    authenticateToken,
    authorizeRoles,
} = require("../middleware/auth.middleware");

const router = express.Router();

router.use(authenticateToken, authorizeRoles("admin", "staff"));

const allowedStatuses = [
    "scheduled",
    "rescheduled",
    "completed",
    "cancelled",
];

function isValidDate(value) {
    return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

async function logActivity(client, req, action, entityType, entityId, oldValues, newValues) {
    await client.query(
        `INSERT INTO activity_logs
      (tenant_id, actor_user_id, action, entity_type, entity_id,
       old_values, new_values, ip_address, user_agent)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
            req.user.tenantId,
            req.user.id,
            action,
            entityType,
            entityId,
            oldValues ? JSON.stringify(oldValues) : null,
            newValues ? JSON.stringify(newValues) : null,
            req.ip || null,
            req.get("user-agent") || null,
        ]
    );
}

// GET /api/appointments/technicians
router.get("/technicians", async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT u.id, u.full_name AS "fullName", u.email, u.phone
       FROM tenant_memberships tm
       JOIN users u ON u.id = tm.user_id
       WHERE tm.tenant_id = $1
         AND tm.role = 'technician'
         AND tm.status = 'active'
         AND u.status = 'active'
       ORDER BY u.full_name`,
            [req.user.tenantId]
        );

        return res.json({ status: "success", data: result.rows });
    } catch (error) {
        console.error("Get technicians failed:", error.message);
        return res.status(500).json({
            status: "error",
            message: "Daftar teknisi gagal diambil.",
        });
    }
});

// GET /api/appointments/eligible-requests
router.get("/eligible-requests", async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT
         sr.id,
         sr.customer_id AS "customerId",
         sr.service_id AS "serviceId",
         sr.description,
         sr.preferred_date AS "preferredDate",
         sr.status,
         c.full_name AS "customerName",
         sc.name AS "serviceName"
       FROM service_requests sr
       JOIN customers c
         ON c.id = sr.customer_id
        AND c.tenant_id = sr.tenant_id
       JOIN service_catalog sc
         ON sc.id = sr.service_id
        AND sc.tenant_id = sr.tenant_id
       WHERE sr.tenant_id = $1
         AND sr.status = 'approved'
         AND NOT EXISTS (
           SELECT 1
           FROM appointments a
           WHERE a.tenant_id = sr.tenant_id
             AND a.service_request_id = sr.id
         )
       ORDER BY sr.created_at DESC`,
            [req.user.tenantId]
        );

        return res.json({ status: "success", data: result.rows });
    } catch (error) {
        console.error("Get eligible requests failed:", error.message);
        return res.status(500).json({
            status: "error",
            message: "Permintaan yang siap dijadwalkan gagal diambil.",
        });
    }
});

// GET /api/appointments
router.get("/", async (req, res) => {
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.min(
        100,
        Math.max(1, Number.parseInt(req.query.limit, 10) || 10)
    );
    const offset = (page - 1) * limit;

    const status =
        typeof req.query.status === "string" ? req.query.status.trim() : "";

    const search =
        typeof req.query.search === "string" ? req.query.search.trim() : "";

    if (status && !allowedStatuses.includes(status)) {
        return res.status(400).json({
            status: "error",
            message: "Filter status jadwal tidak valid.",
        });
    }

    try {
        const result = await pool.query(
            `SELECT
         a.id,
         a.service_request_id AS "serviceRequestId",
         a.technician_id AS "technicianId",
         a.scheduled_start AS "scheduledStart",
         a.scheduled_end AS "scheduledEnd",
         a.status,
         a.notes,
         a.created_at AS "createdAt",
         u.full_name AS "technicianName",
         c.full_name AS "customerName",
         sc.name AS "serviceName",
         COUNT(*) OVER() AS total
       FROM appointments a
       JOIN service_requests sr
         ON sr.id = a.service_request_id
        AND sr.tenant_id = a.tenant_id
       JOIN users u ON u.id = a.technician_id
       JOIN customers c
         ON c.id = sr.customer_id
        AND c.tenant_id = sr.tenant_id
       JOIN service_catalog sc
         ON sc.id = sr.service_id
        AND sc.tenant_id = sr.tenant_id
       WHERE a.tenant_id = $1
         AND ($2 = '' OR a.status = $2)
         AND (
           $3 = ''
           OR u.full_name ILIKE '%' || $3 || '%'
           OR c.full_name ILIKE '%' || $3 || '%'
           OR sc.name ILIKE '%' || $3 || '%'
         )
       ORDER BY a.scheduled_start DESC
       LIMIT $4 OFFSET $5`,
            [req.user.tenantId, status, search, limit, offset]
        );

        const total = result.rows.length
            ? Number(result.rows[0].total)
            : 0;

        return res.json({
            status: "success",
            data: result.rows.map(({ total: _total, ...row }) => row),
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
            },
        });
    } catch (error) {
        console.error("Get appointments failed:", error.message);
        return res.status(500).json({
            status: "error",
            message: "Daftar jadwal gagal diambil.",
        });
    }
});

// POST /api/appointments
router.post("/", async (req, res) => {
    const serviceRequestId = req.body?.serviceRequestId;
    const technicianId = req.body?.technicianId;
    const scheduledStart = req.body?.scheduledStart;
    const scheduledEnd = req.body?.scheduledEnd;
    const notes =
        typeof req.body?.notes === "string" ? req.body.notes.trim() : null;

    if (
        !serviceRequestId ||
        !technicianId ||
        !isValidDate(scheduledStart) ||
        !isValidDate(scheduledEnd) ||
        new Date(scheduledEnd) <= new Date(scheduledStart)
    ) {
        return res.status(400).json({
            status: "error",
            message: "Permintaan, teknisi, dan rentang jadwal yang valid wajib diisi.",
        });
    }

    const client = await pool.connect();

    try {
        await client.query("BEGIN");

        const requestResult = await client.query(
            `SELECT id, status
       FROM service_requests
       WHERE id = $1 AND tenant_id = $2
       FOR UPDATE`,
            [serviceRequestId, req.user.tenantId]
        );

        if (
            !requestResult.rows.length ||
            requestResult.rows[0].status !== "approved"
        ) {
            await client.query("ROLLBACK");
            return res.status(400).json({
                status: "error",
                message: "Hanya permintaan layanan yang disetujui yang dapat dijadwalkan.",
            });
        }

        const technicianResult = await client.query(
            `SELECT u.id
       FROM users u
       JOIN tenant_memberships tm ON tm.user_id = u.id
       WHERE u.id = $1
         AND tm.tenant_id = $2
         AND tm.role = 'technician'
         AND tm.status = 'active'
         AND u.status = 'active'
       FOR UPDATE OF u`,
            [technicianId, req.user.tenantId]
        );

        if (!technicianResult.rows.length) {
            await client.query("ROLLBACK");
            return res.status(400).json({
                status: "error",
                message: "Teknisi tidak aktif atau bukan anggota tenant ini.",
            });
        }

        const overlapResult = await client.query(
            `SELECT id
       FROM appointments
       WHERE tenant_id = $1
         AND technician_id = $2
         AND status IN ('scheduled', 'rescheduled')
         AND scheduled_start < $4::timestamptz
         AND scheduled_end > $3::timestamptz
       LIMIT 1`,
            [
                req.user.tenantId,
                technicianId,
                scheduledStart,
                scheduledEnd,
            ]
        );

        if (overlapResult.rows.length) {
            await client.query("ROLLBACK");
            return res.status(409).json({
                status: "error",
                message: "Jadwal teknisi berbenturan dengan jadwal lain.",
            });
        }


        const existingResult = await client.query(
            `SELECT id, status
   FROM appointments
   WHERE tenant_id = $1
     AND service_request_id = $2
   LIMIT 1`,
            [req.user.tenantId, serviceRequestId]
        );

        if (existingResult.rows.length) {
            await client.query("ROLLBACK");
            return res.status(409).json({
                status: "error",
                message:
                    "Permintaan layanan ini sudah memiliki appointment. Gunakan fitur penjadwalan ulang atau buat permintaan layanan baru untuk pekerjaan lanjutan.",
            });
        }


        const appointmentResult = await client.query(
            `INSERT INTO appointments (
         tenant_id, service_request_id, technician_id,
         scheduled_start, scheduled_end, notes, created_by
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING
         id,
         service_request_id AS "serviceRequestId",
         technician_id AS "technicianId",
         scheduled_start AS "scheduledStart",
         scheduled_end AS "scheduledEnd",
         status,
         notes,
         created_at AS "createdAt"`,
            [
                req.user.tenantId,
                serviceRequestId,
                technicianId,
                scheduledStart,
                scheduledEnd,
                notes,
                req.user.id,
            ]
        );

        const appointment = appointmentResult.rows[0];

        const workOrderResult = await client.query(
            `INSERT INTO work_orders (
         tenant_id, service_request_id, appointment_id
       )
       VALUES ($1, $2, $3)
       RETURNING id, status, appointment_id AS "appointmentId"`,
            [
                req.user.tenantId,
                serviceRequestId,
                appointment.id,
            ]
        );

        await logActivity(
            client,
            req,
            "appointment.created",
            "appointment",
            appointment.id,
            null,
            {
                ...appointment,
                workOrderId: workOrderResult.rows[0].id,
            }
        );

        await client.query("COMMIT");

        return res.status(201).json({
            status: "success",
            message: "Jadwal teknisi berhasil dibuat.",
            data: {
                ...appointment,
                workOrder: workOrderResult.rows[0],
            },
        });
    } catch (error) {
        await client.query("ROLLBACK").catch(() => { });
        console.error("Create appointment failed:", error.message);

        return res.status(500).json({
            status: "error",
            message: "Jadwal teknisi gagal dibuat.",
        });
    } finally {
        client.release();
    }
});

// PATCH /api/appointments/:id
router.patch("/:id", async (req, res) => {
    const { id } = req.params;
    const client = await pool.connect();

    try {
        await client.query("BEGIN");

        const currentResult = await client.query(
            `SELECT *
       FROM appointments
       WHERE id = $1 AND tenant_id = $2
       FOR UPDATE`,
            [id, req.user.tenantId]
        );

        if (!currentResult.rows.length) {
            await client.query("ROLLBACK");
            return res.status(404).json({
                status: "error",
                message: "Jadwal tidak ditemukan.",
            });
        }

        const current = currentResult.rows[0];
        const scheduledStart = req.body?.scheduledStart ?? current.scheduled_start;
        const scheduledEnd = req.body?.scheduledEnd ?? current.scheduled_end;
        const technicianId = req.body?.technicianId ?? current.technician_id;
        const notes =
            typeof req.body?.notes === "string"
                ? req.body.notes.trim()
                : current.notes;

        const requestedStatus = req.body?.status ?? current.status;

        if (
            !isValidDate(String(scheduledStart)) ||
            !isValidDate(String(scheduledEnd)) ||
            new Date(scheduledEnd) <= new Date(scheduledStart) ||
            !allowedStatuses.includes(requestedStatus)
        ) {
            await client.query("ROLLBACK");
            return res.status(400).json({
                status: "error",
                message: "Data perubahan jadwal tidak valid.",
            });
        }

        if (["completed", "cancelled"].includes(current.status)) {
            await client.query("ROLLBACK");
            return res.status(409).json({
                status: "error",
                message: "Jadwal yang sudah selesai atau dibatalkan tidak dapat diubah.",
            });
        }

        if (requestedStatus === "completed") {
            await client.query("ROLLBACK");
            return res.status(400).json({
                status: "error",
                message: "Status selesai dikelola melalui alur penyelesaian pekerjaan.",
            });
        }

        const technicianResult = await client.query(
            `SELECT u.id
       FROM users u
       JOIN tenant_memberships tm ON tm.user_id = u.id
       WHERE u.id = $1
         AND tm.tenant_id = $2
         AND tm.role = 'technician'
         AND tm.status = 'active'
         AND u.status = 'active'
       FOR UPDATE OF u`,
            [technicianId, req.user.tenantId]
        );

        if (!technicianResult.rows.length) {
            await client.query("ROLLBACK");
            return res.status(400).json({
                status: "error",
                message: "Teknisi tidak aktif atau bukan anggota tenant ini.",
            });
        }


        const overlapResult = await client.query(
            `SELECT id
             FROM appointments
             WHERE tenant_id = $1
               AND technician_id = $2
               AND id <> $5
               AND status IN ('scheduled', 'rescheduled')
               AND scheduled_start < $4::timestamptz
               AND scheduled_end > $3::timestamptz
             LIMIT 1`,
            [
                req.user.tenantId,
                technicianId,
                scheduledStart,
                scheduledEnd,
                id,
            ]
        );


        if (overlapResult.rows.length) {
            await client.query("ROLLBACK");
            return res.status(409).json({
                status: "error",
                message: "Jadwal teknisi berbenturan dengan jadwal lain.",
            });
        }

        const status =
            scheduledStart !== current.scheduled_start ||
                scheduledEnd !== current.scheduled_end ||
                String(technicianId) !== String(current.technician_id)
                ? "rescheduled"
                : requestedStatus;

        const updateResult = await client.query(
            `UPDATE appointments
       SET technician_id = $1,
           scheduled_start = $2,
           scheduled_end = $3,
           notes = $4,
           status = $5,
           updated_at = NOW()
       WHERE id = $6 AND tenant_id = $7
       RETURNING
         id,
         service_request_id AS "serviceRequestId",
         technician_id AS "technicianId",
         scheduled_start AS "scheduledStart",
         scheduled_end AS "scheduledEnd",
         status,
         notes,
         updated_at AS "updatedAt"`,
            [
                technicianId,
                scheduledStart,
                scheduledEnd,
                notes,
                status,
                id,
                req.user.tenantId,
            ]
        );

        await logActivity(
            client,
            req,
            "appointment.updated",
            "appointment",
            id,
            current,
            updateResult.rows[0]
        );

        await client.query("COMMIT");

        return res.json({
            status: "success",
            message: "Jadwal teknisi berhasil diperbarui.",
            data: updateResult.rows[0],
        });
    } catch (error) {
        await client.query("ROLLBACK").catch(() => { });
        console.error("Update appointment failed:", error.message);

        return res.status(500).json({
            status: "error",
            message: "Jadwal teknisi gagal diperbarui.",
        });
    } finally {
        client.release();
    }
});

module.exports = router;
