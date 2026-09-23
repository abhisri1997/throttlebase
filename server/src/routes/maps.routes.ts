import { Router } from "express";
import { authenticate } from "../middleware/auth.middleware.js";
import { mapsProxyLimiter } from "../middleware/rateLimit.middleware.js";
import * as MapsController from "../controllers/maps.controller.js";

const router = Router();

// Every route here spends money on outbound Google calls, so all of them are
// authenticated and rate limited without exception. No public page in the app
// reaches these endpoints: the only unauthenticated client route is the shared
// post view, which renders no map, picker or route.
router.use(authenticate);
router.use(mapsProxyLimiter);

/**
 * @swagger
 * /api/maps/directions:
 *   post:
 *     summary: Driving directions between two points, with optional stopovers
 *     tags: [Maps]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [origin, destination]
 *             properties:
 *               origin:
 *                 type: object
 *                 properties: { lat: { type: number }, lng: { type: number } }
 *               destination:
 *                 type: object
 *                 properties: { lat: { type: number }, lng: { type: number } }
 *               waypoints:
 *                 type: array
 *                 maxItems: 10
 *                 items:
 *                   type: object
 *                   properties: { lat: { type: number }, lng: { type: number } }
 *               preferFastest:
 *                 type: boolean
 *                 description: Request alternatives so the fastest can be chosen. Ignored when waypoints are present.
 *               trafficAware:
 *                 type: boolean
 *                 description: Request traffic-aware durations. Ignored when waypoints are present.
 *     responses:
 *       200:
 *         description: Mapped routes. An empty routes array means Google found none.
 *       400:
 *         description: Validation failed
 *       429:
 *         description: Rate limit or daily maps budget reached
 *       502:
 *         description: Upstream maps failure
 */
router.post("/directions", MapsController.postDirections);

/**
 * @swagger
 * /api/maps/reverse-geocode:
 *   get:
 *     summary: Resolve coordinates to a formatted address
 *     tags: [Maps]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: lat
 *         required: true
 *         schema: { type: number, minimum: -90, maximum: 90 }
 *       - in: query
 *         name: lng
 *         required: true
 *         schema: { type: number, minimum: -180, maximum: 180 }
 *     responses:
 *       200:
 *         description: "{ formattedAddress } — null when Google knows no address for the point"
 *       400:
 *         description: Validation failed
 *       429:
 *         description: Rate limit or daily maps budget reached
 */
router.get("/reverse-geocode", MapsController.getReverseGeocode);

/**
 * @swagger
 * /api/maps/places/autocomplete:
 *   post:
 *     summary: Place predictions for a search box
 *     tags: [Maps]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [input, sessionToken]
 *             properties:
 *               input: { type: string, maxLength: 100 }
 *               sessionToken:
 *                 type: string
 *                 format: uuid
 *                 description: One token per picker session; the details call ends it.
 *               locationBias:
 *                 type: object
 *                 properties:
 *                   lat: { type: number }
 *                   lng: { type: number }
 *                   radiusM: { type: number }
 *     responses:
 *       200:
 *         description: "{ predictions: [{ placeId, primaryText, secondaryText }] }"
 *       400:
 *         description: Validation failed
 *       429:
 *         description: Rate limit or daily maps budget reached
 */
router.post("/places/autocomplete", MapsController.postPlacesAutocomplete);

/**
 * @swagger
 * /api/maps/places/{placeId}:
 *   get:
 *     summary: Coordinates and address for one place
 *     tags: [Maps]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: placeId
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: sessionToken
 *         schema: { type: string, format: uuid }
 *         description: The token used for autocomplete. Sending it closes the billing session.
 *     responses:
 *       200:
 *         description: "{ placeId, name, address, lat, lng }"
 *       404:
 *         description: Unknown place, or a place with no coordinates
 *       429:
 *         description: Rate limit or daily maps budget reached
 */
router.get("/places/:placeId", MapsController.getPlace);

export default router;
