import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import * as rideController from '../controllers/ride.controller.js';

const router = Router();

/**
 * @swagger
 * /api/rides:
 *   get:
 *     summary: List upcoming public rides
 *     tags: [Rides]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Array of discoverable rides
 *   post:
 *     summary: Create a new ride (you become captain)
 *     tags: [Rides]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [title, scheduled_at]
 *             properties:
 *               title:
 *                 type: string
 *                 example: Weekend Highway Cruise
 *               description:
 *                 type: string
 *                 example: A chill ride along the coast
 *               visibility:
 *                 type: string
 *                 enum: [public, private]
 *                 default: public
 *               scheduled_at:
 *                 type: string
 *                 format: date-time
 *                 example: "2026-04-01T10:00:00Z"
 *               estimated_duration_min:
 *                 type: integer
 *                 example: 120
 *               max_capacity:
 *                 type: integer
 *                 example: 15
 *               start_point_coords:
 *                 type: array
 *                 items:
 *                   type: number
 *                 example: [77.5946, 12.9716]
 *                 description: "[longitude, latitude]"
 *               end_point_coords:
 *                 type: array
 *                 items:
 *                   type: number
 *                 example: [76.6394, 12.2958]
 *               requirements:
 *                 type: object
 *                 example: { "min_experience": "intermediate", "mandatory_gear": ["helmet"] }
 *     responses:
 *       201:
 *         description: Ride created (transaction - ride + captain participant)
 *       400:
 *         description: Validation error
 */
router.get('/', authenticate, rideController.getAllRides);
router.post('/', authenticate, rideController.createRide);

/**
 * @swagger
 * /api/rides/{id}:
 *   get:
 *     summary: Get ride details with captain info
 *     tags: [Rides]
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
 *         description: Full ride details
 *       404:
 *         description: Ride not found
 *   patch:
 *     summary: Update a ride (captain only)
 *     tags: [Rides]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title:
 *                 type: string
 *               description:
 *                 type: string
 *               status:
 *                 type: string
 *                 enum: [draft, scheduled, active, completed, cancelled]
 *               visibility:
 *                 type: string
 *                 enum: [public, private]
 *     responses:
 *       200:
 *         description: Ride updated
 *       404:
 *         description: Ride not found or not the captain
 */
router.get('/:id', authenticate, rideController.getRide);
router.patch('/:id', authenticate, rideController.updateRide);

/**
 * @swagger
 * /api/rides/{id}/join:
 *   post:
 *     summary: Join a ride as a participant
 *     tags: [Rides]
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
 *         description: Successfully joined the ride
 *       400:
 *         description: Already a participant
 *       404:
 *         description: Ride not found
 */
router.post('/:id/join', authenticate, rideController.joinRide);

export default router;
