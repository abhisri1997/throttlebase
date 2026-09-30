/**
 * The consent ledger and the 18+ declaration (launch readiness E6,
 * docs/launch-readiness/plans/consent.md).
 *
 * Every answer is an append-only event against the exact notice the rider
 * was shown; consent_state holds the latest answer per purpose and is
 * written in the same transaction, so the two never disagree. Withdrawals
 * are also recorded in security_events.
 *
 * A future Consent Manager integration writes through recordConsent with
 * source 'consent_manager', so there is one path for every change.
 */
import { createHash } from "node:crypto";
import { query } from "../config/db.js";
import {
  CURRENT_NOTICES,
  NOTICE_LOCALE,
  currentNotices,
  type ConsentPurpose,
  type ConsentSource,
} from "../core/consent/notices.js";
import {
  hasCurrentConsent,
  refuseAnswer,
  summarizeConsents,
  type ConsentRefusal,
  type ConsentSummary,
  type StoredConsent,
} from "../core/consent/state.js";
import { inTransaction } from "./ride-roster.service.js";
import type { SqlClient } from "./ride-progress.repository.js";

type ConsentServiceRefusal = ConsentRefusal | "age_declared_under_18";

const REFUSAL_MESSAGES: Readonly<Record<ConsentServiceRefusal, string>> = {
  stale_notice: "This notice has been updated. Please read the new version and choose again.",
  age_declared_under_18: "ThrottleBase is only for riders aged 18 or older. Contact support if this is a mistake.",
};

export class ConsentError extends Error {
  constructor(readonly kind: ConsentServiceRefusal) {
    super(REFUSAL_MESSAGES[kind]);
    this.name = "ConsentError";
  }
}

export const noticeHash = (body: string): string => createHash("sha256").update(body, "utf8").digest("hex");

/**
 * The stored row for a purpose's current notice, published on first use.
 *
 * A notice's text is fixed once published. If the text in code no longer
 * matches the stored hash for the same version, someone edited the wording
 * without bumping the version, and recording consent against it would be
 * recording agreement to text nobody can prove was shown. That is refused.
 */
const currentNoticeId = async (client: SqlClient, purpose: ConsentPurpose): Promise<string> => {
  const notice = CURRENT_NOTICES[purpose];
  const hash = noticeHash(notice.body);

  await client.query(
    `INSERT INTO consent_notices (purpose_code, version, locale, body_sha256, body)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (purpose_code, version, locale) DO NOTHING`,
    [purpose, notice.version, NOTICE_LOCALE, hash, notice.body],
  );

  const stored = await client.query(
    `SELECT id, body_sha256 FROM consent_notices WHERE purpose_code = $1 AND version = $2 AND locale = $3`,
    [purpose, notice.version, NOTICE_LOCALE],
  );
  const row = stored.rows[0] as { id: string; body_sha256: string };
  if (row.body_sha256 !== hash) {
    throw new Error(
      `The ${purpose} notice text changed without a new version (${notice.version}). Publish it as a new version.`,
    );
  }
  return row.id;
};

const storedConsents = async (riderId: string): Promise<StoredConsent[]> => {
  const result = await query(
    `SELECT s.purpose_code, s.granted, n.version, s.updated_at
       FROM consent_state s
       JOIN consent_notices n ON n.id = s.notice_id
      WHERE s.rider_id = $1`,
    [riderId],
  );
  return result.rows.map((row) => ({
    purpose: row.purpose_code as ConsentPurpose,
    granted: row.granted as boolean,
    noticeVersion: row.version as string,
    updatedAt: row.updated_at as Date,
  }));
};

export interface ConsentOverview {
  notices: { purpose: ConsentPurpose; version: string; title: string; body: string }[];
  consents: ConsentSummary[];
  declarations: { age_18_plus: boolean | null };
}

export const getConsentOverview = async (riderId: string): Promise<ConsentOverview> => {
  const [stored, age] = await Promise.all([storedConsents(riderId), latestDeclaration(riderId, "age_18_plus")]);
  return {
    notices: currentNotices().map(({ purpose, version, title, body }) => ({ purpose, version, title, body })),
    consents: summarizeConsents(stored),
    declarations: { age_18_plus: age },
  };
};

/** The gate features check. Consent counts only against the current notice. */
export const hasConsent = async (riderId: string, purpose: ConsentPurpose): Promise<boolean> => {
  const result = await query(
    `SELECT s.granted, n.version, s.updated_at
       FROM consent_state s
       JOIN consent_notices n ON n.id = s.notice_id
      WHERE s.rider_id = $1 AND s.purpose_code = $2`,
    [riderId, purpose],
  );
  const row = result.rows[0];
  return hasCurrentConsent(
    row
      ? { purpose, granted: row.granted as boolean, noticeVersion: row.version as string, updatedAt: row.updated_at }
      : undefined,
  );
};

export interface ConsentAnswer {
  purpose: ConsentPurpose;
  granted: boolean;
  /** The notice version the app showed the rider. */
  noticeVersion: string;
  source: ConsentSource;
  appVersion?: string | null;
  platform?: string | null;
}

export interface ConsentAnswerOutcome {
  /** False when the answer repeated the one already on record. */
  changed: boolean;
  consents: ConsentSummary[];
}

export const recordConsent = async (riderId: string, answer: ConsentAnswer): Promise<ConsentAnswerOutcome> => {
  const refusal = refuseAnswer(answer.purpose, answer.noticeVersion);
  if (refusal) throw new ConsentError(refusal);

  const changed = await inTransaction(async (client) => {
    const noticeId = await currentNoticeId(client, answer.purpose);

    // Two answers sent at once are applied one after the other, so the state
    // always matches the last event. A row lock would not cover the first
    // answer, when there is no row yet.
    await client.query(`SELECT pg_advisory_xact_lock(hashtextextended($1 || ':consent:' || $2, 0))`, [
      riderId,
      answer.purpose,
    ]);
    const previous = await client.query(
      `SELECT granted, notice_id FROM consent_state WHERE rider_id = $1 AND purpose_code = $2`,
      [riderId, answer.purpose],
    );
    const before = previous.rows[0] as { granted: boolean; notice_id: string } | undefined;
    if (before && before.granted === answer.granted && before.notice_id === noticeId) {
      return false;
    }

    await client.query(
      `INSERT INTO consent_events (rider_id, purpose_code, notice_id, action, source, app_version, platform)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        riderId,
        answer.purpose,
        noticeId,
        answer.granted ? "granted" : "withdrawn",
        answer.source,
        answer.appVersion ?? null,
        answer.platform ?? null,
      ],
    );

    await client.query(
      `INSERT INTO consent_state (rider_id, purpose_code, granted, notice_id, updated_at)
       VALUES ($1, $2, $3, $4, now())
       ON CONFLICT (rider_id, purpose_code)
       DO UPDATE SET granted = EXCLUDED.granted, notice_id = EXCLUDED.notice_id, updated_at = now()`,
      [riderId, answer.purpose, answer.granted, noticeId],
    );

    // A withdrawal of something that was on is audited (plans/consent.md).
    if (!answer.granted && before?.granted) {
      await client.query(
        `INSERT INTO security_events (actor_id, subject_id, event, reason, metadata)
         VALUES ($1, $1, 'consent.withdrawn', $2, $3::jsonb)`,
        [riderId, answer.purpose, JSON.stringify({ source: answer.source })],
      );
    }

    return true;
  });

  return { changed, consents: summarizeConsents(await storedConsents(riderId)) };
};

export type DeclarationKind = "age_18_plus";
export type DeclarationSource = "onboarding" | "settings" | "support";

/** The rider's latest answer, or null if they were never asked. */
export const latestDeclaration = async (riderId: string, kind: DeclarationKind): Promise<boolean | null> => {
  const result = await query(
    `SELECT answer FROM rider_declarations
      WHERE rider_id = $1 AND kind = $2
      ORDER BY id DESC
      LIMIT 1`,
    [riderId, kind],
  );
  return result.rows.length === 0 ? null : (result.rows[0].answer as boolean);
};

export interface DeclarationInput {
  kind: DeclarationKind;
  answer: boolean;
  source: DeclarationSource;
  appVersion?: string | null;
}

/**
 * Records an answer, keeping every one.
 *
 * Once a rider has said they are under 18, the app cannot change it to yes:
 * otherwise the age gate is one tap back and another forward. Support can,
 * after checking (source 'support'). A yes can always become a no.
 */
export const recordDeclaration = async (riderId: string, input: DeclarationInput): Promise<void> => {
  if (input.kind === "age_18_plus" && input.answer && input.source !== "support") {
    if ((await latestDeclaration(riderId, input.kind)) === false) {
      throw new ConsentError("age_declared_under_18");
    }
  }

  await query(
    `INSERT INTO rider_declarations (rider_id, kind, answer, source, app_version)
     VALUES ($1, $2, $3, $4, $5)`,
    [riderId, input.kind, input.answer, input.source, input.appVersion ?? null],
  );
};
