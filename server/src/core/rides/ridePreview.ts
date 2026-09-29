/**
 * What a rider who isn't on a ride that needs approval may see of it:
 * enough to decide whether to ask. Nothing that places the ride (meeting
 * point, route, stops, description) and nobody on it; the captain may have
 * written their address in the description.
 *
 * An allowlist, so a column added to rides later stays hidden until
 * someone decides a preview should show it.
 */
import type { MyRequest } from "./joinRequest.js";

const PREVIEW_FIELDS = [
  "id",
  "captain_id",
  "captain_name",
  "title",
  "status",
  "visibility",
  "scheduled_at",
  "estimated_duration_min",
  "max_capacity",
  "current_rider_count",
  "requirements",
  "stop_count",
] as const;

type PreviewField = (typeof PREVIEW_FIELDS)[number];

export type RidePreview = Partial<Record<PreviewField, unknown>> & {
  is_preview: true;
  my_request: MyRequest;
};

export const toRidePreview = (ride: Readonly<Record<string, unknown>>, myRequest: MyRequest): RidePreview => {
  const kept = Object.fromEntries(PREVIEW_FIELDS.filter((field) => field in ride).map((field) => [field, ride[field]]));
  return { ...kept, is_preview: true, my_request: myRequest };
};
