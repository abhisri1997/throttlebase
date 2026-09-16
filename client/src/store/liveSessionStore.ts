import { create } from "zustand";
import {
  liveSessionSocket,
  type IncidentCreatedEvent,
  type LiveSessionStateEvent,
  type LocationBroadcastEvent,
  type PresenceUpdateEvent,
  type SessionEndedEvent,
  type SessionErrorEvent,
  type RegroupRequestEvent,
} from "../services/liveSessionSocket";

type LiveIncident = IncidentCreatedEvent;

type LiveLocation = LocationBroadcastEvent;

type LivePresence = {
  riderId: string;
  isOnline: boolean;
  lastHeartbeatAt: string | null;
};

type PresenceMap = Record<string, LivePresence>;
type LocationMap = Record<string, LiveLocation>;

let socketListenersAttached = false;

type LiveSessionState = {
  rideId: string | null;
  session: LiveSessionStateEvent | null;
  connected: boolean;
  isJoining: boolean;
  inRoom: boolean;
  presence: PresenceMap;
  locations: LocationMap;
  incidents: LiveIncident[];
  /** A rider left behind is asking the group to wait somewhere; null once answered. */
  regroupRequest: RegroupRequestEvent | null;
  lastError: string | null;
  sessionEndedReason: string | null;
  connect: (token: string) => void;
  joinRoom: (rideId: string) => void;
  leaveRoom: () => void;
  setRideContext: (rideId: string) => void;
  clearRideContext: () => void;
  sendHeartbeat: () => void;
  reportSOS: (coords?: { lon: number; lat: number }) => void;
  upsertLocation: (input: {
    lon: number;
    lat: number;
    speed_kmh?: number;
    heading_deg?: number;
    accuracy_m?: number;
    captured_at?: string;
    /** Dev simulation: shared with the crew, but kept out of the ride's track. */
    simulated?: boolean;
  }) => void;
  /** Records a waypoint arrival for the ride history. False when not in the room yet. */
  reportWaypointReached: (input: {
    waypoint_id: string;
    waypoint_kind: "start" | "stop" | "destination";
    reached_at: string;
  }) => boolean;
  reset: () => void;
};

const mergePresenceFromSession = (
  session: LiveSessionStateEvent,
  previous: PresenceMap,
): PresenceMap => {
  const next: PresenceMap = { ...previous };

  for (const participant of session.participants) {
    next[participant.rider_id] = {
      riderId: participant.rider_id,
      isOnline: participant.is_online,
      lastHeartbeatAt: participant.last_heartbeat_at,
    };
  }

  return next;
};

const attachSocketListeners = () => {
  if (socketListenersAttached) {
    return;
  }

  liveSessionSocket.off("session:state");
  liveSessionSocket.off("presence:update");
  liveSessionSocket.off("location:broadcast");
  liveSessionSocket.off("incident:created");
  liveSessionSocket.off("session:error");

  liveSessionSocket.on("session:state", (session) => {
    useLiveSessionStore.setState((state) => ({
      ...state,
      rideId: session.ride_id,
      session,
      isJoining: false,
      inRoom: true,
      presence: mergePresenceFromSession(session, state.presence),
      lastError: null,
    }));
  });

  liveSessionSocket.on("presence:update", (event: PresenceUpdateEvent) => {
    useLiveSessionStore.setState((state) => ({
      ...state,
      presence: {
        ...state.presence,
        [event.riderId]: {
          riderId: event.riderId,
          isOnline: event.isOnline,
          lastHeartbeatAt: event.lastHeartbeatAt,
        },
      },
    }));
  });

  liveSessionSocket.on("location:broadcast", (event: LiveLocation) => {
    useLiveSessionStore.setState((state) => ({
      ...state,
      locations: {
        ...state.locations,
        [event.riderId]: event,
      },
    }));
  });

  liveSessionSocket.on("incident:created", (event: LiveIncident) => {
    useLiveSessionStore.setState((state) => ({
      ...state,
      incidents: [event, ...state.incidents].slice(0, 20),
    }));
  });

  liveSessionSocket.on("regroup:requested", (event: RegroupRequestEvent) => {
    useLiveSessionStore.setState((state) => ({ ...state, regroupRequest: event }));
  });

  // Answered — by this leader or another — so the prompt goes away everywhere.
  liveSessionSocket.on("regroup:decided", (event: { stopId: string }) => {
    useLiveSessionStore.setState((state) => ({
      ...state,
      regroupRequest:
        state.regroupRequest?.stop?.id === event.stopId ? null : state.regroupRequest,
    }));
  });

  liveSessionSocket.on("session:error", (event: SessionErrorEvent) => {
    useLiveSessionStore.setState((state) => ({
      ...state,
      isJoining: false,
      lastError: event.error,
    }));
  });

  liveSessionSocket.off("session:ended");
  liveSessionSocket.on("session:ended", (event: SessionEndedEvent) => {
    socketListenersAttached = false;
    liveSessionSocket.disconnect();

    useLiveSessionStore.setState((state) => ({
      ...state,
      rideId: null,
      session: state.session
        ? {
            ...state.session,
            status: "ended",
            ended_at: event.endedAt ?? new Date().toISOString(),
          }
        : state.session,
      connected: false,
      inRoom: false,
      isJoining: false,
      sessionEndedReason: event.reason ?? null,
      presence: Object.fromEntries(
        Object.entries(state.presence).map(([k, v]) => [
          k,
          { ...v, isOnline: false },
        ]),
      ),
    }));
  });

  socketListenersAttached = true;
};

export const useLiveSessionStore = create<LiveSessionState>((set, get) => ({
  rideId: null,
  session: null,
  connected: false,
  isJoining: false,
  inRoom: false,
  presence: {},
  locations: {},
  incidents: [],
  regroupRequest: null,
  lastError: null,
  sessionEndedReason: null,

  connect: (token: string) => {
    const socket = liveSessionSocket.connect(token);

    attachSocketListeners();

    socket.off("connect");
    socket.off("disconnect");

    socket.on("connect", () => {
      set((state) => ({
        ...state,
        connected: true,
        lastError: null,
      }));
    });

    socket.on("disconnect", () => {
      set((state) => ({
        ...state,
        connected: false,
        isJoining: false,
        inRoom: false,
      }));
    });

    set((state) => ({
      ...state,
      connected: socket.connected,
      lastError: null,
    }));
  },

  joinRoom: (rideId: string) => {
    if (!liveSessionSocket.getSocket()) {
      set((state) => ({
        ...state,
        lastError: "Live socket is not connected",
      }));
      return;
    }

    liveSessionSocket.emit("session:join", { rideId });

    set((state) => ({
      ...state,
      rideId,
      isJoining: true,
      inRoom: false,
      incidents: [],
      regroupRequest: null,
      lastError: null,
    }));
  },

  leaveRoom: () => {
    const rideId = get().rideId;
    if (rideId) {
      liveSessionSocket.emit("session:leave", { rideId });
    }

    set((state) => ({
      ...state,
      isJoining: false,
      inRoom: false,
      rideId: null,
      session: null,
      presence: {},
      locations: {},
      incidents: [],
      regroupRequest: null,
    }));
  },

  setRideContext: (rideId: string) => {
    set((state) => {
      if (state.rideId === rideId) {
        return state;
      }

      return {
        ...state,
        rideId,
        isJoining: false,
        inRoom: false,
        session: null,
        presence: {},
        locations: {},
        incidents: [],
        regroupRequest: null,
        lastError: null,
      };
    });
  },

  clearRideContext: () => {
    set((state) => ({
      ...state,
      rideId: null,
      isJoining: false,
      inRoom: false,
      session: null,
      presence: {},
      locations: {},
      incidents: [],
      regroupRequest: null,
      lastError: null,
    }));
  },

  sendHeartbeat: () => {
    const { rideId, inRoom } = get();
    if (!rideId || !inRoom) {
      return;
    }

    liveSessionSocket.emit("presence:heartbeat", {
      rideId,
      ts: new Date().toISOString(),
    });
  },

  reportSOS: (coords) => {
    const { rideId, inRoom } = get();
    if (!rideId || !inRoom) {
      return;
    }

    liveSessionSocket.emit("incident:create", {
      rideId,
      severity: "critical",
      kind: "sos",
      ...(coords
        ? {
            lon: coords.lon,
            lat: coords.lat,
          }
        : {}),
      metadata: {
        source: "mobile",
      },
    });
  },

  upsertLocation: (input) => {
    const { rideId, inRoom } = get();
    if (!rideId || !inRoom) {
      return;
    }

    liveSessionSocket.emit("location:update", {
      rideId,
      ...input,
    });
  },

  reportWaypointReached: (input) => {
    const { rideId, inRoom } = get();
    if (!rideId || !inRoom) {
      return false;
    }

    liveSessionSocket.emit("waypoint:reached", {
      rideId,
      ...input,
    });
    return true;
  },

  reset: () => {
    socketListenersAttached = false;
    liveSessionSocket.disconnect();

    set((state) => ({
      ...state,
      rideId: null,
      session: null,
      connected: false,
      isJoining: false,
      inRoom: false,
      presence: {},
      locations: {},
      incidents: [],
      regroupRequest: null,
      lastError: null,
      sessionEndedReason: null,
    }));
  },
}));
