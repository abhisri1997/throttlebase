import { Router } from "express";
import { authenticate } from "../middleware/auth.middleware.js";
import * as GarageController from "../controllers/manage-garage.controller.js";

const router = Router();

router.use(authenticate);

/**
 * @swagger
 * components:
 *  schemas:
 *    Vehicle:
 *      type: object
 *      properties:
 *        id:
 *          type: string
 *        rider_id:
 *          type: string
 *        make:
 *          type: string
 *        model:
 *          type: string
 *        year:
 *          type: number
 *        engine_capacity_cc:
 *          type: number
 *    Error:
 *      type: object
 *      properties:
 *        error:
 *          type: string
 */

/**
 * @swagger
 * /api/garage/vehicle:
 *   post:
 *     summary: Add a new vehicle to the rider's garage
 *     tags:
 *       - Garage
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               make:
 *                 type: string
 *                 example: Honda
 *               model:
 *                 type: string
 *                 example: CBR650R
 *               year:
 *                 type: number
 *                 example: 2023
 *               engine_capacity_cc:
 *                 type: number
 *                 example: 649
 *             required:
 *               - make
 *               - model
 *               - year
 *               - engine_capacity_cc
 *     responses:
 *       200:
 *         description: Vehicle added successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                   description: The ID of the added vehicle
 *                 rider_id:
 *                   type: string
 *                   description: The ID of the rider
 *                 make:
 *                   type: string
 *                 model:
 *                   type: string
 *                 year:
 *                   type: number
 *                 engine_capacity_cc:
 *                   type: number
 */
router.post("/vehicle", GarageController.addVehicleToGarage);

/**
 * @swagger
 * /api/garage/vehicle:
 *   get:
 *     summary: Get all vehicles in the rider's garage
 *     tags:
 *       - Garage
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: A list of vehicles
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: "#/components/schemas/Vehicle"
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/Error"
 */
router.get("/vehicle", GarageController.getGarageVehicles);
/**
 * @swagger
 * /api/garage/vehicle/{vehicleId}:
 *   put:
 *     summary: Update a vehicle in the rider's garage
 *     tags:
 *       - Garage
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: vehicleId
 *         schema:
 *           type: string
 *         required: true
 *         description: The ID of the vehicle to update
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               make:
 *                 type: string
 *                 example: Honda
 *               model:
 *                 type: string
 *                 example: CBR650R
 *               year:
 *                 type: number
 *                 example: 2023
 *               engine_capacity_cc:
 *                 type: number
 *                 example: 649
 *             required:
 *               - make
 *               - model
 *               - year
 *               - engine_capacity_cc
 *     responses:
 *       200:
 *         description: Vehicle updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                   description: The ID of the updated vehicle
 *                 rider_id:
 *                   type: string
 *                   description: The ID of the rider
 *                 make:
 *                   type: string
 *                 model:
 *                   type: string
 *                 year:
 *                   type: number
 *                 engine_capacity_cc:
 *                   type: number
 *       400:
 *         description: Invalid request
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/Error"
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/Error"
 */
router.put("/vehicle/:vehicleId", GarageController.updateVehicleInGarage);
/**
 * @swagger
 * /api/garage/vehicle/{vehicleId}:
 *   delete:
 *     summary: Delete a vehicle from the rider's garage
 *     tags:
 *       - Garage
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: vehicleId
 *         schema:
 *           type: string
 *         required: true
 *         description: The ID of the vehicle to delete
 *     responses:
 *       200:
 *         description: Vehicle deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                   description: The ID of the deleted vehicle
 *                 rider_id:
 *                   type: string
 *                   description: The ID of the rider
 *                 make:
 *                   type: string
 *                 model:
 *                   type: string
 *                 year:
 *                   type: number
 *                 engine_capacity_cc:
 *                   type: number
 *       400:
 *         description: Invalid request
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/Error"
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/Error"
 */
router.delete("/vehicle/:vehicleId", GarageController.deleteVehicleFromGarage);

export default router;