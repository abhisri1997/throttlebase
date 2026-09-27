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

  const riderId =
    typeof payload.riderId === "string" && payload.riderId.length > 0
      ? payload.riderId
      : undefined;

  const outcome = await recomputeRideHistoryStats(rideId, riderId);
  return {
    processor: "ride-stats",
    ...outcome,
    handledAt: new Date().toISOString(),
  };
};
