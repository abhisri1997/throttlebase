import { recomputeRideHistoryStats } from "../../services/stats.service.js";

export const processRideStatsRecompute = async (
  payload: Record<string, unknown>,
): Promise<Record<string, unknown>> => {
  const rideId =
    typeof payload.rideId === "string" && payload.rideId.length > 0
      ? payload.rideId
      : null;

  if (!rideId) {
    throw new Error("rideId is required for ride stats recompute job");
  }

  const outcome = await recomputeRideHistoryStats(rideId);
  return {
    processor: "ride-stats",
    ...outcome,
    handledAt: new Date().toISOString(),
  };
};
