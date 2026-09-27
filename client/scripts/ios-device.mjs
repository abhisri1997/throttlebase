#!/usr/bin/env node
/**
 * Builds, installs and launches the app on a cabled iPhone.
 *
 *   npm run ios:device            # Release (JS bundled in, runs without Metro)
 *   npm run ios:device -- --debug # Debug (needs `npm start` running)
 *
 * This exists because `expo run:ios` cannot run on Xcode 27. Xcode 27 removed
 * Simulator.app, and @expo/cli gates the command on an AppleScript lookup of
 * it (`id of app "Simulator"`) inside resolveDeviceAsync -- before it looks at
 * --device, so the check fails for cabled devices too. Remove this script once
 * Expo ships a CLI that handles Xcode 27.
 *
 * Nothing machine-specific is hardcoded: the device and signing team are
 * discovered, and either can be overridden.
 *
 *   IOS_DEVICE_UDID=<udid>     pick a device when several are attached
 *   DEVELOPMENT_TEAM=<teamid>  override the signing team
 */
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const CLIENT_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");
const IOS_DIR = join(CLIENT_DIR, "ios");
const DERIVED_DATA = join(IOS_DIR, "build-device");

const run = (file, args) =>
  execFileSync(file, args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });

const fail = (message) => {
  console.error(`\nios:device — ${message}\n`);
  process.exit(1);
};

/** The .xcworkspace prebuild generated, e.g. ios/ThrottleBase.xcworkspace. */
const findWorkspace = () => {
  if (!existsSync(IOS_DIR)) {
    fail("no ios/ directory. Run `npx expo prebuild --platform ios` first.");
  }
  const workspace = readdirSync(IOS_DIR).find((f) => f.endsWith(".xcworkspace"));
  if (!workspace) {
    fail("no .xcworkspace in ios/. Run `npx expo prebuild --platform ios --clean`.");
  }
  return {
    path: join(IOS_DIR, workspace),
    scheme: workspace.replace(/\.xcworkspace$/, ""),
  };
};

/**
 * The one usable iPhone/iPad. `devicectl` lists simulators and previously
 * paired devices too, so filter to physical hardware first.
 *
 * A plugged-in, paired iPhone reports "available (paired)", NOT "connected" --
 * "connected" is what a booted *simulator* shows. Matching only on "connected"
 * finds nothing. Anything not plainly unusable is accepted, and xcodebuild is
 * left to report the specific reason (locked device, untrusted host), which it
 * words better than a guess here could.
 */
const findDevice = () => {
  if (process.env.IOS_DEVICE_UDID) return process.env.IOS_DEVICE_UDID;

  let listing;
  try {
    listing = run("xcrun", ["devicectl", "list", "devices"]);
  } catch {
    fail("could not run `xcrun devicectl`. Is Xcode installed and selected?");
  }

  const physical = listing
    .split("\n")
    .filter((line) => /\bphysical\b/.test(line))
    .map((line) => {
      const udid = line.match(/([0-9A-F]{8}-[0-9A-F]{16}|[0-9a-f]{40})/i)?.[1];
      if (!udid) return null;
      const columns = line.trim().split(/\s{2,}/);
      return { udid, label: columns[0], state: columns[2] ?? "unknown" };
    })
    .filter(Boolean);

  const usable = physical.filter((d) => /connected|available/i.test(d.state));

  if (physical.length === 0) {
    fail(
      "no iPhone found.\n" +
        "  - plug it in and unlock it (a locked device cannot start development services)\n" +
        "  - accept the 'Trust This Computer?' prompt\n" +
        "  - enable Settings > Privacy & Security > Developer Mode",
    );
  }
  if (usable.length === 0) {
    const list = physical.map((d) => `      ${d.label} — ${d.state}`).join("\n");
    fail(`an iPhone is paired but not usable right now:\n${list}\n  Unlock it and check the cable.`);
  }
  if (usable.length > 1) {
    const list = usable.map((d) => `      ${d.udid}  ${d.label} (${d.state})`).join("\n");
    fail(`several devices attached. Pick one with IOS_DEVICE_UDID=<udid>:\n${list}`);
  }

  console.log(`device:  ${usable[0].label} (${usable[0].udid}) — ${usable[0].state}`);
  return usable[0].udid;
};

/**
 * The Team ID is the certificate's OU field. The value in parentheses in the
 * common name looks like a team id but is not one -- using it yields
 * "No Account for Team ...".
 */
const findTeam = () => {
  if (process.env.DEVELOPMENT_TEAM) return process.env.DEVELOPMENT_TEAM;

  let identities;
  try {
    identities = run("security", ["find-identity", "-v", "-p", "codesigning"]);
  } catch {
    fail("could not read codesigning identities from the keychain.");
  }

  const name = identities.match(/"(Apple Development: [^"]+)"/)?.[1];
  if (!name) {
    fail(
      "no 'Apple Development' signing identity found.\n" +
        "  Add your Apple ID in Xcode > Settings > Accounts, then build once in Xcode\n" +
        "  so it issues a certificate. Or set DEVELOPMENT_TEAM=<teamid>.",
    );
  }

  const pem = run("security", ["find-certificate", "-c", name, "-p"]);
  const subject = spawnSync("openssl", ["x509", "-noout", "-subject"], {
    input: pem,
    encoding: "utf8",
  }).stdout;

  const team = subject?.match(/OU\s*=\s*([A-Z0-9]+)/)?.[1];
  if (!team) fail(`could not read a Team ID (OU) from the certificate "${name}".`);

  console.log(`team:    ${team}`);
  return team;
};

/** Read the bundle id back from the built app rather than duplicating it here. */
const bundleId = (app) =>
  run("/usr/libexec/PlistBuddy", [
    "-c",
    "Print :CFBundleIdentifier",
    join(app, "Info.plist"),
  ]).trim();

const main = () => {
  const configuration = process.argv.includes("--debug") ? "Debug" : "Release";
  const { path: workspace, scheme } = findWorkspace();
  const udid = findDevice();
  const team = findTeam();

  console.log(`build:   ${scheme} (${configuration})\n`);

  const step = (file, args) => {
    const { status } = spawnSync(file, args, { stdio: "inherit", cwd: CLIENT_DIR });
    if (status !== 0) fail(`\`${file}\` exited with ${status}.`);
  };

  step("xcodebuild", [
    "-workspace", workspace,
    "-scheme", scheme,
    "-configuration", configuration,
    "-destination", `id=${udid}`,
    "-derivedDataPath", DERIVED_DATA,
    "-allowProvisioningUpdates",
    `DEVELOPMENT_TEAM=${team}`,
    "build",
  ]);

  const app = join(
    DERIVED_DATA,
    "Build",
    "Products",
    `${configuration}-iphoneos`,
    `${scheme}.app`,
  );
  if (!existsSync(app)) fail(`build succeeded but no app at ${app}`);

  step("xcrun", ["devicectl", "device", "install", "app", "--device", udid, app]);
  step("xcrun", [
    "devicectl", "device", "process", "launch",
    "--device", udid,
    "--terminate-existing",
    bundleId(app),
  ]);

  console.log("\nios:device — installed and launched.");
  console.log(
    "If iOS refuses to open it, trust the certificate once:\n" +
      "  Settings > General > VPN & Device Management > Developer App > Trust",
  );
};

main();
