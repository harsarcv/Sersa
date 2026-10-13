
const express = require("express");
const pool = require("../config/database");
const {
    authenticateToken,
    authorizeRoles,
} = require("../middleware/auth.middleware");

const router = express.Router();

router.use(
    authenticateToken,
    authorizeRoles("admin", "staff", "technician")
);

const allowedTransitions = {
    assigned: ["in_progress", "cancelled"],
    in_progress: ["completed", "cancelled"],
    completed: [],
    cancelled: [],
};

async function logActivity(
    client,
    req,
    action,
    workOrderId,
    oldValues,
    newValues
) {
    await client.query(
        `INSERT INTO activity_logs
      (tenant_id, actor_user_id, action, entity_type, entity_id,
       old_values, new_values, ip_address, user_agent)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
            req.user.tenantId,
            req.user.id,
            action,
            "work_order",
            workOrderId,
            JSON.stringify(oldValues),
            JSON.stringify(newValues),
            req.ip || null,
            req.get("user-agent") || null,
        ]
    );
}

const workOrderSelect = `
  SELECT
    wo.id,
    wo.service_request_id AS "serviceRequestId",
    wo.appointment_id AS "appointmentId",
    wo.status,
    wo.work_notes AS "workNotes",
    wo.completion_notes AS "completionNotes",
    wo.started_at AS "startedAt",
    wo.completed_at AS "completedAt",
    wo.created_at AS "createdAt",
    wo.updated_at AS "updatedAt",
    a.technician_id AS "technicianId",
    u.full_name AS "technicianName",
    c.full_name AS "customerName",
    sc.name AS "serviceName",
    a.scheduled_start AS "scheduledStart",
    a.scheduled_end AS "scheduledEnd"
  FROM work_orders wo
  JOIN appointments a
    ON a.id = wo.appointment_id
   AND a.tenant_id = wo.tenant_id
  JOIN service_requests sr
    ON sr.id = wo.service_request_id
   AND sr.tenant_id = wo.tenant_id
  JOIN users u ON u.id = a.technician_id
  JOIN customers c
    ON c.id = sr.customer_id
   AND c.tenant_id = sr.tenant_id
  JOIN service_catalog sc
    ON sc.id = sr.service_id
   AND sc.tenant_id = sr.tenant_id
`;

function canAccessWorkOrder(req, technicianId) {
    return (
        req.user.role !== "technician" ||
        String(req.user.id) === String(technicianId)
    );
}

// GET /api/work-orders
router.get("/", async (req, res) => {
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.min(
        100,
        Math.max(1, Number.parseInt(req.query.limit, 10) || 10)
    );
    const offset = (page - 1) * limit;
    const status =
        typeof req.query.status === "string" ? req.query.status.trim() : "";

    const validStatuses = [
        "assigned",
        "in_progress",
        "completed",
        "cancelled",
    ];

    if (status && !validStatuses.includes(status)) {
        return res.status(400).json({
            status: "error",
            message: "Filter status work order tidak valid.",
        });
    }

    try {
        const result = await pool.query(
            `${workOrderSelect}
       WHERE wo.tenant_id = $1
         AND ($2 = '' OR wo.status = $2)
         AND (
           $3::bigint IS NULL
           OR a.technician_id = $3
         )
       ORDER BY wo.created_at DESC
       LIMIT $4 OFFSET $5`,
            [
                req.user.tenantId,
                status,
                req.user.role === "technician" ? req.user.id : null,
                limit,
                offset,
            ]
        );

        const countResult = await pool.query(
            `SELECT COUNT(*)::int AS total
       FROM work_orders wo
       JOIN appointments a
         ON a.id = wo.appointment_id
        AND a.tenant_id = wo.tenant_id
       WHERE wo.tenant_id = $1
         AND ($2 = '' OR wo.status = $2)
         AND (
           $3::bigint IS NULL
           OR a.technician_id = $3
         )`,
            [
                req.user.tenantId,
                status,
                req.user.role === "technician" ? req.user.id : null,
            ]
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
        console.error("Get work orders failed:", error.message);
        return res.status(500).json({
            status: "error",
            message: "Daftar work order gagal diambil.",
        });
    }
});

// GET /api/work-orders/:id
router.get("/:id", async (req, res) => {
    try {
        const result = await pool.query(
            `${workOrderSelect}
       WHERE wo.tenant_id = $1
         AND wo.id = $2`,
            [req.user.tenantId, req.params.id]
        );

        if (!result.rows.length) {
            return res.status(404).json({
                status: "error",
                message: "Work order tidak ditemukan.",
            });
        }

        const workOrder = result.rows[0];

        if (!canAccessWorkOrder(req, workOrder.technicianId)) {
            return res.status(403).json({
                status: "error",
                message: "Kamu tidak ditugaskan pada pekerjaan ini.",
            });
        }

        return res.json({ status: "success", data: workOrder });
    } catch (error) {
        console.error("Get work order failed:", error.message);
        return res.status(500).json({
            status: "error",
            message: "Detail work order gagal diambil.",
        });
    }
});

// PATCH /api/work-orders/:id/status
router.patch("/:id/status", async (req, res) => {
    const requestedStatus = req.body?.status;
    const workNotes =
        typeof req.body?.workNotes === "string"
            ? req.body.workNotes.trim()
            : undefined;
    const completionNotes =
        typeof req.body?.completionNotes === "string"
            ? req.body.completionNotes.trim()
            : undefined;

    if (
        !["in_progress", "completed", "cancelled"].includes(requestedStatus)
    ) {
        return res.status(400).json({
            status: "error",
            message: "Status tujuan tidak valid.",
        });
    }

    if (
        requestedStatus === "completed" &&
        (!completionNotes || completionNotes.length < 3)
    ) {
        return res.status(400).json({
            status: "error",
            message: "Catatan penyelesaian wajib diisi minimal 3 karakter.",
        });
    }

    const client = await pool.connect();

    try {
        await client.query("BEGIN");

        const currentResult = await client.query(
            `SELECT
         wo.*,
         a.technician_id
       FROM work_orders wo
       JOIN appointments a
         ON a.id = wo.appointment_id
        AND a.tenant_id = wo.tenant_id
       WHERE wo.id = $1
         AND wo.tenant_id = $2
       FOR UPDATE OF wo`,
            [req.params.id, req.user.tenantId]
        );

        if (!currentResult.rows.length) {
            await client.query("ROLLBACK");
            return res.status(404).json({
                status: "error",
                message: "Work order tidak ditemukan.",
            });
        }

        const current = currentResult.rows[0];

        if (!canAccessWorkOrder(req, current.technician_id)) {
            await client.query("ROLLBACK");
            return res.status(403).json({
                status: "error",
                message: "Kamu tidak ditugaskan pada pekerjaan ini.",
            });
        }

        if (!allowedTransitions[current.status]?.includes(requestedStatus)) {
            await client.query("ROLLBACK");
            return res.status(409).json({
                status: "error",
                message: `Status ${current.status} tidak dapat diubah menjadi ${requestedStatus}.`,
            });
        }

        if (requestedStatus === "completed" && req.user.role === "technician") {
            // Teknisi yang ditugaskan boleh menyelesaikan pekerjaannya.
        }

        const updatedResult = await client.query(
            `UPDATE work_orders
 SET status = $1::varchar,
     work_notes = COALESCE($2::text, work_notes),
     completion_notes = COALESCE($3::text, completion_notes),
     started_at = CASE
       WHEN $1::varchar = 'in_progress' AND started_at IS NULL
         THEN NOW()
       ELSE started_at
     END,
     completed_at = CASE
       WHEN $1::varchar = 'completed' THEN NOW()
       ELSE completed_at
     END,
     updated_at = NOW()
 WHERE id = $4::bigint
   AND tenant_id = $5::bigint
 RETURNING
   id,
   service_request_id AS "serviceRequestId",
   appointment_id AS "appointmentId",
   status,
   work_notes AS "workNotes",
   completion_notes AS "completionNotes",
   started_at AS "startedAt",
   completed_at AS "completedAt",
   updated_at AS "updatedAt"`,
            [
                requestedStatus,
                workNotes ?? null,
                completionNotes ?? null,
                req.params.id,
                req.user.tenantId,
            ]
        );

        const updated = updatedResult.rows[0];

        if (requestedStatus === "completed" || requestedStatus === "cancelled") {
            await client.query(
                `UPDATE appointments
   SET status = $1::varchar, updated_at = NOW()
   WHERE id = $2::bigint
     AND tenant_id = $3::bigint`,
                [
                    requestedStatus,
                    current.appointment_id,
                    req.user.tenantId,
                ]
            );
        }

        await logActivity(
            client,
            req,
            `work_order.${requestedStatus}`,
            current.id,
            {
                status: current.status,
                workNotes: current.work_notes,
                completionNotes: current.completion_notes,
            },
            updated
        );

        await client.query("COMMIT");

        return res.json({
            status: "success",
            message: "Work order berhasil diperbarui.",
            data: updated,
        });
    } catch (error) {
        await client.query("ROLLBACK").catch(() => { });
        console.error("Update work order failed:", error.message);

        return res.status(500).json({
            status: "error",
            message: "Work order gagal diperbarui.",
        });
    } finally {
        client.release();
    }
});

module.exports = router;
