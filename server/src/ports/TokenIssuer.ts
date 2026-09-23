export interface IssuedAccessToken {
  token: string;
  expiresAt: Date;
}

export interface AccessTokenSubject {
  riderId: string;
  roles: readonly string[];
}

export interface TokenIssuer {
  issueAccessToken(subject: AccessTokenSubject): Promise<IssuedAccessToken>;
}
