import { query } from "../config/db.js";
import { enqueueRewardsRecompute } from "./jobs.service.js";

interface TracePoint {
  rider_id: string;
  latitude: string | number;
  longitude: string | number;
  altitude_m: string | number | null;
  speed_kmh: string | number | null;
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

const EARTH_RADIUS_METERS = 6371000;

const toNumber = (value: unknown): number | null => {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
};

const roundTo = (value: number, precision: number): number => {
  const factor = Math.pow(10, precision);
  return Math.round(value * factor) / factor;
};

const haversineMeters = (
  fromLat: number,
  fromLng: number,
  toLat: number,
  toLng: number,
): number => {
  const toRad = (deg: number) => (deg * Math.PI) / 180;

  const dLat = toRad(toLat - fromLat);
  const dLng = toRad(toLng - fromLng);
  const lat1 = toRad(fromLat);
  const lat2 = toRad(toLat);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_METERS * c;
};

const computeForRider = (
  riderId: string,
  points: TracePoint[],
): RiderStatsComputation => {
  if (points.length === 0) {
    return {
      riderId,
      totalDistanceKm: 0,
      totalTimeSec: 0,
      movingTimeSec: 0,
      avgSpeedKmh: 0,
      maxSpeedKmh: 0,
      elevationGainM: 0,
      elevationLossM: 0,
      caloriesBurned: 0,
    };
  }

  let totalDistanceMeters = 0;
  let movingTimeSec = 0;
  let maxSpeedKmh = 0;
  let elevationGainM = 0;
  let elevationLossM = 0;

  const firstPoint = points[0]!;
  const lastPoint = points[points.length - 1]!;
  const firstTs = new Date(firstPoint.recorded_at).getTime();
  const lastTs = new Date(lastPoint.recorded_at).getTime();
  const totalTimeSec = Math.max(0, Math.round((lastTs - firstTs) / 1000));

  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1]!;
    const curr = points[i]!;

    const prevLat = toNumber(prev.latitude);
    const prevLng = toNumber(prev.longitude);
    const currLat = toNumber(curr.latitude);
    const currLng = toNumber(curr.longitude);

    const prevTs = new Date(prev.recorded_at).getTime();
    const currTs = new Date(curr.recorded_at).getTime();
    const dtSec = Math.round((currTs - prevTs) / 1000);

    if (
      prevLat === null ||
      prevLng === null ||
      currLat === null ||
      currLng === null ||
      dtSec <= 0
    ) {
      continue;
    }

    const segmentMeters = haversineMeters(prevLat, prevLng, currLat, currLng);
    if (Number.isFinite(segmentMeters) && segmentMeters >= 0) {
      totalDistanceMeters += segmentMeters;
    }

    const currSpeed = toNumber(curr.speed_kmh) ?? 0;
    const prevSpeed = toNumber(prev.speed_kmh) ?? 0;
    const measuredSpeed = Math.max(currSpeed, prevSpeed);
    if (measuredSpeed > maxSpeedKmh) {
      maxSpeedKmh = measuredSpeed;
    }

    const estimatedSpeed =
      dtSec > 0 ? segmentMeters / 1000 / (dtSec / 3600) : 0;

    if (Math.max(measuredSpeed, estimatedSpeed) > 2) {
      movingTimeSec += dtSec;
    }

    const prevAlt = toNumber(prev.altitude_m);
    const currAlt = toNumber(curr.altitude_m);
    if (prevAlt !== null && currAlt !== null) {
      const delta = currAlt - prevAlt;

      // Guard against noisy altitude spikes from device GPS.
      if (Math.abs(delta) <= 150) {
        if (delta > 0) {
          elevationGainM += delta;
        } else if (delta < 0) {
          elevationLossM += Math.abs(delta);
        }
      }
    }
  }

  const totalDistanceKm = totalDistanceMeters / 1000;
  const avgSpeedKmh =
    movingTimeSec > 0 ? totalDistanceKm / (movingTimeSec / 3600) : 0;

  const caloriesBurned = Math.max(
    0,
    Math.round(totalDistanceKm * 35 + movingTimeSec / 60),
  );

  return {
    riderId,
    totalDistanceKm: roundTo(totalDistanceKm, 2),
    totalTimeSec,
    movingTimeSec,
    avgSpeedKmh: roundTo(avgSpeedKmh, 2),
    maxSpeedKmh: roundTo(maxSpeedKmh, 2),
    elevationGainM: roundTo(elevationGainM, 2),
    elevationLossM: roundTo(elevationLossM, 2),
    caloriesBurned,
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
         COALESCE(SUM(total_time_sec), 0)::bigint AS total_ride_time_sec,
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
): Promise<{ rideId: string; ridersProcessed: number }> => {
  const tracesResult = await query(
    `SELECT rider_id, latitude, longitude, altitude_m, speed_kmh, recorded_at
     FROM gps_traces
     WHERE ride_id = $1
     ORDER BY rider_id ASC, recorded_at ASC`,
    [rideId],
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
