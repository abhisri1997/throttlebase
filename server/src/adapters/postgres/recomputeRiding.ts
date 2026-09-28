/**
 * Recomputes what riding means for rides already recorded: routes saved from
 * a ride lose any walking at a stop and put the stop where the bike was, and
 * ride stats count riding time and riding distance only.
 *
 *   npm run rides:recompute-riding            # shows what would change
 *   npm run rides:recompute-riding -- --apply # writes it
 *
 * It uses the app's database pool, so from a laptop against Supabase set
 * DATABASE_SSL_REJECT_UNAUTHORIZED=false, as the deployed services do.
 * No Google calls: routes keep the names they have.
 */
import pool, { query } from "../../config/db.js";
import { rebuildRouteFromRide } from "../../services/route-from-ride.service.js";
import { recomputeRideHistoryStats } from "../../services/stats.service.js";

const minutes = (seconds: number): string => `${(seconds / 60).toFixed(1)} min`;

const recomputeRoutes = async (apply: boolean): Promise<void> => {
  const routes = await query(`SELECT id, title FROM routes WHERE ride_id IS NOT NULL ORDER BY created_at`);
  let changed = 0;
  for (const route of routes.rows) {
    const rebuild = await rebuildRouteFromRide(String(route.id), { dryRun: !apply });
    if (!rebuild) {
      console.log(`  ${route.title}: no track to rebuild from, left as it is`);
      continue;
    }
    changed += 1;
    console.log(
      `  ${route.title}: ${rebuild.before.distanceKm} km, ${minutes(rebuild.before.durationS)}  →  ` +
        `${rebuild.after.distanceKm} km, ${minutes(rebuild.after.durationS)}`,
    );
  }
  console.log(`${apply ? "Rebuilt" : "Would rebuild"} ${changed} of ${routes.rows.length} routes.\n`);
};

const recomputeStats = async (apply: boolean): Promise<void> => {
  const rides = await query(
    `SELECT DISTINCT r.id, r.title
     FROM rides r
     JOIN ride_live_sessions ls ON ls.ride_id = r.id
     JOIN ride_live_location_samples s ON s.session_id = ls.id
     WHERE r.status = 'completed'`,
  );
  if (!apply) {
    console.log(`Would recompute riding stats for ${rides.rows.length} completed rides.`);
    return;
  }
  for (const ride of rides.rows) {
    const { ridersProcessed } = await recomputeRideHistoryStats(String(ride.id));
    console.log(`  ${ride.title}: ${ridersProcessed} riders`);
  }
  console.log(`Recomputed riding stats for ${rides.rows.length} completed rides.`);
};

const main = async (): Promise<void> => {
  const apply = process.argv.includes("--apply");
  console.log("Routes saved from rides:");
  await recomputeRoutes(apply);
  console.log("Ride stats:");
  await recomputeStats(apply);
  if (!apply) console.log("\nRe-run with --apply to write.");
};

main()
  .catch((error: unknown) => {
    console.error("❌ recomputing riding failed:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
