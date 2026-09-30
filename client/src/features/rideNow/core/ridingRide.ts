import { z } from "zod";

/**
 * A ride this rider is riding now, from GET /api/rides/riding
 * (docs/ride-now-ux.md §7.5). The fields past captain_id arrived with Ride
 * now; an older server leaves them out, so each has a safe default: a ride of
 * unknown kind is treated as planned and shared, the way every ride was.
 */
const RidingRideSchema = z.object({
  id: z.string(),
  status: z.string(),
  captain_id: z.string(),
  title: z.string().default(""),
  kind: z.enum(["planned", "unplanned"]).default("planned"),
  others_on_ride: z.boolean().default(true),
  elapsed_s: z.number().nonnegative().default(0),
  distance_km: z.number().nonnegative().default(0),
});

export type RidingRide = z.infer<typeof RidingRideSchema>;

export const parseRidingRides = (data: unknown): RidingRide[] => {
  const rides = (data as { rides?: unknown } | null)?.rides;
  if (!Array.isArray(rides)) return [];

  return rides.flatMap((raw) => {
    const parsed = RidingRideSchema.safeParse(raw);
    return parsed.success ? [parsed.data] : [];
  });
};
