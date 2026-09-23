import type { Clock } from "../../ports/Clock.js";
import type { EmailSender, OutgoingEmail } from "../../ports/EmailSender.js";
import type { Hasher } from "../../ports/Hasher.js";
import type { IdentityProvider } from "../../ports/IdentityVerifier.js";
import type {
  CreateOtpInput,
  OtpRecord,
  OtpStore,
} from "../../ports/OtpStore.js";
import type { RandomSource } from "../../ports/RandomSource.js";
import type {
  RateLimitDecision,
  RateLimiter,
  RateLimitRequest,
} from "../../ports/RateLimiter.js";
import type {
  ConsentInput,
  CreateRiderInput,
  LinkIdentityInput,
  LoginActivityInput,
  OnboardingInput,
  RiderRecord,
  RiderRepository,
  RiderTransaction,
} from "../../ports/RiderRepository.js";
import type {
  CreateSessionInput,
  SessionRecord,
  SessionRepository,
} from "../../ports/SessionRepository.js";
import type {
  AccessTokenSubject,
  IssuedAccessToken,
  TokenIssuer,
} from "../../ports/TokenIssuer.js";

export class FakeClock implements Clock {
  private current: Date;

  constructor(start = new Date("2026-01-01T00:00:00.000Z")) {
    this.current = start;
  }

  now(): Date {
    return new Date(this.current);
  }

  advanceSeconds(seconds: number): void {
    this.current = new Date(this.current.getTime() + seconds * 1000);
  }
}

/** Deterministic counter-based source, so tests can assert exact values. */
export class FakeRandomSource implements RandomSource {
  private counter = 0;
  scriptedDigits: string[] = [];

  token(byteLength: number): string {
    this.counter += 1;
    return `token-${this.counter}-${byteLength}`;
  }

  digits(count: number): string {
    const scripted = this.scriptedDigits.shift();
    if (scripted !== undefined) {
      return scripted;
    }
    this.counter += 1;
    return String(this.counter).padStart(count, "0").slice(-count);
  }

  uuid(): string {
    this.counter += 1;
    return `uuid-${this.counter}`;
  }
}

/**
 * Not a real digest — it only needs to be deterministic and collision-free
 * for test inputs. Keeping node:crypto out of core/** means the boundary
 * lint rule stays honest.
 */
export class FakeHasher implements Hasher {
  sha256Hex(input: string): string {
    return `h(${input})`;
  }

  timingSafeEqual(a: string, b: string): boolean {
    return a.length === b.length && a === b;
  }
}

export class FakeEmailSender implements EmailSender {
  readonly sent: OutgoingEmail[] = [];

  send(mail: OutgoingEmail): Promise<{ messageId: string }> {
    this.sent.push(mail);
    return Promise.resolve({ messageId: `fake-${this.sent.length}` });
  }

  get last(): OutgoingEmail | undefined {
    return this.sent[this.sent.length - 1];
  }
}

export class FakeTokenIssuer implements TokenIssuer {
  issued: AccessTokenSubject[] = [];
  ttlSeconds = 900;
  constructor(private readonly clock: Clock) {}

  issueAccessToken(subject: AccessTokenSubject): Promise<IssuedAccessToken> {
    this.issued.push(subject);
    return Promise.resolve({
      token: `access-${subject.riderId}-${this.issued.length}`,
      expiresAt: new Date(this.clock.now().getTime() + this.ttlSeconds * 1000),
    });
  }
}

/** Allows everything unless a bucket is explicitly exhausted. */
export class FakeRateLimiter implements RateLimiter {
  readonly calls: RateLimitRequest[] = [];
  private readonly counts = new Map<string, number>();
  blockedBuckets = new Set<string>();

  consume(request: RateLimitRequest): Promise<RateLimitDecision> {
    this.calls.push(request);
    const key = `${request.bucket}:${request.subject}`;
    const next = (this.counts.get(key) ?? 0) + 1;
    this.counts.set(key, next);

    const blocked =
      this.blockedBuckets.has(request.bucket) || next > request.limit;

    return Promise.resolve({
      allowed: !blocked,
      retryAfterSeconds: blocked ? request.windowSeconds : 0,
    });
  }
}

export class FakeOtpStore implements OtpStore {
  readonly records: OtpRecord[] = [];
  private sequence = 0;

  invalidateOutstanding(email: string, at: Date): Promise<void> {
    for (const record of this.records) {
      if (record.email === email && record.consumedAt === null) {
        record.consumedAt = at;
      }
    }
    return Promise.resolve();
  }

  create(input: CreateOtpInput): Promise<OtpRecord> {
    this.sequence += 1;
    const record: OtpRecord = {
      id: `otp-${this.sequence}`,
      email: input.email,
      codeHash: input.codeHash,
      expiresAt: input.expiresAt,
      attempts: 0,
      consumedAt: null,
      createdAt: new Date(),
    };
    this.records.push(record);
    return Promise.resolve(record);
  }

  findLatestUnconsumed(email: string): Promise<OtpRecord | null> {
    const matches = this.records.filter(
      (r) => r.email === email && r.consumedAt === null,
    );
    return Promise.resolve(matches[matches.length - 1] ?? null);
  }

  incrementAttempts(id: string): Promise<number> {
    const record = this.records.find((r) => r.id === id);
    if (!record) {
      throw new Error(`no otp ${id}`);
    }
    record.attempts += 1;
    return Promise.resolve(record.attempts);
  }

  consume(id: string, at: Date): Promise<void> {
    const record = this.records.find((r) => r.id === id);
    if (record) {
      record.consumedAt = at;
    }
    return Promise.resolve();
  }
}

export class FakeSessionRepository implements SessionRepository {
  readonly rows: SessionRecord[] = [];
  private sequence = 0;

  create(input: CreateSessionInput): Promise<SessionRecord> {
    this.sequence += 1;
    const record: SessionRecord = {
      id: `session-${this.sequence}`,
      riderId: input.riderId,
      familyId: input.familyId,
      refreshTokenHash: input.refreshTokenHash,
      expiresAt: input.expiresAt,
      revokedAt: null,
      replacedBy: null,
      lastUsedAt: null,
      userAgent: input.userAgent,
      ipAddress: input.ipAddress,
      createdAt: new Date(),
    };
    this.rows.push(record);
    return Promise.resolve(record);
  }

  findByRefreshTokenHash(hash: string): Promise<SessionRecord | null> {
    return Promise.resolve(
      this.rows.find((r) => r.refreshTokenHash === hash) ?? null,
    );
  }

  async rotate(input: {
    currentSessionId: string;
    next: CreateSessionInput;
    at: Date;
  }): Promise<SessionRecord> {
    const current = this.rows.find((r) => r.id === input.currentSessionId);
    if (!current) {
      throw new Error(`no session ${input.currentSessionId}`);
    }
    const next = await this.create(input.next);
    current.replacedBy = next.id;
    current.lastUsedAt = input.at;
    return next;
  }

  revokeFamily(familyId: string, _riderId: string, at: Date): Promise<number> {
    let count = 0;
    for (const row of this.rows) {
      if (row.familyId === familyId && row.revokedAt === null) {
        row.revokedAt = at;
        count += 1;
      }
    }
    return Promise.resolve(count);
  }

  revokeAllForRider(riderId: string, at: Date): Promise<number> {
    let count = 0;
    for (const row of this.rows) {
      if (row.riderId === riderId && row.revokedAt === null) {
        row.revokedAt = at;
        count += 1;
      }
    }
    return Promise.resolve(count);
  }
}

interface RiderRow extends RiderRecord {
  experienceLevel: string | null;
  locationCity: string | null;
  deletedAt: Date | null;
}

interface RiderState {
  riders: RiderRow[];
  identities: Array<{ key: string; riderId: string; email: string | null }>;
  roles: Array<{ riderId: string; role: string }>;
  consents: ConsentInput[];
  loginActivity: LoginActivityInput[];
  settings: string[];
  vehicles: Array<{ riderId: string; make: string; model: string }>;
}

const identityKey = (provider: IdentityProvider, subject: string): string =>
  `${provider}:${subject}`;

/**
 * In-memory rider store with real transaction semantics: `withTransaction`
 * snapshots state and restores it if the callback throws, which is what makes
 * the first-sign-in race test meaningful.
 */
export class FakeRiderRepository implements RiderRepository {
  state: RiderState = {
    riders: [],
    identities: [],
    roles: [],
    consents: [],
    loginActivity: [],
    settings: [],
    vehicles: [],
  };

  private sequence = 0;

  /** Runs once, just before the next linkIdentity — simulates a racing peer. */
  onBeforeLinkIdentity: (() => void) | null = null;

  private externalWrites: Array<(state: RiderState) => void> = [];

  /**
   * Applies a write as though a *different*, already-committed transaction
   * made it. Our rollback restores our own snapshot and then replays these,
   * because a peer's commit does not disappear when we abort.
   */
  commitExternally(mutate: (state: RiderState) => void): void {
    this.externalWrites.push(mutate);
    mutate(this.state);
  }

  async withTransaction<T>(
    fn: (tx: RiderTransaction) => Promise<T>,
  ): Promise<T> {
    const snapshot = structuredClone(this.state);
    const externalBefore = this.externalWrites.length;
    try {
      return await fn(this.transaction());
    } catch (error) {
      this.state = snapshot;
      for (const write of this.externalWrites.slice(externalBefore)) {
        write(this.state);
      }
      throw error;
    }
  }

  /** Inserts an identity directly, bypassing a transaction. */
  seedIdentity(
    provider: IdentityProvider,
    subject: string,
    riderId: string,
  ): void {
    this.state.identities.push({
      key: identityKey(provider, subject),
      riderId,
      email: null,
    });
  }

  seedRider(input: Partial<RiderRow> & { id: string }): RiderRow {
    const row: RiderRow = {
      id: input.id,
      email: input.email ?? null,
      displayName: input.displayName ?? "Rider",
      username: input.username ?? null,
      avatarUrl: input.avatarUrl ?? null,
      createdAt: input.createdAt ?? new Date(),
      experienceLevel: input.experienceLevel ?? null,
      locationCity: input.locationCity ?? null,
      deletedAt: input.deletedAt ?? null,
    };
    this.state.riders.push(row);
    return row;
  }

  findByUsername(username: string): Promise<RiderRecord | null> {
    return Promise.resolve(
      this.state.riders.find(
        (r) => r.username === username && r.deletedAt === null,
      ) ?? null,
    );
  }

  completeOnboarding(input: OnboardingInput): Promise<RiderRecord> {
    const rider = this.state.riders.find((r) => r.id === input.riderId);
    if (!rider) {
      throw new Error(`no rider ${input.riderId}`);
    }
    rider.username = input.username;
    rider.displayName = input.displayName;
    rider.experienceLevel = input.experienceLevel;
    rider.locationCity = input.locationCity;

    if (input.firstVehicle) {
      this.state.vehicles.push({
        riderId: input.riderId,
        make: input.firstVehicle.make,
        model: input.firstVehicle.model,
      });
    }

    return Promise.resolve(rider);
  }

  softDeleteAndUnlink(riderId: string, at: Date): Promise<boolean> {
    const rider = this.state.riders.find(
      (r) => r.id === riderId && r.deletedAt === null,
    );
    if (!rider) {
      return Promise.resolve(false);
    }
    rider.deletedAt = at;
    rider.email = null;
    rider.avatarUrl = null;
    rider.displayName = "Deleted rider";
    this.state.identities = this.state.identities.filter(
      (i) => i.riderId !== riderId,
    );
    return Promise.resolve(true);
  }

  private transaction(): RiderTransaction {
    const state = this.state;
    const nextId = (): string => {
      this.sequence += 1;
      return `created-${this.sequence}`;
    };

    return {
      findRiderIdByIdentity: (provider, subject) =>
        Promise.resolve(
          state.identities.find((i) => i.key === identityKey(provider, subject))
            ?.riderId ?? null,
        ),

      findRiderByEmail: (email) =>
        Promise.resolve(
          state.riders.find(
            (r) => r.email === email && r.deletedAt === null,
          ) ?? null,
        ),

      createRider: (input: CreateRiderInput) => {
        const row: RiderRow = {
          id: nextId(),
          email: input.email,
          displayName: input.displayName,
          username: null,
          avatarUrl: input.avatarUrl,
          createdAt: new Date(),
          experienceLevel: null,
          locationCity: null,
          deletedAt: null,
        };
        state.riders.push(row);
        return Promise.resolve(row);
      },

      linkIdentity: (input: LinkIdentityInput) => {
        this.onBeforeLinkIdentity?.();
        this.onBeforeLinkIdentity = null;

        const key = identityKey(input.provider, input.subject);
        if (state.identities.some((i) => i.key === key)) {
          return Promise.resolve({ inserted: false });
        }
        state.identities.push({
          key,
          riderId: input.riderId,
          email: input.email,
        });
        return Promise.resolve({ inserted: true });
      },

      createDefaultSettings: (riderId) => {
        state.settings.push(riderId);
        return Promise.resolve();
      },

      recordConsent: (input) => {
        state.consents.push(input);
        return Promise.resolve();
      },

      recordLoginActivity: (input) => {
        state.loginActivity.push(input);
        return Promise.resolve();
      },

      getRoles: (riderId) =>
        Promise.resolve(
          state.roles.filter((r) => r.riderId === riderId).map((r) => r.role),
        ),

      findRiderById: (riderId) =>
        Promise.resolve(state.riders.find((r) => r.id === riderId) ?? null),
    };
  }
}
