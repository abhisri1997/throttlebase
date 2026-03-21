import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import * as rc from '../controllers/rewards.controller.js';

const router = Router();
router.use(authenticate);

// ═══════════════════════════════════════════════════════════════════════════════
// BADGES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * @swagger
 * /api/rewards/badges:
 *   get:
 *     summary: List all available badges
 *     tags: [Rewards]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Array of badge definitions
 *   post:
 *     summary: Create a new badge definition (admin)
 *     tags: [Rewards]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, criteria_type, criteria_value]
 *             properties:
 *               name:
 *                 type: string
 *                 example: Century Rider
 *               description:
 *                 type: string
 *                 example: Completed 100 rides
 *               icon_url:
 *                 type: string
 *                 format: uri
 *               criteria_type:
 *                 type: string
 *                 example: total_rides
 *               criteria_value:
 *                 type: number
 *                 example: 100
 *     responses:
 *       201:
 *         description: Badge created
 */
router.get('/badges', rc.listBadges);
router.post('/badges', rc.createBadge);

/**
 * @swagger
 * /api/rewards/badges/me:
 *   get:
 *     summary: Get your earned badges
 *     tags: [Rewards]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Array of earned badges with awarded_at timestamps
 */
router.get('/badges/me', rc.getMyBadges);

/**
 * @swagger
 * /api/rewards/badges/{id}/award:
 *   post:
 *     summary: Award a badge to a rider
 *     tags: [Rewards]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Badge ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [rider_id]
 *             properties:
 *               rider_id:
 *                 type: string
 *                 format: uuid
 *     responses:
 *       201:
 *         description: Badge awarded
 *       200:
 *         description: Badge already awarded to this rider
 */
router.post('/badges/:id/award', rc.awardBadge);

/**
 * @swagger
 * /api/rewards/badges/rider/{id}:
 *   get:
 *     summary: Get badges earned by a specific rider
 *     tags: [Rewards]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Rider ID
 *     responses:
 *       200:
 *         description: Array of badges
 */
router.get('/badges/rider/:id', rc.getRiderBadges);

// ═══════════════════════════════════════════════════════════════════════════════
// ACHIEVEMENTS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * @swagger
 * /api/rewards/achievements:
 *   get:
 *     summary: List all achievement definitions
 *     tags: [Rewards]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Array of tiered achievements
 *   post:
 *     summary: Create a new achievement definition (admin)
 *     tags: [Rewards]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, tier, threshold, criteria_type]
 *             properties:
 *               name:
 *                 type: string
 *                 example: Distance Pro
 *               tier:
 *                 type: integer
 *                 example: 1
 *               threshold:
 *                 type: number
 *                 example: 100
 *               criteria_type:
 *                 type: string
 *                 example: total_distance_km
 *               reward_description:
 *                 type: string
 *                 example: Bronze distance badge
 *     responses:
 *       201:
 *         description: Achievement created
 */
router.get('/achievements', rc.listAchievements);
router.post('/achievements', rc.createAchievement);

/**
 * @swagger
 * /api/rewards/achievements/me:
 *   get:
 *     summary: Get your achievement progress
 *     tags: [Rewards]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Array of achievement progress with current_value and current_tier
 */
router.get('/achievements/me', rc.getMyAchievements);

// ═══════════════════════════════════════════════════════════════════════════════
// LEADERBOARD
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * @swagger
 * /api/rewards/leaderboard:
 *   get:
 *     summary: Get the leaderboard
 *     tags: [Rewards]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: metric
 *         schema:
 *           type: string
 *           enum: [total_distance_km, total_rides, badges_earned]
 *           default: total_distance_km
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *     responses:
 *       200:
 *         description: Ranked list of riders
 */
router.get('/leaderboard', rc.getLeaderboard);

export default router;
