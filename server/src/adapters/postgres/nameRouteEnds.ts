/**
 * Names existing routes' ends by area ("HSR Layout, Bengaluru"), for routes
 * saved before routes named their own ends. Run once after migration 033:
 *
 *   npm run routes:name-ends            # shows what would change
 *   npm run routes:name-ends -- --apply # writes it
 *
 * It uses the app's database pool, so from a laptop against Supabase set
 * DATABASE_SSL_REJECT_UNAUTHORIZED=false, as the deployed services do.
 *
 * Uses the same cached, budgeted Google lookup as saving a route.
 */
import pool, { query } from "../../config/db.js";
import { planRouteEndNames, type RouteEnds } from "../../core/routes/routeEndNames.js";
import { nameAreaWithGoogle } from "../../services/route-from-ride.service.js";

const loadRouteEnds = async (): Promise<RouteEnds[]> => {
  const result = await query(
    `SELECT id, start_name, end_name,
            ST_Y(start_point::geometry) AS start_lat, ST_X(start_point::geometry) AS start_lng,
            ST_Y(end_point::geometry) AS end_lat, ST_X(end_point::geometry) AS end_lng
     FROM routes
     ORDER BY created_at`,
  );
  return result.rows.map((row) => ({
    id: String(row.id),
    startName: row.start_name ?? null,
    endName: row.end_name ?? null,
    start: row.start_lat != null ? { lat: Number(row.start_lat), lng: Number(row.start_lng) } : null,
    end: row.end_lat != null ? { lat: Number(row.end_lat), lng: Number(row.end_lng) } : null,
  }));
};

const main = async (): Promise<void> => {
  const apply = process.argv.includes("--apply");
  const routes = await loadRouteEnds();
  const updates = await planRouteEndNames(routes, nameAreaWithGoogle);

  for (const update of updates) {
    const before = routes.find((route) => route.id === update.id);
    console.log(`${update.id}`);
    console.log(`  start: ${before?.startName ?? "(none)"}  →  ${update.startName ?? "(none)"}`);
    console.log(`  end:   ${before?.endName ?? "(none)"}  →  ${update.endName ?? "(none)"}`);
  }

  if (!apply) {
    console.log(`\n${updates.length} of ${routes.length} routes would change. Re-run with --apply to write.`);
    return;
  }

  for (const update of updates) {
    await query(`UPDATE routes SET start_name = $2, end_name = $3 WHERE id = $1`, [
      update.id,
      update.startName,
      update.endName,
    ]);
  }
  console.log(`\nRenamed the ends of ${updates.length} of ${routes.length} routes.`);
};

main()
  .catch((error: unknown) => {
    console.error("❌ naming route ends failed:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
