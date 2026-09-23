import tseslint from "typescript-eslint";

/**
 * Architecture boundaries, shared by the full lint run and by the
 * boundaries-only run that CI and `npm run lint:boundaries` use.
 *
 * These are not style preferences. Each rule encodes a decision about what
 * may depend on what, and together they are what keeps this codebase
 * portable: a vendor can only ever be reached through an adapter, so
 * replacing one means writing a new file rather than editing business logic.
 */

/** Packages that reach an outside system. Adapter-only. */
export const VENDOR_PACKAGES = [
  "pg",
  "jose",
  "nodemailer",
  "express",
  "socket.io",
  "socket.io-client",
  "jsonwebtoken",
  "bcrypt",
  "otplib",
  "helmet",
  "cors",
  "swagger-jsdoc",
  "swagger-ui-express",
  "express-rate-limit",
  "node-cron",
  "dotenv",
];

/**
 * Files that import vendor packages directly but predate the ports/adapters
 * split. They are the HTTP and worker layer — adapters in all but name,
 * pending relocation.
 *
 * THIS LIST MUST ONLY EVER SHRINK. Adding to it means introducing a vendor
 * dependency outside an adapter, which is the thing these rules exist to stop.
 */
export const LEGACY_VENDOR_ZONE = [
  "src/app.ts",
  "src/config/**",
  "src/controllers/**",
  "src/middleware/**",
  "src/queue/**",
  "src/realtime/**",
  "src/routes/**",
  "src/schemas/**",
  "src/services/**",
  "src/workers/**",
];

export const boundaryConfigs = tseslint.config(
  // ── The load-bearing rule ──────────────────────────────────────────────
  // Domain logic imports nothing but its own relative neighbours: no
  // packages, no node: builtins, no adapters. When core needs a capability
  // it declares a port and someone else supplies it. This is what makes the
  // use cases testable with fakes and portable across every vendor.
  {
    files: ["src/core/**/*.ts", "src/ports/**/*.ts"],
    ignores: ["src/core/**/*.test.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              regex: "^[^.]",
              message:
                "core/ and ports/ may only import relative paths. Declare a port and let an adapter supply the dependency.",
            },
            {
              regex: "adapters/",
              message:
                "core/ and ports/ must not depend on adapters. Dependencies point inward.",
            },
          ],
        },
      ],
    },
  },

  // Core's own tests may reach for the node test runner and nothing else: a
  // test that needs a vendor package is testing an adapter, not core.
  {
    files: ["src/core/**/*.test.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              regex: "^(?!node:(test|assert))[^.]",
              message:
                "Core tests may import only relative paths plus node:test / node:assert. Use the fakes in core/testing.",
            },
          ],
        },
      ],
    },
  },

  // Everywhere else: vendors are adapter-only.
  {
    files: ["src/**/*.ts"],
    ignores: [
      "src/adapters/**",
      "src/core/**",
      "src/ports/**",
      ...LEGACY_VENDOR_ZONE,
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: VENDOR_PACKAGES.map((name) => ({
            name,
            message: `"${name}" may only be imported from src/adapters/**. Wrap it behind a port instead.`,
          })),
          patterns: [
            {
              group: ["pg/*", "jose/*", "socket.io/*"],
              message:
                "Vendor subpath imports belong in src/adapters/** like the package itself.",
            },
          ],
        },
      ],
    },
  },
);
