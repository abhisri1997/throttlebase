import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import * as RiderController from '../controllers/rider.controller.js';

/**
 * Rider Routes — All protected by JWT authentication.
 *
 * The /me routes MUST come before /:id to prevent Express
 * from matching "me" as a UUID parameter.
 */

const router = Router();

// Apply authentication to ALL rider routes
router.use(authenticate);

/**
 * @swagger
 * /api/riders/me:
 *   get:
 *     summary: Get your own full profile
 *     tags: [Riders]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Full rider profile (email, phone, weight included)
 *       401:
 *         description: No token or invalid token
 *       404:
 *         description: Rider not found (soft-deleted)
 */
router.get('/me', RiderController.getMyProfile);

/**
 * @swagger
 * /api/riders/me:
 *   patch:
 *     summary: Update your own profile
 *     tags: [Riders]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               display_name:
 *                 type: string
 *               bio:
 *                 type: string
 *               experience_level:
 *                 type: string
 *                 enum: [beginner, intermediate, expert]
 *               location_city:
 *                 type: string
 *               location_region:
 *                 type: string
 *               phone_number:
 *                 type: string
 *               weight_kg:
 *                 type: number
 *     responses:
 *       200:
 *         description: Profile updated successfully
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 */
router.patch('/me', RiderController.updateMyProfile);

/**
 * @swagger
 * /api/riders/me:
 *   delete:
 *     summary: Soft-delete your account (30-day recovery window)
 *     tags: [Riders]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Account soft-deleted
 *       401:
 *         description: Unauthorized
 */
router.delete('/me', RiderController.deleteMyAccount);

/**
 * @swagger
 * /api/riders/{id}:
 *   get:
 *     summary: View another rider's public profile
 *     tags: [Riders]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Rider UUID
 *     responses:
 *       200:
 *         description: Public profile (email, phone, weight hidden)
 *       400:
 *         description: Invalid UUID format
 *       404:
 *         description: Rider not found
 */
router.get('/:id', RiderController.getPublicProfile);

export default router;
