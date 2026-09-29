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
 * A 401 here never signs the rider out. When a refresh gets no answer (no
 * signal, the API mid-deploy) the auth service keeps the session and hands
 * back the token it has, and the API rejecting that stale token says nothing
 * about the refresh token. Only the auth service ends the session, when the
 * server refuses the refresh token itself.
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
