/**
 * The rider's speed as the navigation screen shows it: whole km/h, 0 when
 * standing (GPS reports a few km/h of drift at rest), and "--" with no fix
 * or no speed from the device.
 */
const KMH_PER_MPS = 3.6;
/** Below this, the reading is GPS drift, not movement. */
const STANDING_KMH = 3;

export const speedometerLabel = (speedMps: number | null | undefined): string => {
  if (speedMps === null || speedMps === undefined || !Number.isFinite(speedMps) || speedMps < 0) return "--";
  const kmh = speedMps * KMH_PER_MPS;
  return kmh < STANDING_KMH ? "0" : String(Math.round(kmh));
};

/** Over the posted limit, once the limit is known. Rounded as shown, so the colour matches the number. */
export const isOverLimit = (speedMps: number | null | undefined, limitKmh: number | null | undefined): boolean => {
  if (limitKmh === null || limitKmh === undefined) return false;
  const shown = Number(speedometerLabel(speedMps));
  return Number.isFinite(shown) && shown > limitKmh;
};
