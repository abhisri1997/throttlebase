#!/usr/bin/env node
/**
 * Serves the exported web build (`npx expo export --platform web` → dist/)
 * for throttlebase.in. This is what production runs; `npm run web` starts
 * Metro's development server and must never face the internet.
 *
 * The export is a single page: any path that isn't a file gets index.html,
 * and Expo Router takes it from there (/privacy, /terms, /post/:id, ...).
 *
 * It listens on $PORT. Railway always sets PORT (8080 unless told
 * otherwise), while the throttlebase.in and dev.throttlebase.in domains send
 * traffic to 8081, so the service sets PORT=8081. The fallback below only
 * matters for local runs.
 *
 *   PORT=8081 npm run serve:web
 */
import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { fileURLToPath, URL } from "node:url";
import handler from "serve-handler";

const PUBLIC_DIR = fileURLToPath(new URL("../dist", import.meta.url));
const DEFAULT_PORT = 8081;
const port = Number(process.env.PORT) || DEFAULT_PORT;

const ONE_YEAR_SECONDS = 365 * 24 * 60 * 60;

const SECURITY_HEADERS = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
];

const CONFIG = {
  public: PUBLIC_DIR,
  rewrites: [{ source: "**", destination: "/index.html" }],
  directoryListing: false,
  headers: [
    { source: "**", headers: [...SECURITY_HEADERS, { key: "Cache-Control", value: "no-cache" }] },
    // Bundles have content hashes in their names, so they never change.
    {
      source: "_expo/static/**",
      headers: [{ key: "Cache-Control", value: `public, max-age=${ONE_YEAR_SECONDS}, immutable` }],
    },
  ],
};

if (!existsSync(PUBLIC_DIR)) {
  console.error(`No web build at ${PUBLIC_DIR}. Run: npx expo export --platform web`);
  process.exit(1);
}

const server = createServer((request, response) => {
  handler(request, response, CONFIG).catch((error) => {
    console.error("serve-web: failed to serve", request.url, error);
    if (!response.headersSent) response.writeHead(500);
    response.end();
  });
});

server.listen(port, () => {
  console.log(`serve-web: serving ${PUBLIC_DIR} on port ${port}`);
});

// Railway sends SIGTERM on redeploy; finish in-flight requests first.
process.on("SIGTERM", () => server.close(() => process.exit(0)));
