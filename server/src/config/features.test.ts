import test from "node:test";
import assert from "node:assert/strict";
import { parseFeatureFlags, requireFeature } from "./features.js";

test("every feature is off when no flag is set", () => {
  assert.deepEqual(parseFeatureFlags({}), {
    groups: false,
    rank: false,
    accountSecurity: false,
    support: false,
  });
});

test("a flag set to true turns its feature on", () => {
  const flags = parseFeatureFlags({ FEATURE_GROUPS: "true", FEATURE_SUPPORT: "TRUE" });

  assert.equal(flags.groups, true);
  assert.equal(flags.support, true);
  assert.equal(flags.rank, false);
});

test("any value other than true leaves the feature off", () => {
  const flags = parseFeatureFlags({ FEATURE_RANK: "1", FEATURE_ACCOUNT_SECURITY: "yes" });

  assert.equal(flags.rank, false);
  assert.equal(flags.accountSecurity, false);
});

const fakeResponse = () => {
  const sent: { status?: number; body?: unknown } = {};
  const res = {
    status(code: number) {
      sent.status = code;
      return res;
    },
    json(body: unknown) {
      sent.body = body;
      return res;
    },
  };
  return { res, sent };
};

test("the gate answers 404 for a disabled feature without reaching the route", () => {
  const { res, sent } = fakeResponse();
  let reachedRoute = false;

  requireFeature(false)({} as never, res as never, () => {
    reachedRoute = true;
  });

  assert.equal(reachedRoute, false);
  assert.equal(sent.status, 404);
  assert.deepEqual(sent.body, { error: "Not found" });
});

test("the gate passes through to the route for an enabled feature", () => {
  const { res, sent } = fakeResponse();
  let reachedRoute = false;

  requireFeature(true)({} as never, res as never, () => {
    reachedRoute = true;
  });

  assert.equal(reachedRoute, true);
  assert.equal(sent.status, undefined);
});
