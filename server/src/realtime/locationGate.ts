/**
 * Which live location updates are let through, and which of those become
 * track samples. A dev simulation feeds the ride's track like real GPS does,
 * so a simulated ride is recorded — distance, history and profile totals —
 * without anyone leaving the desk.
 */
import type { SampleReservation, SampleThrottle, TrackPoint } from "./sampleThrottle.js";

/**
 * How long a simulated fix keeps a rider's real GPS suppressed. Long enough to
 * cover the gap between simulated updates, short enough that closing the
 * simulation hands the rider straight back to their own device.
 */
export const SIMULATION_TAKEOVER_MS = 30_000;

export interface LocationAdmissionInput {
  riderId: string;
  sampleKey: string;
  point: TrackPoint;
  isSimulated: boolean;
  nowMs: number;
}

export type LocationAdmission =
  | { isAccepted: false }
  /** A null reservation means broadcast the update but store no sample. */
  | { isAccepted: true; reservation: SampleReservation | null };

export interface LocationGate {
  admit: (input: LocationAdmissionInput) => LocationAdmission;
  /** Forgets a rider's simulation takeover. */
  clearRider: (riderId: string) => void;
}

export const createLocationGate = (throttle: SampleThrottle): LocationGate => {
  const simulatingSinceByRider = new Map<string, number>();

  return {
    admit: ({ riderId, sampleKey, point, isSimulated, nowMs }) => {
      // A simulated ride takes over the rider's position while it runs. The
      // device keeps reporting real GPS from the background tracker, and
      // letting both through makes the marker — and the track — flick
      // between the two.
      if (isSimulated) {
        simulatingSinceByRider.set(riderId, nowMs);
      } else {
        const simulatingSince = simulatingSinceByRider.get(riderId);
        if (simulatingSince !== undefined) {
          if (nowMs - simulatingSince < SIMULATION_TAKEOVER_MS) {
            return { isAccepted: false };
          }
          simulatingSinceByRider.delete(riderId);
        }
      }

      return { isAccepted: true, reservation: throttle.reserve(sampleKey, point) };
    },

    clearRider: (riderId) => {
      simulatingSinceByRider.delete(riderId);
    },
  };
};
