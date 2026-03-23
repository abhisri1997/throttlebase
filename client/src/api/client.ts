import axios from "axios";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import Constants from "expo-constants";

const debuggerHost = Constants.expoConfig?.hostUri;
const localIp = debuggerHost?.split(":")[0];

let BASE_URL = "http://localhost:5001"; // Fallback for Web/Simulator
if (Platform.OS === "android" && !debuggerHost) {
  BASE_URL = "http://10.0.2.2:5001"; // Android emulator
} else if (localIp) {
  BASE_URL = `http://${localIp}:5001`; // Physical device on LAN
}

export const apiClient = axios.create({
  baseURL: BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

import { useAuthStore } from "../store/authStore";

apiClient.interceptors.request.use(async (config) => {
  const token = await AsyncStorage.getItem("jwt_token");
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`;
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
