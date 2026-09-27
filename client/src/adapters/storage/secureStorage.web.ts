import AsyncStorage from "@react-native-async-storage/async-storage";
import type { SecureStorage } from "../../ports/SecureStorage";

/**
 * Web implementation of the SecureStorage port.
 *
 * Metro picks this file over secureStorage.ts when bundling for web.
 *
 * There is no keychain in a browser. expo-secure-store ships an empty stub
 * for web (`export default {}`), so calling it would throw — and the honest
 * alternative is localStorage, which is what AsyncStorage uses here.
 *
 * That is a real reduction in protection, and worth being clear about: a
 * refresh token in localStorage is readable by any script running on the
 * origin, so an XSS bug becomes an account compromise. The mitigations are
 * the ones that already apply — the strict CSP the API sets, short-lived
 * access tokens, and refresh-token rotation that makes a stolen token
 * detectable on reuse. Native builds still use the keychain.
 */
export const createSecureStorage = (): SecureStorage => ({
  get: (key: string): Promise<string | null> => AsyncStorage.getItem(key),

  set: async (key: string, value: string): Promise<void> => {
    await AsyncStorage.setItem(key, value);
  },

  remove: async (key: string): Promise<void> => {
    await AsyncStorage.removeItem(key);
  },
});
