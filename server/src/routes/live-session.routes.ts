import { Router } from "express";
import { authenticate } from "../middleware/auth.middleware.js";
import { getFoundationStatus } from "../controllers/live-session.controller.js";

const router = Router();

/**
 * @swagger
 * /api/live/health:
 *   get:
 *     summary: Live session module foundation health
 *     tags: [Live Sessions]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Foundation status payload for live session scaffolding
 */
router.get("/health", authenticate, getFoundationStatus);

export default router;
