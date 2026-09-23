import test from "node:test";
import assert from "node:assert/strict";
import { createSingleFlight } from "./singleFlight.js";

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

test("concurrent callers share one underlying call", async () => {
  // Arrange
  const singleFlight = createSingleFlight<string>();
  const gate = deferred<string>();
  let calls = 0;
  const run = () => {
    calls += 1;
    return gate.promise;
  };

  // Act: three callers arrive while the first is still in flight
  const a = singleFlight(run);
  const b = singleFlight(run);
  const c = singleFlight(run);
  gate.resolve("token");

  // Assert: the backend saw exactly one refresh, so rotation reuse detection
  // is never tripped by our own concurrency
  assert.deepEqual(await Promise.all([a, b, c]), ["token", "token", "token"]);
  assert.equal(calls, 1);
});

test("a later caller starts a fresh call once the first settles", async () => {
  const singleFlight = createSingleFlight<number>();
  let calls = 0;
  const run = () => {
    calls += 1;
    return Promise.resolve(calls);
  };

  assert.equal(await singleFlight(run), 1);
  assert.equal(await singleFlight(run), 2);
});

test("a failure is delivered to every waiting caller", async () => {
  const singleFlight = createSingleFlight<string>();
  const gate = deferred<string>();
  const run = () => gate.promise;

  const a = singleFlight(run);
  const b = singleFlight(run);
  gate.reject(new Error("refresh failed"));

  await assert.rejects(() => a, /refresh failed/);
  await assert.rejects(() => b, /refresh failed/);
});

test("a failed call does not wedge the gate shut", async () => {
  // Arrange: the first attempt fails
  const singleFlight = createSingleFlight<string>();
  let attempt = 0;
  const run = () => {
    attempt += 1;
    return attempt === 1
      ? Promise.reject(new Error("network down"))
      : Promise.resolve("recovered");
  };

  await assert.rejects(() => singleFlight(run));

  // Assert: the app can still refresh afterwards
  assert.equal(await singleFlight(run), "recovered");
});
