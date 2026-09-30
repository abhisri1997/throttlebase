/**
 * Reporting what riders make: posts, comments, riders, rides, routes and
 * groups (launch readiness E3). A report waits in the moderation queue; each
 * one is also the grievance record for the IT Rules 2021.
 */
import { query } from "../config/db.js";
import type { CreateReportInput, ReportTargetType } from "../schemas/report.schemas.js";
import { blockRider } from "./notifications.service.js";

export type ReportRefusal = "not_found" | "own_content";

const REFUSAL_MESSAGES: Readonly<Record<ReportRefusal, string>> = {
  not_found: "That can't be found. It may already have been removed.",
  own_content: "You can't report something you made. You can edit or delete it instead.",
};

export class ReportError extends Error {
  constructor(readonly kind: ReportRefusal) {
    super(REFUSAL_MESSAGES[kind]);
    this.name = "ReportError";
  }
}

/** Who made each kind of thing, so the queue can see a rider's whole record. */
const OWNER_SQL: Readonly<Record<ReportTargetType, string>> = {
  post: `SELECT rider_id AS owner_id FROM posts WHERE id = $1`,
  comment: `SELECT rider_id AS owner_id FROM comments WHERE id = $1`,
  rider: `SELECT id AS owner_id FROM riders WHERE id = $1 AND deleted_at IS NULL`,
  ride: `SELECT captain_id AS owner_id FROM rides WHERE id = $1`,
  // A route kept for the community after its creator left is still reportable.
  route: `SELECT creator_id AS owner_id FROM routes WHERE id = $1`,
  group: `SELECT created_by AS owner_id FROM groups WHERE id = $1`,
};

export interface ReportOutcome {
  report: { id: string; status: string; created_at: string };
  /** True when this reporter already had an open report on the same thing. */
  alreadyReported: boolean;
  blocked: boolean;
}

export const createReport = async (reporterId: string, input: CreateReportInput): Promise<ReportOutcome> => {
  const owner = await query(OWNER_SQL[input.target_type], [input.target_id]);
  if (owner.rows.length === 0) throw new ReportError("not_found");
  const ownerId = owner.rows[0].owner_id as string | null;
  if (ownerId === reporterId) throw new ReportError("own_content");

  const inserted = await query(
    `INSERT INTO reports (reporter_id, target_type, target_id, target_rider_id, reason, note)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (reporter_id, target_type, target_id) WHERE status = 'open' DO NOTHING
     RETURNING id, status, created_at`,
    [reporterId, input.target_type, input.target_id, ownerId, input.reason, input.note || null],
  );

  const report =
    inserted.rows[0] ??
    (
      await query(
        `SELECT id, status, created_at FROM reports
          WHERE reporter_id = $1 AND target_type = $2 AND target_id = $3 AND status = 'open'`,
        [reporterId, input.target_type, input.target_id],
      )
    ).rows[0];

  // Blocking goes through the usual path, which also ends follows both ways.
  const blocked = Boolean(input.also_block && ownerId && (await blockRider(reporterId, ownerId)));

  return { report, alreadyReported: inserted.rows.length === 0, blocked };
};
