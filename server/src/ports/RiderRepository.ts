import type { IdentityProvider } from "./IdentityVerifier.js";

export interface RiderRecord {
  id: string;
  email: string | null;
  displayName: string;
  username: string | null;
  avatarUrl: string | null;
  createdAt: Date;
}

export interface CreateRiderInput {
  displayName: string;
  /** Only ever set from a provider-verified address. */
  email: string | null;
  avatarUrl: string | null;
}

export interface LinkIdentityInput {
  riderId: string;
  provider: IdentityProvider;
  subject: string;
  email: string | null;
}

export interface ConsentInput {
  riderId: string;
  termsVersion: string;
  privacyVersion: string;
  ip: string | null;
}

export interface LoginActivityInput {
  riderId: string;
  ipAddress: string | null;
  deviceFingerprint: string | null;
}

export interface OnboardingInput {
  riderId: string;
  username: string;
  displayName: string;
  experienceLevel: string;
  locationCity: string | null;
  firstVehicle: {
    make: string;
    model: string;
    year: number | null;
    engineCapacityCc: number | null;
  } | null;
}

/**
 * Operations available inside one database transaction.
 *
 * Account resolution has to be atomic: two devices signing in at the same
 * instant must not create two riders for one identity.
 */
export interface RiderTransaction {
  findRiderIdByIdentity(
    provider: IdentityProvider,
    subject: string,
  ): Promise<string | null>;
  findRiderByEmail(email: string): Promise<RiderRecord | null>;
  createRider(input: CreateRiderInput): Promise<RiderRecord>;
  /**
   * Inserts the identity. `inserted` is false when a concurrent writer won
   * the race on PK (provider, subject), which is how first-sign-in races are
   * detected without the adapter having to interpret them.
   */
  linkIdentity(input: LinkIdentityInput): Promise<{ inserted: boolean }>;
  createDefaultSettings(riderId: string): Promise<void>;
  recordConsent(input: ConsentInput): Promise<void>;
  recordLoginActivity(input: LoginActivityInput): Promise<void>;
  getRoles(riderId: string): Promise<string[]>;
  findRiderById(riderId: string): Promise<RiderRecord | null>;
}

export interface RiderRepository {
  withTransaction<T>(fn: (tx: RiderTransaction) => Promise<T>): Promise<T>;
  findByUsername(username: string): Promise<RiderRecord | null>;
  completeOnboarding(input: OnboardingInput): Promise<RiderRecord>;
  /** Soft-deletes the rider and removes every linked identity. */
  softDeleteAndUnlink(riderId: string, at: Date): Promise<boolean>;
}
