export const WORKER_POLL_CRON = "*/10 * * * * *";
export const WORKER_BATCH_SIZE = 20;
export const WORKER_LOCK_SECONDS = 120;
const FALLBACK_RETRY_DELAY_SECONDS = 1800;

const RETRY_BACKOFF_SECONDS = [30, 120, 600, 1800] as const;

export const getRetryDelaySeconds = (nextAttempt: number): number => {
  if (nextAttempt <= 1) {
    return RETRY_BACKOFF_SECONDS[0] ?? FALLBACK_RETRY_DELAY_SECONDS;
  }

  const idx = Math.min(nextAttempt - 1, RETRY_BACKOFF_SECONDS.length - 1);
  return RETRY_BACKOFF_SECONDS[idx] ?? FALLBACK_RETRY_DELAY_SECONDS;
};
