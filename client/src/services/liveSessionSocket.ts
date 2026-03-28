import { io, type Socket } from "socket.io-client";
import { Platform } from "react-native";
import Constants from "expo-constants";

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
  reason: string | null;
};

export type LiveSocketServerEvents = {
  "session:state": (event: LiveSessionStateEvent) => void;
  "presence:update": (event: PresenceUpdateEvent) => void;
  "location:broadcast": (event: LocationBroadcastEvent) => void;
  "incident:created": (event: IncidentCreatedEvent) => void;
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

const getBaseUrl = (): string => {
  const debuggerHost = Constants.expoConfig?.hostUri;
  const localIp = debuggerHost?.split(":")[0];

  if (Platform.OS === "android" && !debuggerHost) {
    return "http://10.0.2.2:5001";
  }

  if (localIp) {
    return `http://${localIp}:5001`;
  }

  return "http://localhost:5001";
};

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
