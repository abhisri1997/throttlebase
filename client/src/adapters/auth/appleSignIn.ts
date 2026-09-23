import * as AppleAuthentication from "expo-apple-authentication";
import * as Crypto from "expo-crypto";
import { SignInCancelledError } from "./googleSignIn";

export interface AppleCredentialPayload {
  identityToken: string;
  rawNonce: string;
  fullName: { givenName: string | null; familyName: string | null } | null;
}

/**
 * Native Apple sign-in.
 *
 * The nonce binds the returned token to this attempt. We generate a random
 * value, hand Apple its SHA-256 digest, and send the raw value to our
 * backend, which recomputes the digest and compares. A token captured from
 * one session therefore cannot be replayed into another.
 */
export const isAppleSignInAvailable = async (): Promise<boolean> => {
  try {
    return await AppleAuthentication.isAvailableAsync();
  } catch {
    return false;
  }
};

export const signInWithAppleNatively =
  async (): Promise<AppleCredentialPayload> => {
    const rawNonce = Array.from(Crypto.getRandomBytes(32))
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");

    const hashedNonce = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      rawNonce,
    );

    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
        nonce: hashedNonce,
      });

      if (!credential.identityToken) {
        throw new SignInCancelledError();
      }

      return {
        identityToken: credential.identityToken,
        rawNonce,
        // Apple returns a name only on the very first sign-in, so it is
        // forwarded now or lost for good.
        fullName: credential.fullName
          ? {
              givenName: credential.fullName.givenName ?? null,
              familyName: credential.fullName.familyName ?? null,
            }
          : null,
      };
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        (error as { code: string }).code === "ERR_REQUEST_CANCELED"
      ) {
        throw new SignInCancelledError();
      }
      throw error;
    }
  };
