import { Router } from "express";
import { authenticate } from "../middleware/auth.middleware.js";
import * as garageSuggestionController from "../controllers/garageSuggestion.controller.js";

const router = Router();

router.use(authenticate);

/**
 * @swagger
 * /api/garage-suggestion/vehicle-brand:
 *  get:
 *    summary: Get all vehicle brands
 *    tags:
 *      - Vehicle Suggestions
 *    security:
 *      - bearerAuth: []
 *    responses:
 *      200:
 *        description: Vehicle brands fetched successfully
 *      401:
 *        description: Unauthorized
 *      500:
 *        description: Failed to fetch vehicle brands
 */
router.get('/vehicle-brand', garageSuggestionController.getVehicleBrands);

/**
 * @swagger
 * /vehicle-model/{brandId}:
 *  get:
 *    summary: Get all vehicle models by brand
 *    tags:
 *      - Vehicle Suggestions
 *    security:
 *      - bearerAuth: []
 *    parameters:
 *      - name: brandId
 *        in: path
 *        required: true
 *        schema:
 *          type: string
 *    responses:
 *      200:
 *        description: Vehicle models fetched successfully
 *      401:
 *        description: Unauthorized
 *      500:
 *        description: Failed to fetch vehicle models
 */
router.get('/vehicle-model/:brandId', garageSuggestionController.getVehicleModelsByBrand);

export default router;