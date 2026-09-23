import axios from "axios";
import { Platform } from "react-native";
import Constants from "expo-constants";

const PRODUCTION_API_URL = "https://api.throttlebase.in";
const debuggerHost = Constants.expoConfig?.hostUri;
const localIp = debuggerHost?.split(":")[0];

let BASE_URL = process.env.EXPO_PUBLIC_API_URL?.trim();

if (!BASE_URL) {
  if (__DEV__) {
    BASE_URL = "http://localhost:5001";
    if (Platform.OS === "android" && !debuggerHost) {
      BASE_URL = "http://10.0.2.2:5001"; // Android emulator
    } else if (localIp) {
      BASE_URL = `http://${localIp}:5001`; // Physical device on LAN
    }
  } else {
    BASE_URL = PRODUCTION_API_URL;
  }
}

export const apiClient = axios.create({
  baseURL: BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

import { useAuthStore } from "../store/authStore";
import { authService } from "../services/auth";

/**
 * Bridge to the new auth service.
 *
 * Screens still using this axios client get tokens from the same place as
 * everything else, including the refresh and rotation handling. Without this
 * they would read a storage key nothing writes any more and silently 401.
 *
 * This whole module is replaced by adapters/http/apiClient in the next phase.
 */
apiClient.interceptors.request.use(async (config) => {
  const session = await authService.getValidSession();
  if (session && config.headers) {
    config.headers.Authorization = `Bearer ${session.accessToken}`;
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const status = error.response?.status;
    const errorMessage = error.response?.data?.error;
    const requestUrl =
      typeof error.config?.url === "string" ? error.config.url : "";
    const isAuthEndpoint = requestUrl.startsWith("/auth/");

    if (
      error.response &&
      (status === 401 || status === 403) &&
      errorMessage === "Invalid or expired token."
    ) {
      await authService.signOut();
      await useAuthStore.getState().logout();
      useAuthStore
        .getState()
        .showAuthNotice("Your session expired. Please log in again.");
    } else if (
      error.response &&
      (status === 401 || status === 403) &&
      !isAuthEndpoint
    ) {
      useAuthStore.getState().showAuthNotice("Login required to continue.");
    }

    return Promise.reject(error);
  },
);
