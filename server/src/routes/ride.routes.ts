import { Router } from "express";
import { authenticate } from "../middleware/auth.middleware.js";
import * as rideController from "../controllers/ride.controller.js";

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
 *               status:
 *                 type: string
 *                 enum: [draft, scheduled]
 *                 default: draft
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
 *                 properties:
 *                   min_experience:
 *                     type: string
 *                     enum: [beginner, intermediate, expert]
 *                   mandatory_gear:
 *                     type: array
 *                     items:
 *                       type: string
 *                   vehicle_type:
 *                     type: string
 *               stops:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     type:
 *                       type: string
 *                       enum: [fuel, rest, photo]
 *                     location_coords:
 *                       type: array
 *                       items:
 *                         type: number
 *     responses:
 *       201:
 *         description: Ride created (transaction - ride + captain participant + stops)
 *       400:
 *         description: Validation error
 */
router.get("/", authenticate, rideController.getAllRides);
router.get("/history", authenticate, rideController.getHistory);
router.post("/", authenticate, rideController.createRide);

/**
 * @swagger
 * /api/rides/{id}:
 *   get:
 *     summary: Get ride details with captain info, participants, and stops
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
 *     summary: Update a ride (captain or co-captain only). Status transitions are validated.
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
 *                 description: "Allowed transitions: draft→scheduled|cancelled, scheduled→active|cancelled, active→completed|cancelled"
 *               visibility:
 *                 type: string
 *                 enum: [public, private]
 *     responses:
 *       200:
 *         description: Ride updated
 *       400:
 *         description: Invalid status transition or validation error
 *       404:
 *         description: Ride not found or not the captain/co-captain
 */
router.get("/:id", authenticate, rideController.getRide);
router.patch("/:id", authenticate, rideController.updateRide);
router.delete("/:id", authenticate, rideController.deleteRide);

/**
 * @swagger
 * /api/rides/{id}/join:
 *   post:
 *     summary: Join a ride as a participant (enforces max capacity)
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
 *         description: Already a participant or ride is full
 *       404:
 *         description: Ride not found
 */
router.post("/:id/join", authenticate, rideController.joinRide);

/**
 * @swagger
 * /api/rides/{id}/promote:
 *   post:
 *     summary: Promote a rider to co-captain (captain only)
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
 *             required: [rider_id]
 *             properties:
 *               rider_id:
 *                 type: string
 *                 format: uuid
 *     responses:
 *       200:
 *         description: Rider promoted to co-captain
 *       400:
 *         description: Cannot promote (not captain or target not a participant)
 */
router.post("/:id/promote", authenticate, rideController.promoteCoCaptain);

/**
 * @swagger
 * /api/rides/{id}/stops:
 *   get:
 *     summary: List all stops for a ride
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
 *         description: Array of ride stops
 *   post:
 *     summary: Request a stop on a ride (any participant)
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
 *             required: [type, location_coords]
 *             properties:
 *               type:
 *                 type: string
 *                 enum: [fuel, rest, photo, unplanned]
 *               location_coords:
 *                 type: array
 *                 items:
 *                   type: number
 *                 example: [77.62, 12.93]
 *     responses:
 *       201:
 *         description: Stop request submitted (auto-approved if captain)
 *       403:
 *         description: Not a participant
 */
router.get("/:id/stops", authenticate, rideController.getRideStops);
router.post("/:id/stops", authenticate, rideController.requestStop);

/**
 * @swagger
 * /api/rides/{id}/start-location:
 *   patch:
 *     summary: Update specific start location override for an auto-calculate ride
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
 *             required: [location_coords]
 *             properties:
 *               location_coords:
 *                 type: array
 *                 items:
 *                   type: number
 *                 example: [77.62, 12.93]
 *     responses:
 *       200:
 *         description: Start location updated successfully
 *       400:
 *         description: Invalid coords or less than 12 hours before ride
 *       404:
 *         description: Ride not found
 */
router.patch(
  "/:id/start-location",
  authenticate,
  rideController.updateStartLocation,
);

/**
 * @swagger
 * /api/rides/{id}/stops/{stopId}:
 *   patch:
 *     summary: Approve or reject a stop request (captain/co-captain only)
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
 *       - in: path
 *         name: stopId
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
 *             required: [status]
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [approved, rejected]
 *     responses:
 *       200:
 *         description: Stop request approved or rejected
 *       400:
 *         description: Cannot handle (not captain/co-captain or stop not pending)
 */
router.patch(
  "/:id/stops/:stopId",
  authenticate,
  rideController.handleStopRequest,
);

export default router;
