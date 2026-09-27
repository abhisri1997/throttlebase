import { ApiError, type ApiClient, type ApiRequest } from "../../ports/ApiClient";
import { resolveBaseUrl } from "./baseUrl";

export interface ApiClientOptions {
  baseUrl?: string;
  /** The current access token, without refreshing. */
  getAccessToken: () => Promise<string | null>;
  /**
   * Called once after a 401, to obtain a fresh token. Returning null means
   * the session is unrecoverable and the request should fail.
   */
  refreshAccessToken: () => Promise<string | null>;
}

const REQUEST_TIMEOUT_MS = 20_000;

/**
 * fetch with our auth attached.
 *
 * A 401 is retried exactly once, after a refresh. Once, not in a loop: if the
 * second attempt is also rejected the session is genuinely dead, and retrying
 * further would just hammer the API while the rider waits.
 */
export const createApiClient = (options: ApiClientOptions): ApiClient => {
  const baseUrl = options.baseUrl ?? resolveBaseUrl();

  const send = async (
    request: ApiRequest,
    token: string | null,
  ): Promise<Response> => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    if (request.signal) {
      request.signal.addEventListener("abort", () => controller.abort());
    }

    try {
      return await fetch(`${baseUrl}${request.path}`, {
        method: request.method ?? "GET",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        ...(request.body === undefined
          ? {}
          : { body: JSON.stringify(request.body) }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
  };

  const parse = async <T>(response: Response): Promise<T> => {
    if (response.status === 204) {
      return undefined as T;
    }

    const text = await response.text();
    if (!text) {
      return undefined as T;
    }

    try {
      return JSON.parse(text) as T;
    } catch {
      throw new ApiError(response.status, "Malformed response from server");
    }
  };

  const fail = async (response: Response): Promise<never> => {
    let message = `Request failed (${response.status})`;
    let code: string | undefined;

    try {
      const body = (await response.json()) as { error?: string; code?: string };
      if (body.error) message = body.error;
      code = body.code;
    } catch {
      // A non-JSON error body tells us nothing useful; the status stands.
    }

    throw new ApiError(response.status, message, code);
  };

  return {
    request: async <T>(request: ApiRequest): Promise<T> => {
      const token = request.anonymous ? null : await options.getAccessToken();
      let response = await send(request, token);

      if (response.status === 401 && !request.anonymous) {
        const refreshed = await options.refreshAccessToken();
        if (refreshed) {
          response = await send(request, refreshed);
        }
      }

      if (!response.ok) {
        return await fail(response);
      }

      return await parse<T>(response);
    },
  };
};
