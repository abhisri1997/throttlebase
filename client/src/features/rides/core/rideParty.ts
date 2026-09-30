/**
 * Who is on a ride, as the ride screen needs to know it: a solo ride has no
 * roll call to wait on, and the banner speaks to the rider in their role.
 */

export interface RideParticipantLike {
  rider_id: string;
  role: string;
}

/**
 * A ride only the captain is on. Participants are the confirmed riders, so a
 * pending join request doesn't make it a group ride yet.
 */
export const isSoloRide = (participants: readonly RideParticipantLike[] | undefined, captainId: string): boolean => {
  const riders = participants ?? [];
  return riders.every((participant) => participant.rider_id === captainId);
};

export type RideRole = "captain" | "co_captain" | "rider";

export const rideRoleOf = (
  participants: readonly RideParticipantLike[] | undefined,
  captainId: string,
  riderId: string | undefined,
): RideRole | null => {
  if (!riderId) return null;
  if (riderId === captainId) return "captain";
  const me = (participants ?? []).find((participant) => participant.rider_id === riderId);
  if (!me) return null;
  return me.role === "co_captain" ? "co_captain" : "rider";
};

/** The banner at the foot of a ride the rider is on. */
export const participationHeadline = (role: RideRole, solo: boolean): string => {
  switch (role) {
    case "captain":
      return solo ? "Your solo ride" : "You're leading this ride";
    case "co_captain":
      return "You're co-leading this ride";
    case "rider":
      return "You're riding in this ride! 🎉";
  }
};

/** A second line for the captain of a solo ride, so they know others can still join. */
export const soloRideNote = (visibility: string | undefined, isFull: boolean): string | null => {
  if (isFull) return null;
  return visibility === "public"
    ? "It's just you so far. Other riders can still join until you set off."
    : "It's just you so far. Riders you invite can still join until you set off.";
};

/**
 * Whether "Leave ride" is offered. The captain of a solo ride has nobody to
 * hand over to, so leaving would only cancel it; they cancel or delete it
 * from the top of the screen instead.
 */
export const canLeaveRide = (role: RideRole, solo: boolean, rideStatus: string): boolean =>
  rideStatus !== "active" && !(role === "captain" && solo);
