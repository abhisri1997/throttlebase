export interface AccessTokenClaims {
  sub: string;
  iss: string;
  aud: string;
  iat: number;
  exp: number;
  roles: readonly string[];
}

export interface TokenVerifier {
  /** Rejects on bad signature, wrong issuer/audience, or expiry. */
  verifyAccessToken(token: string): Promise<AccessTokenClaims>;
}
