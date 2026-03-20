import express from "express";
import { testConnection, query } from "./config/db.js";
import authRoutes from "./routes/auth.routes.js";
import { authenticate } from "./middleware/auth.middleware.js";

const app = express();

// Parse JSON request bodies
app.use(express.json());

// Global health check
app.get("/health", (req, res) => {
  res.json({ status: "up", timestamp: new Date().toISOString() });
});

// --- Auth routes ---
app.use("/auth", authRoutes);

// --- Protected test route (requires valid JWT) ---
app.get("/protected", authenticate, (req, res) => {
  res.json({
    message: "You have access to this protected route!",
    rider: req.rider,
  });
});

// Database health check route
app.get("/db-test", async (req, res) => {
  try {
    const result = await query("SELECT NOW() as db_time, PostGIS_Full_Version() as postgis_version");
    res.json({
      database: "connected",
      db_time: result.rows[0].db_time,
      postgis: result.rows[0].postgis_version || "not enabled"
    });
  } catch (error: any) {
    res.status(500).json({
      database: "failed",
      error: error.message
    });
  }
});

const startServer = async () => {
  // Test DB connection before starting the server
  await testConnection();

  app.listen(5001, () => {
    console.log("🚀 Server started on http://localhost:5001");
  });
};

startServer().catch((err) => {
  console.error("Failed to start server:", err.message);
  process.exit(1);
});
