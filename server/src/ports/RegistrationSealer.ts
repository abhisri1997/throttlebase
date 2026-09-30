import type { RegistrationRecord } from "../core/riders/registrationRecord.js";

/**
 * A registration record sealed so that only the holder of a private key kept
 * offline can open it. The key id names which key sealed it, so keys can be
 * replaced: a record keeps the key it was sealed with.
 */
export interface SealedRecord {
  keyId: string;
  box: Record<string, string>;
}

/** Seals registration records at account deletion. It can seal; it can't open. */
export interface RegistrationSealer {
  seal(record: RegistrationRecord): SealedRecord;
}
