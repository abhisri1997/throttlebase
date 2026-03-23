export const JOB_TYPES = {
  RIDE_STATS_RECOMPUTE: "ride_stats.recompute",
} as const;

export type JobType = (typeof JOB_TYPES)[keyof typeof JOB_TYPES];

export type JobStatus =
  | "pending"
  | "processing"
  | "completed"
  | "failed"
  | "cancelled";

export type JobPayload = Record<string, unknown>;
export type JobResult = Record<string, unknown>;

export interface QueueJob {
  id: string;
  type: string;
  status: JobStatus;
  payload: JobPayload;
  result: JobResult | null;
  error_message: string | null;
  attempt: number;
  max_attempts: number;
  scheduled_at: string;
  started_at: string | null;
  completed_at: string | null;
  locked_until: string | null;
  locked_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface EnqueueJobInput {
  type: JobType | string;
  payload?: JobPayload;
  scheduledAt?: Date;
  maxAttempts?: number;
}

export interface LeaseJobsInput {
  workerId: string;
  batchSize?: number;
  lockSeconds?: number;
}
