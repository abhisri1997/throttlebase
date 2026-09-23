import { Platform } from "react-native";

/**
 * Whether this device can offer Apple sign-in.
 *
 * Apple requires the button on iOS wherever other providers appear. It is
 * absent on Android, where the module is not linked, so the check is
 * dynamic — importing it unconditionally would break the Android bundle.
 */
export const isAppleSignInSupported = async (): Promise<boolean> => {
  if (Platform.OS !== "ios") {
    return false;
  }

  try {
    const { isAppleSignInAvailable } = await import(
      "../adapters/auth/appleSignIn"
    );
    return await isAppleSignInAvailable();
  } catch {
    return false;
  }
};
