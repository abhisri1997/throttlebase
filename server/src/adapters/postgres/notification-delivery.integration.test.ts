import test from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { runMigrations } from "./migrate.js";

/**
 * The notification delivery stubs run in every environment, production
 * included. Neither the log nor the job result (kept in the jobs table) may
 * carry a rider's email address, push token or message text: they are
 * written by the thousand and nobody deletes them.
 *
 * Skipped unless TEST_DATABASE_URL points at a throwaway database (see
 * migrations.integration.test.ts for a container recipe).
 */

const CONNECTION = process.env.TEST_DATABASE_URL;
if (CONNECTION) {
  // The processor reads the app pool's URL at import time.
  process.env.DATABASE_URL = CONNECTION;
}

const db = CONNECTION ? await import("../../config/db.js") : null;
const delivery = CONNECTION
  ? await import("../../workers/processors/notification-delivery.processor.js")
  : null;

const RIDER = "f1f1f1f1-0000-0000-0000-0000000000d1";
const EMAIL = "delivery-rider@example.test";
const SUBJECT = "Asha mentioned you in a post";

test("notification delivery keeps personal data out of logs and job results", { skip: !CONNECTION }, async (t) => {
  const admin = new pg.Pool({ connectionString: CONNECTION, max: 2 });

  t.after(async () => {
    await admin.end();
    await db!.default.end();
  });

  await runMigrations(admin);
  await admin.query(
    `INSERT INTO riders (id, email, display_name, username)
     VALUES ($1, $2, 'Delivery Rider', 'deliveryrider')
     ON CONFLICT (id) DO NOTHING`,
    [RIDER, EMAIL],
  );
  await admin.query(
    `INSERT INTO notification_preferences (rider_id, notification_type, email_enabled)
     VALUES ($1, 'mention', true)
     ON CONFLICT (rider_id, notification_type) DO UPDATE SET email_enabled = true`,
    [RIDER],
  );

  await t.test("an email job logs and returns no address or message text", async (st) => {
    const logged: string[] = [];
    const capture = (...args: unknown[]) => {
      logged.push(args.map(String).join(" "));
    };
    st.mock.method(console, "log", capture);
    st.mock.method(console, "info", capture);
    st.mock.method(console, "warn", capture);

    const result = await delivery!.processNotificationEmail({
      riderId: RIDER,
      notificationId: "n-1",
      type: "mention",
      subject: SUBJECT,
      body: "Asha: see you at the Nandi Hills ride, @deliveryrider",
    });

    const everything = [...logged, JSON.stringify(result)].join("\n");
    assert.equal(everything.includes(EMAIL), false, "email address leaked");
    assert.equal(everything.includes(SUBJECT), false, "message subject leaked");
    assert.equal("email" in result, false);
    assert.equal(result.reason, "provider_not_configured");
    assert.equal(result.riderId, RIDER);
  });
});
