import { Router } from "express";
import { authenticate } from "../middleware/auth.middleware.js";
import * as SecurityController from "../controllers/security.controller.js";

const router = Router();

// All security routes require authentication
router.use(authenticate);

/**
 * @swagger
 * /api/security/login-activity:
 *   get:
 *     summary: Get recent login activity
 *     tags: [Security]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *     responses:
 *       200:
 *         description: List of recent login events
 */
router.get("/login-activity", SecurityController.handleGetLoginActivity);

/**
 * @swagger
 * /api/security/sessions:
 *   get:
 *     summary: List active sessions
 *     tags: [Security]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Active sessions for the current rider
 */
router.get("/sessions", SecurityController.handleGetSessions);

/**
 * @swagger
 * /api/security/sessions:
 *   delete:
 *     summary: Revoke all active sessions
 *     tags: [Security]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: All sessions revoked
 */
router.delete("/sessions", SecurityController.handleRevokeAllSessions);

/**
 * @swagger
 * /api/security/sessions/{id}:
 *   delete:
 *     summary: Revoke a specific session
 *     tags: [Security]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Session revoked
 *       404:
 *         description: Session not found
 */
router.delete("/sessions/:id", SecurityController.handleRevokeSession);

export default router;
