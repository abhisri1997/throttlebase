import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import * as routeController from '../controllers/route.controller.js';

const router = Router();

// All route endpoints require authentication
router.use(authenticate);

/**
 * @swagger
 * /api/routes:
 *   get:
 *     summary: List public routes
 *     tags: [Routes]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Array of public routes with GeoJSON data
 *   post:
 *     summary: Create a new route
 *     tags: [Routes]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [title, geojson]
 *             properties:
 *               title:
 *                 type: string
 *                 example: Coastal Highway Loop
 *               geojson:
 *                 type: object
 *                 required: [type, coordinates]
 *                 properties:
 *                   type:
 *                     type: string
 *                     enum: [LineString]
 *                   coordinates:
 *                     type: array
 *                     items:
 *                       type: array
 *                       items:
 *                         type: number
 *                     example: [[77.5946, 12.9716], [77.6, 12.98], [76.6394, 12.2958]]
 *               ride_id:
 *                 type: string
 *                 format: uuid
 *               distance_km:
 *                 type: number
 *                 example: 145.5
 *               difficulty:
 *                 type: string
 *                 enum: [easy, moderate, hard]
 *               visibility:
 *                 type: string
 *                 enum: [private, specific_riders, public]
 *                 default: private
 *     responses:
 *       201:
 *         description: Route created
 *       400:
 *         description: Validation error
 */
router.get('/', routeController.listRoutes);
router.post('/', routeController.createRoute);

/**
 * @swagger
 * /api/routes/traces:
 *   post:
 *     summary: Upload a batch of GPS trace points
 *     tags: [Routes]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [ride_id, traces]
 *             properties:
 *               ride_id:
 *                 type: string
 *                 format: uuid
 *               traces:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required: [latitude, longitude, recorded_at]
 *                   properties:
 *                     latitude:
 *                       type: number
 *                       example: 12.9716
 *                     longitude:
 *                       type: number
 *                       example: 77.5946
 *                     altitude_m:
 *                       type: number
 *                       example: 920
 *                     speed_kmh:
 *                       type: number
 *                       example: 65.4
 *                     recorded_at:
 *                       type: string
 *                       format: date-time
 *                       example: "2026-04-01T10:05:30Z"
 *     responses:
 *       201:
 *         description: GPS points recorded
 *       400:
 *         description: Validation error
 */
router.post('/traces', routeController.uploadGpsTraces);

/**
 * @swagger
 * /api/routes/traces/{rideId}:
 *   get:
 *     summary: Get GPS trace points for a ride
 *     tags: [Routes]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: rideId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Array of GPS trace points
 */
router.get('/traces/:rideId', routeController.getTraces);

/**
 * @swagger
 * /api/routes/{id}:
 *   get:
 *     summary: Get route details (visibility-aware)
 *     tags: [Routes]
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
 *         description: Route details with GeoJSON
 *       404:
 *         description: Route not found or access denied
 */
router.get('/:id', routeController.getRoute);

/**
 * @swagger
 * /api/routes/{id}/bookmark:
 *   post:
 *     summary: Bookmark a route
 *     tags: [Routes]
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
 *         description: Route bookmarked
 *   delete:
 *     summary: Remove a bookmark
 *     tags: [Routes]
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
 *         description: Bookmark removed
 *       404:
 *         description: Bookmark not found
 */
router.post('/:id/bookmark', routeController.bookmark);
router.delete('/:id/bookmark', routeController.unbookmark);

/**
 * @swagger
 * /api/routes/{id}/share:
 *   post:
 *     summary: Share a route with another rider
 *     tags: [Routes]
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
 *             required: [rider_id]
 *             properties:
 *               rider_id:
 *                 type: string
 *                 format: uuid
 *     responses:
 *       200:
 *         description: Route shared successfully
 */
router.post('/:id/share', routeController.shareRoute);

export default router;

