import type { Request, Response } from "express";
import * as garageSuggestionService from "../services/garageSuggestion.service.js";

export const getVehicleBrands = async (req: Request, res: Response) => {
    try {
        const response = await garageSuggestionService.getVehicleBrands();
        return res.status(200).json(response);
    } catch (error) {
        console.error('Failed to fetch vehicle brands:', error)
        return res.status(500).json({ message: "Failed to fetch vehicle brands" });
    }
}

export const getVehicleModelsByBrand = async (req: Request, res: Response) => {
    try {
        const brandId = req.params.brandId as string;
        const response = await garageSuggestionService.getVehicleModelsByBrand(brandId);
        return res.status(200).json(response);
    } catch (error) {
        console.error('Failed to fetch vehicle models:', error)
        return res.status(500).json({ message: "Failed to fetch vehicle models" });
    }
}