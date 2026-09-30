import { Router } from "express";
import { authenticate } from "../middleware/auth.middleware.js";
import { consentLimiter } from "../middleware/rateLimit.middleware.js";
import * as ConsentController from "../controllers/consent.controller.js";

/**
 * Purpose-based consent and the 18+ declaration (launch readiness E6).
 * The declarations route comes before /:purpose so "declarations" is never
 * read as a purpose.
 */
const router = Router();

router.use(authenticate);

/**
 * @swagger
 * /api/consents:
 *   get:
 *     summary: The current notice for each purpose, the rider's answers, and their 18+ declaration
 *     description: >
 *       Each consent's status is granted, withdrawn, not_asked, or
 *       reconsent_required (agreed to an older notice). The app shows the
 *       notice text exactly as sent here.
 *     tags: [Consents]
 *     responses:
 *       200: { description: Notices, consents and declarations }
 */
router.get("/", ConsentController.overview);

/**
 * @swagger
 * /api/consents/declarations:
 *   post:
 *     summary: Record the rider's answer to "I am 18 or older"
 *     description: >
 *       Every answer is kept. After a "no", the app cannot change it to
 *       "yes" (403 age_declared_under_18); support can.
 *     tags: [Consents]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [kind, answer, source]
 *             properties:
 *               kind: { type: string, enum: [age_18_plus] }
 *               answer: { type: boolean }
 *               source: { type: string, enum: [onboarding, settings] }
 *               app_version: { type: string, maxLength: 40 }
 *     responses:
 *       201: { description: Recorded }
 *       400: { description: Invalid }
 *       403: { description: A "no" is already on record }
 *       429: { description: Too many changes }
 */
router.post("/declarations", consentLimiter, ConsentController.declare);

/**
 * @swagger
 * /api/consents/{purpose}:
 *   put:
 *     summary: Grant or withdraw consent for one purpose
 *     description: >
 *       notice_version must be the version the rider was shown; anything but
 *       the current one is refused with 409 stale_notice. Repeating the
 *       answer on record changes nothing (changed false).
 *     tags: [Consents]
 *     parameters:
 *       - in: path
 *         name: purpose
 *         required: true
 *         schema:
 *           type: string
 *           enum: [ride_recording, live_location_sharing, motion_activity, public_profile, marketing_notifications]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [granted, notice_version, source]
 *             properties:
 *               granted: { type: boolean }
 *               notice_version: { type: string }
 *               source: { type: string, enum: [onboarding, contextual, settings] }
 *               app_version: { type: string, maxLength: 40 }
 *               platform: { type: string, enum: [ios, android, web] }
 *     responses:
 *       200: { description: The rider's consents after the change }
 *       400: { description: Invalid }
 *       404: { description: Unknown purpose }
 *       409: { description: The notice shown is not the current one }
 *       429: { description: Too many changes }
 */
router.put("/:purpose", consentLimiter, ConsentController.answer);

export default router;
