#!/usr/bin/env node
/**
 * Chips for Mac, built, installed and paired from this machine, as `pnpm phone` does the phone.
 *
 *   pnpm desktop            build the app, put it in /Applications, and pair it by itself
 *   pnpm desktop connect    pair the installed app: no server to pick, no code to type
 *   pnpm desktop release    build it to hand out: Developer ID, notarized, stapled, in a DMG
 *
 * How pairing works here. The server's own machine can always issue a pairing code (ADR 0048).
 * The code goes to the app as `chips://pair?…`, which macOS hands to Chips.app, and the shell
 * keeps it until the page takes it, so a link that launches the app is not lost. On its pairing
 * screen the app pairs with it at once. An app that is already paired keeps the key it holds and
 * lets the code expire. Either way the server's device list is what says it worked: a
 * "Chips for Mac" that is new, or one seen again since the app was opened.
 *
 * It is signed with this Mac's development certificate when there is one (`signingIdentity`),
 * because the keychain holding the app's key trusts a signature, and an ad-hoc one changes with
 * every build.
 *
 * The app carries its own copy of the web app, so a change to the page reaches it only through a
 * build. That copy is made in a directory of its own and never in `apps/web/dist`, which is what
 * the running server hands every browser: rebuilding that is going live, and is not this tool's.
 *
 * It carries Chips itself too (ADR 0173): a release of `chips` for this Mac, built from that same
 * web copy (`tools/release/build.mjs --web`) and put in the app's resources as `chips/`, which
 * "Run Chips on this Mac" runs `chips up` from when nothing answers here or on the network. Its
 * Node is signed as the app is (`sign.mjs`), so what the app keeps running is named Chips in
 * Login Items, not Node.
 *
 * `release` is the same build for other people's Macs: signed with the Developer ID only, every
 * binary inside with a timestamp, the app notarized by Apple with the App Store Connect key on this
 * Mac and stapled, then put in `dist/release/Chips.dmg`, which is signed, notarized and stapled too,
 * for `gh release upload`. Apple silicon only: the Chips it carries is this Mac's.
 */

import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, renameSync, rmSync, symlinkSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { artifactName, hostTarget } from "../release/release.mjs";
import { isDeveloperId, NODE_ENTITLEMENTS, notarizeArgs, signArgs, teamOf } from "./sign.mjs";

const REPO = fileURLToPath(new URL("../../", import.meta.url));
const TAURI = `${REPO}apps/desktop/src-tauri`;
/** The web app as the desktop build bundles it, beside the rest of the build and ignored with it. */
const WEB = `${TAURI}/target/web`;
/** The release the app carries, copied from the one built so its Node can be signed as the app. */
const CARRIED = `${TAURI}/target/chips`;
const BUILT = `${TAURI}/target/release/bundle/macos/Chips.app`;
const INSTALLED = "/Applications/Chips.app";
/** The DMG `release` makes, beside the release tarballs, as the release carries it. */
const DMG = `${REPO}dist/release/Chips.dmg`;
/** The name the page pairs under when it paired with a server it found (Pairing.tsx). */
const DEVICE_NAME = "Chips for Mac";
const PORT = Number(process.env.CHIPS_PORT ?? 4431);
const DATA_DIR = process.env.CHIPS_DATA_DIR ?? `${REPO}.chips`;
const WORKSPACE_DB = `${DATA_DIR}/chips.db`;
const SERVE_LOG = `${process.env.HOME}/Library/Logs/chips.serve.log`;
/**
 * How long the app gets. The server writes when a device was last seen at most once a minute, so
 * an app that was already paired and was open a moment ago may take that long to show.
 */
const PAIR_WAIT_SECONDS = 90;

const tick = "✓";
const cross = "✗";
const warn = "!";

/** Run something and hand back what it said, without throwing on a non-zero exit. */
function run(command, args, options = {}) {
  const done = spawnSync(command, args, { encoding: "utf8", ...options });
  return { ok: done.status === 0, out: `${done.stdout ?? ""}${done.stderr ?? ""}` };
}

/** Run something the person should watch, its output as it comes. */
function watch(command, args, options = {}) {
  return spawnSync(command, args, { stdio: "inherit", ...options }).status === 0;
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/**
 * The web app into its own directory, then the shell around it, as a `.app` and nothing else. Signed
 * with this Mac's certificate, or with the one given; `handOut` timestamps every signature inside.
 */
function build(identity = signingIdentity(), handOut = false) {
  console.log("\n  Building Chips for Mac\n");
  rmSync(WEB, { recursive: true, force: true });
  const web = watch("pnpm", [
    "--filter",
    "@chipschat/web",
    "exec",
    "vite",
    "build",
    "--outDir",
    WEB,
    "--emptyOutDir",
  ]);
  if (!web) {
    console.log(`\n  ${cross} the web app did not build`);
    return false;
  }
  // Chips for this Mac, from the same web copy, for the app to carry (ADR 0173).
  const built = release();
  if (built === undefined) return false;
  const carried = carry(built, identity, handOut);
  if (carried === undefined) return false;
  // The web app is built already, and not where `tauri.conf.json` would build it.
  const config = {
    build: { beforeBuildCommand: "true", frontendDist: WEB },
    bundle: {
      resources: { [`${carried}/`]: "chips/" },
      ...(identity === undefined ? {} : { macOS: { signingIdentity: identity } }),
    },
  };
  if (identity === undefined) {
    console.log(`  ${warn} no signing certificate on this Mac, so the build is signed ad hoc, as`);
    console.log("      itself alone: the first launch after each build asks for your login");
    console.log("      keychain password before the app can read its key.\n");
  } else {
    console.log(`  ${tick} signing as ${identity}, so the keychain knows it from build to build\n`);
  }
  // Tauri itself rather than `scripts/build.sh`, which is for a build to hand out: it signs from
  // the environment alone and would call this one unsigned.
  const shell = watch(
    "pnpm",
    ["exec", "tauri", "build", "--bundles", "app", "--config", JSON.stringify(config)],
    { cwd: `${REPO}apps/desktop` },
  );
  if (!shell || !existsSync(BUILT)) {
    console.log(`\n  ${cross} the app did not build`);
    return false;
  }
  return identity === undefined || sameTeam();
}

/**
 * The release for the app to carry, copied beside the rest of the build, and its binaries signed as
 * the app will be, before Tauri seals the app around it: macOS names what the app keeps running (the
 * server's service, a kept bridge) after the app only when its program is signed by the app's
 * team, and Apple notarizes an app only when every binary in it is signed by its Developer ID. Node
 * takes its entitlements; the natives beside it take none. The release itself, and the tarball made
 * from it, keep the signatures they came with.
 */
function carry(built, identity, timestamp) {
  rmSync(CARRIED, { recursive: true, force: true });
  const copied = run("ditto", [built, CARRIED]);
  if (!copied.ok) {
    console.log(`  ${cross} could not copy Chips for the app to carry: ${copied.out.trim()}`);
    return undefined;
  }
  if (identity === undefined) {
    console.log(`  ${warn} its Node keeps Node's own signature, so Login Items will name Node\n`);
    return CARRIED;
  }
  const node = `${CARRIED}/runtime/node`;
  for (const binary of binariesIn(CARRIED)) {
    const entitlements = binary === node ? NODE_ENTITLEMENTS : undefined;
    const signed = run("codesign", signArgs(binary, identity, { entitlements, timestamp }));
    if (!signed.ok) {
      console.log(
        `  ${cross} could not sign ${binary.slice(CARRIED.length + 1)}: ${signed.out.trim()}`,
      );
      return undefined;
    }
  }
  console.log(`  ${tick} its Node and natives signed as ${identity}, so Login Items name Chips\n`);
  return CARRIED;
}

/** Every Mach-O file in a folder: the executables, `.node` addons and `.dylib`s a release carries. */
function binariesIn(folder) {
  const files = run("find", [folder, "-type", "f"]).out.split("\n").filter(Boolean);
  return files.filter((file) => run("file", ["-b", file]).out.startsWith("Mach-O"));
}

/** Whether the built app and the Node inside it name the same team, as Login Items need. */
function sameTeam() {
  const app = teamOf(run("codesign", ["-dv", BUILT]).out);
  const node = teamOf(
    run("codesign", ["-dv", `${BUILT}/Contents/Resources/chips/runtime/node`]).out,
  );
  if (app !== undefined && app === node) {
    console.log(`\n  ${tick} the app and its Node are both signed by team ${app}`);
    return true;
  }
  console.log(
    `\n  ${cross} the app is signed by team ${app ?? "none"} and its Node by ${node ?? "none"}`,
  );
  return false;
}

/** The release `tools/release/build.mjs` makes for this Mac, from the app's web copy: its folder. */
function release() {
  const built = watch("node", ["tools/release/build.mjs", "--web", WEB], { cwd: REPO });
  // This version's, by name: an older version's folder may still be beside it.
  const { version } = JSON.parse(readFileSync(`${REPO}package.json`, "utf8"));
  const name = artifactName(version, hostTarget(process.platform, process.arch));
  const folder = `${REPO}dist/release/${name}`;
  if (!built || !existsSync(folder)) {
    console.log(`\n  ${cross} Chips for the app to carry did not build`);
    return undefined;
  }
  console.log(`  ${tick} carrying ${name}\n`);
  return folder;
}

/**
 * A certificate on this Mac to sign with, the one the phone's builds use. The app's key is locked
 * in the login keychain by WebKit, and the keychain lets in the app it was made for. An ad-hoc
 * signature names one build, so every build is a stranger; a certificate names the developer,
 * so every build is the same app. Not for anybody else's Mac: that is `pnpm desktop:build`.
 */
function signingIdentity() {
  const found = run("security", ["find-identity", "-v", "-p", "codesigning"]).out;
  return /"((?:Apple Development|Developer ID Application): [^"]+)"/.exec(found)?.[1];
}

function running() {
  return run("pgrep", ["-f", `${INSTALLED}/Contents/MacOS/`]).ok;
}

/** Quit the installed app the way a person would, so it is not mid-write when it goes. */
function quit() {
  if (!running()) return true;
  run("osascript", ["-e", `tell application "${INSTALLED}" to quit`]);
  for (let second = 0; second < 10 && running(); second += 1) sleep(1000);
  if (running()) {
    console.log(`  ${cross} Chips is still open. Quit it, and run this again.`);
    return false;
  }
  return true;
}

/**
 * The new app in place of the old one, whole. `ditto` into an app that is there already merges the
 * two, so whatever an older build had and this one does not stays: the web copies the app carries
 * piled up, one a build. The new one is copied in beside the old first, so a copy that fails leaves
 * the old app as it was. Nothing in the old one is kept, and nothing needs to be: the app's key and
 * the page's storage live in the keychain and in ~/Library/WebKit/chat.chips.desktop.
 */
function install() {
  if (!quit()) return false;
  const incoming = "/Applications/.Chips.app.installing";
  rmSync(incoming, { recursive: true, force: true });
  const copied = run("ditto", [BUILT, incoming]);
  if (!copied.ok) {
    rmSync(incoming, { recursive: true, force: true });
    console.log(`  ${cross} could not put it in /Applications: ${copied.out.trim()}`);
    return false;
  }
  try {
    rmSync(INSTALLED, { recursive: true, force: true });
    renameSync(incoming, INSTALLED);
  } catch (error) {
    console.log(`  ${cross} could not replace the app in /Applications: ${error.message}`);
    return false;
  }
  console.log(`  ${tick} installed in /Applications`);
  return true;
}

/**
 * A pairing code from this machine, as `pnpm phone` gets one: `chips pair --issue` asks with this
 * machine's own device, or with the token the running server left beside its database.
 */
function issueCode() {
  const issued = run("pnpm", ["chips", "pair", "--issue"], { cwd: REPO });
  const code = /^\s*code\s+([A-Z2-9]{3}-[A-Z2-9]{3})\s*$/m.exec(issued.out)?.[1];
  const server = /^\s*server\s+(https?:\/\/\S+)\s*$/m.exec(issued.out)?.[1];
  if (issued.ok && code && server) return { code, server };
  const said = issued.out.trim().split("\n").filter(Boolean).at(-1) ?? "no answer";
  console.log(`  ${cross} could not get a pairing code from the server on ${PORT}: ${said}`);
  return undefined;
}

/**
 * This workspace's Macs, as id to when each was last seen. Reading the database is the same claim
 * the operator token makes — whoever can read this directory can read the workspace.
 */
function macsSeen() {
  const read = run("sqlite3", [
    "-readonly",
    WORKSPACE_DB,
    `select id, coalesce(last_seen_at, '') from devices where revoked_at is null and name = '${DEVICE_NAME}';`,
  ]);
  const seen = new Map();
  if (!read.ok) return seen;
  for (const line of read.out.split("\n")) {
    const [id, at = ""] = line.trim().split("|");
    if (id !== undefined && id !== "") seen.set(id, at);
  }
  return seen;
}

/** A Mac that is new and has connected, or one already here that has been seen again. */
function macArrived(was) {
  for (const [id, at] of macsSeen()) {
    if (at === "") continue;
    if (!was.has(id)) return "paired";
    if (at > (was.get(id) ?? "")) return "returned";
  }
  return undefined;
}

function logLength() {
  return existsSync(SERVE_LOG) ? run("wc", ["-c", SERVE_LOG]).out.trim().split(/\s+/)[0] : "0";
}

function refusedSince(offset) {
  if (!existsSync(SERVE_LOG)) return false;
  return /pairing refused/.test(run("tail", ["-c", `+${Number(offset) + 1}`, SERVE_LOG]).out);
}

/**
 * The app, opened with a code. One that is open is quit first, so that one already paired comes
 * back and is seen doing it, rather than sitting where it was with nothing to show.
 */
function connect() {
  if (!existsSync(INSTALLED)) {
    console.log(`  ${cross} Chips is not in /Applications. Build and install it: pnpm desktop`);
    return false;
  }
  const issued = issueCode();
  if (issued === undefined) return false;
  const link = `chips://pair?${new URLSearchParams({ pair: issued.code, v: "1", lan: issued.server })}`;
  const was = macsSeen();
  const offset = logLength();
  if (!quit()) return false;
  const opened = run("open", ["-a", INSTALLED, link]);
  if (!opened.ok) {
    console.log(`  ${cross} Chips would not open: ${opened.out.trim()}`);
    return false;
  }
  console.log(`  ${tick} opened, with a code for ${issued.server}`);
  return waitForMac(was, offset);
}

/** A second at a time, until the server has the Mac, turned the code away, or time is up. */
function waitForMac(was, offset) {
  for (let second = 0; second < PAIR_WAIT_SECONDS; second += 1) {
    const arrived = macArrived(was);
    if (arrived === "paired") {
      console.log(`  ${tick} paired, as "${DEVICE_NAME}"\n`);
      return true;
    }
    if (arrived === "returned") {
      console.log(`  ${tick} already paired: it came back with the key it holds\n`);
      return true;
    }
    if (refusedSince(offset)) {
      console.log(`  ${cross} the server refused the code. Run this again for a fresh one.\n`);
      return false;
    }
    sleep(1000);
  }
  if (was.size > 0) {
    console.log(
      `  ${warn} nothing new in ${PAIR_WAIT_SECONDS} s, and this workspace already has a "${DEVICE_NAME}".`,
    );
    console.log("      If the app shows your spaces, it kept the key it had and all is well.\n");
  } else {
    console.log(`  ${cross} the app did not pair in ${PAIR_WAIT_SECONDS} s. Look at its window.\n`);
  }
  return false;
}

/** The Developer ID on this Mac, the one certificate a build for other Macs is signed with. */
function developerId() {
  const found = run("security", ["find-identity", "-v", "-p", "codesigning"]).out;
  return [...found.matchAll(/"([^"]+)"/g)].map((match) => match[1]).find(isDeveloperId);
}

/** The App Store Connect API key on this Mac, as the TestFlight tools use it, for notarytool. */
function notaryKey() {
  const folder = `${homedir()}/.appstoreconnect`;
  try {
    const { keyId, issuerId } = JSON.parse(readFileSync(`${folder}/chips.json`, "utf8"));
    const keyPath = `${folder}/private_keys/AuthKey_${keyId}.p8`;
    if (keyId && issuerId && existsSync(keyPath)) return { keyPath, keyId, issuerId };
  } catch {
    // Said below.
  }
  console.log(
    `  ${cross} no App Store Connect key in ${folder} (chips.json and its .p8) to notarize with`,
  );
  return undefined;
}

/** A file sent to Apple, and the answer waited for; when Apple turns it down, Apple's reasons. */
function notarize(file, key) {
  console.log(`  … sending ${file.split("/").at(-1)} to Apple to be notarized (minutes, usually)`);
  const sent = run("xcrun", notarizeArgs(file, key));
  let answer;
  try {
    answer = JSON.parse(sent.out.slice(sent.out.indexOf("{")));
  } catch {
    console.log(`  ${cross} notarytool said: ${sent.out.trim().split("\n").at(-1)}`);
    return false;
  }
  if (answer.status === "Accepted") {
    console.log(`  ${tick} notarized`);
    return true;
  }
  console.log(`  ${cross} Apple answered ${answer.status}. Its log:`);
  const { keyPath, keyId, issuerId } = key;
  const log = ["notarytool", "log", answer.id, "--key", keyPath, "--key-id", keyId];
  watch("xcrun", [...log, "--issuer", issuerId]);
  return false;
}

/** Something that has to work, with its words if it doesn't. */
function must(what, command, args) {
  const done = run(command, args);
  if (!done.ok) console.log(`  ${cross} ${what}: ${done.out.trim()}`);
  return done.ok;
}

/**
 * Chips for Mac to hand out: the build `pnpm desktop` makes, signed with the Developer ID, the app
 * notarized and stapled, then a DMG with it and a link to Applications, signed, notarized and
 * stapled in turn, so it opens on a Mac that is offline.
 */
function handOut() {
  console.log("\n  Chips for Mac, to hand out\n");
  const identity = developerId();
  if (identity === undefined) {
    console.log(`  ${cross} no Developer ID Application certificate on this Mac. Make one at`);
    console.log(
      "      developer.apple.com → Certificates → + → Developer ID Application, and put it",
    );
    console.log("      in the login keychain. An Apple Development one is for this Mac alone.\n");
    return false;
  }
  const key = notaryKey();
  if (key === undefined || !build(identity, true)) return false;
  if (!notarizedApp(identity, key) || !notarizedDmg(identity, key) || !accepted()) return false;
  console.log(`\n  ${DMG}`);
  console.log(
    "  For the release: gh release upload v<version> dist/release/Chips.dmg -R arjungupta99/chips\n",
  );
  return true;
}

/** The built app signed again with a timestamp, keeping what Tauri claimed, then notarized and stapled. */
function notarizedApp(identity, key) {
  const zip = `${TAURI}/target/Chips.zip`;
  rmSync(zip, { force: true });
  return (
    must("could not sign the app with a timestamp", "codesign", [
      ...["--force", "--sign", identity, "--timestamp", "--options", "runtime"],
      "--preserve-metadata=entitlements,requirements,flags",
      BUILT,
    ]) &&
    must("could not zip the app", "ditto", ["-c", "-k", "--keepParent", BUILT, zip]) &&
    notarize(zip, key) &&
    must("could not staple the app", "xcrun", ["stapler", "staple", BUILT])
  );
}

/**
 * The DMG: the notarized app and a link to Applications, signed, notarized and stapled. Staged
 * outside the repository and gone after: a link to /Applications inside it would lead the test
 * runner, and anything else that walks the tree, into every app on the Mac.
 */
function notarizedDmg(identity, key) {
  const staged = mkdtempSync(join(tmpdir(), "chips-dmg-"));
  try {
    if (!must("could not stage the DMG", "ditto", [BUILT, `${staged}/Chips.app`])) return false;
    symlinkSync("/Applications", `${staged}/Applications`);
    rmSync(DMG, { force: true });
    if (
      !must("could not make the DMG", "hdiutil", [
        ...["create", "-volname", "Chips", "-srcfolder", staged],
        ...["-fs", "HFS+", "-format", "UDZO", "-ov", DMG],
      ])
    ) {
      return false;
    }
  } finally {
    rmSync(staged, { recursive: true, force: true });
  }
  return (
    must("could not sign the DMG", "codesign", [
      "--force",
      "--sign",
      identity,
      "--timestamp",
      DMG,
    ]) &&
    notarize(DMG, key) &&
    must("could not staple the DMG", "xcrun", ["stapler", "staple", DMG])
  );
}

/** Whether Gatekeeper takes the app and the DMG, as it would on somebody else's Mac. */
function accepted() {
  const app = run("spctl", ["-a", "-vvv", "-t", "exec", BUILT]);
  const dmg = run("spctl", [
    ...["-a", "-vvv", "-t", "open"],
    ...["--context", "context:primary-signature", DMG],
  ]);
  if (!app.ok || !dmg.ok) {
    console.log(`  ${cross} Gatekeeper refuses it: ${(app.ok ? dmg : app).out.trim()}`);
    return false;
  }
  console.log(
    `  ${tick} Gatekeeper takes the app and the DMG: ${app.out.match(/source=.*/)?.[0] ?? ""}`,
  );
  return true;
}

const [command] = process.argv.slice(2);
if (command === "connect") {
  process.exit(connect() ? 0 : 1);
} else if (command === "release") {
  process.exit(handOut() ? 0 : 1);
} else if (command === undefined) {
  process.exit(build() && install() && connect() ? 0 : 1);
} else {
  console.log("  pnpm desktop            build, install in /Applications, and pair");
  console.log("  pnpm desktop connect    pair the installed app");
  console.log("  pnpm desktop release    build it to hand out: Developer ID, notarized, in a DMG");
  process.exit(command === "help" || command === "--help" ? 0 : 1);
}
