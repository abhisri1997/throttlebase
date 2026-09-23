export interface SessionRecord {
  id: string;
  riderId: string;
  /**
   * Groups every rotation of one login. Presenting an already-rotated token
   * revokes the whole family.
   */
  familyId: string;
  refreshTokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
  replacedBy: string | null;
  lastUsedAt: Date | null;
  userAgent: string | null;
  ipAddress: string | null;
  createdAt: Date;
}

export interface CreateSessionInput {
  riderId: string;
  familyId: string;
  refreshTokenHash: string;
  expiresAt: Date;
  userAgent: string | null;
  ipAddress: string | null;
}

export interface SessionRepository {
  create(input: CreateSessionInput): Promise<SessionRecord>;
  findByRefreshTokenHash(hash: string): Promise<SessionRecord | null>;
  /**
   * Atomically marks `currentSessionId` as replaced and inserts its successor.
   */
  rotate(input: {
    currentSessionId: string;
    next: CreateSessionInput;
    at: Date;
  }): Promise<SessionRecord>;
  revokeFamily(familyId: string, at: Date): Promise<number>;
  revokeAllForRider(riderId: string, at: Date): Promise<number>;
}
