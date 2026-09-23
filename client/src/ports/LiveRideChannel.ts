/**
 * The realtime transport for live rides.
 *
 * This port wraps the CURRENT socket implementation unchanged. It exists so
 * the transport is replaceable later without touching screens — not because
 * anything about it is changing now.
 */
export interface LiveRideChannel {
  connect(accessToken: string): void;
  disconnect(): void;
  isConnected(): boolean;
}
