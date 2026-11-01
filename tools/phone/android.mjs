/**
 * `chips build mobile a` — the app on Android, from a checkout, in one command.
 *
 *   chips build mobile a                     check, build, install, then pair it with the server
 *   chips build mobile a emulator-5554       the same, on the device adb calls that
 *   chips build mobile a --code ABC-234 --server http://…
 *                                            pair with a code something else already issued
 *   chips build mobile a --no-pair           build and install, nothing else
 *
 * It is `pnpm phone` for Android, and does the same four things in the same order: checks that
 * name what is wrong and what fixes it, a release build with the JavaScript inside it (so no
 * Metro has to be running for the app to open), an install, and a pairing code handed to the app
 * as the `chips://pair` link it is launched with. A phone plugged in with USB debugging on is
 * built for first; without one, the emulator this Mac already has is booted and left running.
 *
 * What an emulator adds is an address. It reaches the Mac's loopback as `10.0.2.2`, so a server
 * advertised at `127.0.0.1` is handed over as that, and its Wi-Fi comes up a few seconds after
 * Android says it has booted, which is waited for (`apps/mobile/README.md`, Android).
 *
 * The decisions are in `android-plan.mjs`, which is tested; this file is the doing.
 */

import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  chooseDevice,
  devicesFrom,
  gradleFailure,
  missingPackages,
  pairLink,
  prebuildNeeded,
  sdkWanted,
  serverForDevice,
} from "./android-plan.mjs";
import { stampedEnv } from "./stamp.mjs";

const REPO = fileURLToPath(new URL("../../", import.meta.url));
const MOBILE = `${REPO}apps/mobile`;
const ANDROID = `${MOBILE}/android`;
const APK = `${ANDROID}/app/build/outputs/apk/release/app-release.apk`;
const PACKAGE = "chat.chips.app";
const PORT = Number(process.env.CHIPS_PORT ?? 4431);
/** The workspace this machine's server keeps, whose device registry says when a phone is in. */
const DATA_DIR = process.env.CHIPS_DATA_DIR ?? `${REPO}.chips`;
const WORKSPACE_DB = `${DATA_DIR}/chips.db`;
const SDK =
  process.env.ANDROID_HOME ??
  process.env.ANDROID_SDK_ROOT ??
  `${process.env.HOME}/Library/Android/sdk`;
const ADB = `${SDK}/platform-tools/adb`;
const EMULATOR = `${SDK}/emulator/emulator`;
const CATALOGUE = `${MOBILE}/node_modules/react-native/gradle/libs.versions.toml`;
const BOOT_SECONDS = 240;
const PAIR_WAIT_SECONDS = 180;

const tick = "✓";
const cross = "✗";
const warn = "!";

/** Run something and hand back what it said, without throwing on a non-zero exit. */
function run(command, args, options = {}) {
  const done = spawnSync(command, args, { encoding: "utf8", ...options });
  return { ok: done.status === 0, out: `${done.stdout ?? ""}${done.stderr ?? ""}` };
}

/** A pause, synchronously: this tool waits on the world, and nothing runs beside it. */
function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

let failures = 0;
/** Say what a check found, and on a failure what puts it right. */
function report(ok, what, detail, fix) {
  if (!ok) failures += 1;
  console.log(`  ${ok ? tick : cross} ${what}${detail ? `  ${detail}` : ""}`);
  if (!ok && fix) for (const line of fix.split("\n")) console.log(`      ${line}`);
  return ok;
}

const mtime = (path) => (existsSync(path) ? statSync(path).mtimeMs : undefined);

/* ---------------------------------------------------------------- the Mac */

/** A JDK 17 for Gradle: the one `JAVA_HOME` names, or the one macOS knows about. */
function javaHome() {
  const named = process.env.JAVA_HOME;
  const home = named && existsSync(`${named}/bin/java`) ? named : undefined;
  const found = home ?? run("/usr/libexec/java_home", ["-v", "17"]).out.trim().split("\n")[0];
  const ok = found !== undefined && existsSync(`${found}/bin/java`);
  report(
    ok,
    "Java 17",
    ok ? found : "",
    "Gradle needs a JDK 17. Temurin 17 from adoptium.net, unpacked into\n~/Library/Java/JavaVirtualMachines, is found without setting anything.",
  );
  return ok ? found : undefined;
}

/** The SDK, with every package this React Native builds against. */
function checkSdk() {
  if (!report(existsSync(ADB), "Android SDK", SDK, `No SDK at ${SDK}. Set ANDROID_HOME to one.`)) {
    return false;
  }
  if (!existsSync(CATALOGUE)) return true;
  const missing = missingPackages(sdkWanted(readFileSync(CATALOGUE, "utf8")), (path) =>
    existsSync(`${SDK}/${path}`),
  );
  const sdkmanager = `${SDK}/cmdline-tools/latest/bin/sdkmanager`;
  return report(
    missing.length === 0,
    "SDK packages",
    missing.length === 0 ? "platform, build tools, NDK" : `missing ${missing.join(", ")}`,
    `${sdkmanager} --install ${missing.map((id) => `"${id}"`).join(" ")}`,
  );
}

/** The app's dependencies installed, which Gradle reads its native modules out of. */
function checkDependencies() {
  const ok = existsSync(`${MOBILE}/node_modules/expo/package.json`);
  if (ok) return report(true, "Dependencies", "installed");
  console.log("  ! Dependencies  not installed here; installing them");
  return report(
    run("pnpm", ["install", "--frozen-lockfile"], { cwd: REPO, stdio: "inherit" }).ok,
    "Dependencies",
    "installed",
    "pnpm install failed; its output is above.",
  );
}

/* ------------------------------------------------------------- the device */

const listDevices = () => devicesFrom(run(ADB, ["devices", "-l"]).out);
const shell = (device, ...args) => run(ADB, ["-s", device.serial, "shell", ...args]).out.trim();

/** An emulator this Mac already has, started and left running, or why there is none. */
function bootEmulator() {
  const avds = run(EMULATOR, ["-list-avds"])
    .out.split("\n")
    .map((line) => line.trim())
    .filter((line) => /^[\w.-]+$/.test(line));
  const avd = process.env.CHIPS_AVD ?? avds[0];
  if (avd === undefined) return false;
  console.log(`  ${warn} No device is connected. Starting the emulator ${avd}.`);
  spawn(EMULATOR, ["-avd", avd, "-no-boot-anim", "-no-snapshot-save"], {
    detached: true,
    stdio: "ignore",
  }).unref();
  return true;
}

/** Whether Android has booted, and on an emulator whether its Wi-Fi has come up behind it. */
function upAndOnline(device) {
  if (shell(device, "getprop", "sys.boot_completed") !== "1") return false;
  if (!device.emulator) return true;
  const route = shell(device, "ip", "route", "get", "10.0.2.2");
  return /\bdev\b/.test(route) && !/unreachable/.test(route);
}

function waitForDevice(wanted) {
  process.stdout.write("  waiting for it to boot and come online ");
  for (let waited = 0; waited < BOOT_SECONDS; waited += 2) {
    const device = chooseDevice(listDevices(), wanted);
    if (device !== undefined && upAndOnline(device)) {
      console.log("");
      return device;
    }
    process.stdout.write(".");
    sleep(2000);
  }
  console.log("");
  return undefined;
}

/** The device named, a phone plugged in, or a running emulator, booting one when there is none. */
function findDevice(wanted) {
  const ready = chooseDevice(listDevices(), wanted);
  const device =
    ready ?? (wanted === undefined && bootEmulator() ? waitForDevice(undefined) : undefined);
  const fix =
    wanted === undefined
      ? 'Plug in a phone with USB debugging on, or make an emulator:\navdmanager create avd -n chips -k "system-images;android-36;google_apis_playstore;arm64-v8a" -d pixel_9'
      : `adb has no device ${wanted} that it can talk to. \`adb devices -l\` lists the ones it has.`;
  report(device !== undefined, "Device", device ? `${device.model} (${device.serial})` : "", fix);
  return device;
}

/* ------------------------------------------------------------- the server */

async function checkServer() {
  let ok = false;
  try {
    ok = (await fetch(`http://127.0.0.1:${PORT}/v1/health`, { signal: AbortSignal.timeout(2000) }))
      .ok;
  } catch {
    // Nothing answering is the failure this reports.
  }
  return report(
    ok,
    "Server",
    ok ? `answering on ${PORT}` : "",
    `Nothing answers as Chips on port ${PORT}. chips phone server starts it.`,
  );
}

/* ---------------------------------------------------------------- the app */

/** `android/` made again from `app.json` when it is missing or older than the config. */
function prebuild() {
  const needed = prebuildNeeded({
    project: mtime(`${ANDROID}/app/build.gradle`),
    config: mtime(`${MOBILE}/app.json`),
    dependencies: mtime(`${MOBILE}/package.json`),
  });
  if (!needed) return true;
  console.log("  Generating the native project from app.json");
  const made = run("pnpm", ["exec", "expo", "prebuild", "--platform", "android", "--no-install"], {
    cwd: MOBILE,
    env: { ...process.env, CI: "1" },
  });
  return report(
    made.ok,
    "Native project",
    "generated",
    made.out.trim().split("\n").slice(-6).join("\n"),
  );
}

function build(device, java) {
  const abi = shell(device, "getprop", "ro.product.cpu.abi") || "arm64-v8a";
  console.log(
    `\nBuilding a release for ${device.model}. The first takes about ten minutes; later ones do not.\n`,
  );
  const started = Date.now();
  const built = run(
    "./gradlew",
    ["app:assembleRelease", `-PreactNativeArchitectures=${abi}`, "--console=plain"],
    {
      cwd: ANDROID,
      env: stampedEnv(REPO, { ...process.env, JAVA_HOME: java, ANDROID_HOME: SDK }),
      maxBuffer: 256 * 1024 * 1024,
    },
  );
  const seconds = Math.round((Date.now() - started) / 1000);
  return report(
    built.ok && existsSync(APK),
    "Built",
    `in ${seconds} s`,
    gradleFailure(built.out).join("\n"),
  );
}

function install(device) {
  const installed = run(ADB, ["-s", device.serial, "install", "-r", APK]);
  const incompatible = /INSTALL_FAILED_UPDATE_INCOMPATIBLE/.test(installed.out);
  return report(
    installed.ok,
    "Installed",
    device.model,
    incompatible
      ? `The Chips on ${device.model} was signed with another key. Removing it forgets its pairing:\nadb -s ${device.serial} uninstall ${PACKAGE}`
      : installed.out.trim().split("\n").slice(-3).join("\n"),
  );
}

/* ----------------------------------------------------------------- pairing */

/**
 * A pairing code from this machine: `chips pair --issue` asks with this machine's own device, or
 * with the token the running server left beside its database (ADR 0048).
 */
function issueCode() {
  const issued = run("pnpm", ["chips", "pair", "--issue"], { cwd: REPO });
  const code = /^\s*code\s+([A-Z2-9]{3}-[A-Z2-9]{3})\s*$/m.exec(issued.out)?.[1];
  const server = /^\s*server\s+(https?:\/\/\S+)\s*$/m.exec(issued.out)?.[1];
  const ok = issued.ok && code !== undefined && server !== undefined;
  report(
    ok,
    "Pairing code",
    ok ? code : "",
    "chips pair --issue could not issue one. chips phone doctor says why.",
  );
  return ok ? { code, server } : undefined;
}

/** The phones in the workspace, id to when each was last seen; browsers and the CLI left out. */
function phonesSeen() {
  const read = run("sqlite3", [
    "-readonly",
    WORKSPACE_DB,
    "select id, coalesce(last_seen_at, '') from devices where revoked_at is null" +
      " and name not like '%browser%' and name not like '%CLI%';",
  ]);
  return new Map(
    read.ok
      ? read.out
          .split("\n")
          .filter((line) => line.includes("|"))
          .map((line) => line.trim().split("|"))
      : [],
  );
}

/** Paired (new to the workspace), back with the key it holds, or not yet. */
function arrived(was) {
  for (const [id, at] of phonesSeen()) {
    if (at === "") continue;
    if (!was.has(id)) return "paired";
    if (at > (was.get(id) ?? "")) return "returned";
  }
  return undefined;
}

function pair(device, issued) {
  const server = serverForDevice(issued.server, device);
  if (
    !report(
      server !== undefined,
      "Address",
      server ?? issued.server,
      `${device.model} cannot reach ${issued.server}: it is this Mac's loopback.\nGive the server an address the phone can reach (CHIPS_PUBLIC_URL), or --server one.`,
    )
  ) {
    return false;
  }
  const was = phonesSeen();
  // `-S` stops a running app first: a link handed to an app already open is only a link, and the
  // screen it is on stays where it is.
  const launched = run(ADB, [
    "-s",
    device.serial,
    "shell",
    "am",
    "start",
    "-S",
    "-W",
    "-a",
    "android.intent.action.VIEW",
    "-d",
    `'${pairLink(issued.code, server)}'`,
    PACKAGE,
  ]);
  if (
    !report(
      launched.ok && !/Error/.test(launched.out),
      "Launched",
      "with the code",
      launched.out.trim(),
    )
  ) {
    return false;
  }
  if (!existsSync(WORKSPACE_DB)) {
    console.log(
      `  (no workspace at ${DATA_DIR} to confirm it from; if the app shows Spaces, it worked)`,
    );
    return true;
  }
  return waitForPairing(device, was);
}

function waitForPairing(device, was) {
  process.stdout.write(`  waiting for ${device.model} to take the code `);
  for (let waited = 0; waited < PAIR_WAIT_SECONDS; waited += 1) {
    const verdict = arrived(was);
    if (verdict !== undefined) {
      console.log("");
      return report(true, verdict === "paired" ? "Paired" : "In, already paired", device.model);
    }
    process.stdout.write(".");
    sleep(1000);
  }
  console.log("");
  return report(
    false,
    "Paired",
    "",
    `${device.model} did not reach the server in ${PAIR_WAIT_SECONDS} seconds. The app is on its\npairing screen, and the code above is still good for a few minutes.`,
  );
}

/* ------------------------------------------------------------------ the run */

const args = process.argv.slice(2);
const option = (name) => {
  const at = args.indexOf(name);
  return at === -1 ? undefined : args[at + 1];
};
const given = option("--code");
const wanted = args.find(
  (arg, at) => !arg.startsWith("-") && args[at - 1] !== "--code" && args[at - 1] !== "--server",
);
const pairing = !args.includes("--no-pair");

if (given !== undefined && option("--server") === undefined) {
  console.log(`\n  ${cross} --code needs --server: the address the code was issued for.\n`);
  process.exit(1);
}

console.log("\nThe Mac");
const java = javaHome();
checkSdk();
checkDependencies();

console.log("\nThe device");
const device = failures === 0 ? findDevice(wanted) : undefined;

if (pairing && given === undefined) {
  console.log("\nThe server");
  await checkServer();
}

if (failures > 0 || device === undefined || java === undefined) {
  console.log(
    `\n${failures} thing${failures === 1 ? "" : "s"} to fix first. Each is above, with what to do about it.\n`,
  );
  process.exit(1);
}

console.log("\nThe app");
if (!prebuild() || !build(device, java) || !install(device)) process.exit(1);

if (pairing) {
  console.log("\nPairing");
  const issued =
    given === undefined ? issueCode() : { code: given.toUpperCase(), server: option("--server") };
  if (issued === undefined || !pair(device, issued)) process.exit(1);
}

console.log(`\nChips is on ${device.model}.\n`);
