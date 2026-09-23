/**
 * On-device ride storage.
 *
 * Serves two cases that both need rides to exist before the server knows
 * about them: guest mode, where there is no account yet, and offline
 * recording, where there is no connection. Both are uploaded later.
 */
export interface LocalRide {
  localId: string;
  startedAt: number;
  endedAt: number | null;
  samples: LocalGpsSample[];
}

export interface LocalGpsSample {
  lat: number;
  lon: number;
  capturedAt: number;
  speedKmh: number | null;
  headingDeg: number | null;
  accuracyM: number | null;
}

export interface LocalRideStore {
  saveRide(ride: LocalRide): Promise<void>;
  listRides(): Promise<LocalRide[]>;
  removeRide(localId: string): Promise<void>;

  /** Samples captured while offline or signed out, awaiting upload. */
  queueSamples(rideId: string, samples: LocalGpsSample[]): Promise<void>;
  takeQueuedSamples(rideId: string): Promise<LocalGpsSample[]>;
  pendingRideIds(): Promise<string[]>;
}
