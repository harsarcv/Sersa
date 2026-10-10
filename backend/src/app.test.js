process.env.JWT_SECRET = "sersa-test-secret-minimum-32-characters";

jest.mock("./config/database", () => ({
  query: jest.fn(),
  connect: jest.fn(),
}));

jest.mock("jsonwebtoken", () => {
  const actual = jest.requireActual("jsonwebtoken");

  return {
    ...actual,
    verify: jest.fn(),
    sign: jest.fn(() => "test-token"),
  };
});

const request = require("supertest");
const jwt = require("jsonwebtoken");
const pool = require("./config/database");
const app = require("./app");

const mockClient = {
  query: jest.fn(),
  release: jest.fn(),
};

pool.connect.mockResolvedValue(mockClient);

const {
  authenticateToken,
  authorizeRoles,
} = require("./middleware/auth.middleware");

const express = require("express");

const authTestApp = express();

authTestApp.use(express.json());

authTestApp.get(
  "/protected",
  authenticateToken,
  (req, res) => {
    res.json({ status: "success", user: req.user });
  }
);

authTestApp.get(
  "/admin-only",
  authenticateToken,
  authorizeRoles("admin"),
  (req, res) => {
    res.json({ status: "success", role: req.user.role });
  }
);

describe("Sersa API Health Check", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  test("GET /api/health returns 200 when database is connected", async () => {
    pool.query.mockResolvedValueOnce({
      rows: [
        {
          server_time: "2026-10-10T08:00:00.000Z",
          database: "sersa_db",
        },
      ],
    });

    const response = await request(app).get("/api/health");

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      status: "ok",
      application: "Sersa API",
      database: "connected",
      databaseName: "sersa_db",
    });
  });

  test("GET /api/health returns 503 when database fails", async () => {
    pool.query.mockRejectedValueOnce(
      new Error("Database unavailable")
    );

    const response = await request(app).get("/api/health");

    expect(response.status).toBe(503);
    expect(response.body).toEqual({
      status: "error",
      application: "Sersa API",
      database: "disconnected",
    });
  });
});

describe("Sersa Authentication Middleware", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  test("rejects requests without a token", async () => {
    const response = await request(authTestApp).get("/protected");

    expect(response.status).toBe(401);
    expect(response.body.message).toBe(
      "Token autentikasi diperlukan."
    );
  });

  test("accepts a valid token", async () => {
    jwt.verify.mockReturnValueOnce({
      sub: "1",
      tenantId: "1",
      role: "admin",
    });

    const response = await request(authTestApp)
      .get("/protected")
      .set("Authorization", "Bearer valid-test-token");

    expect(response.status).toBe(200);
    expect(response.body.user).toEqual({
      id: "1",
      tenantId: "1",
      role: "admin",
    });
  });

  test("rejects an invalid token", async () => {
    jwt.verify.mockImplementationOnce(() => {
      throw new Error("Invalid token");
    });

    const response = await request(authTestApp)
      .get("/protected")
      .set("Authorization", "Bearer invalid-test-token");

    expect(response.status).toBe(401);
    expect(response.body.message).toBe(
      "Token tidak valid atau sudah kedaluwarsa."
    );
  });

  test("rejects a non-admin user from admin-only endpoint", async () => {
    jwt.verify.mockReturnValueOnce({
      sub: "2",
      tenantId: "1",
      role: "staff",
    });

    const response = await request(authTestApp)
      .get("/admin-only")
      .set("Authorization", "Bearer staff-test-token");

    expect(response.status).toBe(403);
    expect(response.body.message).toBe(
      "Kamu tidak memiliki izin untuk mengakses fitur ini."
    );
  });

  test("allows an admin to access admin-only endpoint", async () => {
    jwt.verify.mockReturnValueOnce({
      sub: "1",
      tenantId: "1",
      role: "admin",
    });

    const response = await request(authTestApp)
      .get("/admin-only")
      .set("Authorization", "Bearer admin-test-token");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      status: "success",
      role: "admin",
    });
  });
});


describe("Sersa Customer Routes Authorization", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  test("GET /api/customers rejects requests without a token", async () => {
    const response = await request(app).get("/api/customers");

    expect(response.status).toBe(401);
    expect(response.body.message).toBe(
      "Token autentikasi diperlukan."
    );
  });

  test("GET /api/customers rejects technicians", async () => {
    jwt.verify.mockReturnValueOnce({
      sub: "3",
      tenantId: "1",
      role: "technician",
    });

    const response = await request(app)
      .get("/api/customers")
      .set("Authorization", "Bearer technician-test-token");

    expect(response.status).toBe(403);
    expect(response.body.message).toBe(
      "Kamu tidak memiliki izin untuk mengakses fitur ini."
    );
  });

  test("GET /api/customers allows admins", async () => {
    jwt.verify.mockReturnValueOnce({
      sub: "1",
      tenantId: "1",
      role: "admin",
    });

    pool.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ total: 0 }] });

    const response = await request(app)
      .get("/api/customers")
      .set("Authorization", "Bearer admin-test-token");

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      status: "success",
      data: [],
      pagination: {
        page: 1,
        limit: 10,
        total: 0,
        totalPages: 0,
      },
    });
  });
});


describe("Sersa Customer Detail Route", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  test("returns 400 when customer ID is invalid", async () => {
    jwt.verify.mockReturnValueOnce({
      sub: "1",
      tenantId: "1",
      role: "admin",
    });

    const response = await request(app)
      .get("/api/customers/abc")
      .set("Authorization", "Bearer admin-test-token");

    expect(response.status).toBe(400);
    expect(response.body.message).toBe("ID pelanggan tidak valid.");
  });

  test("returns 404 when customer does not exist in the tenant", async () => {
    jwt.verify.mockReturnValueOnce({
      sub: "1",
      tenantId: "1",
      role: "admin",
    });

    pool.query.mockResolvedValueOnce({ rows: [] });

    const response = await request(app)
      .get("/api/customers/999")
      .set("Authorization", "Bearer admin-test-token");

    expect(response.status).toBe(404);
    expect(response.body.message).toBe("Pelanggan tidak ditemukan.");
  });

  test("returns customer detail for the current tenant", async () => {
    jwt.verify.mockReturnValueOnce({
      sub: "1",
      tenantId: "1",
      role: "admin",
    });

    pool.query.mockResolvedValueOnce({
      rows: [
        {
          id: 1,
          full_name: "Pelanggan Demo",
          email: "pelanggan.demo@sersa.test",
          phone: "081234567890",
          status: "active",
          created_at: "2026-10-10T09:00:00.000Z",
        },
      ],
    });

    const response = await request(app)
      .get("/api/customers/1")
      .set("Authorization", "Bearer admin-test-token");

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      id: 1,
      full_name: "Pelanggan Demo",
      email: "pelanggan.demo@sersa.test",
    });

    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining("tenant_id = $2"),
      [1, "1"]
    );
  });
});



describe("Sersa Customer Update Route", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  test("returns 400 when customer ID is invalid", async () => {
    jwt.verify.mockReturnValueOnce({
      sub: "1",
      tenantId: "1",
      role: "admin",
    });

    const response = await request(app)
      .put("/api/customers/abc")
      .set("Authorization", "Bearer admin-test-token")
      .send({
        fullName: "Pelanggan Baru",
        email: "baru@sersa.test",
        phone: "081234567890",
      });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe("ID pelanggan tidak valid.");
  });

  test("returns 400 when customer name is invalid", async () => {
    jwt.verify.mockReturnValueOnce({
      sub: "1",
      tenantId: "1",
      role: "admin",
    });

    const response = await request(app)
      .put("/api/customers/1")
      .set("Authorization", "Bearer admin-test-token")
      .send({
        fullName: "A",
        email: "baru@sersa.test",
        phone: "081234567890",
      });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe(
      "Nama pelanggan harus terdiri dari 2 sampai 150 karakter."
    );
  });

  test("returns 404 when customer does not exist in the tenant", async () => {
    jwt.verify.mockReturnValueOnce({
      sub: "1",
      tenantId: "1",
      role: "admin",
    });

    pool.query.mockResolvedValueOnce({ rows: [] });

    const response = await request(app)
      .put("/api/customers/999")
      .set("Authorization", "Bearer admin-test-token")
      .send({
        fullName: "Pelanggan Baru",
        email: "baru@sersa.test",
        phone: "081234567890",
      });

    expect(response.status).toBe(404);
    expect(response.body.message).toBe("Pelanggan tidak ditemukan.");
  });

  test("updates a customer belonging to the current tenant", async () => {
    jwt.verify.mockReturnValueOnce({
      sub: "1",
      tenantId: "1",
      role: "admin",
    });

    pool.query.mockResolvedValueOnce({
      rows: [
        {
          id: 1,
          full_name: "Pelanggan Diperbarui",
          email: "update@sersa.test",
          phone: "081234567891",
          status: "active",
          created_at: "2026-10-10T09:00:00.000Z",
        },
      ],
    });

    const response = await request(app)
      .put("/api/customers/1")
      .set("Authorization", "Bearer admin-test-token")
      .send({
        fullName: "Pelanggan Diperbarui",
        email: "update@sersa.test",
        phone: "081234567891",
      });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      status: "success",
      message: "Pelanggan berhasil diperbarui.",
      data: {
        id: 1,
        full_name: "Pelanggan Diperbarui",
        email: "update@sersa.test",
      },
    });

    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining("tenant_id = $5"),
      ["Pelanggan Diperbarui", "update@sersa.test", "081234567891", 1, "1"]
    );
  });
});



describe("Sersa Customer Deactivation Route", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  test("rejects requests without a token", async () => {
    const response = await request(app)
      .patch("/api/customers/1/deactivate");

    expect(response.status).toBe(401);
  });

  test("rejects technicians", async () => {
    jwt.verify.mockReturnValueOnce({
      sub: "3",
      tenantId: "1",
      role: "technician",
    });

    const response = await request(app)
      .patch("/api/customers/1/deactivate")
      .set("Authorization", "Bearer technician-test-token");

    expect(response.status).toBe(403);
  });

  test("returns 400 for an invalid customer ID", async () => {
    jwt.verify.mockReturnValueOnce({
      sub: "1",
      tenantId: "1",
      role: "admin",
    });

    const response = await request(app)
      .patch("/api/customers/abc/deactivate")
      .set("Authorization", "Bearer admin-test-token");

    expect(response.status).toBe(400);
    expect(response.body.message).toBe("ID pelanggan tidak valid.");
  });

  test("deactivates an active customer in the current tenant", async () => {
    jwt.verify.mockReturnValueOnce({
      sub: "1",
      tenantId: "1",
      role: "admin",
    });

    pool.query.mockResolvedValueOnce({
      rows: [
        {
          id: 1,
          full_name: "Pelanggan Demo",
          email: "pelanggan.demo@sersa.test",
          phone: "081234567890",
          status: "inactive",
          updated_at: "2026-10-10T09:00:00.000Z",
        },
      ],
    });

    const response = await request(app)
      .patch("/api/customers/1/deactivate")
      .set("Authorization", "Bearer admin-test-token");

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      status: "success",
      message: "Pelanggan berhasil dinonaktifkan.",
      data: {
        id: 1,
        status: "inactive",
      },
    });

    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining("tenant_id = $2"),
      [1, "1"]
    );
  });

  test("returns 404 when no active customer exists in the current tenant", async () => {
    jwt.verify.mockReturnValueOnce({
      sub: "1",
      tenantId: "1",
      role: "admin",
    });

    pool.query.mockResolvedValueOnce({ rows: [] });

    const response = await request(app)
      .patch("/api/customers/999/deactivate")
      .set("Authorization", "Bearer admin-test-token");

    expect(response.status).toBe(404);
    expect(response.body.message).toBe(
      "Pelanggan aktif tidak ditemukan."
    );
  });
});



describe("Sersa Customer Status Filter", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  test("rejects an invalid customer status filter", async () => {
    jwt.verify.mockReturnValueOnce({
      sub: "1",
      tenantId: "1",
      role: "admin",
    });

    const response = await request(app)
      .get("/api/customers?status=deleted")
      .set("Authorization", "Bearer admin-test-token");

    expect(response.status).toBe(400);
    expect(response.body.message).toBe(
      "Filter status pelanggan tidak valid."
    );
  });

  test("defaults customer list filter to active", async () => {
    jwt.verify.mockReturnValueOnce({
      sub: "1",
      tenantId: "1",
      role: "admin",
    });

    pool.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ total: 0 }] });

    const response = await request(app)
      .get("/api/customers")
      .set("Authorization", "Bearer admin-test-token");

    expect(response.status).toBe(200);
    expect(pool.query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining("status = $2"),
      ["1", "active", "%%", 10, 0]
    );
  });

  test.each(["active", "inactive", "all"])(
    "accepts status filter %s",
    async (status) => {
      jwt.verify.mockReturnValueOnce({
        sub: "1",
        tenantId: "1",
        role: "admin",
      });

      pool.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ total: 0 }] });

      const response = await request(app)
        .get(`/api/customers?status=${status}`)
        .set("Authorization", "Bearer admin-test-token");

      expect(response.status).toBe(200);
      expect(pool.query).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining("status = $2"),
        ["1", status, "%%", 10, 0]
      );
    }
  );
});


describe("Sersa Customer Address Route", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  test("rejects requests without a token", async () => {
    const response = await request(app)
      .post("/api/customers/1/addresses")
      .send({
        recipientName: "Penerima Demo",
        address: "Jl. Merdeka No. 10",
      });

    expect(response.status).toBe(401);
  });

  test("rejects technicians", async () => {
    jwt.verify.mockReturnValueOnce({
      sub: "3",
      tenantId: "1",
      role: "technician",
    });

    const response = await request(app)
      .post("/api/customers/1/addresses")
      .set("Authorization", "Bearer technician-test-token")
      .send({
        recipientName: "Penerima Demo",
        address: "Jl. Merdeka No. 10",
      });

    expect(response.status).toBe(403);
  });

  test("rejects an invalid customer ID", async () => {
    jwt.verify.mockReturnValueOnce({
      sub: "1",
      tenantId: "1",
      role: "admin",
    });

    const response = await request(app)
      .post("/api/customers/abc/addresses")
      .set("Authorization", "Bearer admin-test-token")
      .send({
        recipientName: "Penerima Demo",
        address: "Jl. Merdeka No. 10",
      });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe("ID pelanggan tidak valid.");
  });

  test("rejects an invalid recipient name", async () => {
    jwt.verify.mockReturnValueOnce({
      sub: "1",
      tenantId: "1",
      role: "admin",
    });

    const response = await request(app)
      .post("/api/customers/1/addresses")
      .set("Authorization", "Bearer admin-test-token")
      .send({
        recipientName: "A",
        address: "Jl. Merdeka No. 10",
      });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe(
      "Nama penerima harus terdiri dari 2 sampai 150 karakter."
    );
  });
});


describe("Sersa Customer Address Creation", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });


  describe("Sersa Customer Address List", () => {
    afterEach(() => {
      jest.clearAllMocks();
    });

    test("returns customer addresses with default address first", async () => {
      jwt.verify.mockReturnValueOnce({
        sub: "1",
        tenantId: "1",
        role: "admin",
      });

      pool.query
        .mockResolvedValueOnce({
          rows: [{ id: 1 }],
        })
        .mockResolvedValueOnce({
          rows: [
            {
              id: 10,
              customer_id: 1,
              label: "Rumah",
              recipient_name: "Penerima Demo",
              is_default: true,
            },
          ],
        });

      const response = await request(app)
        .get("/api/customers/1/addresses")
        .set("Authorization", "Bearer admin-test-token");

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        status: "success",
        data: [
          {
            id: 10,
            customer_id: 1,
            label: "Rumah",
            is_default: true,
          },
        ],
      });

      expect(pool.query).toHaveBeenCalledTimes(2);
    });

    test("returns 404 when customer does not exist in the tenant", async () => {
      jwt.verify.mockReturnValueOnce({
        sub: "1",
        tenantId: "1",
        role: "admin",
      });

      pool.query.mockResolvedValueOnce({
        rows: [],
      });

      const response = await request(app)
        .get("/api/customers/999/addresses")
        .set("Authorization", "Bearer admin-test-token");

      expect(response.status).toBe(404);
      expect(response.body).toMatchObject({
        status: "error",
        message: "Pelanggan tidak ditemukan.",
      });

      expect(pool.query).toHaveBeenCalledTimes(1);
    });

    test("returns 400 when customer ID is invalid", async () => {
      jwt.verify.mockReturnValueOnce({
        sub: "1",
        tenantId: "1",
        role: "admin",
      });

      const response = await request(app)
        .get("/api/customers/abc/addresses")
        .set("Authorization", "Bearer admin-test-token");

      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({
        status: "error",
        message: "ID pelanggan tidak valid.",
      });

      expect(pool.query).not.toHaveBeenCalled();
    });

    test("returns 404 when customer belongs to another tenant", async () => {
      jwt.verify.mockReturnValueOnce({
        sub: "1",
        tenantId: "1",
        role: "admin",
      });

      pool.query.mockResolvedValueOnce({
        rows: [],
      });

      const response = await request(app)
        .get("/api/customers/2/addresses")
        .set("Authorization", "Bearer admin-test-token");

      expect(response.status).toBe(404);
      expect(response.body).toMatchObject({
        status: "error",
        message: "Pelanggan tidak ditemukan.",
      });

      expect(pool.query).toHaveBeenCalledTimes(1);
    });

    test("returns 400 when customer or address ID is invalid for update", async () => {
      jwt.verify.mockReturnValueOnce({
        sub: "1",
        tenantId: "1",
        role: "admin",
      });

      const response = await request(app)
        .put("/api/customers/abc/addresses/1")
        .set("Authorization", "Bearer admin-test-token")
        .send({
          recipientName: "Penerima Demo",
          address: "Jl. Merdeka No. 10",
        });

      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({
        status: "error",
        message: "ID pelanggan atau alamat tidak valid.",
      });

      expect(pool.connect).not.toHaveBeenCalled();
    });

    test("returns 400 when recipient name is invalid for update", async () => {
      jwt.verify.mockReturnValueOnce({
        sub: "1",
        tenantId: "1",
        role: "admin",
      });

      const response = await request(app)
        .put("/api/customers/2/addresses/1")
        .set("Authorization", "Bearer admin-test-token")
        .send({
          recipientName: "",
          address: "Jl. Merdeka No. 10",
        });

      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({
        status: "error",
        message: "Data alamat tidak valid.",
      });

      expect(pool.connect).not.toHaveBeenCalled();
    });

    test("returns 404 when customer is not found for address update", async () => {
      jwt.verify.mockReturnValueOnce({
        sub: "1",
        tenantId: "1",
        role: "admin",
      });

      const mockClient = {
        query: jest.fn()
          .mockResolvedValueOnce({ rows: [] }) // BEGIN
          .mockResolvedValueOnce({ rows: [] }) // Customer not found
          .mockResolvedValueOnce({ rows: [] }), // ROLLBACK
        release: jest.fn(),
      };

      pool.connect.mockResolvedValueOnce(mockClient);

      const response = await request(app)
        .put("/api/customers/999/addresses/1")
        .set("Authorization", "Bearer admin-test-token")
        .send({
          recipientName: "Penerima Demo",
          address: "Jl. Merdeka No. 10",
        });

      expect(response.status).toBe(404);
      expect(response.body).toMatchObject({
        status: "error",
        message: "Pelanggan aktif tidak ditemukan.",
      });

      expect(mockClient.release).toHaveBeenCalledTimes(1);
    });

    test("returns 404 when address is not found for update", async () => {
      jwt.verify.mockReturnValueOnce({
        sub: "1",
        tenantId: "1",
        role: "admin",
      });

      const mockClient = {
        query: jest.fn()
          .mockResolvedValueOnce({ rows: [] }) // BEGIN
          .mockResolvedValueOnce({ rows: [{ id: 2 }] }) // Customer found
          .mockResolvedValueOnce({ rows: [] }) // Address not found
          .mockResolvedValueOnce({ rows: [] }), // ROLLBACK
        release: jest.fn(),
      };

      pool.connect.mockResolvedValueOnce(mockClient);

      const response = await request(app)
        .put("/api/customers/2/addresses/999")
        .set("Authorization", "Bearer admin-test-token")
        .send({
          recipientName: "Penerima Demo",
          address: "Jl. Merdeka No. 10",
        });

      expect(response.status).toBe(404);
      expect(response.body).toMatchObject({
        status: "error",
        message: "Alamat pelanggan tidak ditemukan.",
      });

      expect(mockClient.release).toHaveBeenCalledTimes(1);
    });

    test("updates customer address successfully", async () => {
      jwt.verify.mockReturnValueOnce({
        sub: "1",
        tenantId: "1",
        role: "admin",
      });

      const updatedAddress = {
        id: 1,
        customer_id: 2,
        label: "Rumah",
        recipient_name: "Penerima Baru",
        address: "Jl. Sudirman No. 20",
        is_default: true,
      };


      const mockClient = {
        query: jest.fn()
          .mockResolvedValueOnce({ rows: [] }) // BEGIN
          .mockResolvedValueOnce({ rows: [{ id: 2 }] }) // Customer found
          .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // Address found
          .mockResolvedValueOnce({ rows: [] }) // Clear previous default
          .mockResolvedValueOnce({ rows: [updatedAddress] }) // UPDATE
          .mockResolvedValueOnce({ rows: [] }), // COMMIT
        release: jest.fn(),
      };


      pool.connect.mockResolvedValueOnce(mockClient);

      const response = await request(app)
        .put("/api/customers/2/addresses/1")
        .set("Authorization", "Bearer admin-test-token")
        .send({
          label: "Rumah",
          recipientName: "Penerima Baru",
          address: "Jl. Sudirman No. 20",
          isDefault: true,
        });

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        status: "success",
        message: "Alamat pelanggan berhasil diperbarui.",
        data: {
          id: 1,
          recipient_name: "Penerima Baru",
          address: "Jl. Sudirman No. 20",
        },
      });

      expect(mockClient.release).toHaveBeenCalledTimes(1);
    });

    test("clears previous default address when updating another address as default", async () => {
      jwt.verify.mockReturnValueOnce({
        sub: "1",
        tenantId: "1",
        role: "admin",
      });

      const updatedAddress = {
        id: 2,
        customer_id: 2,
        label: "Kantor",
        recipient_name: "Penerima Demo",
        address: "Jl. Sudirman No. 30",
        is_default: true,
      };

      const mockClient = {
        query: jest.fn()
          .mockResolvedValueOnce({ rows: [] }) // BEGIN
          .mockResolvedValueOnce({ rows: [{ id: 2 }] }) // Customer found
          .mockResolvedValueOnce({ rows: [{ id: 2 }] }) // Address found
          .mockResolvedValueOnce({ rows: [] }) // Clear previous default
          .mockResolvedValueOnce({ rows: [updatedAddress] }) // UPDATE
          .mockResolvedValueOnce({ rows: [] }), // COMMIT
        release: jest.fn(),
      };

      pool.connect.mockResolvedValueOnce(mockClient);

      const response = await request(app)
        .put("/api/customers/2/addresses/2")
        .set("Authorization", "Bearer admin-test-token")
        .send({
          label: "Kantor",
          recipientName: "Penerima Demo",
          address: "Jl. Sudirman No. 30",
          isDefault: true,
        });

      expect(response.status).toBe(200);
      expect(response.body.data.is_default).toBe(true);

      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining("SET is_default = FALSE"),
        [2, "1", 2]
      );
    });

  });

  test("creates an address and commits the transaction", async () => {
    jwt.verify.mockReturnValueOnce({
      sub: "1",
      tenantId: "1",
      role: "admin",
    });



    mockClient.query
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // Customer exists
      .mockResolvedValueOnce({ rows: [] }) // Clear previous default address
      .mockResolvedValueOnce({
        rows: [
          {
            id: 10,
            customer_id: 1,
            label: "Rumah",
            recipient_name: "Penerima Demo",
            phone: "081234567890",
            address: "Jl. Merdeka No. 10",
            city: "Bekasi",
            province: "Jawa Barat",
            postal_code: "17121",
            is_default: true,
            created_at: "2026-10-10T09:00:00.000Z",
            updated_at: "2026-10-10T09:00:00.000Z",
          },
        ],
      }) // INSERT address
      .mockResolvedValueOnce({ rows: [] }); // COMMIT



    const response = await request(app)
      .post("/api/customers/1/addresses")
      .set("Authorization", "Bearer admin-test-token")
      .send({
        label: "Rumah",
        recipientName: "Penerima Demo",
        phone: "081234567890",
        address: "Jl. Merdeka No. 10",
        city: "Bekasi",
        province: "Jawa Barat",
        postalCode: "17121",
        isDefault: true,
      });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      status: "success",
      message: "Alamat pelanggan berhasil ditambahkan.",
      data: {
        id: 10,
        customer_id: 1,
        recipient_name: "Penerima Demo",
        is_default: true,
      },
    });

    expect(mockClient.query).toHaveBeenCalledWith("BEGIN");
    expect(mockClient.query).toHaveBeenCalledWith("COMMIT");
    expect(mockClient.release).toHaveBeenCalled();
  });
});
