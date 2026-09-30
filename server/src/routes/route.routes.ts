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
/**
 * @swagger
 * /api/routes/search:
 *   get:
 *     summary: Routes from one place to another, nearby or by name, in either direction
 *     description: >
 *       A searched place matches a route end named after it (or a stop), or an
 *       end within the route's radius: 15% of its length, 5 to 25 km. Routes
 *       ridden the other way come after same-direction ones, with
 *       match.direction "reverse". Each result carries match.start_gap_km and
 *       match.end_gap_km from the searched places.
 *     tags: [Routes]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: query, name: from_lat, schema: { type: number } }
 *       - { in: query, name: from_lng, schema: { type: number } }
 *       - { in: query, name: from_name, schema: { type: string } }
 *       - { in: query, name: to_lat, schema: { type: number } }
 *       - { in: query, name: to_lng, schema: { type: number } }
 *       - { in: query, name: to_name, schema: { type: string } }
 *       - { in: query, name: min_km, schema: { type: number } }
 *       - { in: query, name: max_km, schema: { type: number } }
 *       - { in: query, name: highlights, schema: { type: string }, description: "Comma-separated; all must match" }
 *     responses:
 *       200:
 *         description: Up to 50 routes, best first, each with a match object
 *       400:
 *         description: Invalid search (e.g. a latitude without its longitude)
 */
router.get('/search', routeController.searchRoutes);

/**
 * @swagger
 * /api/routes/{id}:
 *   get:
 *     summary: A route the rider may see, with its stops and road feedback
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
 *         description: The route
 *       404:
 *         description: Not found, or not visible to this rider
 *   patch:
 *     summary: Change who can see your route (owner only)
 *     description: >
 *       Made private, the route leaves search, the Routes list and other
 *       riders' bookmarks at once. Shares grant access only while the route
 *       is set to specific_riders. Shown to others, the route is shown
 *       without its first and last ~500 m, unless an end is at a public place
 *       such as a hotel or fuel station; the owner still sees it whole.
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
 *             required: [visibility]
 *             properties:
 *               visibility:
 *                 type: string
 *                 enum: [private, specific_riders, public]
 *     responses:
 *       200:
 *         description: "{ route: { id, visibility } }"
 *       400:
 *         description: Invalid input
 *       404:
 *         description: Not your route, or no such route
 *       422:
 *         description: Too short to show others once its personal ends are hidden (code ROUTE_TOO_SHORT)
 *   delete:
 *     summary: Delete your route for good (owner only)
 *     description: >
 *       Its stops, shares, bookmarks and road feedback go with it. Rides
 *       planned on it keep their road and lose only the link.
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
 *         description: Route deleted
 *       404:
 *         description: Not your route, or no such route
 */
router.get('/:id', routeController.getRoute);
router.patch('/:id', routeController.updateRouteVisibility);
router.delete('/:id', routeController.deleteRoute);

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
 *     summary: Share your route with another rider (owner only)
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
 *         description: Route shared, or already shared
 *       400:
 *         description: Invalid input
 *       404:
 *         description: Not your route, or no such rider
 */
router.post('/:id/share', routeController.shareRoute);

export default router;

