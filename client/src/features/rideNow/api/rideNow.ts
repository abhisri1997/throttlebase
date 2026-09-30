import { z } from "zod";
import { apiClient } from "../../../api/client";
import type { LatLng } from "../../navigation/types/navigation";

export interface RideNowDestination {
  coordinate: LatLng;
  name: string;
}

export interface RideNowRequest {
  title: string;
  /** Where the rider is; routing needs it when there is a destination. */
  start: LatLng | null;
  destination: RideNowDestination | null;
}

const RideNowResponseSchema = z.object({
  ride: z.object({ id: z.string() }),
});

const AlreadyRidingSchema = z.object({
  code: z.literal("ALREADY_RIDING"),
  ride_id: z.string(),
});

/** PostGIS order: [longitude, latitude]. */
const toLngLat = (point: LatLng): [number, number] => [point.longitude, point.latitude];

/**
 * Makes the ride and sets it off in one step (docs/ride-now-ux.md §7.2).
 * Resolves with the new ride's id.
 */
export const startRideNow = async ({ title, start, destination }: RideNowRequest): Promise<string> => {
  const { data } = await apiClient.post("/api/rides/ride-now", {
    title,
    ...(start ? { start_point_coords: toLngLat(start) } : {}),
    ...(destination
      ? { end_point_coords: toLngLat(destination.coordinate), end_point_name: destination.name }
      : {}),
  });
  return RideNowResponseSchema.parse(data).ride.id;
};

/** The ride already under way, when the server refused a second one (409). */
export const alreadyRidingRideId = (error: unknown): string | null => {
  const response = (error as { response?: { status?: number; data?: unknown } } | null)?.response;
  if (response?.status !== 409) return null;

  const parsed = AlreadyRidingSchema.safeParse(response.data);
  return parsed.success ? parsed.data.ride_id : null;
};
