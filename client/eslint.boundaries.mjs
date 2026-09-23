import tseslint from "typescript-eslint";

/**
 * Architecture boundaries for the app.
 *
 * The app's job is to keep vendor SDKs at arm's length. Sign-in providers,
 * secure storage, the HTTP client and the realtime transport are all
 * replaceable, and they stay replaceable only while exactly one file per
 * vendor knows the vendor exists.
 */

/**
 * SDKs that talk to a platform or a network. Adapter-only.
 *
 * react-native, expo-router and the UI libraries are deliberately absent:
 * those are the rendering substrate, not swappable integrations, and screens
 * import them directly.
 */
export const VENDOR_PACKAGES = [
  "@react-native-google-signin/google-signin",
  "expo-apple-authentication",
  "expo-secure-store",
  "expo-crypto",
  "@react-native-async-storage/async-storage",
  "axios",
  "socket.io-client",
];

/**
 * Files that reach a vendor directly but predate the ports/adapters split.
 * Each is scheduled for relocation:
 *
 *   src/api/client.ts                  -> adapters/http/apiClient.ts      (phase D)
 *   src/store/authStore.ts             -> services/authService.ts         (phase D)
 *   src/services/liveSessionSocket.ts  -> adapters/realtime/*             (phase D)
 *   src/services/rideSocket.ts         -> adapters/realtime/*             (phase D)
 *   src/features/.../useNavigationSession.ts -> LocalRideStore port       (phase F)
 *   src/api/maps.ts                    -> adapters/http/*                 (follow-up)
 *
 * THIS LIST MUST ONLY EVER SHRINK.
 */
export const LEGACY_VENDOR_ZONE = [
  "src/api/client.ts",
  "src/api/maps.ts",
  "src/features/navigation/hooks/useNavigationSession.ts",
  "src/services/liveSessionSocket.ts",
  "src/services/rideSocket.ts",
  "src/store/authStore.ts",
];

export const boundaryConfigs = tseslint.config(
  // Pure app-side domain logic: relative imports only, the same contract as
  // the server's core. Session expiry maths and refresh de-duplication live
  // here and must be testable without a simulator.
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
                "Core tests may import only relative paths plus node:test / node:assert.",
            },
          ],
        },
      ],
    },
  },

  // Vendors are adapter-only.
  {
    files: ["src/**/*.ts", "src/**/*.tsx", "app/**/*.ts", "app/**/*.tsx"],
    ignores: ["src/adapters/**", ...LEGACY_VENDOR_ZONE],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: VENDOR_PACKAGES.map((name) => ({
            name,
            message: `"${name}" may only be imported from src/adapters/**. Reach it through a port instead.`,
          })),
        },
      ],
    },
  },

  // Screens and shared components consume the app's own services, never an
  // adapter directly. Keeping this edge one-way is what lets the storage or
  // sign-in implementation change without a screen noticing.
  {
    files: ["app/**/*.tsx", "app/**/*.ts", "src/components/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              regex: "(^|/)(adapters|ports)/",
              message:
                "Screens and components import from src/services/** only. Adapters and ports are internal.",
            },
          ],
        },
      ],
    },
  },
);
