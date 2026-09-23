/**
 * Key/value storage for secrets.
 *
 * Refresh tokens live here rather than in AsyncStorage: AsyncStorage is plain
 * unencrypted files, readable on a rooted or jailbroken device and included
 * in some device backups.
 */
export interface SecureStorage {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}
