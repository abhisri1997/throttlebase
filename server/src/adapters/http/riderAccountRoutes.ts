import { Router } from "express";
import { z } from "zod";
import {
  completeOnboarding,
  isUsernameAvailable,
  EXPERIENCE_LEVELS,
} from "../../core/riders/completeOnboarding.js";
import {
  deleteAccount,
  requestDeletionCode,
} from "../../core/riders/deleteAccount.js";
import type { AuthContainer } from "../../composition/container.js";
import { createAuthenticate } from "./authenticate.js";
import {
  requestContextFrom,
  sendAuthError,
  SIGNED_IN_CODE_STATUS,
} from "./errorMapping.js";

const OnboardingSchema = z.object({
  username: z.string().min(1).max(40),
  displayName: z.string().min(1).max(100),
  experienceLevel: z.enum(EXPERIENCE_LEVELS),
  locationCity: z.string().max(100).nullable().optional(),
  firstVehicle: z
    .object({
      make: z.string().min(1).max(100),
      model: z.string().min(1).max(100),
      year: z.number().int().min(1900).max(2100).nullable().optional(),
      engineCapacityCc: z.number().int().min(1).max(10_000).nullable().optional(),
    })
    .nullable()
    .optional(),
});

const DeleteAccountSchema = z.object({
  code: z.string().min(4).max(10).optional(),
});

export const createRiderAccountRoutes = (container: AuthContainer): Router => {
  const router = Router();
  const authenticate = createAuthenticate(container.tokenVerifier);

  router.get("/username-available", authenticate, async (req, res) => {
    const candidate = String(req.query.u ?? "");
    if (!candidate) {
      res.status(400).json({ error: "Query parameter u is required" });
      return;
    }

    try {
      const result = await isUsernameAvailable(container, candidate);
      res.json(result);
    } catch (error) {
      sendAuthError(res, error);
    }
  });

  router.patch("/me/onboarding", authenticate, async (req, res) => {
    const parsed = OnboardingSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Validation failed", details: parsed.error.issues });
      return;
    }

    try {
      const rider = await completeOnboarding(container, {
        riderId: req.auth?.riderId as string,
        username: parsed.data.username,
        displayName: parsed.data.displayName,
        experienceLevel: parsed.data.experienceLevel,
        locationCity: parsed.data.locationCity ?? null,
        firstVehicle: parsed.data.firstVehicle
          ? {
              make: parsed.data.firstVehicle.make,
              model: parsed.data.firstVehicle.model,
              year: parsed.data.firstVehicle.year ?? null,
              engineCapacityCc: parsed.data.firstVehicle.engineCapacityCc ?? null,
            }
          : null,
      });

      res.json({
        rider: {
          id: rider.id,
          username: rider.username,
          displayName: rider.displayName,
          email: rider.email,
          avatarUrl: rider.avatarUrl,
        },
      });
    } catch (error) {
      sendAuthError(res, error);
    }
  });

  /** Emails the rider the code that confirms deleting their account. */
  router.post("/me/deletion-code", authenticate, async (req, res) => {
    try {
      const result = await requestDeletionCode(container, {
        riderId: req.auth?.riderId as string,
        ctx: { ...requestContextFrom(req), acceptedTermsVersion: null },
      });
      res.status(202).json(result);
    } catch (error) {
      sendAuthError(res, error);
    }
  });

  /**
   * Account deletion, which the app stores require, confirmed by the emailed
   * code. Without one it answers 403 REAUTH_REQUIRED.
   *
   * Identities and sessions go immediately; the rider row is retained
   * anonymised because rides and safety records reference it. What is kept
   * and why is documented in core/riders/deleteAccount.ts.
   */
  router.delete("/me", authenticate, async (req, res) => {
    const parsed = DeleteAccountSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: "Validation failed", details: parsed.error.issues });
      return;
    }

    try {
      await deleteAccount(container, {
        riderId: req.auth?.riderId as string,
        code: parsed.data.code ?? null,
      });
      res.status(204).end();
    } catch (error) {
      sendAuthError(res, error, SIGNED_IN_CODE_STATUS);
    }
  });

  return router;
};
