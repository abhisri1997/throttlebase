/**
 * Sealing with a public key: anyone with the public key can seal, only the
 * holder of the private key can open. Each box gets its own random AES-256-GCM
 * key, and that key is wrapped with RSA-OAEP (SHA-256) for the public key.
 * GCM's tag means a box that was changed won't open.
 *
 * Node's built-in crypto only; no dependency.
 */
import {
  constants,
  createCipheriv,
  createDecipheriv,
  createHash,
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  privateDecrypt,
  publicEncrypt,
  randomBytes,
} from "node:crypto";

export const SEALED_BOX_ALG = "RSA-OAEP-256+A256GCM";

/** RSA key size: comfortably beyond what can be broken for years to come. */
const RSA_BITS = 3072;
const IV_BYTES = 12;

/** Every part base64. */
export interface SealedBox {
  alg: string;
  wrapped_key: string;
  iv: string;
  tag: string;
  ciphertext: string;
  [part: string]: string;
}

const OAEP = { padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256" } as const;

export const sealText = (plaintext: string, publicKeyPem: string): SealedBox => {
  const dataKey = randomBytes(32);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", dataKey, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const wrappedKey = publicEncrypt({ key: createPublicKey(publicKeyPem), ...OAEP }, dataKey);
  return {
    alg: SEALED_BOX_ALG,
    wrapped_key: wrappedKey.toString("base64"),
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    ciphertext: ciphertext.toString("base64"),
  };
};

export const openBox = (box: SealedBox, privateKeyPem: string): string => {
  if (box.alg !== SEALED_BOX_ALG) throw new Error(`Unknown sealed box algorithm: ${box.alg}`);
  const dataKey = privateDecrypt({ key: createPrivateKey(privateKeyPem), ...OAEP }, Buffer.from(box.wrapped_key, "base64"));
  const decipher = createDecipheriv("aes-256-gcm", dataKey, Buffer.from(box.iv, "base64"));
  decipher.setAuthTag(Buffer.from(box.tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(box.ciphertext, "base64")), decipher.final()]).toString("utf8");
};

/**
 * A short id for a key pair, from its public key: the first 16 hex digits of
 * the SHA-256 of the key's DER form. The same from either half of the pair.
 */
export const keyIdOf = (pem: string): string => {
  const publicKey = pem.includes("PRIVATE KEY") ? createPublicKey(createPrivateKey(pem)) : createPublicKey(pem);
  const der = publicKey.export({ type: "spki", format: "der" });
  return createHash("sha256").update(der).digest("hex").slice(0, 16);
};

export const generateSealingKeyPair = (): { publicKeyPem: string; privateKeyPem: string } => {
  const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: RSA_BITS });
  return {
    publicKeyPem: publicKey.export({ type: "spki", format: "pem" }).toString(),
    privateKeyPem: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
  };
};
