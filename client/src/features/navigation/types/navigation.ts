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
  steps: NavigationStep[];
  totalDistanceMeters: number;
  totalDurationSeconds: number;
};

export type RideParticipantView = {
  riderId: string;
  displayName: string;
  role: "captain" | "co_captain" | "member";
  isOnline: boolean;
};
