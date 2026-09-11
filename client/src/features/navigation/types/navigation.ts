export type LatLng = {
  latitude: number;
  longitude: number;
};

export type NavigationStep = {
  /** The maneuver without Google's note, e.g. "Turn left onto MG Rd". */
  instruction: string;
  /** Road the maneuver leads onto, when Google names one. */
  roadName?: string | null;
  /** Google's secondary line, e.g. "Pass by Indian Oil (on the left)". */
  note?: string | null;
  distanceMeters: number;
  durationSeconds: number;
  start: LatLng;
  end: LatLng;
  maneuver?: string;
  /** Leg this step belongs to. */
  legIndex: number;
};

/**
 * One stretch of a route between two consecutive waypoints. Google returns one
 * per stopover; each keeps its own polyline and steps so a trip can be
 * followed leg by leg.
 */
export type RouteLeg = {
  index: number;
  start: LatLng;
  end: LatLng;
  polyline: LatLng[];
  steps: NavigationStep[];
  distanceMeters: number;
  durationSeconds: number;
  /**
   * Only present when Google returned traffic — which it does solely for
   * requests without stopover waypoints.
   */
  durationInTrafficSeconds?: number;
};

export type NavigationRoute = {
  source: "directions" | "fallback";
  /**
   * Why this is a straight-line fallback rather than a real route — a
   * Directions status such as OVER_QUERY_LIMIT, or NETWORK_ERROR / NO_API_KEY.
   */
  errorStatus?: string;
  legs: RouteLeg[];
  polyline: LatLng[];
  /**
   * Google's overview polyline, still encoded. Kept because Places
   * search-along-route accepts only the encoded form, and re-encoding the
   * decoded points would be lossy work we already have the answer to.
   * Absent on fallback (straight-line) routes.
   */
  encodedPolyline?: string;
  steps: NavigationStep[];
  totalDistanceMeters: number;
  totalDurationSeconds: number;
  estimatedTrafficDurationSeconds?: number;
  selectedAlternativeIndex?: number;
  alternativeCount?: number;
};

/** One GPS reading, as navigation consumes it. */
export type NavigationFix = {
  coordinate: LatLng;
  accuracyMeters: number | null;
  /** GPS course over ground in degrees from north; null when unknown. */
  headingDegrees: number | null;
  speedMps: number | null;
  /** Epoch milliseconds. */
  timestamp: number;
};

export type RideParticipantView = {
  riderId: string;
  displayName: string;
  role: "captain" | "co_captain" | "member";
  isOnline: boolean;
};
