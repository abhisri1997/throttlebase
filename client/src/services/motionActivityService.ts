/**
 * Keeps the phone's latest motion reading while the rider is riding, so each
 * location fix can say whether they were on the bike or on foot.
 *
 * The sensors only report while the app is open, and the rider may say no to
 * motion access; the ride carries on exactly the same either way.
 */
import * as ExpoLocation from "expo-location";
import { Alert, AppState, Platform, type NativeEventSubscription } from "react-native";
import { dominantActivity, freshActivity, type MotionActivityLabel, type MotionReading } from "./motionReading";

const WHY_MOTION = "Motion access lets ThrottleBase tell a stop from a traffic jam. Your ride goes on either way.";

let _latest: MotionReading | null = null;
let _subscription: ExpoLocation.LocationSubscription | null = null;
let _appStateSubscription: NativeEventSubscription | null = null;
let _starting: Promise<void> | null = null;
// Bumped on stop, so a watch still starting when the ride ends lets go at once.
let _generation = 0;
// Asked once per app run: a rider who said no isn't asked again every ride.
let _hasAsked = false;

const logMotionError = (action: string) => (error: unknown) =>
  console.warn(`[Motion] could not ${action}:`, error instanceof Error ? error.message : error);

const explainWhy = (): Promise<void> =>
  new Promise((resolve) => {
    Alert.alert("Motion & fitness", WHY_MOTION, [{ text: "Continue", onPress: () => resolve() }], {
      onDismiss: () => resolve(),
    });
  });

const hasMotionPermission = async (): Promise<boolean> => {
  const current = await ExpoLocation.getMotionActivityPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain || _hasAsked) return false;

  _hasAsked = true;
  await explainWhy();
  return (await ExpoLocation.requestMotionActivityPermissionsAsync()).granted;
};

const watch = async (): Promise<void> => {
  const generation = _generation;
  if (!(await hasMotionPermission())) return;

  const subscription = await ExpoLocation.watchMotionActivityAsync(
    (reading) => {
      const activity = dominantActivity(reading);
      _latest = activity ? { activity, receivedAtMs: Date.now(), endedAtMs: null } : null;
    },
    (message) => console.warn("[Motion] updates failed:", message),
  );
  if (generation === _generation) {
    _subscription = subscription;
    // The sensors stop reporting in the background, so the last reading says
    // nothing about what the rider does after that (getting off, say).
    _appStateSubscription = AppState.addEventListener("change", (state) => {
      if (state !== "active" && _latest && _latest.endedAtMs === null) {
        _latest = { ..._latest, endedAtMs: Date.now() };
      }
    });
  } else {
    subscription.remove();
  }
};

/** Starts listening, asking for motion access the first time. Never throws. */
export const startMotionWatch = (): Promise<void> => {
  if (_subscription || Platform.OS === "web") return Promise.resolve();
  _starting ??= watch()
    .catch(logMotionError("start motion updates"))
    .finally(() => {
      _starting = null;
    });
  return _starting;
};

export const stopMotionWatch = (): void => {
  _generation += 1;
  _subscription?.remove();
  _subscription = null;
  _appStateSubscription?.remove();
  _appStateSubscription = null;
  _latest = null;
};

/** The reading to send with a fix taken at this time, if there is a trustworthy one. */
export const activityAt = (fixAtMs: number): MotionActivityLabel | undefined => freshActivity(_latest, fixAtMs);
