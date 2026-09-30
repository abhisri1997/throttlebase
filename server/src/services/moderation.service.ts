/**
 * The moderation queue and the actions taken on it (launch readiness E3,
 * docs/launch-readiness/plans/ugc-safety.md). Admin only: the routes check
 * the role in the access token.
 *
 * Each action runs in one transaction: the change itself, closing the open
 * reports on the thing, the notice to the rider who made it, and the audit
 * entry in security_events. Either all of it happens or none of it does.
 */
import { query } from "../config/db.js";
import {
  noticeFor,
  refuseAction,
  reportStatusAfter,
  type ActionRefusal,
  type ModerationAction,
  type ModerationTargetType,
} from "../core/moderation/actions.js";
import { outcomeFor, reportReference, type ReportStatus } from "../core/moderation/grievance.js";
import { inTransaction } from "./ride-roster.service.js";
import type { SqlClient } from "./ride-progress.repository.js";

const REFUSAL_MESSAGES: Readonly<Record<ActionRefusal | "not_found", string>> = {
  not_found: "That can't be found.",
  not_removable: "Only posts, comments and routes can be removed. Suspend the rider instead.",
  no_owner: "There's no rider to act on: it was kept after its creator left.",
  own_account: "You can't suspend your own account.",
  already_suspended: "That rider is already suspended.",
  not_suspended: "That rider isn't suspended.",
  reason_required: "Give a reason of at least a few words. It's kept in the audit log.",
};

export class ModerationError extends Error {
  constructor(readonly kind: ActionRefusal | "not_found") {
    super(REFUSAL_MESSAGES[kind]);
    this.name = "ModerationError";
  }
}

/** The thing, whose it is, and a short preview for the queue. */
const TARGET_SQL: Readonly<Record<ModerationTargetType, string>> = {
  post: `SELECT rider_id AS owner_id, left(content, 280) AS preview, removed_at FROM posts WHERE id = $1`,
  comment: `SELECT rider_id AS owner_id, left(content, 280) AS preview, removed_at FROM comments WHERE id = $1`,
  route: `SELECT creator_id AS owner_id, title AS preview, removed_at FROM routes WHERE id = $1`,
  ride: `SELECT captain_id AS owner_id, title AS preview, NULL::timestamptz AS removed_at FROM rides WHERE id = $1`,
  rider: `SELECT id AS owner_id, display_name AS preview, NULL::timestamptz AS removed_at FROM riders WHERE id = $1`,
  group: `SELECT created_by AS owner_id, name AS preview, NULL::timestamptz AS removed_at FROM groups WHERE id = $1`,
};

const REMOVE_SQL: Readonly<Partial<Record<ModerationTargetType, string>>> = {
  post: `UPDATE posts SET removed_at = now(), removed_by = $2, removal_reason = $3 WHERE id = $1 AND removed_at IS NULL`,
  comment: `UPDATE comments SET removed_at = now(), removed_by = $2, removal_reason = $3 WHERE id = $1 AND removed_at IS NULL`,
  route: `UPDATE routes SET removed_at = now(), removed_by = $2, removal_reason = $3 WHERE id = $1 AND removed_at IS NULL`,
};

export interface QueueItem {
  target_type: ModerationTargetType;
  target_id: string;
  preview: string | null;
  removed: boolean;
  owner_id: string | null;
  owner_name: string | null;
  owner_suspended: boolean;
  report_count: number;
  reasons: string[];
  notes: string[];
  first_reported_at: string;
  last_reported_at: string;
  /** The earliest deadline among its open reports (IT Rules 2021, Rule 3(2)). */
  resolve_due_at: string | null;
  overdue: boolean;
}

/** Open reports, one row per reported thing, the soonest due first. */
export const listQueue = async (limit = 100): Promise<QueueItem[]> => {
  const grouped = await query(
    `SELECT rp.target_type, rp.target_id, rp.target_rider_id AS owner_id,
            o.display_name AS owner_name, (o.suspended_at IS NOT NULL) AS owner_suspended,
            count(*)::int AS report_count,
            array_agg(DISTINCT rp.reason) AS reasons,
            COALESCE(
              (array_agg(rp.note ORDER BY rp.created_at DESC) FILTER (WHERE rp.note IS NOT NULL))[1:3],
              '{}'
            ) AS notes,
            min(rp.created_at) AS first_reported_at,
            max(rp.created_at) AS last_reported_at,
            min(rp.resolve_due_at) AS resolve_due_at,
            COALESCE(min(rp.resolve_due_at) < now(), false) AS overdue
       FROM reports rp
       LEFT JOIN riders o ON o.id = rp.target_rider_id
      WHERE rp.status = 'open'
      GROUP BY rp.target_type, rp.target_id, rp.target_rider_id, o.display_name, o.suspended_at
      ORDER BY min(rp.resolve_due_at) ASC NULLS LAST, min(rp.created_at) ASC
      LIMIT $1`,
    [limit],
  );

  return Promise.all(
    grouped.rows.map(async (row) => {
      const target = await query(TARGET_SQL[row.target_type as ModerationTargetType], [row.target_id]);
      const found = target.rows[0];
      return {
        ...row,
        preview: (found?.preview as string | null | undefined) ?? null,
        removed: Boolean(found?.removed_at),
      } as QueueItem;
    }),
  );
};

/** Riders under suspension, most recent first, for lifting it. */
export const listSuspended = async () => {
  const result = await query(
    `SELECT r.id, r.display_name, r.suspended_at, r.suspension_reason, m.display_name AS suspended_by_name
       FROM riders r LEFT JOIN riders m ON m.id = r.suspended_by
      WHERE r.suspended_at IS NOT NULL
      ORDER BY r.suspended_at DESC`,
  );
  return result.rows;
};

export interface ActionInput {
  target_type: ModerationTargetType;
  target_id: string;
  action: ModerationAction;
  reason: string;
}

export interface ActionOutcome {
  action: ModerationAction;
  reportsClosed: number;
  notified: boolean;
}

const lockTarget = async (client: SqlClient, targetType: ModerationTargetType, targetId: string) => {
  const target = await client.query(`${TARGET_SQL[targetType]} FOR UPDATE`, [targetId]);
  if (target.rows.length === 0) throw new ModerationError("not_found");
  const ownerId = (target.rows[0].owner_id as string | null) ?? null;
  const owner = ownerId
    ? await client.query(`SELECT suspended_at IS NOT NULL AS suspended FROM riders WHERE id = $1 FOR UPDATE`, [ownerId])
    : null;
  return { ownerId, ownerSuspended: Boolean(owner?.rows[0]?.suspended) };
};

export const takeAction = async (moderatorId: string, input: ActionInput): Promise<ActionOutcome> =>
  inTransaction(async (client) => {
    const { ownerId, ownerSuspended } = await lockTarget(client, input.target_type, input.target_id);
    const refusal = refuseAction(
      input.action,
      { targetType: input.target_type, ownerId, ownerSuspended, moderatorId },
      input.reason,
    );
    if (refusal) throw new ModerationError(refusal);
    const reason = input.reason.trim();
    let changed = true;

    switch (input.action) {
      case "remove": {
        // Already removed, it stays as it was and its maker isn't told
        // twice: closing its reports is all that's left to do.
        const removed = await client.query(REMOVE_SQL[input.target_type]!, [input.target_id, moderatorId, reason]);
        changed = (removed.rowCount ?? 0) > 0;
        break;
      }
      case "suspend":
        await client.query(
          `UPDATE riders SET suspended_at = now(), suspended_by = $2, suspension_reason = $3 WHERE id = $1`,
          [ownerId, moderatorId, reason],
        );
        // Signed out everywhere: no refresh works, so every device is out
        // within an access token's 15 minutes.
        await client.query(`UPDATE sessions SET revoked_at = now() WHERE rider_id = $1 AND revoked_at IS NULL`, [ownerId]);
        break;
      case "lift_suspension":
        await client.query(
          `UPDATE riders SET suspended_at = NULL, suspended_by = NULL, suspension_reason = NULL WHERE id = $1`,
          [ownerId],
        );
        break;
      case "dismiss":
        break;
    }

    const status = reportStatusAfter(input.action);
    const closed = status
      ? await client.query(
          `UPDATE reports SET status = $3, resolved_at = now(), resolved_by = $4
            WHERE target_type = $1 AND target_id = $2 AND status = 'open'
            RETURNING id, reporter_id`,
          [input.target_type, input.target_id, status, moderatorId],
        )
      : { rowCount: 0, rows: [] as Array<{ id: string; reporter_id: string }> };

    // Each reporter hears how their report was resolved, never what was done
    // to whom or who else reported it.
    for (const report of closed.rows) {
      const reference = reportReference(report.id as string);
      await client.query(
        `INSERT INTO notifications (rider_id, type, title, body, data) VALUES ($1, 'report_resolved', $2, $3, $4::jsonb)`,
        [
          report.reporter_id,
          `Update on your report ${reference}`,
          outcomeFor(status as ReportStatus),
          JSON.stringify({ report_id: report.id, reference, status }),
        ],
      );
    }

    const notice = changed ? noticeFor(input.action, input.target_type, reason) : null;
    if (notice && ownerId) {
      await client.query(
        `INSERT INTO notifications (rider_id, type, title, body, data) VALUES ($1, $2, $3, $4, $5::jsonb)`,
        [
          ownerId,
          `moderation_${input.action}`,
          notice.title,
          notice.body,
          JSON.stringify({ target_type: input.target_type, target_id: input.target_id }),
        ],
      );
    }

    await client.query(
      `INSERT INTO security_events (actor_id, subject_id, event, target_type, target_id, reason, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
      [
        moderatorId,
        ownerId,
        `moderation.${input.action}`,
        input.target_type,
        input.target_id,
        reason,
        JSON.stringify({ reports_closed: closed.rowCount ?? 0 }),
      ],
    );

    return { action: input.action, reportsClosed: closed.rowCount ?? 0, notified: Boolean(notice && ownerId) };
  });
