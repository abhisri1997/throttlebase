#!/usr/bin/env node
/**
 * Checks a branch's migration changes against the branch it merges into.
 *
 *   node scripts/check-migration-changes.mjs origin/dev
 *
 * - A migration already on the base branch has run on dev (and maybe prod),
 *   and the runner refuses one whose contents changed (migrate.ts checks a
 *   checksum). So it may never be edited, renamed or deleted: add a new
 *   migration instead.
 * - A new migration is numbered after every migration on the base branch, so
 *   it runs after everything that already ran. Numbering one into a gap would
 *   run it out of order on a fresh database.
 *
 * Duplicate numbers within the branch are caught by
 * src/adapters/postgres/migrationNames.test.ts.
 */
import { execFileSync } from "node:child_process";

const base = process.argv[2];
if (!base) {
  console.error("usage: node scripts/check-migration-changes.mjs <base-ref>");
  process.exit(2);
}

const DIR = "server/src/db/migrations";
// Paths are from the repository root, wherever this is run from.
const root = execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
const git = (...args) => execFileSync("git", args, { encoding: "utf8", cwd: root }).trim();

const mergeBase = git("merge-base", base, "HEAD");
const changes = git("diff", "--name-status", "--no-renames", mergeBase, "HEAD", "--", DIR)
  .split("\n")
  .filter(Boolean)
  .map((line) => {
    const [status, path] = line.split("\t");
    return { status, file: path.slice(DIR.length + 1) };
  });

const baseFiles = git("ls-tree", "--name-only", `${mergeBase}:${DIR}`).split("\n").filter(Boolean);
const numberOf = (file) => Number.parseInt(file.slice(0, 3), 10);
const highestOnBase = Math.max(...baseFiles.map(numberOf).filter(Number.isFinite));

const problems = [];
for (const { status, file } of changes) {
  if (status !== "A") {
    problems.push(
      `${file} is ${status === "D" ? "deleted" : "changed"}. It has already run on dev and maybe prod, ` +
        `so it can't change: add a new migration instead.`,
    );
  } else if (numberOf(file) <= highestOnBase) {
    problems.push(
      `${file} is numbered ${file.slice(0, 3)}, but ${base} already goes up to ${String(highestOnBase).padStart(3, "0")}. ` +
        `Renumber it to ${String(highestOnBase + 1).padStart(3, "0")} or later.`,
    );
  }
}

if (problems.length > 0) {
  console.error("Migration problems:\n" + problems.map((problem) => `  - ${problem}`).join("\n"));
  process.exit(1);
}

const added = changes.filter((change) => change.status === "A").map((change) => change.file);
console.log(added.length > 0 ? `New migrations OK: ${added.join(", ")}` : "No migration changes.");
