import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Crypto from "expo-crypto";
import * as SecureStore from "expo-secure-store";
import type { SecureStorage } from "../../ports/SecureStorage";

/**
 * Keychain / Keystore storage, with an escape hatch for large values.
 *
 * SecureStore is backed by the iOS keychain and Android keystore, which are
 * meant for small secrets. iOS warns above 2048 bytes and Android can fail
 * outright, so anything larger is stored as ciphertext in AsyncStorage with
 * only its key in SecureStore. The secret never lands unencrypted on disk
 * either way.
 *
 * Tokens are far below the threshold; this matters for anything larger we
 * later decide to protect.
 */

const INLINE_LIMIT_BYTES = 1800;
const ENVELOPE_PREFIX = "tb.env.";
const CIPHERTEXT_PREFIX = "tb.ct.";

const byteLength = (value: string): number =>
  // React Native has TextEncoder; this avoids assuming one byte per char for
  // non-ASCII content.
  new TextEncoder().encode(value).length;

const toBase64 = (bytes: Uint8Array): string => {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return globalThis.btoa(binary);
};

const fromBase64 = (value: string): Uint8Array => {
  const binary = globalThis.atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
};

/**
 * XOR against a keystream derived from a stored random key.
 *
 * Deliberately simple: this path exists so a large value is never written to
 * AsyncStorage in the clear, and the real protection is that the key lives in
 * the keychain. Anything needing genuine authenticated encryption should use
 * a dedicated crypto library rather than extend this.
 */
const keystream = async (key: Uint8Array, length: number): Promise<Uint8Array> => {
  const out = new Uint8Array(length);
  let offset = 0;
  let counter = 0;

  while (offset < length) {
    const block = await Crypto.digest(
      Crypto.CryptoDigestAlgorithm.SHA256,
      new Uint8Array([...key, ...new Uint8Array([counter & 0xff, (counter >> 8) & 0xff])]),
    );
    const blockBytes = new Uint8Array(block);
    const take = Math.min(blockBytes.length, length - offset);
    out.set(blockBytes.subarray(0, take), offset);
    offset += take;
    counter += 1;
  }

  return out;
};

const xor = (data: Uint8Array, stream: Uint8Array): Uint8Array => {
  const out = new Uint8Array(data.length);
  for (let i = 0; i < data.length; i += 1) {
    out[i] = (data[i] as number) ^ (stream[i] as number);
  }
  return out;
};

export const createSecureStorage = (): SecureStorage => ({
  get: async (key: string): Promise<string | null> => {
    const direct = await SecureStore.getItemAsync(key);
    if (direct !== null) {
      return direct;
    }

    const envelopeKey = await SecureStore.getItemAsync(ENVELOPE_PREFIX + key);
    if (envelopeKey === null) {
      return null;
    }

    const ciphertext = await AsyncStorage.getItem(CIPHERTEXT_PREFIX + key);
    if (ciphertext === null) {
      return null;
    }

    const bytes = fromBase64(ciphertext);
    const stream = await keystream(fromBase64(envelopeKey), bytes.length);
    return new TextDecoder().decode(xor(bytes, stream));
  },

  set: async (key: string, value: string): Promise<void> => {
    if (byteLength(value) <= INLINE_LIMIT_BYTES) {
      // Clear any envelope left by a previously larger value, so a stale
      // ciphertext can never be read back in its place.
      await SecureStore.deleteItemAsync(ENVELOPE_PREFIX + key).catch(() => undefined);
      await AsyncStorage.removeItem(CIPHERTEXT_PREFIX + key).catch(() => undefined);
      await SecureStore.setItemAsync(key, value);
      return;
    }

    const envelopeKey = Crypto.getRandomBytes(32);
    const plaintext = new TextEncoder().encode(value);
    const stream = await keystream(envelopeKey, plaintext.length);

    await SecureStore.deleteItemAsync(key).catch(() => undefined);
    await SecureStore.setItemAsync(ENVELOPE_PREFIX + key, toBase64(envelopeKey));
    await AsyncStorage.setItem(CIPHERTEXT_PREFIX + key, toBase64(xor(plaintext, stream)));
  },

  remove: async (key: string): Promise<void> => {
    await Promise.all([
      SecureStore.deleteItemAsync(key).catch(() => undefined),
      SecureStore.deleteItemAsync(ENVELOPE_PREFIX + key).catch(() => undefined),
      AsyncStorage.removeItem(CIPHERTEXT_PREFIX + key).catch(() => undefined),
    ]);
  },
});
