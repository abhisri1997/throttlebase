import { Router } from "express";
import { z } from "zod";
import { logout, logoutAll } from "../../core/auth/logout.js";
import { refreshSession } from "../../core/auth/refreshSession.js";
import {
  signInWithApple,
  signInWithGoogle,
} from "../../core/auth/signInWithProvider.js";
import { startEmailLogin } from "../../core/auth/startEmailLogin.js";
import { verifyEmailLogin } from "../../core/auth/verifyEmailLogin.js";
import type { SignInResult } from "../../core/auth/types.js";
import type { AuthContainer } from "../../composition/container.js";
import { createAuthenticate } from "./authenticate.js";
import { requestContextFrom, sendAuthError } from "./errorMapping.js";

/**
 * HTTP is an adapter.
 *
 * Every handler here does the same three things and nothing else: validate
 * the request, call one use case, shape the response. All the decisions live
 * in core, which is why they can be tested without a server.
 */

const GoogleSchema = z.object({
  idToken: z.string().min(1),
  acceptedTermsVersion: z.string().optional(),
});

const AppleSchema = z.object({
  identityToken: z.string().min(1),
  rawNonce: z.string().min(1),
  fullName: z
    .object({
      givenName: z.string().nullable().optional(),
      familyName: z.string().nullable().optional(),
    })
    .nullable()
    .optional(),
  acceptedTermsVersion: z.string().optional(),
});

const EmailStartSchema = z.object({ email: z.string().min(3).max(320) });

const EmailVerifySchema = z.object({
  email: z.string().min(3).max(320),
  code: z.string().min(4).max(10),
  acceptedTermsVersion: z.string().optional(),
});

const RefreshSchema = z.object({ refreshToken: z.string().min(1) });

const toSessionResponse = (result: SignInResult) => ({
  accessToken: result.accessToken,
  accessTokenExpiresAt: result.accessTokenExpiresAt.toISOString(),
  refreshToken: result.refreshToken,
  refreshTokenExpiresAt: result.refreshTokenExpiresAt.toISOString(),
  riderId: result.riderId,
  isNewRider: result.isNewRider,
  needsOnboarding: result.needsOnboarding,
});

export const createAuthRoutes = (container: AuthContainer): Router => {
  const router = Router();
  const authenticate = createAuthenticate(container.tokenVerifier);

  router.post("/google", async (req, res) => {
    const parsed = GoogleSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Validation failed", details: parsed.error.issues });
      return;
    }

    try {
      const result = await signInWithGoogle(container, {
        idToken: parsed.data.idToken,
        ctx: {
          ...requestContextFrom(req),
          acceptedTermsVersion: parsed.data.acceptedTermsVersion ?? null,
        },
      });
      res.status(200).json(toSessionResponse(result));
    } catch (error) {
      sendAuthError(res, error);
    }
  });

  router.post("/apple", async (req, res) => {
    // Apple sign-in ships once the developer account exists. Until
    // APPLE_CLIENT_IDS is configured this reports honestly rather than
    // failing somewhere less obvious.
    const appleVerifier = container.apple;
    if (!appleVerifier) {
      res.status(501).json({
        error: "Apple sign-in is not enabled yet.",
        code: "APPLE_SIGN_IN_UNAVAILABLE",
      });
      return;
    }

    const parsed = AppleSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Validation failed", details: parsed.error.issues });
      return;
    }

    try {
      const result = await signInWithApple(
        { ...container, apple: appleVerifier },
        {
        credential: {
          identityToken: parsed.data.identityToken,
          rawNonce: parsed.data.rawNonce,
          fullName: parsed.data.fullName
            ? {
                givenName: parsed.data.fullName.givenName ?? null,
                familyName: parsed.data.fullName.familyName ?? null,
              }
            : null,
        },
        ctx: {
          ...requestContextFrom(req),
          acceptedTermsVersion: parsed.data.acceptedTermsVersion ?? null,
        },
        },
      );
      res.status(200).json(toSessionResponse(result));
    } catch (error) {
      sendAuthError(res, error);
    }
  });

  /**
   * Always 202, always the same body.
   *
   * Whether the address belongs to an existing rider, is brand new, or is
   * undeliverable must be indistinguishable from out here — any difference
   * turns this endpoint into an account-existence oracle.
   */
  router.post("/email/start", async (req, res) => {
    const parsed = EmailStartSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Validation failed", details: parsed.error.issues });
      return;
    }

    try {
      const result = await startEmailLogin(container, {
        email: parsed.data.email,
        ctx: { ...requestContextFrom(req), acceptedTermsVersion: null },
      });
      res.status(202).json(result);
    } catch (error) {
      sendAuthError(res, error);
    }
  });

  router.post("/email/verify", async (req, res) => {
    const parsed = EmailVerifySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Validation failed", details: parsed.error.issues });
      return;
    }

    try {
      const result = await verifyEmailLogin(container, {
        email: parsed.data.email,
        code: parsed.data.code,
        ctx: {
          ...requestContextFrom(req),
          acceptedTermsVersion: parsed.data.acceptedTermsVersion ?? null,
        },
      });
      res.status(200).json(toSessionResponse(result));
    } catch (error) {
      sendAuthError(res, error);
    }
  });

  router.post("/refresh", async (req, res) => {
    const parsed = RefreshSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Validation failed", details: parsed.error.issues });
      return;
    }

    try {
      const result = await refreshSession(container, {
        refreshToken: parsed.data.refreshToken,
        ctx: { ...requestContextFrom(req), acceptedTermsVersion: null },
      });
      res.status(200).json({
        accessToken: result.accessToken,
        accessTokenExpiresAt: result.accessTokenExpiresAt.toISOString(),
        refreshToken: result.refreshToken,
        refreshTokenExpiresAt: result.refreshTokenExpiresAt.toISOString(),
        riderId: result.riderId,
      });
    } catch (error) {
      sendAuthError(res, error);
    }
  });

  router.post("/logout", async (req, res) => {
    const parsed = RefreshSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Validation failed" });
      return;
    }

    try {
      // Idempotent: an unknown token still reports success, because telling a
      // caller their token was unrecognised helps nobody but an attacker.
      await logout(container, parsed.data.refreshToken);
      res.status(204).end();
    } catch (error) {
      sendAuthError(res, error);
    }
  });

  router.post("/logout-all", authenticate, async (req, res) => {
    try {
      const result = await logoutAll(container, req.auth?.riderId as string);
      res.status(200).json(result);
    } catch (error) {
      sendAuthError(res, error);
    }
  });

  return router;
};

/** Public key set, so anything can verify our tokens without asking us. */
export const createJwksRoute = (container: AuthContainer): Router => {
  const router = Router();

  router.get("/jwks.json", (_req, res) => {
    res.setHeader("Cache-Control", "public, max-age=300");
    res.json(container.jwks);
  });

  return router;
};
