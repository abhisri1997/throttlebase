/**
 * Writes the Privacy Policy and Terms from src/core/legal/ to
 * docs/legal/drafts/ as Markdown, for legal review outside the app.
 *
 *   npm run legal:drafts            write the files
 *   npm run legal:drafts -- --check fail if they are out of date
 *
 * Also lists the placeholders a human still has to fill in.
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { placeholdersIn, toMarkdown, type LegalDocument } from "../src/core/legal/legalDocument";
import { GRIEVANCE } from "../src/core/legal/grievance";
import { PRIVACY_POLICY } from "../src/core/legal/privacyPolicy";
import { TERMS } from "../src/core/legal/terms";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const draftsDir = join(repoRoot, "docs", "legal", "drafts");

const DRAFTS: ReadonlyArray<{ file: string; document: LegalDocument }> = [
  { file: "privacy-policy.md", document: PRIVACY_POLICY },
  { file: "terms.md", document: TERMS },
  { file: "grievance.md", document: GRIEVANCE },
];

const readIfExists = async (path: string): Promise<string | null> => {
  try {
    return await readFile(path, "utf8");
  } catch {
    return null;
  }
};

const main = async (): Promise<void> => {
  const checkOnly = process.argv.includes("--check");
  const stale: string[] = [];

  await mkdir(draftsDir, { recursive: true });
  for (const { file, document } of DRAFTS) {
    const path = join(draftsDir, file);
    const markdown = toMarkdown(document);
    const shown = relative(repoRoot, path);

    if ((await readIfExists(path)) === markdown) {
      console.log(`up to date  ${shown}`);
    } else if (checkOnly) {
      stale.push(shown);
    } else {
      await writeFile(path, markdown);
      console.log(`wrote       ${shown}`);
    }

    const placeholders = placeholdersIn(document);
    if (placeholders.length > 0) console.log(`            to fill in: ${placeholders.join(", ")}`);
  }

  if (stale.length > 0) {
    console.error(`Out of date: ${stale.join(", ")}. Run npm run legal:drafts.`);
    process.exitCode = 1;
  }
};

await main();
