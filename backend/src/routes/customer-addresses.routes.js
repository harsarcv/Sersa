
const express = require("express");
const pool = require("../config/database");
const {
  authenticateToken,
  authorizeRoles,
} = require("../middleware/auth.middleware");

const router = express.Router();
const allowedRoles = authorizeRoles("admin", "staff");


router.get("/:customerId/addresses", authenticateToken, allowedRoles, async (req, res) => {
  const customerId = Number.parseInt(req.params.customerId, 10);

  if (!Number.isInteger(customerId) || customerId <= 0) {
    return res.status(400).json({
      status: "error",
      message: "ID pelanggan tidak valid.",
    });
  }

  try {
    const customerResult = await pool.query(
      `SELECT id
       FROM customers
       WHERE id = $1 AND tenant_id = $2`,
      [customerId, req.user.tenantId]
    );

    if (customerResult.rows.length === 0) {
      return res.status(404).json({
        status: "error",
        message: "Pelanggan tidak ditemukan.",
      });
    }

    const result = await pool.query(
      `SELECT id, customer_id, label, recipient_name, phone,
              address, city, province, postal_code, is_default,
              created_at, updated_at
       FROM customer_addresses
       WHERE customer_id = $1 AND tenant_id = $2
       ORDER BY is_default DESC, created_at DESC`,
      [customerId, req.user.tenantId]
    );

    return res.status(200).json({
      status: "success",
      message: "Daftar alamat pelanggan berhasil diambil.",
      data: result.rows,
    });
  } catch (error) {
    console.error("Get Customer Addresses Error:", error);

    return res.status(500).json({
      status: "error",
      message: "Daftar alamat pelanggan gagal diambil.",
    });
  }
});

// POST /api/customers/:customerId/addresses
router.post(
  "/:customerId/addresses",
  authenticateToken,
  allowedRoles,
  async (req, res) => {
    const customerId = Number.parseInt(req.params.customerId, 10);

    if (!Number.isSafeInteger(customerId) || customerId < 1) {
      return res.status(400).json({
        status: "error",
        message: "ID pelanggan tidak valid.",
      });
    }

    const {
      label,
      recipientName,
      phone,
      address,
      city,
      province,
      postalCode,
      isDefault = false,
    } = req.body ?? {};

    if (
      typeof recipientName !== "string" ||
      recipientName.trim().length < 2 ||
      recipientName.trim().length > 150
    ) {
      return res.status(400).json({
        status: "error",
        message: "Nama penerima harus terdiri dari 2 sampai 150 karakter.",
      });
    }

    if (typeof address !== "string" || !address.trim()) {
      return res.status(400).json({
        status: "error",
        message: "Alamat wajib diisi.",
      });
    }

    if (typeof isDefault !== "boolean") {
      return res.status(400).json({
        status: "error",
        message: "isDefault harus berupa boolean.",
      });
    }

    const optionalFields = [
      ["label", label, 80],
      ["phone", phone, 30],
      ["city", city, 100],
      ["province", province, 100],
      ["postalCode", postalCode, 20],
    ];

    for (const [field, value, maxLength] of optionalFields) {
      if (
        value !== undefined &&
        value !== null &&
        typeof value !== "string"
      ) {
        return res.status(400).json({
          status: "error",
          message: `Field ${field} harus berupa teks.`,
        });
      }

      if (typeof value === "string" && value.trim().length > maxLength) {
        return res.status(400).json({
          status: "error",
          message: `Field ${field} maksimal ${maxLength} karakter.`,
        });
      }
    }

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      const customerResult = await client.query(
        `SELECT id
         FROM customers
         WHERE id = $1
           AND tenant_id = $2
           AND status = 'active'
         FOR UPDATE`,
        [customerId, req.user.tenantId]
      );

      if (customerResult.rows.length === 0) {
        await client.query("ROLLBACK");

        return res.status(404).json({
          status: "error",
          message: "Pelanggan aktif tidak ditemukan.",
        });
      }

      if (isDefault) {
        await client.query(
          `UPDATE customer_addresses
           SET is_default = FALSE,
               updated_at = NOW()
           WHERE tenant_id = $1 AND customer_id = $2`,
          [req.user.tenantId, customerId]
        );
      }

      const result = await client.query(
        `INSERT INTO customer_addresses (
           tenant_id,
           customer_id,
           label,
           recipient_name,
           phone,
           address,
           city,
           province,
           postal_code,
           is_default
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING id, customer_id, label, recipient_name, phone,
                   address, city, province, postal_code, is_default,
                   created_at, updated_at`,
        [
          req.user.tenantId,
          customerId,
          typeof label === "string" && label.trim()
            ? label.trim()
            : "Alamat utama",
          recipientName.trim(),
          typeof phone === "string" && phone.trim() ? phone.trim() : null,
          address.trim(),
          typeof city === "string" && city.trim() ? city.trim() : null,
          typeof province === "string" && province.trim()
            ? province.trim()
            : null,
          typeof postalCode === "string" && postalCode.trim()
            ? postalCode.trim()
            : null,
          isDefault,
        ]
      );

      await client.query("COMMIT");

      return res.status(201).json({
        status: "success",
        message: "Alamat pelanggan berhasil ditambahkan.",
        data: result.rows[0],
      });
    } catch (error) {
      await client.query("ROLLBACK");

      console.error("Create customer address failed:", error.message);

      return res.status(500).json({
        status: "error",
        message: "Alamat pelanggan gagal ditambahkan.",
      });
    } finally {
      client.release();
    }
  }
);


router.put(
  "/:customerId/addresses/:addressId",
  authenticateToken,
  allowedRoles,
  async (req, res) => {
    const customerId = Number(req.params.customerId);
    const addressId = Number(req.params.addressId);

    if (
      !Number.isSafeInteger(customerId) ||
      customerId <= 0 ||
      !Number.isSafeInteger(addressId) ||
      addressId <= 0
    ) {
      return res.status(400).json({
        status: "error",
        message: "ID pelanggan atau alamat tidak valid.",
      });
    }

    const {
      label,
      recipientName,
      phone,
      address,
      city,
      province,
      postalCode,
      isDefault,
    } = req.body;

    if (
      typeof recipientName !== "string" ||
      recipientName.trim().length < 2 ||
      recipientName.trim().length > 150 ||
      typeof address !== "string" ||
      !address.trim() ||
      (label !== undefined &&
        (typeof label !== "string" || label.trim().length > 80)) ||
      (phone !== undefined &&
        phone !== null &&
        (typeof phone !== "string" || phone.length > 30)) ||
      (city !== undefined &&
        city !== null &&
        (typeof city !== "string" || city.length > 100)) ||
      (province !== undefined &&
        province !== null &&
        (typeof province !== "string" || province.length > 100)) ||
      (postalCode !== undefined &&
        postalCode !== null &&
        (typeof postalCode !== "string" || postalCode.length > 20)) ||
      (isDefault !== undefined && typeof isDefault !== "boolean")
    ) {
      return res.status(400).json({
        status: "error",
        message: "Data alamat tidak valid.",
      });
    }

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      const customerResult = await client.query(
        `SELECT id
         FROM customers
         WHERE id = $1
           AND tenant_id = $2
           AND status = 'active'
         FOR UPDATE`,
        [customerId, req.user.tenantId]
      );

      if (customerResult.rows.length === 0) {
        await client.query("ROLLBACK");

        return res.status(404).json({
          status: "error",
          message: "Pelanggan aktif tidak ditemukan.",
        });
      }

      const addressResult = await client.query(
        `SELECT id
         FROM customer_addresses
         WHERE id = $1
           AND customer_id = $2
           AND tenant_id = $3`,
        [addressId, customerId, req.user.tenantId]
      );

      if (addressResult.rows.length === 0) {
        await client.query("ROLLBACK");

        return res.status(404).json({
          status: "error",
          message: "Alamat pelanggan tidak ditemukan.",
        });
      }

      if (isDefault === true) {
        await client.query(
          `UPDATE customer_addresses
           SET is_default = FALSE, updated_at = NOW()
           WHERE customer_id = $1
             AND tenant_id = $2
             AND is_default = TRUE
             AND id <> $3`,
          [customerId, req.user.tenantId, addressId]
        );
      }

      const result = await client.query(
        `UPDATE customer_addresses
         SET label = $1,
             recipient_name = $2,
             phone = $3,
             address = $4,
             city = $5,
             province = $6,
             postal_code = $7,
             is_default = COALESCE($8, is_default),
             updated_at = NOW()
         WHERE id = $9
           AND customer_id = $10
           AND tenant_id = $11
         RETURNING *`,
        [
          label === undefined ? "Alamat utama" : label.trim(),
          recipientName.trim(),
          phone ?? null,
          address.trim(),
          city ?? null,
          province ?? null,
          postalCode ?? null,
          isDefault ?? null,
          addressId,
          customerId,
          req.user.tenantId,
        ]
      );

      await client.query("COMMIT");

      return res.status(200).json({
        status: "success",
        message: "Alamat pelanggan berhasil diperbarui.",
        data: result.rows[0],
      });
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("Update Customer Address Error:", error);

      return res.status(500).json({
        status: "error",
        message: "Alamat pelanggan gagal diperbarui.",
      });
    } finally {
      client.release();
    }
  }
);

module.exports = router;
