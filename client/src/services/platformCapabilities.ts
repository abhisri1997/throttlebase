import { Platform } from "react-native";

/**
 * Whether this build can offer Apple sign-in.
 *
 * Three things must line up, and all three are off right now: the Apple
 * Developer membership, the "Sign In with Apple" capability on the App ID,
 * and the expo-apple-authentication plugin in app.config.ts. Until then the
 * button is hidden and the backend reports the endpoint as unavailable.
 *
 * To turn it on: add the capability in the Apple developer portal, restore
 * the plugin and `usesAppleSignIn: true` in app.config.ts, set
 * APPLE_CLIENT_IDS on the API, and set this flag to "true".
 */
const APPLE_SIGN_IN_ENABLED =
  process.env.EXPO_PUBLIC_ENABLE_APPLE_SIGN_IN === "true";

export const isAppleSignInSupported = async (): Promise<boolean> => {
  if (!APPLE_SIGN_IN_ENABLED || Platform.OS !== "ios") {
    return false;
  }

  try {
    const { isAppleSignInAvailable } = await import(
      "../adapters/auth/appleSignIn"
    );
    return await isAppleSignInAvailable();
  } catch {
    // The native module is absent unless the plugin is enabled, so a failed
    // import means "not available", not an error worth surfacing.
    return false;
  }
};
