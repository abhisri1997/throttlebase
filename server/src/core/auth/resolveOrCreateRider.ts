import type { Clock } from "../../ports/Clock.js";
import type { VerifiedIdentity } from "../../ports/IdentityVerifier.js";
import type {
  RiderRepository,
  RiderTransaction,
} from "../../ports/RiderRepository.js";
import { AuthError, ConcurrentIdentityError } from "./errors.js";
import { isLinkableEmail, normalizeEmail } from "./email.js";
import type { AuthPolicy, RequestContext, ResolvedRider } from "./types.js";

export interface ResolveRiderDeps {
  riders: RiderRepository;
  clock: Clock;
  policy: AuthPolicy;
}

const DEFAULT_DISPLAY_NAME = "Rider";

const displayNameFor = (identity: VerifiedIdentity): string => {
  const provided = identity.displayName?.trim();
  return provided ? provided : DEFAULT_DISPLAY_NAME;
};

/**
 * Turns a proven third-party identity into one of our riders.
 *
 * Signup and login are the same flow: whether this is a first sign-in is an
 * outcome, not a separate endpoint. Runs entirely in one transaction so a
 * half-created rider can never be observed.
 */
export const resolveOrCreateRider = async (
  deps: ResolveRiderDeps,
  identity: VerifiedIdentity,
  ctx: RequestContext,
): Promise<ResolvedRider> => {
  try {
    return await deps.riders.withTransaction((tx) =>
      resolveInTransaction(deps, tx, identity, ctx),
    );
  } catch (error) {
    if (!(error instanceof ConcurrentIdentityError)) {
      throw error;
    }

    // The losing side of a first sign-in race. The identity now exists, so a
    // second attempt takes the login path.
    return await deps.riders.withTransaction((tx) =>
      resolveInTransaction(deps, tx, identity, ctx),
    );
  }
};

const resolveInTransaction = async (
  deps: ResolveRiderDeps,
  tx: RiderTransaction,
  identity: VerifiedIdentity,
  ctx: RequestContext,
): Promise<ResolvedRider> => {
  const existingRiderId = await tx.findRiderIdByIdentity(
    identity.provider,
    identity.subject,
  );

  if (existingRiderId) {
    return await finish(tx, ctx, existingRiderId, false);
  }

  const linkableEmail = isLinkableEmail(
    identity.email === null ? null : normalizeEmail(identity.email),
    identity.emailVerified,
  )
    ? normalizeEmail(identity.email as string)
    : null;

  if (linkableEmail) {
    const existing = await tx.findRiderByEmail(linkableEmail);
    if (existing) {
      const { inserted } = await tx.linkIdentity({
        riderId: existing.id,
        provider: identity.provider,
        subject: identity.subject,
        email: linkableEmail,
      });

      if (!inserted) {
        throw new ConcurrentIdentityError();
      }

      return await finish(tx, ctx, existing.id, false);
    }
  }

  return await createRider(deps, tx, identity, ctx, linkableEmail);
};

const createRider = async (
  deps: ResolveRiderDeps,
  tx: RiderTransaction,
  identity: VerifiedIdentity,
  ctx: RequestContext,
  linkableEmail: string | null,
): Promise<ResolvedRider> => {
  if (ctx.acceptedTermsVersion !== deps.policy.consent.terms) {
    throw new AuthError(
      "CONSENT_REQUIRED",
      "The current terms must be accepted to create an account.",
    );
  }

  const rider = await tx.createRider({
    displayName: displayNameFor(identity),
    email: linkableEmail,
    avatarUrl: identity.avatarUrl,
  });

  const { inserted } = await tx.linkIdentity({
    riderId: rider.id,
    provider: identity.provider,
    subject: identity.subject,
    email: linkableEmail,
  });

  if (!inserted) {
    // Roll back, discarding the rider we just created, and retry as a login.
    throw new ConcurrentIdentityError();
  }

  await tx.createDefaultSettings(rider.id);
  await tx.recordConsent({
    riderId: rider.id,
    termsVersion: deps.policy.consent.terms,
    privacyVersion: deps.policy.consent.privacy,
    ip: ctx.ipAddress,
  });

  return await finish(tx, ctx, rider.id, true);
};

const finish = async (
  tx: RiderTransaction,
  ctx: RequestContext,
  riderId: string,
  isNewRider: boolean,
): Promise<ResolvedRider> => {
  await tx.recordLoginActivity({
    riderId,
    ipAddress: ctx.ipAddress,
    deviceFingerprint: ctx.userAgent,
  });

  const [roles, rider] = await Promise.all([
    tx.getRoles(riderId),
    tx.findRiderById(riderId),
  ]);

  if (!rider) {
    throw new AuthError("RIDER_NOT_FOUND", "Rider disappeared mid-transaction");
  }

  return {
    riderId,
    isNewRider,
    needsOnboarding: rider.username === null,
    roles,
  };
};
