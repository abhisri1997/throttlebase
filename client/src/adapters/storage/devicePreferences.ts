import AsyncStorage from "@react-native-async-storage/async-storage";
import type { DevicePreferences } from "../../ports/DevicePreferences";

/** AsyncStorage: plain files on the phone, localStorage on the web. */
export const createDevicePreferences = (): DevicePreferences => ({
  get: (key) => AsyncStorage.getItem(key),
  set: (key, value) => AsyncStorage.setItem(key, value),
});
