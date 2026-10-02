import { Router } from "express";
import { authenticate } from "../middleware/auth.middleware.js";
import * as garageSuggestionController from "../controllers/garageSuggestion.controller.js";

const router = Router();

router.use(authenticate);

router.get('/vehicle-brand', garageSuggestionController.getVehicleBrands);
router.get('/vehicle-model/:brandId', garageSuggestionController.getVehicleModelsByBrand);

export default router;