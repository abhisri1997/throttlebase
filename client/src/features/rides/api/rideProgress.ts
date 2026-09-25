/**
 * A rider's own ride within a group ride — start early, finish, take it back —
 * and ending the group ride, which asks first when riders are still out.
 */
import { apiClient } from "../../../api/client";

export interface UnfinishedRiderPayload {
  rider_id: string;
  display_name: string | null;
  is_online: boolean;
  last_heartbeat_at: string | null;
  distance_to_destination_m: number | null;
}

export interface FinishMyRideResponse {
  reason: "arrived" | "left_early" | "group_ended";
  already_finished: boolean;
  /** This rider was the last one out, so the group ride completed. */
  ride_completed: boolean;
}

export const startMyRide = async (rideId: string): Promise<void> => {
  await apiClient.post(`/api/rides/${rideId}/live/me/start`);
};

export const finishMyRide = async (rideId: string): Promise<FinishMyRideResponse> => {
  const { data } = await apiClient.post(`/api/rides/${rideId}/live/me/finish`);
  return data as FinishMyRideResponse;
};

export const resumeMyRide = async (rideId: string): Promise<void> => {
  await apiClient.post(`/api/rides/${rideId}/live/me/resume`);
};

export const endGroupRide = async (
  rideId: string,
  options: { confirmUnfinished: boolean },
): Promise<void> => {
  await apiClient.post(`/api/rides/${rideId}/live/end`, {
    mark_ride_completed: true,
    reason: "ride_completed",
    confirm_unfinished: options.confirmUnfinished,
  });
};

/** The riders still out when the server refused to end the ride without confirmation. */
export const getUnfinishedRiders = (error: unknown): UnfinishedRiderPayload[] | null => {
  const response = (error as { response?: { status?: number; data?: any } } | null)?.response;
  if (response?.status !== 409 || response.data?.code !== "UNFINISHED_RIDERS") return null;
  return Array.isArray(response.data.riders) ? (response.data.riders as UnfinishedRiderPayload[]) : [];
};

/** Rides this device should be tracking: under way for this rider and not finished. */
export const fetchRidesImRiding = async (): Promise<Array<{ id: string; status: string; captain_id: string }>> => {
  const { data } = await apiClient.get("/api/rides/riding");
  return Array.isArray(data?.rides) ? data.rides : [];
};
