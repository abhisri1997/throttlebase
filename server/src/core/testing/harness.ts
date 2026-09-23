import type { AuthPolicy, RequestContext } from "../auth/types.js";
import {
  FakeClock,
  FakeEmailSender,
  FakeHasher,
  FakeOtpStore,
  FakeRandomSource,
  FakeRateLimiter,
  FakeRiderRepository,
  FakeSessionRepository,
  FakeTokenIssuer,
} from "./fakes.js";

export const TEST_TERMS_VERSION = "2026-01-01";
export const TEST_PRIVACY_VERSION = "2026-01-01";

export const testPolicy = (overrides: Partial<AuthPolicy> = {}): AuthPolicy => ({
  accessTokenTtlSeconds: 900,
  refreshTokenTtlSeconds: 30 * 24 * 60 * 60,
  otpTtlSeconds: 600,
  otpMaxAttempts: 5,
  otpCodeLength: 6,
  refreshTokenBytes: 32,
  consent: { terms: TEST_TERMS_VERSION, privacy: TEST_PRIVACY_VERSION },
  otpRateLimits: {
    startPerEmailShort: { limit: 3, windowSeconds: 900 },
    startPerEmailDaily: { limit: 10, windowSeconds: 86400 },
    startPerIp: { limit: 20, windowSeconds: 900 },
    verifyPerIp: { limit: 20, windowSeconds: 900 },
  },
  ...overrides,
});

export const testContext = (
  overrides: Partial<RequestContext> = {},
): RequestContext => ({
  ipAddress: "203.0.113.10",
  userAgent: "ThrottleBase/1.0 (test)",
  acceptedTermsVersion: TEST_TERMS_VERSION,
  ...overrides,
});

/** Every fake wired together, for use cases that need the full set. */
export const buildHarness = (policyOverrides: Partial<AuthPolicy> = {}) => {
  const clock = new FakeClock();
  const riders = new FakeRiderRepository();
  const sessions = new FakeSessionRepository();
  const otps = new FakeOtpStore();
  const email = new FakeEmailSender();
  const hasher = new FakeHasher();
  const random = new FakeRandomSource();
  const rateLimiter = new FakeRateLimiter();
  const tokenIssuer = new FakeTokenIssuer(clock);
  const policy = testPolicy(policyOverrides);

  return {
    clock,
    riders,
    sessions,
    otps,
    email,
    hasher,
    random,
    rateLimiter,
    tokenIssuer,
    policy,
  };
};

export type Harness = ReturnType<typeof buildHarness>;
