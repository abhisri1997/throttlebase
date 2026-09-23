import { createPrivateKey, createPublicKey } from "node:crypto";
import { importPKCS8, type JWK, type KeyObject } from "jose";

/**
 * Signing keys, loaded from configuration.
 *
 * ES256 rather than RS256: a P-256 key is a fraction of the size for
 * equivalent strength, which keeps tokens small on a mobile connection, and
 * it is universally supported by JWT libraries.
 *
 * PEM values may arrive base64-encoded. Dashboards mangle multi-line
 * environment variables in ways that are tedious to debug, so a single-line
 * form is accepted and normalised here.
 */

/**
 * A JWKS document, named in our own terms so callers outside adapters/ need
 * no vendor type import.
 */
export interface PublicKeySet {
  keys: JWK[];
}

export interface SigningKey {
  kid: string;
  privateKey: CryptoKey | KeyObject;
  publicJwk: JWK;
}

export interface VerificationKey {
  kid: string;
  publicJwk: JWK;
}

const PEM_PRIVATE_HEADER = "-----BEGIN PRIVATE KEY-----";
const PEM_PUBLIC_HEADER = "-----BEGIN PUBLIC KEY-----";

/**
 * OpenSSL emits EC keys in SEC1 form by default, which reads
 * "-----BEGIN EC PRIVATE KEY-----". It carries exactly the same key as the
 * PKCS#8 form, in a different envelope.
 */
const PEM_SEC1_HEADER = "-----BEGIN EC PRIVATE KEY-----";

/** Accepts a raw PEM or a base64 blob containing one. */
export const normalizePem = (
  value: string,
  header: string,
  alsoAccept: readonly string[] = [],
): string => {
  const accepted = [header, ...alsoAccept];
  const trimmed = value.trim();

  if (accepted.some((prefix) => trimmed.startsWith(prefix))) {
    return trimmed;
  }

  const decoded = Buffer.from(trimmed, "base64").toString("utf8").trim();
  if (accepted.some((prefix) => decoded.startsWith(prefix))) {
    return decoded;
  }

  throw new Error(
    `Expected a PEM beginning "${header}", or its base64 encoding. Check the value is complete and not truncated.`,
  );
};

/**
 * Normalises a SEC1 EC key into PKCS#8.
 *
 * `openssl ecparam -genkey` produces SEC1, which is the command most people
 * reach for first, so rejecting it would be a papercut with no security
 * benefit — the key material is identical either way.
 */
const toPkcs8 = (pem: string): string => {
  if (!pem.startsWith(PEM_SEC1_HEADER)) {
    return pem;
  }

  return createPrivateKey(pem)
    .export({ type: "pkcs8", format: "pem" })
    .toString();
};

export const loadSigningKey = async (input: {
  pem: string;
  kid: string;
}): Promise<SigningKey> => {
  const pem = toPkcs8(
    normalizePem(input.pem, PEM_PRIVATE_HEADER, [PEM_SEC1_HEADER]),
  );
  const privateKey = await importPKCS8(pem, "ES256");

  // The public half is derived from the private key rather than configured
  // separately: two independently supplied halves can drift, and a JWKS that
  // does not match the signing key fails in a way that is miserable to
  // diagnose.
  //
  // Deriving it from the *public* key object means the private key never has
  // to be extractable, and there is no path by which the private component
  // could end up in the published key set.
  const publicJwk = createPublicKey(pem).export({ format: "jwk" }) as JWK;

  return {
    kid: input.kid,
    privateKey,
    publicJwk: { ...publicJwk, kid: input.kid, alg: "ES256", use: "sig" },
  };
};

/**
 * Additional public keys served by the JWKS endpoint but never used to sign.
 *
 * During a key rotation the previous public key must stay published until
 * every token signed with it has expired, or in-flight requests fail.
 */
export const loadVerificationKey = async (input: {
  pem: string;
  kid: string;
}): Promise<VerificationKey> => {
  const pem = normalizePem(input.pem, PEM_PUBLIC_HEADER);
  const publicJwk = createPublicKey(pem).export({ format: "jwk" }) as JWK;

  return {
    kid: input.kid,
    publicJwk: { ...publicJwk, kid: input.kid, alg: "ES256", use: "sig" },
  };
};
