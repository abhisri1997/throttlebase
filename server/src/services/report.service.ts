/**
 * Reporting what riders make: posts, comments, riders, rides, routes and
 * groups (launch readiness E3). A report waits in the moderation queue; each
 * one is also the grievance record for the IT Rules 2021.
 */
import { query } from "../config/db.js";
import type { CreateReportInput, ReportTargetType } from "../schemas/report.schemas.js";
import { blockRider } from "./notifications.service.js";
import {
  isOverdue,
  outcomeFor,
  reportReference,
  resolveDueAt,
  type ReportStatus,
} from "../core/moderation/grievance.js";

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
  report: { id: string; reference: string; status: string; created_at: string; resolve_due_at: string };
  /** True when this reporter already had an open report on the same thing. */
  alreadyReported: boolean;
  blocked: boolean;
}

export const createReport = async (reporterId: string, input: CreateReportInput): Promise<ReportOutcome> => {
  const owner = await query(OWNER_SQL[input.target_type], [input.target_id]);
  if (owner.rows.length === 0) throw new ReportError("not_found");
  const ownerId = owner.rows[0].owner_id as string | null;
  if (ownerId === reporterId) throw new ReportError("own_content");

  // Acknowledged on receipt: the rider gets a reference straight away, and a
  // notice they can come back to (IT Rules 2021, Rule 3(2)).
  const receivedAt = new Date();
  const inserted = await query(
    `INSERT INTO reports (reporter_id, target_type, target_id, target_rider_id, reason, note,
                          created_at, acknowledged_at, resolve_due_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $7, $8)
     ON CONFLICT (reporter_id, target_type, target_id) WHERE status = 'open' DO NOTHING
     RETURNING id, status, created_at, resolve_due_at`,
    [
      reporterId,
      input.target_type,
      input.target_id,
      ownerId,
      input.reason,
      input.note || null,
      receivedAt,
      resolveDueAt(receivedAt, input.reason),
    ],
  );

  const row =
    inserted.rows[0] ??
    (
      await query(
        `SELECT id, status, created_at, resolve_due_at FROM reports
          WHERE reporter_id = $1 AND target_type = $2 AND target_id = $3 AND status = 'open'`,
        [reporterId, input.target_type, input.target_id],
      )
    ).rows[0];
  const report = { ...row, reference: reportReference(row.id as string) };

  if (inserted.rows.length > 0) {
    await query(
      `INSERT INTO notifications (rider_id, type, title, body, data) VALUES ($1, 'report_received', $2, $3, $4::jsonb)`,
      [
        reporterId,
        `We received your report ${report.reference}`,
        "We review reports within 24 hours and resolve them within 7 days. You'll hear back here, and you can follow it in Settings → Your reports.",
        JSON.stringify({ report_id: report.id, reference: report.reference }),
      ],
    );
  }

  // Blocking goes through the usual path, which also ends follows both ways.
  const blocked = Boolean(input.also_block && ownerId && (await blockRider(reporterId, ownerId)));

  return { report, alreadyReported: inserted.rows.length === 0, blocked };
};

export interface MyReport {
  id: string;
  reference: string;
  target_type: string;
  reason: string;
  status: ReportStatus;
  outcome: string;
  created_at: string;
  resolve_due_at: string | null;
  resolved_at: string | null;
  overdue: boolean;
}

/** The rider's own reports, newest first, with where each one stands. */
export const listMyReports = async (reporterId: string, now = new Date()): Promise<MyReport[]> => {
  const result = await query(
    `SELECT id, target_type, reason, status, created_at, resolve_due_at, resolved_at
       FROM reports
      WHERE reporter_id = $1
      ORDER BY created_at DESC
      LIMIT 100`,
    [reporterId],
  );
  return result.rows.map((row) => ({
    id: row.id,
    reference: reportReference(row.id),
    target_type: row.target_type,
    reason: row.reason,
    status: row.status,
    outcome: outcomeFor(row.status as ReportStatus),
    created_at: row.created_at,
    resolve_due_at: row.resolve_due_at,
    resolved_at: row.resolved_at,
    overdue: row.resolve_due_at ? isOverdue(row.status as ReportStatus, new Date(row.resolve_due_at), now) : false,
  }));
};
