import Constants from "expo-constants";
import { Platform } from "react-native";

/** The released app. Only ever used by a build that asks for it explicitly. */
const PRODUCTION_API_URL = "https://api.throttlebase.in";

/** Everything else: local runs, dev clients, internal test builds. */
const DEVELOPMENT_API_URL = "https://api-dev.throttlebase.in";

/** A server running on the developer's own machine. */
const LOCAL_API_PORT = 5001;

/**
 * Where the API lives. The single place that decides, for HTTP and sockets
 * alike.
 *
 * Resolution order:
 *
 *   1. EXPO_PUBLIC_API_URL, when set. This is how a build picks its backend:
 *      .env points at development, and the EAS production profile sets the
 *      production URL. Metro inlines it at build time.
 *   2. A development build with no value falls back to a server on this
 *      machine, reached differently per target -- an Android emulator cannot
 *      resolve "localhost", and a physical device needs the LAN address, so
 *      the packager's own host is used to work it out.
 *   3. Anything else falls back to the DEVELOPMENT API, not production.
 *      A build that has lost its configuration should talk to development
 *      and be obviously wrong, rather than quietly write to production.
 *      Production is reached only by setting EXPO_PUBLIC_API_URL.
 */
export const resolveBaseUrl = (): string => {
  const configured = process.env.EXPO_PUBLIC_API_URL?.trim();
  if (configured) {
    return configured;
  }

  if (!__DEV__) {
    return DEVELOPMENT_API_URL;
  }

  const debuggerHost = Constants.expoConfig?.hostUri;
  const localIp = debuggerHost?.split(":")[0];

  if (Platform.OS === "android" && !debuggerHost) {
    // The emulator's alias for the host machine's loopback.
    return `http://10.0.2.2:${LOCAL_API_PORT}`;
  }

  return localIp
    ? `http://${localIp}:${LOCAL_API_PORT}`
    : `http://localhost:${LOCAL_API_PORT}`;
};

/** For diagnosing which backend a given build talks to. */
export const API_URLS = {
  production: PRODUCTION_API_URL,
  development: DEVELOPMENT_API_URL,
} as const;
