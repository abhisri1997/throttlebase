/**
 * The time a ride is shown at. Before it goes live, when it's scheduled;
 * once it has, when it actually began (the rider's own start). A ride
 * scheduled for 02:00 and started at 01:50 reads "Started ... 1:50 AM".
 */
export interface RideTimes {
  scheduled_at: string;
  actual_started_at?: string | null;
}

export interface RideTime {
  at: Date;
  isActual: boolean;
}

export const rideTimeOf = (ride: RideTimes): RideTime => {
  const actual = ride.actual_started_at ? new Date(ride.actual_started_at) : null;
  return actual && Number.isFinite(actual.getTime())
    ? { at: actual, isActual: true }
    : { at: new Date(ride.scheduled_at), isActual: false };
};

/** "Started Thursday, October 1 at 1:50 AM", or just the scheduled time. */
export const rideTimeLabel = (ride: RideTimes, format: (date: Date) => string): string => {
  const time = rideTimeOf(ride);
  return time.isActual ? `Started ${format(time.at)}` : format(time.at);
};
