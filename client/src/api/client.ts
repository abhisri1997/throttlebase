import axios from "axios";
import { resolveBaseUrl } from "../adapters/http/baseUrl";

const BASE_URL = resolveBaseUrl();

export const apiClient = axios.create({
  baseURL: BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

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
      // The token could not be refreshed, so the session is genuinely over.
      // Signing out flips the auth state and the root layout redirects.
      await authService.signOut();
    }

    return Promise.reject(error);
  },
);
