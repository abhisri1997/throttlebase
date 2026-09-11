import { useMemo } from "react";
import type { LocationBroadcastEvent } from "../../../services/liveSessionSocket";
import type { RideParticipantView } from "../types/navigation";
import type { NavigationRide } from "./useRideLiveSession";

export interface PeerLocation extends LocationBroadcastEvent {
  displayName: string;
}

interface UseRideParticipantsInput {
  ride: NavigationRide | null;
  presence: Readonly<Record<string, { isOnline?: boolean } | undefined>>;
  locations: Readonly<Record<string, LocationBroadcastEvent>>;
  currentRiderId: string | undefined;
}

/** The crew list, and the other riders to draw on the map. */
export const useRideParticipants = ({
  ride,
  presence,
  locations,
  currentRiderId,
}: UseRideParticipantsInput): { participants: RideParticipantView[]; peers: PeerLocation[] } => {
  const participants = useMemo(
    (): RideParticipantView[] =>
      (ride?.participants ?? []).map((participant) => ({
        riderId: participant.rider_id,
        displayName: participant.display_name || "Rider",
        role: participant.role,
        isOnline: presence[participant.rider_id]?.isOnline ?? false,
      })),
    [presence, ride?.participants],
  );

  const peers = useMemo((): PeerLocation[] => {
    if (participants.length === 0) return [];

    const nameByRiderId = new Map(participants.map((p) => [p.riderId, p.displayName]));

    return Object.values(locations)
      .filter((location) => location.riderId !== currentRiderId)
      .filter((location) => presence[location.riderId]?.isOnline !== false)
      .map((location) => ({
        ...location,
        displayName: nameByRiderId.get(location.riderId) ?? "Rider",
      }));
  }, [currentRiderId, locations, participants, presence]);

  return { participants, peers };
};
