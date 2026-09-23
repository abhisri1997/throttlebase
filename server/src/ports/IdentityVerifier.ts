/** An identity proven by a third-party issuer, reduced to what core needs. */
export interface VerifiedIdentity {
  provider: IdentityProvider;
  /** The issuer's stable subject claim. Never used as our own rider id. */
  subject: string;
  email: string | null;
  /**
   * Whether the issuer asserts the address is verified. Account linking is
   * only ever allowed on a verified address.
   */
  emailVerified: boolean;
  displayName: string | null;
  avatarUrl: string | null;
}

export type IdentityProvider = "google" | "apple" | "email";

export interface AppleFullName {
  givenName: string | null;
  familyName: string | null;
}

export interface AppleCredential {
  identityToken: string;
  /** The un-hashed nonce the app generated; we compare SHA-256 of it. */
  rawNonce: string;
  /** Apple returns a name only on first sign-in, so the app forwards it. */
  fullName?: AppleFullName | null;
}

export interface GoogleIdentityVerifier {
  verify(idToken: string): Promise<VerifiedIdentity>;
}

export interface AppleIdentityVerifier {
  verify(credential: AppleCredential): Promise<VerifiedIdentity>;
}
