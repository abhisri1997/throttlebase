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

const KMH_PER_MPS = 3.6;

/** Expo reports unknown speed, course or accuracy as null or a negative number. */
const finiteNonNegative = (value: number | null | undefined): number | undefined =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;

const toLocationUpdate = (rideId: string, position: ExpoLocation.LocationObject) => {
  const speedMps = finiteNonNegative(position.coords.speed);
  const heading = finiteNonNegative(position.coords.heading);

  return {
    rideId,
    lon: position.coords.longitude,
    lat: position.coords.latitude,
    speed_kmh: speedMps === undefined ? undefined : speedMps * KMH_PER_MPS,
    // The server accepts [0, 360); some devices report exactly 360 for north.
    heading_deg: heading === undefined ? undefined : heading % 360,
    accuracy_m: finiteNonNegative(position.coords.accuracy),
    captured_at: new Date(position.timestamp).toISOString(),
  };
};

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

  // The OS batches fixes while the app is backgrounded. Send all of them, oldest
  // first, so the ride history keeps the road between batches — the server
  // decides which ones are worth keeping as track samples.
  const rideId = _activeRideId;
  [...locations]
    .sort((left, right) => left.timestamp - right.timestamp)
    .forEach((position) => {
      liveSessionSocket.emit("location:update", toLocationUpdate(rideId, position));
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

      liveSessionSocket.emit("location:update", toLocationUpdate(_activeRideId, position));
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

  if (!isRunning) {
    return;
  }

  try {
    await ExpoLocation.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
  } catch (error: unknown) {
    // After a JS reload Android can still report the updates as started while
    // the task itself is gone ("TaskNotFoundException") — there is nothing
    // left to stop. Anything else is worth a warning, not a crash.
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes("TaskNotFoundException")) {
      console.warn("[BgLocation] could not stop background updates:", message);
    }
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
