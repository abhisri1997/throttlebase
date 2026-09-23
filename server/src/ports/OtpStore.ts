export interface OtpRecord {
  id: string;
  email: string;
  codeHash: string;
  expiresAt: Date;
  attempts: number;
  consumedAt: Date | null;
  createdAt: Date;
}

export interface CreateOtpInput {
  email: string;
  codeHash: string;
  expiresAt: Date;
  ip: string | null;
}

export interface OtpStore {
  /**
   * Marks every outstanding code for this address as consumed, so issuing a
   * new code invalidates the previous one.
   */
  invalidateOutstanding(email: string, at: Date): Promise<void>;
  create(input: CreateOtpInput): Promise<OtpRecord>;
  /** Most recent code that is neither consumed nor superseded. */
  findLatestUnconsumed(email: string): Promise<OtpRecord | null>;
  /** Returns the attempt count after incrementing. */
  incrementAttempts(id: string): Promise<number>;
  consume(id: string, at: Date): Promise<void>;
}
