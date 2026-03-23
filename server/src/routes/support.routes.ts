import { Router } from "express";
import { authenticate } from "../middleware/auth.middleware.js";
import * as sc from "../controllers/support.controller.js";

const router = Router();
router.use(authenticate);

/**
 * @swagger
 * /api/support:
 *   get:
 *     summary: List your support tickets
 *     tags: [Support]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [open, in_progress, awaiting_rider, resolved, closed]
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 25
 *     responses:
 *       200:
 *         description: Array of support tickets for the authenticated rider
 *   post:
 *     summary: Create a support ticket
 *     tags: [Support]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [category, subject, description]
 *             properties:
 *               category:
 *                 type: string
 *                 enum: [bug, dispute, account, general]
 *               subject:
 *                 type: string
 *               description:
 *                 type: string
 *               attachment_urls:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: uri
 *     responses:
 *       201:
 *         description: Support ticket created
 */
router.get("/", sc.listSupportTickets);
router.post("/", sc.createSupportTicket);

/**
 * @swagger
 * /api/support/{id}:
 *   get:
 *     summary: Get one of your support tickets
 *     tags: [Support]
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
 *         description: Support ticket details
 *       404:
 *         description: Support ticket not found
 */
router.get("/:id", sc.getSupportTicket);

export default router;
