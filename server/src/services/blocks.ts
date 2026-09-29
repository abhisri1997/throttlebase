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

/**
 * SQL that is true when `viewer` may see what `owner` made. A null viewer (a
 * caller that has none) sees everything the other clauses allow.
 */
export const visibleToViewerSql = (viewer: string, owner: string): string =>
  `(${viewer}::uuid IS NULL OR NOT ${blockedBetweenSql(`${viewer}::uuid`, owner)})`;

export const isBlockedBetween = async (a: string, b: string): Promise<boolean> => {
  const result = await query(`SELECT ${blockedBetweenSql("$1::uuid", "$2::uuid")} AS blocked`, [a, b]);
  return Boolean(result.rows[0]?.blocked);
};
