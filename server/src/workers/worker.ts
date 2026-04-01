import cron, { type ScheduledTask } from "node-cron";
import { randomUUID } from "crypto";
import {
  WORKER_BATCH_SIZE,
  WORKER_LOCK_SECONDS,
  WORKER_POLL_CRON,
  getRetryDelaySeconds,
} from "../queue/job-config.js";
import { JOB_TYPES, type QueueJob } from "../queue/job-types.js";
import {
  completeJob,
  failJob,
  leaseJobs,
  recoverExpiredLocks,
} from "../queue/queue.js";
import { processRideStatsRecompute } from "./processors/ride-stats.processor.js";
import {
  processLiveSessionEnded,
  processLiveSessionStarted,
} from "./processors/live-session.processor.js";
import { processLiveIncidentReported } from "./processors/live-notification.processor.js";
import {
  processLiveIncidentEscalation,
  processLivePresenceSweep,
} from "./processors/live-ops.processor.js";
import {
  processNotificationPush,
  processNotificationEmail,
} from "./processors/notification-delivery.processor.js";
import {
  enqueueLiveIncidentEscalationJob,
  enqueueLivePresenceSweepJob,
} from "../services/jobs.service.js";

type JobProcessor = (
  payload: Record<string, unknown>,
) => Promise<Record<string, unknown>>;

const workerId = `worker-${randomUUID()}`;
let tickInProgress = false;

const processors: Record<string, JobProcessor> = {
  [JOB_TYPES.RIDE_STATS_RECOMPUTE]: processRideStatsRecompute,
  [JOB_TYPES.LIVE_SESSION_STARTED]: processLiveSessionStarted,
  [JOB_TYPES.LIVE_SESSION_ENDED]: processLiveSessionEnded,
  [JOB_TYPES.LIVE_INCIDENT_REPORTED]: processLiveIncidentReported,
  [JOB_TYPES.LIVE_PRESENCE_SWEEP]: processLivePresenceSweep,
  [JOB_TYPES.LIVE_INCIDENT_ESCALATE]: processLiveIncidentEscalation,
  [JOB_TYPES.NOTIFICATION_PUSH]: processNotificationPush,
  [JOB_TYPES.NOTIFICATION_EMAIL]: processNotificationEmail,
};

const scheduleOperationalJobs = async (): Promise<void> => {
  try {
    await Promise.all([
      enqueueLivePresenceSweepJob(),
      enqueueLiveIncidentEscalationJob(),
    ]);
  } catch (error) {
    console.error("[worker] Failed to enqueue operational live jobs:", error);
  }
};

const processJob = async (job: QueueJob): Promise<void> => {
  const processor = processors[job.type];
  if (!processor) {
    await failJob(
      job.id,
      workerId,
      `No processor registered for job type: ${job.type}`,
      0,
    );
    return;
  }

  try {
    const result = await processor(job.payload || {});
    const completed = await completeJob(job.id, workerId, result);

    if (!completed) {
      console.warn(
        `[worker] Job ${job.id} was not completed (lease no longer owned).`,
      );
    }
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unknown worker processing error";
    const nextAttempt = job.attempt + 1;
    const retryDelay = getRetryDelaySeconds(nextAttempt);

    const failed = await failJob(job.id, workerId, message, retryDelay);
    if (!failed) {
      console.warn(`[worker] Job ${job.id} could not be marked as failed.`);
      return;
    }

    if (failed.status === "failed") {
      console.error(
        `[worker] Job ${job.id} exhausted retries (${failed.attempt}/${failed.max_attempts}).`,
      );
      return;
    }

    console.warn(
      `[worker] Job ${job.id} failed (${failed.attempt}/${failed.max_attempts}). Retrying in ${retryDelay}s.`,
    );
  }
};

const runTick = async (): Promise<void> => {
  if (tickInProgress) {
    return;
  }

  tickInProgress = true;
  try {
    await scheduleOperationalJobs();

    const recovered = await recoverExpiredLocks();
    if (recovered > 0) {
      console.warn(`[worker] Recovered ${recovered} expired job lock(s).`);
    }

    const jobs = await leaseJobs({
      workerId,
      batchSize: WORKER_BATCH_SIZE,
      lockSeconds: WORKER_LOCK_SECONDS,
    });

    for (const job of jobs) {
      await processJob(job);
    }
  } catch (error) {
    console.error("[worker] Tick execution failed:", error);
  } finally {
    tickInProgress = false;
  }
};

const startWorker = async (): Promise<void> => {
  console.log(`[worker] Starting worker ${workerId}`);
  console.log(`[worker] Poll schedule: ${WORKER_POLL_CRON}`);

  await runTick();

  const schedule: ScheduledTask = cron.schedule(WORKER_POLL_CRON, () => {
    void runTick();
  });

  const shutdown = () => {
    console.log(`[worker] Shutting down worker ${workerId}`);
    schedule.stop();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
};

startWorker().catch((error) => {
  console.error("[worker] Fatal startup error:", error);
  process.exit(1);
});
