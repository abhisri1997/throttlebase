import { Router } from "express";
import { authenticate } from "../middleware/auth.middleware.js";
import * as PlaceSuggestionController from "../controllers/placeSuggestion.controller.js";
import {
  stopSuggestionDailyLimiter,
  stopSuggestionHourlyLimiter,
} from "../middleware/rateLimit.middleware.js";

const router = Router();

// Every route here spends money on outbound Google calls, so all of them are
// authenticated and rate limited without exception.
router.use(authenticate);

/**
 * @swagger
 * /api/stop-suggestions:
 *   post:
 *     summary: Find places along a route, by stop category
 *     tags: [Stops]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [category, encodedPolyline]
 *             properties:
 *               category:
 *                 type: string
 *                 enum: [fuel, rest, photo]
 *               encodedPolyline:
 *                 type: string
 *                 description: Google encoded polyline of the route to search along
 *               mode:
 *                 type: string
 *                 enum: [planning, live]
 *                 default: planning
 *               origin:
 *                 type: array
 *                 items: { type: number }
 *                 description: "[lng, lat]; live mode only, used for cache keying"
 *               openNow:
 *                 type: boolean
 *               limit:
 *                 type: integer
 *                 default: 10
 *                 maximum: 20
 *     responses:
 *       200:
 *         description: Suggestions ordered by distance along the route. A
 *           degraded response means the daily budget or Google refused the
 *           request; clients should offer manual search instead.
 *       400:
 *         description: Validation failed
 *       429:
 *         description: Rate limit exceeded
 */
router.post(
  "/",
  stopSuggestionHourlyLimiter,
  stopSuggestionDailyLimiter,
  PlaceSuggestionController.getSuggestions,
);

export default router;
