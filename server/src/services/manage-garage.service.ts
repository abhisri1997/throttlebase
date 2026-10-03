import { query } from "../config/db.js";
import { getById } from "./rider.service.js";

export interface GarageVehicleDetails {
    make: string;
    model: string;
    year: number;
    engine_capacity_cc: number;
    image_url?: string;
}

export async function getGarageVehicles(riderId: string): Promise<GarageVehicleDetails[]> {
    const result = await query(`SELECT * FROM vehicles WHERE rider_id = $1`, [riderId]);

    if (result.rows.length === 0) {
        return [];
    }

    return result.rows as GarageVehicleDetails[];
}

export async function addVehicleToGarage(riderId: string, vehicle: GarageVehicleDetails): Promise<GarageVehicleDetails> {
    const rider = await getById(riderId);
    if (!rider) throw new Error("Rider not found");

    const insertResult = await query(`INSERT INTO vehicles (rider_id, make, model, year, engine_capacity_cc, image_url) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`, [riderId, vehicle.make, vehicle.model, vehicle.year, vehicle.engine_capacity_cc, vehicle.image_url || null]);

    if (insertResult.rows.length === 0) {
        return [] as unknown as GarageVehicleDetails;
    }

    return insertResult.rows[0] as GarageVehicleDetails;
}

export async function updateVehicleInGarage(vehicleId: string, vehicle: GarageVehicleDetails): Promise<GarageVehicleDetails> {
    const updateResult = await query(`UPDATE vehicles SET make = $1, model = $2, year = $3, engine_capacity_cc = $4, image_url = $5 WHERE id = $6 RETURNING *`, [vehicle.make, vehicle.model, vehicle.year, vehicle.engine_capacity_cc, vehicle.image_url || null, vehicleId]);

    if (updateResult.rows.length === 0) {
        return [] as unknown as GarageVehicleDetails;
    }

    return updateResult.rows[0] as GarageVehicleDetails;
}

export async function deleteVehicleFromGarage(vehicleId: string): Promise<GarageVehicleDetails> {
    const deleteResult = await query(`DELETE FROM vehicles WHERE id = $1 RETURNING *`, [vehicleId]);

    if (deleteResult.rows.length === 0) {
        return [] as unknown as GarageVehicleDetails;
    }

    return deleteResult.rows[0] as GarageVehicleDetails;
}