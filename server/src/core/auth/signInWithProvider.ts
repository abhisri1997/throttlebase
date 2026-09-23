import type {
  AppleCredential,
  AppleIdentityVerifier,
  GoogleIdentityVerifier,
  VerifiedIdentity,
} from "../../ports/IdentityVerifier.js";
import { AuthError, isAuthError } from "./errors.js";
import { issueSession, type IssueSessionDeps } from "./issueSession.js";
import {
  resolveOrCreateRider,
  type ResolveRiderDeps,
} from "./resolveOrCreateRider.js";
import type { RequestContext, SignInResult } from "./types.js";

/**
 * Each sign-in path asks for the one verifier it uses.
 *
 * A combined type would make Google sign-in depend on Apple being configured,
 * which is exactly backwards: the providers ship independently.
 */
interface CommonSignInDeps extends IssueSessionDeps, ResolveRiderDeps {}

export interface GoogleSignInDeps extends CommonSignInDeps {
  google: GoogleIdentityVerifier;
}

export interface AppleSignInDeps extends CommonSignInDeps {
  apple: AppleIdentityVerifier;
}

const completeSignIn = async (
  deps: CommonSignInDeps,
  identity: VerifiedIdentity,
  ctx: RequestContext,
): Promise<SignInResult> => {
  const resolved = await resolveOrCreateRider(deps, identity, ctx);
  const tokens = await issueSession(deps, {
    riderId: resolved.riderId,
    roles: resolved.roles,
    ctx,
  });

  return {
    ...tokens,
    riderId: resolved.riderId,
    isNewRider: resolved.isNewRider,
    needsOnboarding: resolved.needsOnboarding,
  };
};

/**
 * Turns a verifier failure into a credential rejection.
 *
 * A bad signature, a wrong audience or an expired provider token are all the
 * client presenting something we will not accept — a 401, not a server fault.
 * Letting the raw library error escape would report 500 and bury a routine
 * rejection in the error logs.
 */
const verifyOrReject = async <T>(verify: () => Promise<T>): Promise<T> => {
  try {
    return await verify();
  } catch (error) {
    if (isAuthError(error)) {
      throw error;
    }
    throw new AuthError(
      "INVALID_CREDENTIAL",
      "That sign-in could not be verified.",
    );
  }
};

export const signInWithGoogle = async (
  deps: GoogleSignInDeps,
  input: { idToken: string; ctx: RequestContext },
): Promise<SignInResult> => {
  const identity = await verifyOrReject(() => deps.google.verify(input.idToken));
  return await completeSignIn(deps, identity, input.ctx);
};

export const signInWithApple = async (
  deps: AppleSignInDeps,
  input: { credential: AppleCredential; ctx: RequestContext },
): Promise<SignInResult> => {
  const identity = await verifyOrReject(() =>
    deps.apple.verify(input.credential),
  );
  return await completeSignIn(deps, identity, input.ctx);
};
