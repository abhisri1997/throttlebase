import { io, type Socket } from "socket.io-client";
import { resolveBaseUrl } from "../adapters/http/baseUrl";

export type LiveSessionStateEvent = {
  id: string;
  ride_id: string;
  status: "starting" | "active" | "paused" | "ended";
  started_at: string | null;
  ended_at: string | null;
  participants: Array<{
    rider_id: string;
    display_name: string;
    role: "captain" | "co_captain" | "member";
    is_online: boolean;
    last_heartbeat_at: string | null;
  }>;
};

export type PresenceUpdateEvent = {
  riderId: string;
  isOnline: boolean;
  lastHeartbeatAt: string | null;
};

export type LocationBroadcastEvent = {
  sessionId: string;
  riderId: string;
  lon: number;
  lat: number;
  speedKmh: number | null;
  headingDeg: number | null;
  accuracyM: number | null;
  capturedAt: string;
};

export type IncidentCreatedEvent = {
  incidentId: string;
  riderId: string;
  severity: "low" | "medium" | "high" | "critical";
  kind: "sos" | "crash" | "medical" | "mechanical" | "other";
  createdAt: string;
};

export type SessionErrorEvent = {
  error: string;
  code: number;
};

export type SessionEndedEvent = {
  rideId: string;
  sessionId: string;
  endedAt: string | null;
  endedBy: string | null;
  reason: string | null;
};

/** A stop proposed so the group can wait for a rider who has fallen behind. */
export type RegroupRequestEvent = {
  rideId: string;
  stop: {
    id: string;
    name?: string | null;
    address?: string | null;
    status: string;
    location_geojson?: { coordinates?: unknown } | null;
  };
  requestedBy: string;
  waitSeconds: number | null;
  /** The ride was already stopping there: news for the leaders, not a decision. */
  isExistingStop?: boolean;
};

export type RegroupDecidedEvent = {
  rideId: string;
  stopId: string;
  status: "approved" | "rejected";
  decidedBy: string;
};

export type LiveSocketServerEvents = {
  "session:state": (event: LiveSessionStateEvent) => void;
  "presence:update": (event: PresenceUpdateEvent) => void;
  "location:broadcast": (event: LocationBroadcastEvent) => void;
  "incident:created": (event: IncidentCreatedEvent) => void;
  "regroup:requested": (event: RegroupRequestEvent) => void;
  "regroup:decided": (event: RegroupDecidedEvent) => void;
  "session:error": (event: SessionErrorEvent) => void;
  "session:ended": (event: SessionEndedEvent) => void;
};

export type LiveSocketClientEvents = {
  "session:join": (payload: { rideId: string }) => void;
  "session:leave": (payload: { rideId: string }) => void;
  "presence:heartbeat": (payload: { rideId: string; ts?: string }) => void;
  "location:update": (payload: {
    rideId: string;
    lon: number;
    lat: number;
    speed_kmh?: number;
    heading_deg?: number;
    accuracy_m?: number;
    captured_at?: string;
  }) => void;
  "waypoint:reached": (payload: {
    rideId: string;
    waypoint_id: string;
    waypoint_kind: "start" | "stop" | "destination";
    reached_at: string;
  }) => void;
  "incident:create": (payload: {
    rideId: string;
    severity: "low" | "medium" | "high" | "critical";
    kind: "sos" | "crash" | "medical" | "mechanical" | "other";
    lon?: number;
    lat?: number;
    metadata?: Record<string, unknown>;
  }) => void;
};

type LiveSocket = Socket<LiveSocketServerEvents, LiveSocketClientEvents>;

const getBaseUrl = resolveBaseUrl;

class LiveSessionSocketService {
  private socket: LiveSocket | null = null;
  private authToken: string | null = null;

  connect(token: string): LiveSocket {
    this.authToken = token;

    if (this.socket) {
      if (!this.socket.connected) {
        this.socket.auth = { token };
        this.socket.connect();
      }
      return this.socket;
    }

    const socket = io(`${getBaseUrl()}/live`, {
      transports: ["websocket"],
      autoConnect: false,
      auth: { token },
      extraHeaders: {
        Authorization: `Bearer ${token}`,
      },
    });

    socket.connect();
    this.socket = socket;

    return socket;
  }

  getSocket(): LiveSocket | null {
    return this.socket;
  }

  isConnected(): boolean {
    return Boolean(this.socket?.connected);
  }

  on<E extends keyof LiveSocketServerEvents>(
    event: E,
    handler: LiveSocketServerEvents[E],
  ): void {
    this.socket?.on(event, handler as any);
  }

  off<E extends keyof LiveSocketServerEvents>(
    event: E,
    handler?: LiveSocketServerEvents[E],
  ): void {
    if (!this.socket) {
      return;
    }

    if (handler) {
      this.socket.off(event, handler as any);
      return;
    }

    this.socket.off(event);
  }

  emit<E extends keyof LiveSocketClientEvents>(
    event: E,
    ...args: Parameters<LiveSocketClientEvents[E]>
  ): void {
    this.socket?.emit(event, ...args);
  }

  disconnect(): void {
    if (!this.socket) {
      return;
    }

    this.socket.removeAllListeners();
    this.socket.disconnect();
    this.socket = null;
  }
}

export const liveSessionSocket = new LiveSessionSocketService();
