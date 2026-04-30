/**
 * Background Location Service
 *
 * Tracks rider location globally — even when user navigates away from ride
 * screens or puts app in background. Uses expo-task-manager + expo-location
 * background location task.
 *
 * Lifecycle:
 *   1. App detects rider is participant of an active ride → startTracking(rideId, token)
 *   2. Location updates emitted to live-session socket every ~5s
 *   3. Ride ends / rider leaves / app logs out → stopTracking()
 */

import * as ExpoLocation from "expo-location";
import * as TaskManager from "expo-task-manager";
import { Platform } from "react-native";
import { liveSessionSocket } from "./liveSessionSocket";

const BACKGROUND_LOCATION_TASK = "THROTTLEBASE_BG_LOCATION";

// ── Module-level state ──────────────────────────────────────────────────────
let _activeRideId: string | null = null;
let _authToken: string | null = null;
let _foregroundSubscription: ExpoLocation.LocationSubscription | null = null;
let _heartbeatTimer: ReturnType<typeof setInterval> | null = null;

// ── Background task definition ──────────────────────────────────────────────
// Must be called at module scope (top level), not inside a component.
TaskManager.defineTask(BACKGROUND_LOCATION_TASK, async ({ data, error }) => {
  if (error) {
    console.warn("[BgLocation] task error:", error.message);
    return;
  }

  if (!_activeRideId) {
    return;
  }

  const { locations } = data as { locations: ExpoLocation.LocationObject[] };
  if (!locations || locations.length === 0) {
    return;
  }

  // Ensure socket connected
  if (!liveSessionSocket.isConnected() && _authToken) {
    liveSessionSocket.connect(_authToken);
  }

  const position = locations[locations.length - 1]; // most recent
  const speedMs = position.coords.speed;
  const heading = position.coords.heading;
  const accuracy = position.coords.accuracy;

  liveSessionSocket.emit("location:update", {
    rideId: _activeRideId,
    lon: position.coords.longitude,
    lat: position.coords.latitude,
    speed_kmh:
      typeof speedMs === "number" &&
      Number.isFinite(speedMs) &&
      speedMs >= 0
        ? speedMs * 3.6
        : undefined,
    heading_deg:
      typeof heading === "number" &&
      Number.isFinite(heading) &&
      heading >= 0
        ? heading
        : undefined,
    accuracy_m:
      typeof accuracy === "number" &&
      Number.isFinite(accuracy) &&
      accuracy >= 0
        ? accuracy
        : undefined,
    captured_at: new Date(position.timestamp).toISOString(),
  });
});

// ── Foreground tracking (runs while app is active) ──────────────────────────
const startForegroundTracking = async (): Promise<void> => {
  if (_foregroundSubscription || Platform.OS === "web") {
    return;
  }

  const permission = await ExpoLocation.requestForegroundPermissionsAsync();
  if (permission.status !== "granted") {
    return;
  }

  _foregroundSubscription = await ExpoLocation.watchPositionAsync(
    {
      accuracy: ExpoLocation.Accuracy.Balanced,
      timeInterval: 5000,
      distanceInterval: 10,
    },
    (position) => {
      if (!_activeRideId) {
        return;
      }

      const speedMs = position.coords.speed;
      const heading = position.coords.heading;
      const accuracy = position.coords.accuracy;

      liveSessionSocket.emit("location:update", {
        rideId: _activeRideId,
        lon: position.coords.longitude,
        lat: position.coords.latitude,
        speed_kmh:
          typeof speedMs === "number" &&
          Number.isFinite(speedMs) &&
          speedMs >= 0
            ? speedMs * 3.6
            : undefined,
        heading_deg:
          typeof heading === "number" &&
          Number.isFinite(heading) &&
          heading >= 0
            ? heading
            : undefined,
        accuracy_m:
          typeof accuracy === "number" &&
          Number.isFinite(accuracy) &&
          accuracy >= 0
            ? accuracy
            : undefined,
        captured_at: new Date(position.timestamp).toISOString(),
      });
    },
  );
};

const stopForegroundTracking = (): void => {
  _foregroundSubscription?.remove();
  _foregroundSubscription = null;
};

// ── Background tracking (runs when app is minimized) ────────────────────────
const startBackgroundTracking = async (): Promise<void> => {
  if (Platform.OS === "web") {
    return;
  }

  const { status } = await ExpoLocation.requestBackgroundPermissionsAsync();
  if (status !== "granted") {
    console.warn("[BgLocation] background permission denied");
    return;
  }

  const isRunning = await ExpoLocation.hasStartedLocationUpdatesAsync(
    BACKGROUND_LOCATION_TASK,
  ).catch(() => false);

  if (isRunning) {
    return;
  }

  await ExpoLocation.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
    accuracy: ExpoLocation.Accuracy.Balanced,
    timeInterval: 5000,
    distanceInterval: 10,
    deferredUpdatesInterval: 5000,
    showsBackgroundLocationIndicator: true,
    foregroundService: {
      notificationTitle: "ThrottleBase Ride Active",
      notificationBody: "Sharing your live location with the group",
      notificationColor: "#22c55e",
    },
  });
};

const stopBackgroundTracking = async (): Promise<void> => {
  if (Platform.OS === "web") {
    return;
  }

  const isRunning = await ExpoLocation.hasStartedLocationUpdatesAsync(
    BACKGROUND_LOCATION_TASK,
  ).catch(() => false);

  if (isRunning) {
    await ExpoLocation.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
  }
};

// ── Heartbeat (keeps presence alive while tracking) ─────────────────────────
const startHeartbeat = (): void => {
  stopHeartbeat();

  _heartbeatTimer = setInterval(() => {
    if (!_activeRideId) {
      return;
    }

    liveSessionSocket.emit("presence:heartbeat", {
      rideId: _activeRideId,
      ts: new Date().toISOString(),
    });
  }, 10000);
};

const stopHeartbeat = (): void => {
  if (_heartbeatTimer) {
    clearInterval(_heartbeatTimer);
    _heartbeatTimer = null;
  }
};

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Start tracking for an active ride. Connects socket, starts foreground +
 * background location updates, and begins heartbeat.
 */
export const startTracking = async (
  rideId: string,
  token: string,
): Promise<void> => {
  // Already tracking this ride
  if (_activeRideId === rideId) {
    return;
  }

  // Stop any previous tracking
  await stopTracking();

  _activeRideId = rideId;
  _authToken = token;

  // Connect socket and join room
  liveSessionSocket.connect(token);
  liveSessionSocket.emit("session:join", { rideId });

  // Start location tracking
  await startForegroundTracking();
  await startBackgroundTracking();
  startHeartbeat();

  console.log("[BgLocation] tracking started for ride:", rideId);
};

/**
 * Stop all tracking. Leaves room, stops location tasks, clears heartbeat.
 */
export const stopTracking = async (): Promise<void> => {
  stopHeartbeat();
  stopForegroundTracking();
  await stopBackgroundTracking();

  if (_activeRideId) {
    console.log("[BgLocation] tracking stopped for ride:", _activeRideId);
  }

  _activeRideId = null;
  // Keep _authToken — might need for reconnect
};

/**
 * Get currently tracked ride ID (null if not tracking).
 */
export const getActiveTrackingRideId = (): string | null => _activeRideId;

/**
 * Check if background location tracking is currently active.
 */
export const isTracking = (): boolean => _activeRideId !== null;
