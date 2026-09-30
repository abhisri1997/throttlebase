/**
 * Rules for migration filenames, checked by a unit test on every run so CI
 * catches a clash before it merges.
 *
 * The runner records each migration by its full filename and applies them in
 * name order (migrate.ts), so two files sharing a number both run. What goes
 * wrong is ordering: two changes built at the same time each pick "the next
 * number", and nobody decided which runs first. So every new migration gets a
 * number of its own.
 */

/** `044_report_grievances.sql`: three digits, then lower-case words. */
export const MIGRATION_NAME = /^(\d{3})_[a-z0-9_]+\.sql$/;

/**
 * Numbers that already appear twice on databases that have applied both
 * files. Renaming either file would make the runner apply it again, so they
 * stay as they are; no other file may use these numbers.
 */
export const SHARED_NUMBERS_ALREADY_APPLIED: ReadonlyMap<string, readonly string[]> = new Map([
  ["004", ["004_participant_start_override.sql", "004_routes_and_gps.sql"]],
  ["042", ["042_reports.sql", "042_route_public_ends.sql"]],
  ["043", ["043_moderation.sql", "043_sealed_registration_records.sql"]],
]);

/** Everything wrong with a set of migration filenames; empty when they're fine. */
export const migrationNameProblems = (files: readonly string[]): string[] => {
  const problems: string[] = [];
  const byNumber = new Map<string, string[]>();

  for (const file of files) {
    const match = MIGRATION_NAME.exec(file);
    if (!match) {
      problems.push(`${file}: name it NNN_lower_case_words.sql`);
      continue;
    }
    const number = match[1]!;
    byNumber.set(number, [...(byNumber.get(number) ?? []), file]);
  }

  for (const [number, sharing] of byNumber) {
    if (sharing.length < 2) continue;
    const allowed = SHARED_NUMBERS_ALREADY_APPLIED.get(number) ?? [];
    const extra = sharing.filter((file) => !allowed.includes(file));
    if (extra.length > 0) {
      const highest = Math.max(...[...byNumber.keys()].map(Number));
      problems.push(
        `${sharing.sort().join(" and ")} share the number ${number}. ` +
          `Renumber ${extra.sort().join(", ")} to ${String(highest + 1).padStart(3, "0")} or later ` +
          `(before it has run anywhere).`,
      );
    }
  }

  return problems;
};
