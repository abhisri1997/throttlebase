import test from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { runMigrations } from "./migrate.js";

/**
 * Thirty days after a rider deletes their account, the purge removes that
 * rider's own data, table by table, and nothing that belongs to anyone else.
 * The riders row stays as an empty tombstone so shared records (rides they
 * captained, incidents, stops they requested) still point somewhere.
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
const purge = CONNECTION
  ? await import("../../workers/processors/account-purge.processor.js")
  : null;

const LEAVER = "a0a0a0a0-0000-0000-0000-0000000000e1";
const STAYER = "b0b0b0b0-0000-0000-0000-0000000000e2";
const RECENT = "c0c0c0c0-0000-0000-0000-0000000000e3";

const POINT = "ST_SetSRID(ST_MakePoint(77.6, 12.9), 4326)::geography";

const countOf = async (pool: pg.Pool, sql: string, params: unknown[]): Promise<number> => {
  const result = await pool.query(sql, params);
  return Number(result.rows[0].count);
};

const insertRide = async (pool: pg.Pool, captainId: string, title: string): Promise<string> => {
  const ride = await pool.query(
    `INSERT INTO rides (captain_id, title, status, visibility, scheduled_at)
     VALUES ($1, $2, 'completed', 'public', now() - interval '40 days')
     RETURNING id`,
    [captainId, title],
  );
  return ride.rows[0].id as string;
};

/** Both riders took part in the ride and recorded a track, stats and presence. */
const rideTogether = async (pool: pg.Pool, rideId: string, captainId: string): Promise<void> => {
  const riderIds = [LEAVER, STAYER];
  for (const riderId of riderIds) {
    await pool.query(
      `INSERT INTO ride_participants (ride_id, rider_id, role, status, joined_at)
       VALUES ($1, $2, $3, 'confirmed', now() - interval '40 days')`,
      [rideId, riderId, riderId === captainId ? "captain" : "rider"],
    );
    await pool.query(
      `INSERT INTO ride_history_stats (ride_id, rider_id, total_distance_km, total_time_sec)
       VALUES ($1, $2, 30, 3600)`,
      [rideId, riderId],
    );
  }
  const session = await pool.query(
    `INSERT INTO ride_live_sessions (ride_id, status, started_at, ended_at)
     VALUES ($1, 'ended', now() - interval '40 days', now() - interval '40 days')
     RETURNING id`,
    [rideId],
  );
  const sessionId = session.rows[0].id as string;
  for (const riderId of riderIds) {
    await pool.query(
      `INSERT INTO ride_live_presence (session_id, rider_id, role, last_location)
       VALUES ($1, $2, 'member', ${POINT})`,
      [sessionId, riderId],
    );
    await pool.query(
      `INSERT INTO ride_live_location_samples (session_id, rider_id, location, captured_at)
       VALUES ($1, $2, ${POINT}, now() - interval '40 days')`,
      [sessionId, riderId],
    );
  }
};

const insertRoute = async (pool: pg.Pool, creatorId: string, title: string): Promise<string> => {
  const route = await pool.query(
    `INSERT INTO routes (creator_id, title, geojson, visibility)
     VALUES ($1, $2, '{"type":"LineString","coordinates":[[77.6,12.9],[77.7,13.0]]}', 'public')
     RETURNING id`,
    [creatorId, title],
  );
  return route.rows[0].id as string;
};

const insertPost = async (pool: pg.Pool, authorId: string, content: string): Promise<string> => {
  const post = await pool.query(
    `INSERT INTO posts (rider_id, content) VALUES ($1, $2) RETURNING id`,
    [authorId, content],
  );
  return post.rows[0].id as string;
};

test("purging a deleted account removes only that rider's data", { skip: !CONNECTION }, async (t) => {
  const admin = new pg.Pool({ connectionString: CONNECTION, max: 2 });

  t.after(async () => {
    await admin.end();
    await db!.default.end();
  });

  await runMigrations(admin);

  // LEAVER deleted their account 31 days ago (already anonymised, as
  // deleteAccount leaves it); RECENT deleted theirs 10 days ago.
  await admin.query(
    `INSERT INTO riders (id, email, display_name, username, deleted_at, total_rides, total_distance_km) VALUES
       ($1, NULL, 'Deleted rider', NULL, now() - interval '31 days', 2, 60),
       ($2, 'purge-stayer@example.test', 'Stayer', 'purgestayer', NULL, 2, 60),
       ($3, NULL, 'Deleted rider', NULL, now() - interval '10 days', 0, 0)
     ON CONFLICT (id) DO UPDATE
       SET deleted_at = EXCLUDED.deleted_at, purged_at = NULL`,
    [LEAVER, STAYER, RECENT],
  );
  // A rerun on the same database starts from one Terms acceptance.
  await admin.query(`DELETE FROM rider_consents WHERE rider_id = $1`, [LEAVER]);

  // Rides: one the leaver captained, one the stayer captained. Both rode both.
  const leaversRide = await insertRide(admin, LEAVER, "Leaver's loop");
  const stayersRide = await insertRide(admin, STAYER, "Stayer's loop");
  await rideTogether(admin, leaversRide, LEAVER);
  await rideTogether(admin, stayersRide, STAYER);

  // Social: posts, a comment and a like each way, follows and blocks both ways.
  const leaversPost = await insertPost(admin, LEAVER, "Leaver's post");
  const stayersPost = await insertPost(admin, STAYER, "Stayer's post");
  await admin.query(
    `INSERT INTO comments (post_id, rider_id, content) VALUES ($1, $2, 'from stayer'), ($3, $4, 'from leaver')`,
    [leaversPost, STAYER, stayersPost, LEAVER],
  );
  await admin.query(`INSERT INTO likes (post_id, rider_id) VALUES ($1, $2), ($3, $4)`, [
    leaversPost,
    STAYER,
    stayersPost,
    LEAVER,
  ]);
  // The app keeps like and comment counts on each post; start them true.
  await admin.query(
    `UPDATE posts
        SET like_count = (SELECT count(*) FROM likes l WHERE l.post_id = posts.id),
            comment_count = (SELECT count(*) FROM comments c WHERE c.post_id = posts.id)
      WHERE id IN ($1, $2)`,
    [leaversPost, stayersPost],
  );
  await admin.query(
    `INSERT INTO follows (follower_id, following_id) VALUES ($1, $2), ($2, $1)`,
    [LEAVER, STAYER],
  );
  await admin.query(
    `INSERT INTO blocked_riders (blocker_id, blocked_id) VALUES ($1, $2)`,
    [LEAVER, STAYER],
  );
  await admin.query(
    `INSERT INTO ride_reviews (ride_id, rider_id, rating, review_text) VALUES ($1, $2, 5, 'great')`,
    [stayersRide, LEAVER],
  );

  // Routes: each saved one and bookmarked the other's.
  const leaversRoute = await insertRoute(admin, LEAVER, "Leaver's route");
  const stayersRoute = await insertRoute(admin, STAYER, "Stayer's route");
  await admin.query(
    `INSERT INTO route_bookmarks (route_id, rider_id) VALUES ($1, $2), ($3, $4)`,
    [leaversRoute, STAYER, stayersRoute, LEAVER],
  );

  // The leaver's private and account records.
  await admin.query(`INSERT INTO rider_settings (rider_id) VALUES ($1)`, [LEAVER]);
  await admin.query(`INSERT INTO rider_privacy_settings (rider_id) VALUES ($1)`, [LEAVER]);
  await admin.query(
    `INSERT INTO notification_preferences (rider_id, notification_type) VALUES ($1, 'mention')`,
    [LEAVER],
  );
  await admin.query(
    `INSERT INTO notifications (rider_id, type, title) VALUES ($1, 'mention', 'hi')`,
    [LEAVER],
  );
  await admin.query(`INSERT INTO vehicles (rider_id, make, model) VALUES ($1, 'Royal Enfield', 'Himalayan')`, [LEAVER]);
  await admin.query(`INSERT INTO gear (rider_id, type) VALUES ($1, 'helmet')`, [LEAVER]);
  await admin.query(`INSERT INTO login_activity (rider_id, ip_address) VALUES ($1, '203.0.113.7')`, [LEAVER]);
  await admin.query(
    `INSERT INTO rider_consents (rider_id, terms_version, privacy_version, ip) VALUES ($1, '2026-01-01', '2026-01-01', '203.0.113.7')`,
    [LEAVER],
  );
  await admin.query(
    `INSERT INTO support_tickets (rider_id, category, subject, description) VALUES ($1, 'general', 'help', 'please')`,
    [LEAVER],
  );

  // The recently deleted rider still has a post: not due for purge yet.
  const recentPost = await insertPost(admin, RECENT, "Recent leaver's post");

  await purge!.processAccountPurge({});

  await t.test("the leaver's own rows are gone", async () => {
    const owned: Array<[string, string]> = [
      ["ride_participants", "rider_id"],
      ["ride_history_stats", "rider_id"],
      ["ride_live_presence", "rider_id"],
      ["ride_live_location_samples", "rider_id"],
      ["posts", "rider_id"],
      ["comments", "rider_id"],
      ["likes", "rider_id"],
      ["follows", "follower_id"],
      ["follows", "following_id"],
      ["blocked_riders", "blocker_id"],
      ["blocked_riders", "blocked_id"],
      ["ride_reviews", "rider_id"],
      ["routes", "creator_id"],
      ["route_bookmarks", "rider_id"],
      ["rider_settings", "rider_id"],
      ["rider_privacy_settings", "rider_id"],
      ["notification_preferences", "rider_id"],
      ["notifications", "rider_id"],
      ["vehicles", "rider_id"],
      ["gear", "rider_id"],
      ["login_activity", "rider_id"],
      ["support_tickets", "rider_id"],
    ];
    for (const [table, column] of owned) {
      assert.equal(
        await countOf(admin, `SELECT count(*) FROM ${table} WHERE ${column} = $1`, [LEAVER]),
        0,
        `${table}.${column} still holds the leaver's rows`,
      );
    }
  });

  await t.test("the tombstone stays, marked purged, with no personal data or stats", async () => {
    const row = await admin.query(
      `SELECT email, username, bio, phone_number, location_coords, total_rides, total_distance_km, purged_at
       FROM riders WHERE id = $1`,
      [LEAVER],
    );
    assert.equal(row.rows.length, 1);
    const tombstone = row.rows[0];
    assert.notEqual(tombstone.purged_at, null);
    for (const field of ["email", "username", "bio", "phone_number", "location_coords"]) {
      assert.equal(tombstone[field], null, `${field} not cleared`);
    }
    assert.equal(Number(tombstone.total_rides), 0);
    assert.equal(Number(tombstone.total_distance_km), 0);
  });

  await t.test("terms-acceptance evidence is kept without the IP address", async () => {
    const consents = await admin.query(
      `SELECT terms_version, ip FROM rider_consents WHERE rider_id = $1`,
      [LEAVER],
    );
    assert.equal(consents.rows.length, 1);
    assert.equal(consents.rows[0].terms_version, "2026-01-01");
    assert.equal(consents.rows[0].ip, null);
  });

  await t.test("the ride the leaver captained survives for the stayer", async () => {
    assert.equal(await countOf(admin, `SELECT count(*) FROM rides WHERE id = $1`, [leaversRide]), 1);
  });

  await t.test("the stayer keeps their participation, stats, presence and track in both rides", async () => {
    for (const rideId of [leaversRide, stayersRide]) {
      assert.equal(
        await countOf(
          admin,
          `SELECT count(*) FROM ride_participants WHERE ride_id = $1 AND rider_id = $2`,
          [rideId, STAYER],
        ),
        1,
      );
      assert.equal(
        await countOf(
          admin,
          `SELECT count(*) FROM ride_history_stats WHERE ride_id = $1 AND rider_id = $2`,
          [rideId, STAYER],
        ),
        1,
      );
      assert.equal(
        await countOf(
          admin,
          `SELECT count(*) FROM ride_live_location_samples s
           JOIN ride_live_sessions ls ON ls.id = s.session_id
           WHERE ls.ride_id = $1 AND s.rider_id = $2`,
          [rideId, STAYER],
        ),
        1,
      );
    }
  });

  await t.test("the stayer's own post, route and follow list are intact", async () => {
    assert.equal(await countOf(admin, `SELECT count(*) FROM posts WHERE id = $1`, [stayersPost]), 1);
    assert.equal(await countOf(admin, `SELECT count(*) FROM routes WHERE id = $1`, [stayersRoute]), 1);
  });

  await t.test("the stayer's post no longer counts the leaver's like and comment", async () => {
    const post = await admin.query(
      `SELECT like_count, comment_count,
              (SELECT count(*) FROM likes WHERE post_id = $1) AS likes,
              (SELECT count(*) FROM comments WHERE post_id = $1) AS comments
       FROM posts WHERE id = $1`,
      [stayersPost],
    );
    const counts = post.rows[0];
    assert.equal(Number(counts.like_count), Number(counts.likes));
    assert.equal(Number(counts.comment_count), Number(counts.comments));
    assert.equal(Number(counts.like_count), 0);
    assert.equal(Number(counts.comment_count), 0);
  });

  await t.test("a rider deleted 10 days ago is not purged yet", async () => {
    const recent = await admin.query(`SELECT purged_at FROM riders WHERE id = $1`, [RECENT]);
    assert.equal(recent.rows[0].purged_at, null);
    assert.equal(await countOf(admin, `SELECT count(*) FROM posts WHERE id = $1`, [recentPost]), 1);
  });

  await t.test("running the purge again is harmless", async () => {
    await purge!.processAccountPurge({});
    assert.equal(await countOf(admin, `SELECT count(*) FROM rides WHERE id = $1`, [leaversRide]), 1);
    assert.equal(await countOf(admin, `SELECT count(*) FROM posts WHERE id = $1`, [stayersPost]), 1);
  });

  await t.test("a hard delete of a rider who captained a ride is refused", async () => {
    await assert.rejects(
      admin.query(`DELETE FROM riders WHERE id = $1`, [LEAVER]),
      /foreign key|violates/,
    );
    assert.equal(await countOf(admin, `SELECT count(*) FROM rides WHERE id = $1`, [leaversRide]), 1);
  });
});
