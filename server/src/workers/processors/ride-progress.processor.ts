import {
  autoFinishArrivedRiders,
  endIdleRides,
} from "../../services/ride-progress.service.js";

/**
 * The time-driven half of per-rider progress: nothing arrives on a socket to
 * say ten minutes have passed at the destination, or that a ride went quiet.
 */
export const processRideProgressSweep = async (): Promise<Record<string, unknown>> => {
  const autoFinish = await autoFinishArrivedRiders();
  const idle = await endIdleRides();

  return {
    processor: "ride-progress-sweep",
    autoFinishedRiders: autoFinish.finished,
    completedRides: autoFinish.closedRides,
    idleRidesEnded: idle.ended,
    handledAt: new Date().toISOString(),
  };
};
