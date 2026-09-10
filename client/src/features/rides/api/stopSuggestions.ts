import { useQuery } from "@tanstack/react-query";
import { apiClient } from "../../../api/client";
import type { StopSuggestionResponse, StopType } from "../types/stops";

/**
 * Suggestions only change when the route or category changes, and every miss
 * costs a Places call. The app's QueryClient is created with no defaults
 * (staleTime 0), so this must be set explicitly or every screen focus re-bills.
 */
const STOP_SUGGESTION_STALE_TIME_MS = 30 * 60 * 1000;

export const fetchStopSuggestions = async (
  category: StopType,
  encodedPolyline: string,
): Promise<StopSuggestionResponse> => {
  const { data } = await apiClient.post<StopSuggestionResponse>(
    "/api/stop-suggestions",
    { category, encodedPolyline, mode: "planning" },
  );
  return data;
};

export const useStopSuggestions = (
  category: StopType,
  encodedPolyline: string | undefined,
  enabled: boolean,
) =>
  useQuery({
    queryKey: ["stopSuggestions", category, encodedPolyline],
    queryFn: () => fetchStopSuggestions(category, encodedPolyline as string),
    enabled: enabled && Boolean(encodedPolyline),
    staleTime: STOP_SUGGESTION_STALE_TIME_MS,
    gcTime: STOP_SUGGESTION_STALE_TIME_MS,
    // A failed lookup falls back to manual search; retrying just spends budget.
    retry: false,
  });
