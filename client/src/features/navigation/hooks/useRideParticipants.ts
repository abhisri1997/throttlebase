import { useMemo } from "react";
import type {
  LiveSessionParticipant,
  LocationBroadcastEvent,
} from "../../../services/liveSessionSocket";
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
  /** The live session's view of each rider, for their own ride's progress. */
  sessionParticipants: readonly LiveSessionParticipant[];
}

/** The crew list, and the other riders to draw on the map. */
export const useRideParticipants = ({
  ride,
  presence,
  locations,
  currentRiderId,
  sessionParticipants,
}: UseRideParticipantsInput): { participants: RideParticipantView[]; peers: PeerLocation[] } => {
  const participants = useMemo((): RideParticipantView[] => {
    const sessionByRiderId = new Map(sessionParticipants.map((p) => [p.rider_id, p]));

    return (ride?.participants ?? []).map((participant) => {
      const inSession = sessionByRiderId.get(participant.rider_id);
      return {
        riderId: participant.rider_id,
        displayName: participant.display_name || "Rider",
        role: participant.role,
        isOnline: presence[participant.rider_id]?.isOnline ?? false,
        progress: inSession?.progress ?? "not_started",
        finishedAt: inSession?.finished_at ?? null,
      };
    });
  }, [presence, ride?.participants, sessionParticipants]);

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
