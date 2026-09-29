import { io, type Socket } from "socket.io-client";
import { resolveBaseUrl } from "../adapters/http/baseUrl";
import { keepSocketAuthenticated } from "../core/auth/socketAuth";
import { currentAccessToken } from "./socketToken";

const getBaseUrl = resolveBaseUrl;

export type RideJoinedEvent = {
  rideId: string;
  riderId: string;
};

export type RideStopRequestedEvent = {
  rideId: string;
  stop: {
    id: string;
    ride_id: string;
    rider_id: string;
    location_name: string | null;
    status: "pending" | "approved" | "rejected";
    created_at: string;
  };
};

export type RideStopUpdatedEvent = {
  rideId: string;
  stopId: string;
  status: "approved" | "rejected";
};

export type RideErrorEvent = {
  error: string;
  code: number;
};

export type RideSocketServerEvents = {
  "ride:subscribed": (event: { rideId: string }) => void;
  "ride:joined": (event: RideJoinedEvent) => void;
  "ride:stop_requested": (event: RideStopRequestedEvent) => void;
  "ride:stop_updated": (event: RideStopUpdatedEvent) => void;
  /** Someone left, or the captain changed. */
  "ride:roster_changed": (event: { rideId: string }) => void;
  "ride:error": (event: RideErrorEvent) => void;
};

export type RideSocketClientEvents = {
  "ride:subscribe": (payload: { rideId: string }) => void;
  "ride:unsubscribe": (payload: { rideId: string }) => void;
};

type RideSocket = Socket<RideSocketServerEvents, RideSocketClientEvents>;

class RideSocketService {
  private socket: RideSocket | null = null;
  private stopAuthenticating: (() => void) | null = null;

  /** Same token handling as the live-session socket. */
  connect(): RideSocket {
    if (this.socket) {
      if (!this.socket.connected) {
        this.socket.connect();
      }
      return this.socket;
    }

    const socket: RideSocket = io(`${getBaseUrl()}/rides`, {
      transports: ["websocket"],
      autoConnect: false,
    });
    this.stopAuthenticating = keepSocketAuthenticated(socket, currentAccessToken);

    socket.connect();
    this.socket = socket;
    return socket;
  }

  subscribe(rideId: string): void {
    this.socket?.emit("ride:subscribe", { rideId });
  }

  unsubscribe(rideId: string): void {
    this.socket?.emit("ride:unsubscribe", { rideId });
  }

  on<E extends keyof RideSocketServerEvents>(
    event: E,
    handler: RideSocketServerEvents[E],
  ): void {
    this.socket?.on(event, handler as any);
  }

  off<E extends keyof RideSocketServerEvents>(
    event: E,
    handler?: RideSocketServerEvents[E],
  ): void {
    if (!this.socket) return;
    if (handler) {
      this.socket.off(event, handler as any);
    } else {
      this.socket.off(event);
    }
  }

  isConnected(): boolean {
    return Boolean(this.socket?.connected);
  }

  disconnect(): void {
    if (!this.socket) return;
    this.stopAuthenticating?.();
    this.stopAuthenticating = null;
    this.socket.removeAllListeners();
    this.socket.disconnect();
    this.socket = null;
  }
}

export const rideSocket = new RideSocketService();
