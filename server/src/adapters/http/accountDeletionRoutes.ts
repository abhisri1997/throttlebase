import { Router } from "express";
import { z } from "zod";
import {
  deleteAccountByEmail,
  requestDeletionCodeByEmail,
} from "../../core/riders/deleteAccount.js";
import type { AuthContainer } from "../../composition/container.js";
import { requestContextFrom, sendAuthError } from "./errorMapping.js";

const CodeSchema = z.object({ email: z.string().min(3).max(320) });

const ConfirmSchema = z.object({
  email: z.string().min(3).max(320),
  code: z.string().min(4).max(10),
});

/**
 * Account deletion without the app, for throttlebase.in/delete-account, which
 * Google Play requires. There is no session: the code emailed to the address
 * is the proof. Signed-in riders use /api/riders/me/deletion-code instead.
 */
export const createAccountDeletionRoutes = (container: AuthContainer): Router => {
  const router = Router();

  router.post("/code", async (req, res) => {
    const parsed = CodeSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Validation failed", details: parsed.error.issues });
      return;
    }

    try {
      const result = await requestDeletionCodeByEmail(container, {
        email: parsed.data.email,
        ctx: { ...requestContextFrom(req), acceptedTermsVersion: null },
      });
      res.status(202).json(result);
    } catch (error) {
      sendAuthError(res, error);
    }
  });

  router.post("/confirm", async (req, res) => {
    const parsed = ConfirmSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Validation failed", details: parsed.error.issues });
      return;
    }

    try {
      const result = await deleteAccountByEmail(container, {
        email: parsed.data.email,
        code: parsed.data.code,
        ctx: { ...requestContextFrom(req), acceptedTermsVersion: null },
      });
      res.json(result);
    } catch (error) {
      sendAuthError(res, error);
    }
  });

  return router;
};
