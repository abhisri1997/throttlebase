import { MapsApiError, type MapsErrorKind } from "./mapsProvider.js";

/**
 * Shared request and error-mapping plumbing for every Google call.
 *
 * Two things here are load-bearing for security:
 *
 *  1. Nothing logged from this module may include a request URL. The v3 JSON
 *     APIs carry the API key in the query string, so logging a URL would print
 *     the key into Railway's log stream.
 *  2. Response bodies are read only to derive a reason for the server log. They
 *     never travel back to the caller, so an upstream body cannot reach a client.
 */

/** How much of an upstream error body is worth keeping for the log line. */
const MAX_LOGGED_DETAIL_CHARS = 500;

/** Places (New) reports failure through HTTP status codes. */
const kindForHttpStatus = (status: number): MapsErrorKind => {
  if (status === 429) return "quota";
  // 403 is commonly an unenabled API or a key restricted away from this caller.
  if (status === 403) return "denied";
  return "upstream";
};

/**
 * The v3 JSON APIs (Directions, Geocoding) answer HTTP 200 even when they
 * refuse the request, so the payload status is the only thing separating
 * "nothing is here" from "this key may not call this API".
 */
const KIND_BY_LEGACY_STATUS: Record<string, MapsErrorKind> = {
  OVER_QUERY_LIMIT: "quota",
  OVER_DAILY_LIMIT: "quota",
  REQUEST_DENIED: "denied",
};

/** Statuses that mean a valid answer, including a valid empty one. */
const LEGACY_OK_STATUSES = new Set(["OK", "ZERO_RESULTS"]);

/**
 * Logs why an upstream call failed, with enough detail to diagnose a
 * misconfigured key without ever printing the key itself.
 */
const logUpstreamFailure = (
  label: string,
  httpStatus: number,
  upstreamStatus: string | undefined,
  detail: string,
): void => {
  console.error(
    `[maps] ${label} failed`,
    JSON.stringify({
      httpStatus,
      upstreamStatus: upstreamStatus ?? null,
      detail: detail.slice(0, MAX_LOGGED_DETAIL_CHARS),
    }),
  );
};

/**
 * Performs a Google request and parses its JSON body.
 *
 * Throws MapsApiError for transport failures and non-2xx responses. A 2xx body
 * is returned as-is; v3 status checking is a separate step because only some
 * endpoints use it.
 */
export const requestGoogleJson = async <T>(
  label: string,
  url: string,
  init: RequestInit,
  fetchImpl: typeof fetch,
): Promise<T> => {
  let response: Response;

  try {
    response = await fetchImpl(url, init);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    logUpstreamFailure(label, 0, undefined, reason);
    throw new MapsApiError(`${label} request failed`, "network", 0);
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    logUpstreamFailure(label, response.status, undefined, detail);
    throw new MapsApiError(
      `${label} responded ${response.status}`,
      kindForHttpStatus(response.status),
      response.status,
    );
  }

  try {
    return (await response.json()) as T;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    logUpstreamFailure(label, response.status, undefined, reason);
    throw new MapsApiError(`${label} returned malformed JSON`, "upstream", response.status);
  }
};

/**
 * Enforces the v3 payload status, turning a refusal into the right error kind.
 * Returns normally for OK and ZERO_RESULTS; callers handle emptiness themselves.
 */
export const assertLegacyStatus = (
  label: string,
  payload: { status?: string | undefined; error_message?: string | undefined },
): void => {
  const status = payload.status ?? "UNKNOWN_STATUS";
  if (LEGACY_OK_STATUSES.has(status)) return;

  logUpstreamFailure(label, 200, status, payload.error_message ?? "");
  throw new MapsApiError(
    `${label} refused the request`,
    KIND_BY_LEGACY_STATUS[status] ?? "upstream",
    200,
    status,
  );
};
