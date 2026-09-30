/**
 * Small, non-secret choices remembered on this device, such as a note the
 * rider has dismissed. Secrets belong in SecureStorage instead.
 */
export interface DevicePreferences {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
}
