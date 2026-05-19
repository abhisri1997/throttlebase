import type { CorsOptions } from "cors";
import type { RequestHandler } from "express";

const parseCsv = (value?: string): string[] =>
  (value || "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

export const isProduction = process.env.NODE_ENV === "production";

const defaultAllowedOrigins = isProduction
  ? ["https://throttlebase.in", "https://www.throttlebase.in"]
  : [
      "http://localhost:3000",
      "http://localhost:8081",
      "http://localhost:19006",
      "http://127.0.0.1:3000",
      "http://127.0.0.1:8081",
      "http://127.0.0.1:19006",
      "exp://localhost:8081",
      "exp://127.0.0.1:8081",
      "https://throttlebase.in",
      "https://www.throttlebase.in",
    ];

export const allowedOrigins = new Set(
  parseCsv(process.env.CORS_ALLOWED_ORIGINS).length > 0
    ? parseCsv(process.env.CORS_ALLOWED_ORIGINS)
    : defaultAllowedOrigins,
);

export const isAllowedOrigin = (origin?: string): boolean => {
  if (!origin) {
    return true;
  }

  return allowedOrigins.has(origin);
};

export const corsOptions: CorsOptions = {
  origin(origin, callback) {
    callback(null, isAllowedOrigin(origin));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Authorization", "Content-Type"],
  maxAge: 86400,
};

export const socketCorsOptions = {
  origin(origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) {
    callback(null, isAllowedOrigin(origin));
  },
  credentials: true,
};

const docsFlag = process.env.ENABLE_SWAGGER_DOCS;
export const isSwaggerDocsEnabled =
  docsFlag === "true";

const swaggerUser = process.env.SWAGGER_USERNAME;
const swaggerPass = process.env.SWAGGER_PASSWORD;

export const hasSwaggerBasicAuthConfig =
  Boolean(swaggerUser) && Boolean(swaggerPass);

export const requireSwaggerBasicAuth: RequestHandler = (req, res, next) => {
  if (!isProduction) {
    next();
    return;
  }

  if (!hasSwaggerBasicAuthConfig) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Basic ")) {
    res.setHeader("WWW-Authenticate", "Basic realm=\"ThrottleBase API Docs\"");
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  const encoded = authHeader.slice("Basic ".length).trim();
  const decoded = Buffer.from(encoded, "base64").toString("utf8");
  const separatorIndex = decoded.indexOf(":");

  if (separatorIndex === -1) {
    res.status(401).json({ error: "Invalid authentication format" });
    return;
  }

  const username = decoded.slice(0, separatorIndex);
  const password = decoded.slice(separatorIndex + 1);

  if (username !== swaggerUser || password !== swaggerPass) {
    res.setHeader("WWW-Authenticate", "Basic realm=\"ThrottleBase API Docs\"");
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  next();
};
