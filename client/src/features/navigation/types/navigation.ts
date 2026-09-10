export type LatLng = {
  latitude: number;
  longitude: number;
};

export type NavigationStep = {
  instruction: string;
  distanceMeters: number;
  durationSeconds: number;
  start: LatLng;
  end: LatLng;
  maneuver?: string;
};

export type NavigationRoute = {
  source: "directions" | "fallback";
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

export type RideParticipantView = {
  riderId: string;
  displayName: string;
  role: "captain" | "co_captain" | "member";
  isOnline: boolean;
};
