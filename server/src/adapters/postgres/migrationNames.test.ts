import test from "node:test";
import assert from "node:assert/strict";
import { readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { migrationNameProblems } from "./migrationNames.js";

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "db", "migrations");

test("every migration in the repository has a number of its own", async () => {
  const files = (await readdir(MIGRATIONS_DIR)).filter((name) => name.endsWith(".sql"));
  assert.deepEqual(migrationNameProblems(files), []);
});

test("a new migration reusing a number is caught, with the number to use instead", () => {
  const problems = migrationNameProblems(["043_moderation.sql", "044_a.sql", "044_b.sql"]);
  assert.equal(problems.length, 1);
  assert.match(problems[0]!, /044_a\.sql and 044_b\.sql share the number 044/);
  assert.match(problems[0]!, /to 045 or later/);
});

test("the pairs already applied are allowed, but nothing may join them", () => {
  assert.deepEqual(migrationNameProblems(["042_reports.sql", "042_route_public_ends.sql"]), []);
  const joined = migrationNameProblems(["042_reports.sql", "042_route_public_ends.sql", "042_third.sql"]);
  assert.match(joined[0]!, /Renumber 042_third\.sql/);
});

test("a badly named file is caught", () => {
  assert.match(migrationNameProblems(["44_grievances.sql"])[0]!, /NNN_lower_case_words/);
  assert.match(migrationNameProblems(["044_Grievances.sql"])[0]!, /NNN_lower_case_words/);
});
