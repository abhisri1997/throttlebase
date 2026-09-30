import type { RegistrationSealer } from "../../ports/RegistrationSealer.js";
import { keyIdOf, sealText } from "./sealedBox.js";

/** Seals registration records with the operator's public key. */
export const createRegistrationSealer = (publicKeyPem: string): RegistrationSealer => {
  const keyId = keyIdOf(publicKeyPem);
  return {
    seal: (record) => ({ keyId, box: sealText(JSON.stringify(record), publicKeyPem) }),
  };
};
