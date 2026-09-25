/**
 * Development builds only: keeps React Native's `performance` buffer from
 * growing without bound.
 *
 * React 19's development build records a `performance.measure` for every
 * component render (its component performance track), and React Native keeps
 * every entry in a JS-side buffer that nothing clears. On the navigation
 * screen, which re-renders every second while riding, that was ~570 entries a
 * second — over a million after half an hour and gigabytes of heap, until
 * Android killed the app for low memory. Production React records none of
 * these, and nothing in the app reads them, so clearing them is safe.
 */

const CLEAR_INTERVAL_MS = 5_000;

interface PerformanceBuffer {
  clearMarks?: () => void;
  clearMeasures?: () => void;
}

interface Timer {
  setInterval: (callback: () => void, ms: number) => unknown;
  clearInterval: (handle: unknown) => void;
}

interface GuardInput {
  isDev: boolean;
  performance: PerformanceBuffer | undefined;
  timer: Timer;
}

/** Starts clearing the buffer periodically; returns a function that stops it. */
export const installPerformanceBufferGuard = ({
  isDev,
  performance,
  timer,
}: GuardInput): (() => void) => {
  if (!isDev) return () => {};

  const handle = timer.setInterval(() => {
    performance?.clearMarks?.();
    performance?.clearMeasures?.();
  }, CLEAR_INTERVAL_MS);

  return () => timer.clearInterval(handle);
};
