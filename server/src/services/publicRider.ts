import type { RiderProfile } from "./rider.service.js";

/**
 * The only profile fields another rider may see.
 *
 * An allowlist, not a denylist: a column added to riders later stays private
 * until someone decides to add it here. Contact details, body weight, the
 * home point used for meeting-point suggestions (location_coords), admin
 * state and activity timestamps are never public, whatever the rider's
 * profile visibility.
 */
export const PUBLIC_RIDER_FIELDS = [
  "id",
  "display_name",
  "username",
  "bio",
  "profile_picture_url",
  "experience_level",
  "location_city",
  "total_rides",
  "total_distance_km",
  "total_ride_time_sec",
  "follower_count",
  "following_count",
  "created_at",
] as const satisfies readonly (keyof RiderProfile)[];

type PublicRiderField = (typeof PUBLIC_RIDER_FIELDS)[number];

export type PublicRider = Pick<RiderProfile, PublicRiderField> & {
  is_following: boolean;
};

export const toPublicRider = (
  rider: RiderProfile,
  isFollowing: boolean,
): PublicRider => {
  const entries = PUBLIC_RIDER_FIELDS.map((field) => [field, rider[field]] as const);

  return {
    ...(Object.fromEntries(entries) as Pick<RiderProfile, PublicRiderField>),
    is_following: isFollowing,
  };
};
