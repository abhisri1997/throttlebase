import test from "node:test";
import assert from "node:assert/strict";
import { installPerformanceBufferGuard } from "./performanceBufferGuard";

const fakePerformance = () => {
  const calls: string[] = [];
  return {
    calls,
    performance: {
      clearMarks: () => calls.push("marks"),
      clearMeasures: () => calls.push("measures"),
    },
  };
};

const manualTimer = () => {
  let tick: (() => void) | null = null;
  let cleared = false;
  return {
    setInterval: (fn: () => void) => {
      tick = fn;
      return 1;
    },
    clearInterval: () => {
      cleared = true;
    },
    tick: () => tick?.(),
    isCleared: () => cleared,
  };
};

test("clears marks and measures on every interval in a development build", () => {
  const { calls, performance } = fakePerformance();
  const timer = manualTimer();

  installPerformanceBufferGuard({ isDev: true, performance, timer });
  timer.tick();
  timer.tick();

  assert.deepEqual(calls, ["marks", "measures", "marks", "measures"]);
});

test("does nothing in a production build", () => {
  const { calls, performance } = fakePerformance();
  const timer = manualTimer();

  installPerformanceBufferGuard({ isDev: false, performance, timer });
  timer.tick();

  assert.deepEqual(calls, []);
});

test("tolerates a runtime without the performance API", () => {
  const timer = manualTimer();

  installPerformanceBufferGuard({ isDev: true, performance: undefined, timer });

  assert.doesNotThrow(() => timer.tick());
});

test("can be stopped", () => {
  const { performance } = fakePerformance();
  const timer = manualTimer();

  const stop = installPerformanceBufferGuard({ isDev: true, performance, timer });
  stop();

  assert.equal(timer.isCleared(), true);
});
