import { useEffect, useState } from "react";
import { elapsedSecondsAt } from "../core/ridingStats";

/**
 * A ride's elapsed time that ticks on the phone between server readings.
 * `baseSeconds` was true at `readAtMs`.
 */
export const useElapsedSeconds = (baseSeconds: number, readAtMs: number, tickMs: number): number => {
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    setNowMs(Date.now());
    const timer = setInterval(() => setNowMs(Date.now()), tickMs);
    return () => clearInterval(timer);
  }, [baseSeconds, readAtMs, tickMs]);

  return elapsedSecondsAt(baseSeconds, readAtMs, nowMs);
};
