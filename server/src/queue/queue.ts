import pool, { query } from "../config/db.js";
import type { EnqueueJobInput, LeaseJobsInput, QueueJob } from "./job-types.js";

const JOB_COLUMNS = `
  id, type, status, payload, result, error_message,
  attempt, max_attempts, scheduled_at, started_at,
  completed_at, locked_until, locked_by, created_at, updated_at
`;

const JOB_COLUMNS_LEASE = `
  j.id, j.type, j.status, j.payload, j.result, j.error_message,
  j.attempt, j.max_attempts, j.scheduled_at, j.started_at,
  j.completed_at, j.locked_until, j.locked_by, j.created_at, j.updated_at
`;

const toQueueJob = (row: any): QueueJob => {
  return {
    id: row.id,
    type: row.type,
    status: row.status,
    payload: (row.payload || {}) as Record<string, unknown>,
    result: row.result as Record<string, unknown> | null,
    error_message: row.error_message,
    attempt: row.attempt,
    max_attempts: row.max_attempts,
    scheduled_at: row.scheduled_at,
    started_at: row.started_at,
    completed_at: row.completed_at,
    locked_until: row.locked_until,
    locked_by: row.locked_by,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
};

export const enqueueJob = async (input: EnqueueJobInput): Promise<QueueJob> => {
  const scheduledAt = input.scheduledAt ?? new Date();
  const maxAttempts = input.maxAttempts ?? 3;

  const result = await query(
    `INSERT INTO jobs (type, payload, scheduled_at, max_attempts)
     VALUES ($1, $2::jsonb, $3, $4)
     RETURNING ${JOB_COLUMNS}`,
    [
      input.type,
      JSON.stringify(input.payload || {}),
      scheduledAt.toISOString(),
      maxAttempts,
    ],
  );

  return toQueueJob(result.rows[0]);
};

export const recoverExpiredLocks = async (): Promise<number> => {
  const result = await query(
    `UPDATE jobs
     SET status = 'pending',
         locked_by = NULL,
         locked_until = NULL,
         scheduled_at = now()
     WHERE status = 'processing'
       AND locked_until IS NOT NULL
       AND locked_until < now()
     RETURNING id`,
  );

  return result.rowCount ?? 0;
};

export const leaseJobs = async (input: LeaseJobsInput): Promise<QueueJob[]> => {
  const batchSize = input.batchSize ?? 10;
  const lockSeconds = input.lockSeconds ?? 120;
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const leaseResult = await client.query(
      `WITH candidates AS (
         SELECT id
         FROM jobs
         WHERE status = 'pending'
           AND scheduled_at <= now()
           AND (locked_until IS NULL OR locked_until < now())
         ORDER BY scheduled_at ASC, created_at ASC
         FOR UPDATE SKIP LOCKED
         LIMIT $1
       )
       UPDATE jobs j
       SET status = 'processing',
           started_at = now(),
           locked_by = $2,
           locked_until = now() + ($3 || ' seconds')::interval
       FROM candidates c
       WHERE j.id = c.id
       RETURNING ${JOB_COLUMNS_LEASE}`,
      [batchSize, input.workerId, lockSeconds],
    );

    await client.query("COMMIT");
    return leaseResult.rows.map(toQueueJob);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

export const completeJob = async (
  jobId: string,
  workerId: string,
  resultPayload: Record<string, unknown> = {},
): Promise<boolean> => {
  const result = await query(
    `UPDATE jobs
     SET status = 'completed',
         completed_at = now(),
         result = $3::jsonb,
         error_message = NULL,
         locked_by = NULL,
         locked_until = NULL
     WHERE id = $1
       AND status = 'processing'
       AND locked_by = $2
     RETURNING id`,
    [jobId, workerId, JSON.stringify(resultPayload)],
  );

  return (result.rowCount ?? 0) > 0;
};

export const failJob = async (
  jobId: string,
  workerId: string,
  errorMessage: string,
  retryDelaySeconds: number,
): Promise<QueueJob | null> => {
  const result = await query(
    `UPDATE jobs
     SET attempt = attempt + 1,
         status = CASE WHEN attempt + 1 >= max_attempts THEN 'failed' ELSE 'pending' END,
         error_message = $3,
         scheduled_at = CASE
           WHEN attempt + 1 >= max_attempts THEN scheduled_at
           ELSE now() + ($4 || ' seconds')::interval
         END,
         completed_at = CASE WHEN attempt + 1 >= max_attempts THEN now() ELSE completed_at END,
         locked_by = NULL,
         locked_until = NULL
     WHERE id = $1
       AND status = 'processing'
       AND locked_by = $2
     RETURNING ${JOB_COLUMNS}`,
    [jobId, workerId, errorMessage, retryDelaySeconds],
  );

  if (!result.rows.length) {
    return null;
  }

  return toQueueJob(result.rows[0]);
};
