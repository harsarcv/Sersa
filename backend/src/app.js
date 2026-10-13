
const express = require("express");
const cors = require("cors");
const pool = require("./config/database");

const authRoutes = require("./routes/auth.routes");
const customerRoutes = require("./routes/customers.routes");
const customerAddressRoutes = require("./routes/customer-addresses.routes");
const serviceCatalogRoutes = require("./routes/service-catalog.routes");
const serviceRequestRoutes = require("./routes/service-requests.routes");
const appointmentRoutes = require("./routes/appointments.routes");
const teamRoutes = require("./routes/team.routes");
const workOrdersRoutes = require("./routes/work-orders.routes");

const app = express();

app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.use("/api/auth", authRoutes);
app.use("/api/customers", customerRoutes);
app.use("/api/customers", customerAddressRoutes);
app.use("/api/services", serviceCatalogRoutes);
app.use("/api/service-requests", serviceRequestRoutes);
app.use("/api/appointments", appointmentRoutes);
app.use("/api/team", teamRoutes);
app.use("/api/work-orders", workOrdersRoutes);

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
