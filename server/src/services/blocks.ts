/**
 * Blocking, and what it hides.
 *
 * A block works both ways. Once either rider blocks the other, neither sees
 * the other's posts, comments, reviews, routes, rides or profile, neither can
 * find the other in search or mention them, and neither can follow, like,
 * comment on, or join a ride led by the other. Blocking also ends any follow
 * between them. Whoever is blocked is not told: what is hidden reads as not
 * found.
 *
 * A group ride both are already on is left alone. Hiding one rider's live
 * position from the others on the road would make the ride less safe; the
 * rider who blocked can leave the ride instead (launch readiness E3).
 *
 * A suspended rider's content is hidden from everyone the same way, for as
 * long as the suspension lasts (services/moderation.service.ts).
 */
import { query } from "../config/db.js";

/**
 * SQL that is true when the riders at the two SQL expressions have blocked
 * each other, either way. Both arguments are trusted SQL (column names or
 * parameter placeholders), never user input.
 */
export const blockedBetweenSql = (a: string, b: string): string =>
  `EXISTS (SELECT 1 FROM blocked_riders blk
            WHERE (blk.blocker_id = ${a} AND blk.blocked_id = ${b})
               OR (blk.blocker_id = ${b} AND blk.blocked_id = ${a}))`;

/** SQL that is true when the rider at `owner` is suspended. */
export const ownerSuspendedSql = (owner: string): string =>
  `EXISTS (SELECT 1 FROM riders sus WHERE sus.id = ${owner} AND sus.suspended_at IS NOT NULL)`;

/**
 * SQL that is true when `viewer` may see what `owner` made: the owner isn't
 * suspended, and neither has blocked the other. A null viewer (a caller that
 * has none) sees everything else the other clauses allow.
 */
export const visibleToViewerSql = (viewer: string, owner: string): string =>
  `(NOT ${ownerSuspendedSql(owner)} AND (${viewer}::uuid IS NULL OR NOT ${blockedBetweenSql(`${viewer}::uuid`, owner)}))`;

export const isBlockedBetween = async (a: string, b: string): Promise<boolean> => {
  const result = await query(`SELECT ${blockedBetweenSql("$1::uuid", "$2::uuid")} AS blocked`, [a, b]);
  return Boolean(result.rows[0]?.blocked);
};

/** True when `viewer` may not see `owner`: blocked either way, or suspended. */
export const isHiddenFrom = async (viewer: string, owner: string): Promise<boolean> => {
  const result = await query(`SELECT NOT ${visibleToViewerSql("$1", "$2::uuid")} AS hidden`, [viewer, owner]);
  return Boolean(result.rows[0]?.hidden);
};
