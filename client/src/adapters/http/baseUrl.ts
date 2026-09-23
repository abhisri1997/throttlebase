import Constants from "expo-constants";
import { Platform } from "react-native";

const PRODUCTION_API_URL = "https://api.throttlebase.in";

/**
 * Where the API lives.
 *
 * In development the host differs per target — an emulator cannot reach
 * "localhost", and a physical device needs the laptop's LAN address — so the
 * packager's own host is used to work it out.
 */
export const resolveBaseUrl = (): string => {
  const configured = process.env.EXPO_PUBLIC_API_URL?.trim();
  if (configured) {
    return configured;
  }

  if (!__DEV__) {
    return PRODUCTION_API_URL;
  }

  const debuggerHost = Constants.expoConfig?.hostUri;
  const localIp = debuggerHost?.split(":")[0];

  if (Platform.OS === "android" && !debuggerHost) {
    return "http://10.0.2.2:5001";
  }

  return localIp ? `http://${localIp}:5001` : "http://localhost:5001";
};
