/**
 * The sealed registration record (IT Rules 2021, Rule 3(1)(h)): the details a
 * rider gave to register, kept for 180 days after they cancel their account,
 * and used for nothing but a lawful request
 * (docs/launch-readiness/plans/account-deletion.md, step 4).
 *
 * Only registration details: nothing they rode, posted or saved. The record
 * is sealed before it is stored (ports/RegistrationSealer.ts), so it can't be
 * read without a key the operator keeps offline. ⚖️ The exact field list is
 * for counsel to confirm.
 */

import { REGISTRATION_RETENTION_DAYS } from "../retention/retentionPolicy.js";

const DAY_MS = 24 * 60 * 60 * 1000;

export const purgeAfter = (cancelledAt: Date): Date =>
  new Date(cancelledAt.getTime() + REGISTRATION_RETENTION_DAYS * DAY_MS);

export interface SignInMethod {
  provider: string;
  /** The provider's own id for the account. */
  subject: string;
  email: string | null;
}

export interface RegistrationDetails {
  riderId: string;
  email: string | null;
  displayName: string;
  username: string | null;
  phoneNumber: string | null;
  registeredAt: Date;
  identities: readonly SignInMethod[];
  /** Their first acceptance of the Terms: where and when they signed up. */
  firstConsent: { ip: string | null; acceptedAt: Date } | null;
  cancelledAt: Date;
}

/** What is sealed, as it will read when opened. */
export interface RegistrationRecord {
  rider_id: string;
  email: string | null;
  display_name: string;
  username: string | null;
  phone_number: string | null;
  registered_at: string;
  sign_in_methods: SignInMethod[];
  sign_up_ip: string | null;
  sign_up_at: string | null;
  cancelled_at: string;
}

export const buildRegistrationRecord = (details: RegistrationDetails): RegistrationRecord => ({
  rider_id: details.riderId,
  email: details.email,
  display_name: details.displayName,
  username: details.username,
  phone_number: details.phoneNumber,
  registered_at: details.registeredAt.toISOString(),
  sign_in_methods: details.identities.map(({ provider, subject, email }) => ({ provider, subject, email })),
  sign_up_ip: details.firstConsent?.ip ?? null,
  sign_up_at: details.firstConsent?.acceptedAt.toISOString() ?? null,
  cancelled_at: details.cancelledAt.toISOString(),
});
