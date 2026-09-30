import { Router } from "express";
import { authenticate } from "../middleware/auth.middleware.js";
import { requireAdmin } from "../middleware/admin.middleware.js";
import * as ModerationController from "../controllers/moderation.controller.js";

const router = Router();

// Admins only, on every route: the role comes from the access token.
router.use(authenticate, requireAdmin);

/**
 * @swagger
 * /api/admin/moderation/queue:
 *   get:
 *     summary: Open reports, one row per reported thing, longest waiting first
 *     tags: [Moderation]
 *     security: [{ bearerAdminAuth: [] }]
 *     responses:
 *       200: { description: The queue }
 *       403: { description: Not an admin }
 */
router.get("/queue", ModerationController.queue);

/**
 * @swagger
 * /api/admin/moderation/suspended:
 *   get:
 *     summary: Riders under suspension
 *     tags: [Moderation]
 *     security: [{ bearerAdminAuth: [] }]
 *     responses:
 *       200: { description: Suspended riders }
 */
router.get("/suspended", ModerationController.suspended);

/**
 * @swagger
 * /api/admin/moderation/actions:
 *   post:
 *     summary: Remove, dismiss, suspend or lift a suspension, with a reason
 *     description: >
 *       One transaction: the change, closing the thing's open reports, an
 *       in-app notice to its maker (not for dismissals), and an audit entry
 *       in security_events. Posts, comments and routes can be removed; a
 *       suspension acts on whoever made the reported thing.
 *     tags: [Moderation]
 *     security: [{ bearerAdminAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [target_type, target_id, action, reason]
 *             properties:
 *               target_type: { type: string, enum: [post, comment, rider, ride, route, group] }
 *               target_id: { type: string, format: uuid }
 *               action: { type: string, enum: [remove, dismiss, suspend, lift_suspension] }
 *               reason: { type: string, minLength: 5, maxLength: 500 }
 *     responses:
 *       200: { description: Done }
 *       400: { description: Not allowed for this thing, or no reason }
 *       404: { description: Not found }
 */
router.post("/actions", ModerationController.act);

export default router;
