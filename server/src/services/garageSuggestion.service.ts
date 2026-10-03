import { query } from "../config/db.js";

export interface VehicleBrand {
    id: string;
    name: string;
}

export interface VehicleModel {
    id: string;
    name: string;
    brand_id: string;
    image_url: string | null;
    cc: string;
}

const VehicleModelColumns = ['id', 'name', 'brand_id', 'image_url', 'cc'];

export const getVehicleBrands = async (): Promise<VehicleBrand[]> => {
    const result = await query('select id, name from brands order by name');
    return result.rows as VehicleBrand[];
}

export const getVehicleModelsByBrand = async (brandId: string): Promise<VehicleModel[]> => {
    const result = await query(`select ${VehicleModelColumns.join(', ')} from models where brand_id = $1 order by name`, [brandId]);
    return result.rows as VehicleModel[];
}