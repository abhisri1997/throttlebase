import { query } from "../config/db.js";
import { ridingStats } from "../core/ride-progress/ridingStats.js";
import type { TrackSample } from "../utils/track.js";
import { enqueueRewardsRecompute } from "./jobs.service.js";

interface TracePoint {
  rider_id: string;
  latitude: string | number;
  longitude: string | number;
  altitude_m: string | number | null;
  speed_kmh: string | number | null;
  accuracy_m: string | number | null;
  recorded_at: string;
}

interface RiderStatsComputation {
  riderId: string;
  totalDistanceKm: number;
  totalTimeSec: number;
  movingTimeSec: number;
  avgSpeedKmh: number;
  maxSpeedKmh: number;
  elevationGainM: number;
  elevationLossM: number;
  caloriesBurned: number;
}

/** Null stays null: Number(null) is 0, which would read a missing speed as standing still. */
const toNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
};

const roundTo = (value: number, precision: number): number => {
  const factor = Math.pow(10, precision);
  return Math.round(value * factor) / factor;
};

const toTrackSample = (point: TracePoint): TrackSample => ({
  lat: Number(point.latitude),
  lng: Number(point.longitude),
  accuracyM: toNumber(point.accuracy_m),
  capturedAtMs: new Date(point.recorded_at).getTime(),
  speedKmh: toNumber(point.speed_kmh),
});

/** Altitude is never sent over the socket today, so this stays zero until it is. */
const elevationChange = (points: readonly TracePoint[]): { gainM: number; lossM: number } => {
  let gainM = 0;
  let lossM = 0;
  for (let i = 1; i < points.length; i++) {
    const prevAlt = toNumber(points[i - 1]!.altitude_m);
    const currAlt = toNumber(points[i]!.altitude_m);
    if (prevAlt === null || currAlt === null) continue;
    const delta = currAlt - prevAlt;
    // Guard against noisy altitude spikes from device GPS.
    if (Math.abs(delta) > 150) continue;
    if (delta > 0) gainM += delta;
    else lossM -= delta;
  }
  return { gainM, lossM };
};

/**
 * Distance, moving time and speeds count only the riding: a stop, and any
 * walking at it, is neither (see core/ride-progress/segmentRide). Total time
 * is still first fix to last.
 */
const computeForRider = (
  riderId: string,
  points: TracePoint[],
): RiderStatsComputation => {
  const firstPoint = points[0];
  const lastPoint = points[points.length - 1];
  const totalTimeSec =
    firstPoint && lastPoint
      ? Math.max(
          0,
          Math.round(
            (new Date(lastPoint.recorded_at).getTime() - new Date(firstPoint.recorded_at).getTime()) / 1000,
          ),
        )
      : 0;
  const riding = ridingStats(points.map(toTrackSample));
  const elevation = elevationChange(points);

  return {
    riderId,
    totalDistanceKm: riding.distanceKm,
    totalTimeSec,
    movingTimeSec: riding.ridingTimeS,
    avgSpeedKmh: riding.avgSpeedKmh,
    maxSpeedKmh: riding.maxSpeedKmh,
    elevationGainM: roundTo(elevation.gainM, 2),
    elevationLossM: roundTo(elevation.lossM, 2),
    caloriesBurned: Math.max(0, Math.round(riding.distanceKm * 35 + riding.ridingTimeS / 60)),
  };
};

const upsertRiderStats = async (
  rideId: string,
  stats: RiderStatsComputation,
): Promise<void> => {
  await query(
    `INSERT INTO ride_history_stats (
       ride_id,
       rider_id,
       total_distance_km,
       total_time_sec,
       moving_time_sec,
       avg_speed_kmh,
       max_speed_kmh,
       elevation_gain_m,
       elevation_loss_m,
       calories_burned,
       computed_at
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, now())
     ON CONFLICT (ride_id, rider_id)
     DO UPDATE SET
       total_distance_km = EXCLUDED.total_distance_km,
       total_time_sec = EXCLUDED.total_time_sec,
       moving_time_sec = EXCLUDED.moving_time_sec,
       avg_speed_kmh = EXCLUDED.avg_speed_kmh,
       max_speed_kmh = EXCLUDED.max_speed_kmh,
       elevation_gain_m = EXCLUDED.elevation_gain_m,
       elevation_loss_m = EXCLUDED.elevation_loss_m,
       calories_burned = EXCLUDED.calories_burned,
       computed_at = now()`,
    [
      rideId,
      stats.riderId,
      stats.totalDistanceKm,
      stats.totalTimeSec,
      stats.movingTimeSec,
      stats.avgSpeedKmh,
      stats.maxSpeedKmh,
      stats.elevationGainM,
      stats.elevationLossM,
      stats.caloriesBurned,
    ],
  );
};

const refreshRiderAggregateTotals = async (riderId: string): Promise<void> => {
  await query(
    `UPDATE riders
     SET total_distance_km = COALESCE(stats.total_distance_km, 0),
         total_ride_time_sec = COALESCE(stats.total_ride_time_sec, 0),
         total_rides = COALESCE(stats.total_rides, 0)
     FROM (
       SELECT
         $1::uuid AS rider_id,
         COALESCE(SUM(total_distance_km), 0)::numeric(10,2) AS total_distance_km,
         -- Riding time, not first fix to last: stops aren't riding.
         COALESCE(SUM(moving_time_sec), 0)::bigint AS total_ride_time_sec,
         COUNT(*)::int AS total_rides
       FROM ride_history_stats
       WHERE rider_id = $1
     ) AS stats
     WHERE riders.id = stats.rider_id`,
    [riderId],
  );
};

export const recomputeRideHistoryStats = async (
  rideId: string,
  /** Recompute only this rider — one rider finishing while the rest still ride. */
  riderId?: string,
): Promise<{ rideId: string; ridersProcessed: number }> => {
  // The track comes from the live session's sampled positions — what the
  // navigation screen and background tracker actually broadcast. `gps_traces`
  // is a separate upload path no client writes to, so reading it found nothing.
  // Altitude is never sent over the socket, so elevation stays unknown.
  //
  // A rider's ride ends at their finish. An arrival is dated to reaching the
  // destination, so samples from time spent there are left out.
  const tracesResult = await query(
    `SELECT s.rider_id,
            ST_Y(s.location::geometry) AS latitude,
            ST_X(s.location::geometry) AS longitude,
            NULL::numeric AS altitude_m,
            s.speed_kmh,
            s.accuracy_m,
            s.captured_at AS recorded_at
     FROM ride_live_location_samples s
     JOIN ride_live_sessions ls ON ls.id = s.session_id
     LEFT JOIN ride_live_presence p
       ON p.session_id = s.session_id AND p.rider_id = s.rider_id
     WHERE ls.ride_id = $1
       AND ($2::uuid IS NULL OR s.rider_id = $2::uuid)
       AND (p.finished_at IS NULL OR s.captured_at <= p.finished_at)
     ORDER BY s.rider_id ASC, s.captured_at ASC`,
    [rideId, riderId ?? null],
  );

  const traces = tracesResult.rows as TracePoint[];
  if (traces.length === 0) {
    return { rideId, ridersProcessed: 0 };
  }

  const grouped = new Map<string, TracePoint[]>();
  for (const row of traces) {
    if (!grouped.has(row.rider_id)) {
      grouped.set(row.rider_id, []);
    }
    grouped.get(row.rider_id)!.push(row);
  }

  for (const [riderId, points] of grouped.entries()) {
    const stats = computeForRider(riderId, points);
    await upsertRiderStats(rideId, stats);
    await refreshRiderAggregateTotals(riderId);
    await enqueueRewardsRecompute(riderId, "stats-recompute");
  }

  return { rideId, ridersProcessed: grouped.size };
};
