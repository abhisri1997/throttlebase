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
import { createLiveGateway } from "./realtime/gateway.js";
import cors from "cors";
import helmet from "helmet";
import {
  corsOptions,
  isAllowedOrigin,
  isProduction,
  isSwaggerDocsEnabled,
  requireSwaggerBasicAuth,
} from "./config/security.js";

const app = express();

if (isProduction) {
  app.set("trust proxy", 1);
}

app.disable("x-powered-by");

app.use(
  helmet({
    contentSecurityPolicy: false,
    frameguard: { action: "deny" },
    referrerPolicy: { policy: "no-referrer" },
    hsts: isProduction
      ? {
          maxAge: 31536000,
          includeSubDomains: true,
          preload: true,
        }
      : false,
  }),
);

app.use((req, res, next) => {
  const forwardedProto = req.headers["x-forwarded-proto"];
  const hostHeader = req.headers.host;
  const host = Array.isArray(hostHeader) ? hostHeader[0] : hostHeader;
  const proto = Array.isArray(forwardedProto)
    ? forwardedProto[0]
    : forwardedProto?.split(",")[0]?.trim().toLowerCase();
  const isThrottlebaseDomain = Boolean(
    host && (host.includes("throttlebase.in") || host.includes("throttlebase.local")),
  );
  const isHttpsRequest = req.secure || proto === "https" || isThrottlebaseDomain;

  if (isHttpsRequest) {
    res.setHeader(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains; preload",
    );
  }

  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
  res.setHeader("Cross-Origin-Resource-Policy", "same-site");

  res.setHeader(
    "Permissions-Policy",
    "geolocation=(), camera=(), microphone=(), payment=(), usb=(), accelerometer=(), gyroscope=(), magnetometer=()",
  );

  if (req.path.startsWith("/api-docs")) {
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; img-src 'self' data: https:; style-src 'self' 'unsafe-inline' https:; script-src 'self' 'unsafe-inline' https:; base-uri 'self'; frame-ancestors 'none'",
    );
  } else {
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
    );
  }

  next();
});

app.use((req, res, next) => {
  const originHeader = req.headers.origin;
  const origin = Array.isArray(originHeader) ? originHeader[0] : originHeader;

  if (origin && !isAllowedOrigin(origin)) {
    res.status(403).json({ error: "Origin not allowed" });
    return;
  }

  next();
});

// Securely unblock localhost ports
app.use(cors(corsOptions));
app.options(/.*/, cors(corsOptions));

// Parse JSON request bodies
app.use(express.json());

// Global health check
app.get("/health", (req: express.Request, res: express.Response) => {
  res.json({ status: "up", timestamp: new Date().toISOString() });
});

app.get("/", (_req, res) => {
  res.status(404).json({ error: "Not found" });
});

// --- Swagger API Docs ---
let swaggerDocsHandler: express.RequestHandler | null = null;
let swaggerJsonHandler: express.RequestHandler | null = null;

if (isSwaggerDocsEnabled) {
  app.get("/openapi.json", requireSwaggerBasicAuth, (req, res, next) => {
    if (!swaggerJsonHandler) {
      swaggerJsonHandler = (_jsonReq, jsonRes) => {
        jsonRes.json(getSwaggerSpec());
      };
    }

    return swaggerJsonHandler(req, res, next);
  });

  app.get("/swagger.json", requireSwaggerBasicAuth, (req, res, next) => {
    if (!swaggerJsonHandler) {
      swaggerJsonHandler = (_jsonReq, jsonRes) => {
        jsonRes.json(getSwaggerSpec());
      };
    }

    return swaggerJsonHandler(req, res, next);
  });

  app.use(
    "/api-docs",
    requireSwaggerBasicAuth,
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
} else {
  app.use(["/openapi.json", "/swagger.json"], (_req, res) => {
    res.status(404).json({ error: "Not found" });
  });

  app.use("/api-docs", (_req, res) => {
    res.status(404).json({ error: "Not found" });
  });
}

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

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (err && typeof err === "object" && "message" in err) {
    const message = String((err as { message: unknown }).message);
    if (message.toLowerCase().includes("cors")) {
      res.status(403).json({ error: "Origin not allowed" });
      return;
    }
  }

  res.status(500).json({ error: "Internal server error" });
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
