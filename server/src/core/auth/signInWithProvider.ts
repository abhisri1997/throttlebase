import type {
  AppleCredential,
  AppleIdentityVerifier,
  GoogleIdentityVerifier,
  VerifiedIdentity,
} from "../../ports/IdentityVerifier.js";
import { issueSession, type IssueSessionDeps } from "./issueSession.js";
import {
  resolveOrCreateRider,
  type ResolveRiderDeps,
} from "./resolveOrCreateRider.js";
import type { RequestContext, SignInResult } from "./types.js";

export interface ProviderSignInDeps extends IssueSessionDeps, ResolveRiderDeps {
  google: GoogleIdentityVerifier;
  apple: AppleIdentityVerifier;
}

const completeSignIn = async (
  deps: ProviderSignInDeps,
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

export const signInWithGoogle = async (
  deps: ProviderSignInDeps,
  input: { idToken: string; ctx: RequestContext },
): Promise<SignInResult> => {
  const identity = await deps.google.verify(input.idToken);
  return await completeSignIn(deps, identity, input.ctx);
};

export const signInWithApple = async (
  deps: ProviderSignInDeps,
  input: { credential: AppleCredential; ctx: RequestContext },
): Promise<SignInResult> => {
  const identity = await deps.apple.verify(input.credential);
  return await completeSignIn(deps, identity, input.ctx);
};
