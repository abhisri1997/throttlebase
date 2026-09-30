import { Router } from "express";
import { authenticate } from "../middleware/auth.middleware.js";
import { reportLimiter } from "../middleware/rateLimit.middleware.js";
import * as ReportController from "../controllers/report.controller.js";

const router = Router();

router.use(authenticate);

/**
 * @swagger
 * /api/reports:
 *   post:
 *     summary: Report a post, comment, rider, ride, route or group
 *     description: >
 *       Goes to the moderation queue. Reporting the same thing again while the
 *       first report is open changes nothing (200, already_reported). Optionally
 *       blocks whoever made it. Limited to 20 an hour per rider.
 *     tags: [Reports]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [target_type, target_id, reason]
 *             properties:
 *               target_type:
 *                 type: string
 *                 enum: [post, comment, rider, ride, route, group]
 *               target_id:
 *                 type: string
 *                 format: uuid
 *               reason:
 *                 type: string
 *                 enum: [spam, harassment, hate, sexual, violence, dangerous_riding, impersonation, other]
 *               note:
 *                 type: string
 *                 maxLength: 1000
 *               also_block:
 *                 type: boolean
 *     responses:
 *       201: { description: Reported }
 *       200: { description: Already reported and still open }
 *       400: { description: Invalid, or the rider's own content }
 *       404: { description: Nothing to report }
 *       429: { description: Too many reports }
 */
router.post("/", reportLimiter, ReportController.create);

/**
 * @swagger
 * /api/reports/mine:
 *   get:
 *     summary: The rider's own reports, with a reference, status and outcome
 *     tags: [Reports]
 *     responses:
 *       200: { description: Newest first, up to 100 }
 */
router.get("/mine", ReportController.mine);

export default router;
