
const express = require("express");
const cors = require("cors");
const pool = require("./config/database");

const authRoutes = require("./routes/auth.routes");
const customerRoutes = require("./routes/customers.routes");
const customerAddressRoutes = require("./routes/customer-addresses.routes");
const serviceCatalogRoutes = require("./routes/service-catalog.routes");

const app = express();

app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.use("/api/auth", authRoutes);
app.use("/api/customers", customerRoutes);
app.use("/api/customers", customerAddressRoutes);
app.use("/api/services", serviceCatalogRoutes);

app.get("/api/health", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT NOW() AS server_time, current_database() AS database"
    );

    return res.status(200).json({
      status: "ok",
      application: "Sersa API",
      database: "connected",
      databaseName: result.rows[0].database,
      serverTime: result.rows[0].server_time,
    });
  } catch (error) {
    console.error("Database health check failed:", error.message);

    return res.status(503).json({
      status: "error",
      application: "Sersa API",
      database: "disconnected",
    });
  }
});

module.exports = app;
