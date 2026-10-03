import type { Request, Response } from "express";
import * as GarageService from "../services/manage-garage.service.js";

export const getGarageVehicles = async (req: Request, res: Response) => {
    try {
        const riderId = req.rider!.riderId;
        const vehicles = await GarageService.getGarageVehicles(riderId);
        return res.json(vehicles);
    } catch (error) {
        console.error("Get garage vehicles error:", error);
        return res.status(500).json({ error: "Internal server error" });
    }
}

export const addVehicleToGarage = async (req: Request, res: Response) => {
    try {
        const riderId = req.rider!.riderId;
        const vehicle = req.body;
        const addedVehicle = await GarageService.addVehicleToGarage(riderId, vehicle);
        return res.json(addedVehicle);
    } catch (error) {
        console.error("Add vehicle to garage error:", error);
        return res.status(500).json({ error: "Internal server error" });
    }
}

export const updateVehicleInGarage = async (req: Request, res: Response) => {
    try {
        const vehicleId = req.params.vehicleId as string;
        const vehicle = req.body;
        const updatedVehicle = await GarageService.updateVehicleInGarage(vehicleId, vehicle);
        return res.json(updatedVehicle);
    } catch (error) {
        console.error("Update vehicle in garage error:", error);
        return res.status(500).json({ error: "Internal server error" });
    }
}

export const deleteVehicleFromGarage = async (req: Request, res: Response) => {
    try {
        const vehicleId = req.params.vehicleId as string;
        const deletedVehicle = await GarageService.deleteVehicleFromGarage(vehicleId);
        return res.json(deletedVehicle);
    } catch (error) {
        console.error("Delete vehicle from garage error:", error);
        return res.status(500).json({ error: "Internal server error" });
    }
}