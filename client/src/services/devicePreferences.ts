import { createDevicePreferences } from "../adapters/storage/devicePreferences";
import type { DevicePreferences } from "../ports/DevicePreferences";

export const devicePreferences: DevicePreferences = createDevicePreferences();
