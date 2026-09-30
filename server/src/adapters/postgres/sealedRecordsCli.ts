/**
 * Sealed registration records, from the command line (migration 043;
 * plans/account-deletion.md, step 4). Run from server/:
 *
 *   npm run sealed:keygen  -- --out ~/throttlebase-sealing-key.pem
 *   npm run sealed:open    -- --rider <id> --key <file> --actor "<name>" --reason "<order ref>"
 *   npm run sealed:hold    -- --rider <id> --until 2027-12-31 --actor "<name>" --reason "<order ref>"
 *   npm run sealed:release -- --rider <id> --actor "<name>" --reason "<why>"
 *
 * open, hold and release use the app's database settings: against production
 * from a laptop, set DATABASE_URL (and DATABASE_SSL_REJECT_UNAUTHORIZED=false,
 * as the deployed services do). Each is recorded in sealed.access_log.
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { generateSealingKeyPair, keyIdOf } from "../crypto/sealedBox.js";
import { openSealedRecord, releaseLegalHold, setLegalHold, SealedRecordError } from "./sealedRecordStore.js";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

const options = {
  out: { type: "string" },
  rider: { type: "string" },
  key: { type: "string" },
  actor: { type: "string" },
  reason: { type: "string" },
  until: { type: "string" },
} as const;

const need = (value: string | undefined, flag: string): string => {
  if (!value?.trim()) throw new SealedRecordError(`--${flag} is required.`);
  return value.trim();
};

const keygen = (out: string): void => {
  const target = path.resolve(out.replace(/^~(?=$|\/)/, process.env.HOME ?? "~"));
  if (target === REPO_ROOT || target.startsWith(`${REPO_ROOT}${path.sep}`)) {
    throw new SealedRecordError("Write the private key outside the repository, so it can never be committed.");
  }
  const { publicKeyPem, privateKeyPem } = generateSealingKeyPair();
  try {
    // wx: never overwrite a key that may be sealing records already.
    writeFileSync(target, privateKeyPem, { mode: 0o600, flag: "wx" });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      throw new SealedRecordError(`${target} already exists; it may be a key in use. Choose another path.`);
    }
    throw error;
  }

  console.log(`Key id: ${keyIdOf(publicKeyPem)}`);
  console.log(`\nPrivate key written to ${target} (readable only by you).`);
  console.log("\n1. Back it up in two places, before anything else:");
  console.log("   - your password manager (as a secure note or attachment), and");
  console.log("   - an offline copy: printed, or on an encrypted USB drive kept somewhere safe.");
  console.log("   Then delete the file from this computer. Without the private key, sealed records can't be opened.");
  console.log("\n2. Set this on the Railway API service, in each environment, as SEALED_RECORD_PUBLIC_KEY:\n");
  console.log(Buffer.from(publicKeyPem).toString("base64"));
  console.log("\n   The public key can only seal; it is safe on the server.");
  console.log("\nTo replace a key later, run this again and swap SEALED_RECORD_PUBLIC_KEY. Keep the old");
  console.log("private key until 180 days have passed: records sealed with it can still be opened until they purge.");
};

const main = async (): Promise<void> => {
  const [command, ...rest] = process.argv.slice(2);
  const { values } = parseArgs({ args: rest, options, strict: true });

  if (command === "keygen") {
    keygen(need(values.out, "out"));
    return;
  }

  const who = { actor: need(values.actor, "actor"), reason: need(values.reason, "reason") };
  const riderId = need(values.rider, "rider");
  const { default: pool } = await import("../../config/db.js");
  try {
    if (command === "open") {
      const privateKeyPem = readFileSync(need(values.key, "key"), "utf8");
      console.log(JSON.stringify(await openSealedRecord(pool, riderId, privateKeyPem, who), null, 2));
    } else if (command === "hold") {
      const until = new Date(need(values.until, "until"));
      if (Number.isNaN(until.getTime())) throw new SealedRecordError("--until must be a date, such as 2027-12-31.");
      await setLegalHold(pool, riderId, until, who);
      console.log(`Held until ${until.toISOString()}.`);
    } else if (command === "release") {
      await releaseLegalHold(pool, riderId, who);
      console.log("Hold released.");
    } else {
      throw new SealedRecordError(`Unknown command "${command ?? ""}": use keygen, open, hold or release.`);
    }
  } finally {
    await pool.end();
  }
};

main().catch((error: unknown) => {
  console.error(error instanceof SealedRecordError ? error.message : error);
  process.exit(1);
});
