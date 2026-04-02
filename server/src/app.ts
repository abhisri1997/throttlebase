import express from "express";
import { createServer } from "node:http";
import { testConnection, query } from "./config/db.js";
import swaggerUi from "swagger-ui-express";
import { getSwaggerSpec } from "./config/swagger.js";
import authRoutes from "./routes/auth.routes.js";
import riderRoutes from "./routes/rider.routes.js";
import rideRoutes from "./routes/ride.routes.js";
import routeRoutes from "./routes/route.routes.js";
import communityRoutes from "./routes/community.routes.js";
import rewardsRoutes from "./routes/rewards.routes.js";
import notificationRoutes from "./routes/notifications.routes.js";
import supportRoutes from "./routes/support.routes.js";
import liveSessionRoutes from "./routes/live-session.routes.js";
import securityRoutes from "./routes/security.routes.js";
import { createLiveGateway } from "./realtime/gateway.js";
import cors from "cors";

const app = express();

// Securely unblock localhost ports
app.use(cors());

// Parse JSON request bodies
app.use(express.json());

// Global health check
app.get("/health", (req: express.Request, res: express.Response) => {
  res.json({ status: "up", timestamp: new Date().toISOString() });
});

// --- Swagger API Docs ---
let swaggerDocsHandler: express.RequestHandler | null = null;

app.use(
  "/api-docs",
  swaggerUi.serve,
  (req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (!swaggerDocsHandler) {
      swaggerDocsHandler = swaggerUi.setup(getSwaggerSpec(), {
        customSiteTitle: "ThrottleBase API Docs",
      });
    }

    return swaggerDocsHandler(req, res, next);
  },
);

// --- Auth routes (public) ---
app.use("/auth", authRoutes);

// --- Rider routes (protected) ---
app.use("/api/riders", riderRoutes);
app.use("/api/rides", rideRoutes);
app.use("/api/routes", routeRoutes);
app.use("/api/community", communityRoutes);
app.use("/api/rewards", rewardsRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/support", supportRoutes);
app.use("/api/live", liveSessionRoutes);
app.use("/api/security", securityRoutes);

// Database health check route
app.get("/db-test", async (req, res) => {
  try {
    const result = await query(
      "SELECT NOW() as db_time, PostGIS_Full_Version() as postgis_version",
    );
    res.json({
      database: "connected",
      db_time: result.rows[0].db_time,
      postgis: result.rows[0].postgis_version || "not enabled",
    });
  } catch (error: any) {
    res.status(500).json({
      database: "failed",
      error: error.message,
    });
  }
});

const startServer = async () => {
  // Test DB connection before starting the server
  await testConnection();

  const httpServer = createServer(app);
  createLiveGateway(httpServer);

  httpServer.listen(5001, () => {
    console.log("🚀 Server started on http://localhost:5001");
  });
};

startServer().catch((err) => {
  console.error("Failed to start server:", err.message);
  process.exit(1);
});
