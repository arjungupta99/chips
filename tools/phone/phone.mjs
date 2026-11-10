/**
 * `pnpm phone` — the app on a real iPhone, from a checkout, in one command.
 *
 *   pnpm phone                        check, build, install, then pair the phone by itself
 *   pnpm phone doctor                 check only, and say exactly what to fix
 *   pnpm phone build                  build, install and open, nothing else
 *   pnpm phone sim                    the same, in a booted simulator, and pair it
 *   pnpm phone connect                pair the phone, plugged in: no code typed, no QR scanned
 *   pnpm phone connect --code ABC-234 the same, with a code the desktop app already issued
 *   pnpm phone server                 chipsd as a launch agent, so it survives this terminal,
 *                                     this session and a reboot; then pairs the phone
 *   pnpm phone pods                   link a dependency that has a native side, after adding one
 *   pnpm phone fix-chain              install Apple's intermediate certificate
 *   pnpm phone testflight             archive it and send it to App Store Connect, from where
 *                                     TestFlight puts it on the phone (`testflight.mjs`)
 *   pnpm phone testflight --export    send the last archive again, without archiving
 *   pnpm phone ship                   the quickest way onto the phone from here: installed from
 *                                     this Mac when it is on the Wi-Fi or plugged in, through
 *                                     TestFlight when it is not (`devices.mjs`)
 *   pnpm phone ship "AG iPad Pro 2"   any of these on the device named; with none named, the
 *                                     iPhone, though Xcode lists an iPad first (`deviceMeant`)
 *
 * No Expo Go anywhere in it. This is the installed app, signed by you, talking to your own
 * server.
 *
 * How pairing works here. The server's own machine can always issue a pairing code (ADR 0048),
 * and `xcrun devicectl` can launch an installed app with a URL for it to open. So the code goes
 * to the phone as `chips://pair?…` at launch, the app pairs with it, and the server's log says
 * "device paired". Nobody reads a code off a screen, and no browser is involved — a browser on
 * a plain-HTTP address cannot pair at all, which is a rule of browsers and not of Chips.
 *
 * Why this exists. Getting the app onto a device the first time failed eight times in a row,
 * and not once for a reason the error message named: a missing Apple intermediate certificate,
 * a keychain that would not let `codesign` near the key, a development team that cannot sign
 * push, a Babel preset pnpm keeps where Xcode cannot see it, two servers on one port, an App
 * Transport Security rule that drops the request before it leaves the phone, and a web build
 * from before the fix that drew every QR with `127.0.0.1` in it. Each was ten minutes of
 * reading a log that said something else. They are all checkable in under a second, so they
 * are checked here, once, with the fix beside the failure.
 *
 * The rule for this file: every check names what is wrong in the words of the thing that is
 * wrong, and hands back a command or a sentence that fixes it. A check that cannot say what to
 * do about a failure does not belong here.
 *
 * And where that fix is a command this tool could have run itself, it runs it (Arjun, 12
 * September 2026: "I expect it should just work without hassle"). Printing `pnpm web:build` and
 * stopping makes you the thing that types an answer the tool already knew. So a check can carry
 * a `mend`: the run says everything that is wrong first, mends what it can, checks again, and
 * stops only for what is left — which is what needs your hands or your password. A cable, a
 * phone's Developer Mode, a team in Xcode, a second server to choose between.
 */

import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { homedir, networkInterfaces, tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import appConfig from "../../apps/mobile/app.config.js";
import { configTime, prebuildNeeded } from "./android-plan.mjs";
import { coreDeviceRowOf, deviceMeant, shipRoute } from "./devices.mjs";
import { nodeTrouble, STEADY_NODES, withNode } from "./node.mjs";
import { devicesThatOpened } from "./opened.mjs";
import { podsSandbox } from "./pods.mjs";
import { stampedEnv } from "./stamp.mjs";
import { machineDnsName, staleServeName } from "./tailnet.mjs";
import { freeTeamEntitlements, teamIds, teamOf } from "./team.mjs";
import {
  API_KEY_CONFIG,
  apiKeyFrom,
  archiveArgs,
  buildNumber,
  exportArgs,
  exportOptions,
  keyMissing,
  signedInToXcode,
  TESTFLIGHT_DIR,
  uploadFailure,
  uploadWords,
  XCODE_ACCOUNT_FIX,
} from "./testflight.mjs";

const REPO = fileURLToPath(new URL("../../", import.meta.url));
const MOBILE = `${REPO}apps/mobile`;
const IOS = `${MOBILE}/ios`;
/** What CocoaPods leaves behind: the list of every native dependency actually in the build. */
const PODFILE_LOCK = `${IOS}/Podfile.lock`;
/** The copy of that list inside what `pod install` installed; the two agree when `Pods/` is current. */
const PODS_MANIFEST = `${IOS}/Pods/Manifest.lock`;
const APP = `${IOS}/build/Build/Products/Release-iphoneos/Chips.app`;
const SIM_APP = `${IOS}/build/Build/Products/Release-iphonesimulator/Chips.app`;
/** Where a build for this device lands. The two platforms share derived data, not a product. */
const appFor = (device) => (device?.simulator ? SIM_APP : APP);
/** Whose app it is: `app.json`, and what the environment says over it (`app.config.js`). */
const IDENTITY = appConfig.identity(JSON.parse(readFileSync(`${MOBILE}/app.json`, "utf8")).expo);
const BUNDLE_ID = IDENTITY.bundle;
/**
 * Which app `ios/` was made for, written when this tool makes it. A variable changes no file's
 * time, so a project made before one was set or changed is found by this and not by its age.
 */
const MADE_FOR = `${IOS}/.made-for.json`;
const MADE_FOR_NOW = JSON.stringify({
  team: IDENTITY.team,
  bundle: IDENTITY.bundle,
  domains: IDENTITY.domains,
  free: IDENTITY.free,
});
const ENTITLEMENTS = `${IOS}/Chips/Chips.entitlements`;
const INFO_PLIST = `${IOS}/Chips/Info.plist`;
/** The push extension's (`plugins/with-push-seal.js`), which must carry the app's build number. */
const SEAL_PLIST = `${IOS}/ChipsNotifications/ChipsNotifications-Info.plist`;
/** The node Xcode's script phases run, which React Native names once and never again. */
const XCODE_ENV_LOCAL = `${IOS}/.xcode.env.local`;
const PORT = Number(process.env.CHIPS_PORT ?? 4431);
const WWDR = "https://www.apple.com/certificateauthority/AppleWWDRCAG3.cer";
/** Where the launch agent's stdout goes, which is where the server says "device paired". */
const SERVE_LOG = `${process.env.HOME}/Library/Logs/chips.serve.log`;
/** The workspace this machine's server keeps: its token, and the database beside it. */
const DATA_DIR = process.env.CHIPS_DATA_DIR ?? `${REPO}.chips`;
/**
 * What a running server leaves beside its database, for a pairing code from this machine. The
 * port is in the name so a scratch server sharing this directory cannot write over the agent's.
 */
const OPERATOR_TOKEN = `${DATA_DIR}/operator.${PORT}.token`;
const WORKSPACE_DB = `${DATA_DIR}/chips.db`;
/** How long the phone gets to take a code: long enough to type it, if it comes to that. */
const PAIR_WAIT_SECONDS = 180;

const tick = "✓";
const cross = "✗";
const warn = "!";

/** Run something and hand back what it said, without throwing on a non-zero exit. */
function run(command, args, options = {}) {
  const done = spawnSync(command, args, { encoding: "utf8", ...options });
  return {
    ok: done.status === 0,
    code: done.status,
    out: `${done.stdout ?? ""}${done.stderr ?? ""}`,
    timedOut: done.error?.code === "ETIMEDOUT" || done.signal === "SIGTERM",
  };
}

/** A second's pause, synchronously: this tool waits on the world, and nothing runs beside it. */
function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

const findings = [];
/**
 * Say what a check found. `mend` is how this tool puts that finding right without you: a line
 * saying what it is about to do, and the doing of it, which hands back whether it worked.
 */
function report(state, what, detail, fix, mend) {
  findings.push({ state, what, detail, fix, mend });
  const mark = state === "ok" ? tick : state === "warn" ? warn : cross;
  console.log(`  ${mark} ${what}${detail ? `  ${detail}` : ""}`);
  if (fix) for (const line of fix.split("\n")) console.log(`      ${line}`);
}
const broken = () => findings.filter((f) => f.state === "bad");

/**
 * What this tool can put right on its own: a line saying what it is about to do, and the doing
 * of it. Everything here is a command with nothing in it to decide — the same command the check
 * used to print and then leave to you. What is deliberately not here is what needs your hands (a
 * cable, Developer Mode), your password (`sudo xcode-select`), a keychain dialog answered, or
 * somebody else's process stopped. Those checks still print and stop, and that is the whole of
 * the line between the two.
 */
const MENDS = {
  chain: { says: "importing Apple's intermediate certificate", run: fixChain },
  babel: {
    says: "adding babel-preset-expo to apps/mobile, which puts it in the lockfile",
    run: () =>
      run("pnpm", ["--filter", "@chipschat/mobile", "add", "-D", "babel-preset-expo"], {
        cwd: REPO,
      }).ok,
  },
  prebuild: { says: "generating the iOS project from app.json again", run: prebuildIos },
  pods: { says: "linking the native dependencies", run: installPods },
  node: { says: "pointing Xcode at Homebrew's own link to node", run: steadyNode },
  sim: { says: "booting a simulator this Mac already has", run: bootSimulator },
  web: {
    says: "building the browser app",
    run: () => run("pnpm", ["run", "web:build"], { cwd: REPO }).ok,
  },
  server: { says: "starting the server as a launch agent", run: installAgent },
};

/* ---------------------------------------------------------------- the Mac */

function checkXcode() {
  const selected = run("xcode-select", ["-p"]).out.trim();
  if (!selected.includes("Xcode.app")) {
    report(
      "bad",
      "Xcode",
      `xcode-select points at ${selected || "nothing"}`,
      "sudo xcode-select -s /Applications/Xcode.app/Contents/Developer",
    );
    return;
  }
  const version = run("xcodebuild", ["-version"]).out.split("\n")[0] ?? "";
  report("ok", "Xcode", `${version.trim()} at ${selected}`);
}

/** A development certificate that can actually sign, which is three separate facts. */
function checkSigning() {
  const valid = run("security", ["find-identity", "-v", "-p", "codesigning"]).out;
  const any = run("security", ["find-identity", "-p", "codesigning"]).out;
  const name = /"(Apple Development: [^"]+)"/.exec(valid)?.[1];

  if (!name) {
    const present = /"(Apple Development: [^"]+)"/.exec(any)?.[1];
    if (present && /NOT_TRUSTED/.test(any)) {
      report(
        "bad",
        "Signing certificate",
        `${present} cannot build a chain to Apple's root`,
        `Apple's G3 intermediate is missing from this Mac. Fix it with:\n  pnpm phone fix-chain`,
        MENDS.chain,
      );
      return undefined;
    }
    report(
      "bad",
      "Signing certificate",
      "none this Mac can sign with",
      "Xcode, Settings, Accounts: add your Apple ID, then Manage Certificates, then\n+ , then Apple Development.",
    );
    return undefined;
  }

  // The key exists. Can codesign reach it without stopping for a dialog? Ten seconds of
  // silence is the dialog: the ACL does not name codesign, and the prompt is modal and
  // invisible from here.
  const probe = `${tmpdir()}/chips-phone-probe`;
  copyFileSync("/bin/echo", probe);
  const signed = run("codesign", ["-f", "-s", name, probe], { timeout: 10_000 });
  if (signed.timedOut) {
    report(
      "bad",
      "Keychain access",
      "codesign is waiting on a keychain dialog",
      `Answer it with Allow, or stop it coming back:\n  security set-key-partition-list -S apple-tool:,apple:,codesign: -s ~/Library/Keychains/login.keychain-db`,
    );
  } else if (!signed.ok) {
    report(
      "bad",
      "Keychain access",
      signed.out.trim().split("\n").pop() ?? "codesign failed",
      "Sign anything by hand once and answer the dialog with Always Allow.",
    );
  } else {
    report("ok", "Signing certificate", name);
  }
  return name;
}

/** Where Xcode keeps the provisioning profiles it has downloaded: Xcode 16's place, then the old one. */
const PROFILE_DIRS = [
  `${process.env.HOME}/Library/Developer/Xcode/UserData/Provisioning Profiles`,
  `${process.env.HOME}/Library/MobileDevice/Provisioning Profiles`,
];

/** Every profile Xcode holds, decoded. Xcode's own word on the team is older than these. */
function provisioningProfiles() {
  return PROFILE_DIRS.flatMap((dir) =>
    existsSync(dir)
      ? readdirSync(dir)
          .filter((name) => name.endsWith(".mobileprovision"))
          .map((name) => run("security", ["cms", "-D", "-i", `${dir}/${name}`]).out)
      : [],
  );
}

/** Free team or paid, because it decides whether push can be in the build at all (`team.mjs`). */
function checkTeam() {
  const prefs = run("plutil", [
    "-p",
    `${process.env.HOME}/Library/Preferences/com.apple.dt.Xcode.plist`,
  ]).out;
  const team = teamOf(prefs, provisioningProfiles(), IDENTITY.team);
  if (team === undefined) {
    report("warn", "Development team", "Xcode lists none; the build will ask for one");
    return { id: undefined, free: true };
  }
  const listed = teamIds(prefs);
  const kind = `${team.label ?? team.id}${team.free ? ", free" : ", paid"}`;
  if (listed.length === 0) {
    report("ok", "Development team", `${kind}, by its profiles here; Xcode lists no account`);
    return team;
  }
  report("ok", "Development team", kind);
  // The build is signed as the config's team (`app.config.js`), which is Chips' own until set.
  if (!listed.includes(IDENTITY.team)) {
    report(
      "warn",
      "Signing team",
      `the build is signed as ${IDENTITY.team}, which is not one of Xcode's teams`,
      `Name yours, and a bundle id of your own, in your shell profile:\n  export CHIPS_APPLE_TEAM_ID=${team.id}\n  export CHIPS_IOS_BUNDLE_ID=com.yourname.chips${team.free ? "\n  export CHIPS_IOS_FREE_TEAM=1" : ""}\n(Building the phone app → Under your own Apple team, in the docs.)`,
    );
  }
  return team;
}

/**
 * A free team cannot sign push or a link domain, and the error Xcode gives names the capability
 * rather than the team, four hundred lines into a log. So they come out, loudly, and go back when
 * the team can carry them.
 */
function reconcileFreeTeam(free) {
  if (!existsSync(ENTITLEMENTS)) return;
  const text = readFileSync(ENTITLEMENTS, "utf8");
  const signable = freeTeamEntitlements(text);
  if (free && signable.gone.length > 0) {
    copyFileSync(ENTITLEMENTS, `${ENTITLEMENTS}.with-push`);
    writeFileSync(ENTITLEMENTS, signable.text);
    report(
      "warn",
      "Entitlements",
      `${signable.gone.join(" and ")} taken out: a free team cannot sign ${signable.gone.length === 1 ? "it" : "them"}`,
      "Notifications on this phone will refuse, and an invite link opens in Safari, until you\nbuild with a paid team.",
    );
  } else if (
    !free &&
    !IDENTITY.free &&
    signable.gone.length === 0 &&
    existsSync(`${ENTITLEMENTS}.with-push`)
  ) {
    copyFileSync(`${ENTITLEMENTS}.with-push`, ENTITLEMENTS);
    report("ok", "Entitlements", "put back, now that the team is a paid one");
  } else if (text.includes("aps-environment")) {
    report("ok", "Entitlements", "push in the build");
  } else {
    report(
      "ok",
      "Entitlements",
      IDENTITY.free ? "no push, because CHIPS_IOS_FREE_TEAM is set" : "no push in the build",
    );
  }
}

/* ------------------------------------------------------------- the project */

/** pnpm keeps a transitive package where Xcode's own Babel cannot find it by name. */
function checkBabelPreset() {
  const there = existsSync(`${MOBILE}/node_modules/babel-preset-expo`);
  if (there) return report("ok", "babel-preset-expo", "resolvable from apps/mobile");
  report(
    "bad",
    "babel-preset-expo",
    "not resolvable from apps/mobile, so the embed step will fail",
    "pnpm --filter @chipschat/mobile add -D babel-preset-expo",
    MENDS.babel,
  );
}

/** Every pod the project has, by name, from the lockfile's list of what it last built. */
function podsInLock() {
  const lock = readFileSync(PODFILE_LOCK, "utf8");
  return new Set(
    (lock.split("SPEC CHECKSUMS:")[1] ?? "")
      .split("\n")
      .map((line) => /^ {2}(\S+):/.exec(line)?.[1])
      .filter((name) => name !== undefined),
  );
}

/**
 * The pods this app's dependencies want, as pod name to the package that brings it. A package
 * keeps its podspec at its root or under `ios/`, and one with no podspec has no native side to
 * link at all: `react-native-web` and `expo-status-bar` are JavaScript and are nobody's pod.
 */
function podsWanted() {
  const manifest = JSON.parse(readFileSync(`${MOBILE}/package.json`, "utf8"));
  const wanted = new Map();
  for (const dep of Object.keys(manifest.dependencies ?? {})) {
    const dir = `${MOBILE}/node_modules/${dep}`;
    const found = run("sh", ["-c", `ls ${dir}/*.podspec ${dir}/ios/*.podspec 2>/dev/null`]).out;
    for (const path of found.split("\n")) {
      const pod = /([^/]+)\.podspec$/.exec(path)?.[1];
      if (pod !== undefined) wanted.set(pod, dep);
    }
  }
  // And the app's own (`apps/mobile/modules`), which Expo links the same way and no package.json
  // lists. A build without one opens all the same and quietly does without it: the tabs' glass
  // falls back to a shelf without its band (`modules/scroll-band`, 2 October 2026).
  const own = run("sh", ["-c", `ls ${MOBILE}/modules/*/ios/*.podspec 2>/dev/null`]).out;
  for (const path of own.split("\n")) {
    const found = /modules\/([^/]+)\/ios\/([^/]+)\.podspec$/.exec(path);
    if (found !== null) wanted.set(found[2], `modules/${found[1]}`);
  }
  return wanted;
}

const mtime = (path) => (existsSync(path) ? statSync(path).mtimeMs : undefined);
const filesUnder = (dir) =>
  existsSync(dir) ? readdirSync(dir, { recursive: true }).map((name) => `${dir}/${name}`) : [];

/**
 * `ios/` is generated from `app.json` and never edited (`apps/mobile/.gitignore`), so one made
 * before `app.json` or the app's dependencies last changed is missing what changed: a plugin's
 * permission sentence, a native setting. The build compiles, installs and opens all the same, and
 * the app dies at the first thing that needed the sentence. That was the media viewer's Save (14
 * September 2026): Photos refuses an app with no `NSPhotoLibraryAddUsageDescription` by ending it,
 * and the checkout's `ios/` predated the plugin entry that writes the sentence. Android's tool
 * makes its project again by the same rule (`prebuildNeeded`). A config plugin and the sources it
 * copies count as config (`configTime`): the notification extension's copy stayed old once. And
 * one made for another team or
 * bundle id is signed for them, which is the first `pnpm phone` of a fork run before its variables
 * were set (`app.config.js`).
 */
function staleNativeProject() {
  if (!existsSync(INFO_PLIST)) return "ios/ has not been generated";
  if (!existsSync(MADE_FOR)) return "ios/ was not made here, so it does not say whose app it is";
  // When the project was made is the mark's time, written by each prebuild here. Not Info.plist's:
  // every build stamps its number there, so the project read as new after any build at all.
  const needed = prebuildNeeded({
    project: mtime(MADE_FOR),
    config: configTime(MOBILE, { mtime, filesUnder }),
    dependencies: mtime(`${MOBILE}/package.json`),
  });
  if (needed) return "ios/ is older than app.json, app.config.js, plugins/ or package.json";
  if (readFileSync(MADE_FOR, "utf8") !== MADE_FOR_NOW)
    return "ios/ was made for another team, bundle id or link domain";
  return undefined;
}

function checkNativeProject() {
  const stale = staleNativeProject();
  if (stale === undefined) return report("ok", "Native project", "made from the config it has");
  report(
    "bad",
    "Native project",
    stale,
    "What changed there is not in the build. Make it again:\n  pnpm --filter @chipschat/mobile exec expo prebuild --platform ios --no-install",
    MENDS.prebuild,
  );
}

/** Make `ios/` again from the config, keeping what is already built, and mark it as made now. */
function prebuildIos() {
  console.log("\nGenerating the iOS project from app.json.\n");
  const made = run("pnpm", ["exec", "expo", "prebuild", "--platform", "ios", "--no-install"], {
    cwd: MOBILE,
    env: { ...process.env, CI: "1", LANG: "en_US.UTF-8", LC_ALL: "en_US.UTF-8" },
  });
  if (!made.ok) {
    console.log(`  ${cross} expo prebuild failed:`);
    console.log(`      ${made.out.trim().split("\n").slice(-8).join("\n      ")}`);
    return false;
  }
  // Written each time, so its time is when the project was made (`staleNativeProject`).
  writeFileSync(MADE_FOR, MADE_FOR_NOW);
  console.log(`  ${tick} generated`);
  return true;
}

/**
 * A dependency with a native side is in the app only once CocoaPods has been told about it, and
 * a build says nothing about it either way: Metro puts the JavaScript in the bundle regardless,
 * so the app compiles, installs, opens, and aborts on the first import — naming the package, and
 * never the step nobody ran. That was the night of 11 September 2026: the keyboard controller
 * went in on one day and the haptics on the next, neither was ever linked, and the simulator
 * build said only "doesn't seem to be linked" the moment it opened. Two files answer it in a
 * millisecond, so they are read here, ahead of a build that takes a quarter of an hour to arrive
 * at the same crash.
 */
function checkPods() {
  if (!existsSync(PODFILE_LOCK))
    return report(
      "bad",
      "Pods",
      "this iOS project has never been linked",
      "pnpm phone pods",
      MENDS.pods,
    );
  const have = podsInLock();
  const missing = [...podsWanted()].filter(([pod]) => !have.has(pod));
  if (missing.length === 0) {
    // Listed is not installed: `Pods/` can be gone, or older than the lockfile, and the build then
    // stops at a Pods xcconfig only `pod install` writes (16 September 2026).
    const sandbox = podsSandbox(
      readFileSync(PODFILE_LOCK, "utf8"),
      existsSync(PODS_MANIFEST) ? readFileSync(PODS_MANIFEST, "utf8") : undefined,
    );
    if (sandbox === "missing" || sandbox === "stale")
      return report(
        "bad",
        "Pods",
        sandbox === "missing"
          ? "listed in Podfile.lock, but ios/Pods is not installed"
          : "ios/Pods was installed from a different Podfile.lock",
        "The build would stop at a missing Pods xcconfig. Install them:\n  pnpm phone pods",
        MENDS.pods,
      );
    return report("ok", "Pods", "every dependency with a native side is installed in the build");
  }
  const packages = [...new Set(missing.map(([, dep]) => dep))];
  report(
    "bad",
    "Pods",
    `${packages.join(", ")} ${packages.length === 1 ? "is" : "are"} in the app and not in the build`,
    "The app would install, open, and abort on the first import of them. Link them:\n  pnpm phone pods",
    MENDS.pods,
  );
}

/**
 * Xcode runs its script phases with the node `ios/.xcode.env.local` names, and React Native names
 * the one Homebrew keeps for that version alone, which the next `brew upgrade` deletes (`node.mjs`).
 */
function checkNode() {
  const found = existsSync(XCODE_ENV_LOCAL)
    ? nodeTrouble(readFileSync(XCODE_ENV_LOCAL, "utf8"), existsSync)
    : undefined;
  if (found === undefined) return report("ok", "Node for Xcode", "one an upgrade leaves in place");
  report(
    "bad",
    "Node for Xcode",
    found.trouble === "gone"
      ? `${found.path} is gone, so the build stops in a Pods script`
      : `${found.path} is gone at Homebrew's next node upgrade`,
    `Name ${STEADY_NODES[0]} in ios/.xcode.env.local instead: it follows every upgrade.`,
    MENDS.node,
  );
}

/** Name Homebrew's link to node in `ios/.xcode.env.local`, in place of one version's own. */
function steadyNode() {
  const steady = STEADY_NODES.find((path) => existsSync(path));
  if (steady === undefined) return false;
  writeFileSync(XCODE_ENV_LOCAL, withNode(readFileSync(XCODE_ENV_LOCAL, "utf8"), steady));
  return true;
}

/**
 * An installed build is not Expo Go: App Transport Security refuses cleartext to anything it
 * does not call local, and a connection to your own network needs a stated purpose.
 */
function checkNetworkKeys() {
  if (!existsSync(INFO_PLIST)) return report("warn", "Info.plist", "not generated yet");
  const plist = run("plutil", ["-p", INFO_PLIST]).out;
  const cleartext = /"NSAllowsArbitraryLoads"\s*=>\s*(1|true)/.test(plist);
  const purpose = /"NSLocalNetworkUsageDescription"/.test(plist);
  // The trap that cost an evening (10 September 2026): iOS *ignores* NSAllowsArbitraryLoads the
  // moment any of these companion keys sits beside it, so a cleartext server on the tailnet —
  // which is not an RFC1918 address NSAllowsLocalNetworking would cover — is refused after all,
  // and the app says only "requires the use of a secure connection".
  const ignoredBy = [
    "NSAllowsLocalNetworking",
    "NSAllowsArbitraryLoadsForMedia",
    "NSAllowsArbitraryLoadsInWebContent",
  ].find((key) => new RegExp(`"${key}"`).test(plist));
  if (cleartext && ignoredBy) {
    return report(
      "bad",
      "Network permissions",
      `${ignoredBy} sits beside NSAllowsArbitraryLoads, which iOS then ignores`,
      `Your server over cleartext is refused despite the arbitrary-loads key. Remove it:\n  plutil -remove NSAppTransportSecurity.${ignoredBy} ${INFO_PLIST}\nand take it out of apps/mobile/app.json under ios.infoPlist.NSAppTransportSecurity.`,
    );
  }
  if (cleartext && purpose)
    return report("ok", "Network permissions", "cleartext allowed, local network described");
  report(
    "bad",
    "Network permissions",
    `${cleartext ? "" : "cleartext HTTP blocked"}${!cleartext && !purpose ? "; " : ""}${purpose ? "" : "no local network purpose string"}`,
    "Both belong in apps/mobile/app.json under ios.infoPlist, and in the generated\nios/Chips/Info.plist. Without them the phone never reaches your server.",
  );
}

/**
 * The browser is served from a build on disk, and a stale one is invisible: the page works, and
 * quietly behaves like the day it was built. It cost an evening once — a bundle from before the
 * fix that addresses a pairing QR by the server drew every QR with `127.0.0.1` in it, which is
 * the one address a phone cannot use.
 *
 * The source is the app's and the three packages it is built from. Looking at `apps/web/src`
 * alone called a build current that had none of the day's changes to `@chipschat/ui` and
 * `@chipschat/core` (26 September 2026: a space's new colours, and the fix for its reset).
 */
const WEB_SOURCES = [
  "apps/web/src",
  "packages/ui/src",
  "packages/core/src",
  "packages/protocol/src",
];

function checkWebBuild() {
  const dist = `${REPO}apps/web/dist`;
  if (!existsSync(dist)) {
    return report(
      "bad",
      "Web build",
      "there is none, so the server serves nothing",
      "pnpm web:build",
      MENDS.web,
    );
  }
  const newest = (path) =>
    Number(
      run("sh", [
        "-c",
        `find ${path} -type f -newermt '1970-01-01' -print0 | xargs -0 stat -f %m | sort -nr | head -1`,
      ]).out.trim(),
    );
  const built = newest(dist);
  const source = Math.max(...WEB_SOURCES.map((path) => newest(`${REPO}${path}`)));
  if (Number.isFinite(built) && Number.isFinite(source) && source > built) {
    const days = Math.round((source - built) / 86_400);
    return report(
      "bad",
      "Web build",
      `older than the source it is built from by ${days} day${days === 1 ? "" : "s"}`,
      "The browser is running code from before your last change:\n  pnpm web:build",
      MENDS.web,
    );
  }
  report("ok", "Web build", "newer than its source");
}

/* -------------------------------------------------------------- the device */

/** Every real device Xcode can see, told from the simulators by having an OS version. */
function connectedDevices() {
  const listed = run("xcrun", ["xctrace", "list", "devices"]).out;
  const devices = [];
  for (const line of listed.split("\n")) {
    const match = /^(.+?) \(([\d.]+)\) \(([0-9A-Fa-f-]{8,})\)\s*$/.exec(line.trim());
    if (match && !/Simulator/.test(line))
      devices.push({ name: match[1], os: match[2], udid: match[3] });
  }
  return devices;
}

/**
 * CoreDevice knows a phone by another name, and that is the one `devicectl` installs with; it
 * also knows whether the phone can be reached now (`devices.mjs`).
 */
function coreDeviceRow(name) {
  return coreDeviceRowOf(coreDeviceList(), name);
}

function coreDeviceList() {
  return run("xcrun", ["devicectl", "list", "devices"]).out;
}

/** Developer Mode is off until someone turns it on, and the phone says so only here. */
function developerModeOn(identifier) {
  const details = run("xcrun", [
    "devicectl",
    "device",
    "info",
    "details",
    "--device",
    identifier,
  ]).out;
  return /developerModeStatus:\s*enabled/.test(details);
}

function findDevice(wanted) {
  const devices = connectedDevices();
  const chosen = deviceMeant(devices, wanted, coreDeviceList());
  if (!chosen) {
    report(
      "bad",
      "iPhone",
      devices.length === 0 ? "none connected" : "none matching that name",
      "Plug the phone in, unlock it, and tap Trust if it asks.",
    );
    return undefined;
  }
  const { identifier, state, reachable } = coreDeviceRow(chosen.name);
  if (!reachable) {
    report(
      "bad",
      "iPhone",
      `${chosen.name} is out of reach: away from this Mac's Wi-Fi, or asleep`,
      "Unlock it on the same Wi-Fi as this Mac, or plug it in.",
    );
    return undefined;
  }
  const address = identifier ?? chosen.udid;
  if (/no DDI/.test(state) && !developerModeOn(address)) {
    report(
      "bad",
      "iPhone",
      `${chosen.name} has Developer Mode off`,
      "On the phone: Settings, Privacy and Security, Developer Mode, on, then restart.",
    );
    return undefined;
  }
  report("ok", "iPhone", `${chosen.name}, iOS ${chosen.os}`);
  return { ...chosen, identifier: address };
}

/**
 * Which way `ship` goes, said first, since the two take such different times. The phone is the
 * one `findDevice` would choose, so a direct install checks the same phone it decided on.
 */
function shipWay(wanted) {
  const phone = deviceMeant(connectedDevices(), wanted, coreDeviceList());
  const row = phone === undefined ? { reachable: false } : coreDeviceRow(phone.name);
  const details =
    row.identifier !== undefined && row.reachable
      ? run("xcrun", ["devicectl", "device", "info", "details", "--device", row.identifier]).out
      : "";
  const way = shipRoute(row, details);
  console.log(
    way.direct
      ? `\n${phone.name} is ${way.via}: installing from this Mac, not through TestFlight.`
      : `\n${phone?.name ?? "No iPhone"} is out of this Mac's reach: sending it through TestFlight.`,
  );
  return way;
}

/**
 * The simulators that are running. A simulator needs no cable, no Developer Mode and no signing,
 * so all that is wanted of one is that it is booted: `simctl` speaks only to those.
 */
function simulators() {
  const listed = run("xcrun", ["simctl", "list", "devices", "booted", "-j"]);
  if (!listed.ok) return [];
  let byRuntime = {};
  try {
    byRuntime = JSON.parse(listed.out).devices ?? {};
  } catch {
    return [];
  }
  const devices = [];
  for (const [runtime, rows] of Object.entries(byRuntime)) {
    const os = /iOS-([\d-]+)/.exec(runtime)?.[1].replace(/-/g, ".") ?? "";
    for (const row of rows) devices.push({ name: row.name, os, udid: row.udid, simulator: true });
  }
  return devices;
}

/**
 * The newest iPhone this Mac already has a simulator for: newest iOS first, and within one iOS
 * the first device `simctl` lists, which is that year's flagship — the order is Pro, Pro Max, e,
 * Air, plain, and not oldest to newest. Nothing is downloaded: a runtime is a gigabyte and
 * somebody's decision, and this only starts a device that is already here.
 */
function bootableIPhone() {
  const listed = run("xcrun", ["simctl", "list", "devices", "available", "-j"]);
  let byRuntime = {};
  try {
    byRuntime = JSON.parse(listed.out).devices ?? {};
  } catch {
    return undefined;
  }
  const phones = [];
  for (const [runtime, rows] of Object.entries(byRuntime)) {
    const os = /iOS-([\d-]+)/.exec(runtime)?.[1].replace(/-/g, ".");
    if (os === undefined) continue;
    for (const row of rows) {
      if (row.name.startsWith("iPhone"))
        phones.push({ name: row.name, os, udid: row.udid, at: phones.length });
    }
  }
  phones.sort((a, b) => Number.parseFloat(b.os) - Number.parseFloat(a.os) || a.at - b.at);
  return phones[0];
}

/** Boot one and wait for it: `simctl boot` returns long before a device can take an install. */
function bootSimulator() {
  const phone = bootableIPhone();
  if (phone === undefined) {
    console.log(`  ${cross} this Mac has no iPhone simulator to boot`);
    return false;
  }
  console.log(`      ${phone.name}, iOS ${phone.os}`);
  if (!run("xcrun", ["simctl", "boot", phone.udid]).ok) return false;
  run("open", ["-a", "Simulator"]);
  return run("xcrun", ["simctl", "bootstatus", phone.udid, "-b"]).ok;
}

function findSimulator(wanted) {
  const devices = simulators();
  // A tool called `phone` means the phone when it is not told otherwise, and an iPad can be
  // booted beside one. Name it to get the iPad.
  const booted = devices.find((d) => d.name.startsWith("iPhone")) ?? devices[0];
  const chosen = wanted ? devices.find((d) => d.udid === wanted || d.name === wanted) : booted;
  if (!chosen) {
    const none = devices.length === 0;
    report(
      "bad",
      "Simulator",
      none ? "none booted" : "none matching that name",
      "Open Simulator, or boot one by name:\n  xcrun simctl boot 'iPhone 17 Pro'",
      // Only when there is none at all. A name that matches nothing is a typo or a device this
      // Mac does not have, and booting a different one answers a question nobody asked.
      none ? MENDS.sim : undefined,
    );
    return undefined;
  }
  report("ok", "Simulator", `${chosen.name}, iOS ${chosen.os}`);
  return chosen;
}

/** Whether Chips is on the phone at all, which decides between launching it and building it. */
function appInstalled(device) {
  if (device.simulator) {
    return run("xcrun", ["simctl", "get_app_container", device.udid, BUNDLE_ID]).ok;
  }
  const apps = run("xcrun", [
    "devicectl",
    "device",
    "info",
    "apps",
    "--device",
    device.identifier,
    "--bundle-id",
    BUNDLE_ID,
  ]);
  return apps.ok && apps.out.includes(BUNDLE_ID);
}

/* -------------------------------------------------------------- the server */

function addressesOfThisMac() {
  const found = [];
  for (const addresses of Object.values(networkInterfaces())) {
    for (const address of addresses ?? []) {
      if (address.family === "IPv4" && !address.internal) found.push(address.address);
    }
  }
  return found;
}

function listeners() {
  return run("lsof", ["-nP", `-iTCP:${PORT}`, "-sTCP:LISTEN"])
    .out.split("\n")
    .slice(1)
    .filter(Boolean)
    .map((line) => ({ pid: line.split(/\s+/)[1], bind: line.split(/\s+/).pop() }));
}

/** What the running server tells other devices it is at, read off its environment. */
function advertisedAddress() {
  const [only] = listeners();
  if (!only) return undefined;
  return /CHIPS_PUBLIC_URL=(\S+)/.exec(run("ps", ["eww", "-p", only.pid]).out)?.[1];
}

/**
 * Whether an address the server advertises is this Mac's: one of its own, or the name Tailscale
 * Serve gives it, which no address of it spells (HTTPS on the tailnet, proxied to this port; the
 * Tailscale page under Operate).
 */
function isThisMac(publicUrl, mine) {
  return (
    mine.some((address) => publicUrl.includes(address)) ||
    publicUrl.replace(/\/$/, "") === tailnetHttpsUrl()
  );
}

/** What this Mac may be advertised as: its addresses, and Serve's name when Serve is running. */
function namesOfThisMac(mine) {
  const served = tailnetHttpsUrl();
  return served ? [...mine, served] : mine;
}

/** Whether an address answers as a Chips server, for a name this Mac's addresses do not spell. */
async function answersAsChips(publicUrl) {
  try {
    const health = await fetch(`${publicUrl.replace(/\/$/, "")}/v1/health`, {
      signal: AbortSignal.timeout(5000),
    });
    return (await health.json()).name === "chipsd";
  } catch {
    return false;
  }
}

/**
 * Serve at a name the Mac no longer has. Renamed on the tailnet, the old name resolves nowhere, and
 * a server advertising it looks like this Mac's to every other test (14 September 2026).
 */
function servedAtAnOldName() {
  const renamed = staleServeName(
    tailnetHttpsUrl(),
    machineDnsName(tailscale(["status", "--json"])),
  );
  if (!renamed) return false;
  report(
    "bad",
    "tailnet name",
    `Serve answers at ${renamed.served}, but this Mac is ${renamed.current} on the tailnet now`,
    `That name no longer resolves, so a phone paired to it reaches nothing: photos draw blank and\nvoice notes say the server could not be found. Take the old name back, and every pairing works again:\n  tailscale set --hostname=${renamed.oldHost}\nOr serve the new name, then advertise it, restart the server and pair the phone again:\n  tailscale serve reset && tailscale serve --bg ${PORT}`,
  );
  return true;
}

/**
 * What the server tells phones it is at, asked of the address itself: false when a phone paired to
 * it would reach nothing.
 */
async function checkAdvertised(pid, publicUrl) {
  const mine = addressesOfThisMac();
  if (!publicUrl) {
    report(
      "warn",
      "chipsd",
      "no CHIPS_PUBLIC_URL, so the QR carries whichever network it guesses",
      `Its guess prefers a home address over a tailnet one. This Mac has: ${mine.join(", ")}`,
    );
  } else if (!(await answersAsChips(publicUrl))) {
    // Asked of every address, this Mac's too: one that looks like this Mac's and resolves nowhere
    // is a phone reaching nothing, whatever the names say.
    report(
      "bad",
      "chipsd",
      `advertises ${publicUrl}, which does not answer`,
      `A pairing that carries it sends the phone nowhere, and a phone paired to it reaches nothing.\nThis Mac has: ${namesOfThisMac(mine).join(", ")}`,
    );
    return false;
  } else if (isThisMac(publicUrl, mine)) {
    report("ok", "chipsd", `pid ${pid}, advertising ${publicUrl}`);
  } else {
    // Your own domain, through a proxy or a tunnel: no address of this Mac spells it, and its
    // health is the one thing to ask. It cannot say which Chips server answered.
    report("ok", "chipsd", `pid ${pid}, advertising ${publicUrl}, which answers as Chips`);
  }
  return true;
}

async function checkServer() {
  const found = listeners();

  if (found.length === 0) {
    report(
      "bad",
      "chipsd",
      `nothing is listening on ${PORT}`,
      "Start it as a launch agent, once, and it is there after every login:\n  pnpm phone server",
      // Only when the port is empty. A server that is running and wrong is somebody's, and
      // `installAgent` would stop it: whose it is, and whether it may go, is not this tool's call.
      MENDS.server,
    );
    return;
  }
  if (found.length > 1) {
    report(
      "bad",
      "chipsd",
      `${found.length} servers share port ${PORT}: ${found.map((l) => `${l.pid} on ${l.bind}`).join(", ")}`,
      "A loopback bind wins over a wildcard one, so your browser and your phone reach\ndifferent servers, with different pairing codes and one shared database.\nStop all but the one bound to *: kill <pid>",
    );
    return;
  }

  const [only] = found;
  const env = run("ps", ["eww", "-p", only.pid]).out;
  const publicUrl = /CHIPS_PUBLIC_URL=(\S+)/.exec(env)?.[1];
  const host = /CHIPS_HOST=(\S+)/.exec(env)?.[1];

  if (host !== "0.0.0.0") {
    report(
      "bad",
      "chipsd",
      `bound to ${host ?? "127.0.0.1"}, which no phone can reach`,
      "Restart it with CHIPS_HOST=0.0.0.0, which `pnpm phone server` does.",
    );
    return;
  }
  if (servedAtAnOldName()) return;

  if (!(await checkAdvertised(only.pid, publicUrl))) return;

  try {
    const health = await fetch(`http://127.0.0.1:${PORT}/v1/health`, {
      signal: AbortSignal.timeout(3000),
    });
    const body = await health.json();
    report("ok", "chipsd health", `${body.status}, relay ${body.relay?.status ?? "unknown"}`);
  } catch {
    report("bad", "chipsd health", "the port is open but nothing answered");
    return;
  }
  checkServerAge(only.pid);

  // The running server leaves a token beside its database, and that is what lets this machine
  // issue a pairing code whether or not its own device is still in the workspace (ADR 0048). A
  // server from before that has no token, and can only be asked by a device it still trusts.
  if (existsSync(OPERATOR_TOKEN)) {
    report("ok", "Pairing codes", "this machine can issue one: the server left its token");
  } else {
    report(
      "warn",
      "Pairing codes",
      "the running server left no operator token, so it predates this checkout",
      "It can still be asked by this machine's own device, if that is still in the workspace.\nA restart brings the token: pnpm phone server",
    );
  }
}

/**
 * chipsd is a long-lived process running the code it was started with, so a server changed since
 * then goes on serving the old behaviour — silently, and for as long as it stays up. On
 * 12 September 2026 a change went into the protocol, the server and both clients and reached
 * nothing at all, because the thing in the middle had been running since the night before and
 * nothing anywhere said so. Restarting it is not this tool's call: it is a daemon with sessions
 * on it, and whose it is decides when it goes. So this says it, and hands over the line.
 */
function checkServerAge(pid) {
  const started = Date.parse(run("ps", ["-p", pid, "-o", "lstart="]).out.trim());
  const changed =
    newestMtime(`${REPO}server/src ${REPO}packages/core/src ${REPO}packages/protocol/src`) * 1000;
  if (!Number.isFinite(started) || !Number.isFinite(changed) || changed <= started) return;
  const hours = Math.max(1, Math.round((changed - started) / 3_600_000));
  report(
    "warn",
    "chipsd age",
    `started ${hours} hour${hours === 1 ? "" : "s"} before your last change to the server`,
    "It serves the code it was started with, so that change is not in it yet. Yours to\nrestart, when the sessions on it can take it:\n  launchctl kickstart -k gui/$(id -u)/chat.chips.serve",
  );
}

/** True once the server answers on the port, within the wait. */
async function waitForHealth(seconds) {
  for (let attempt = 0; attempt < seconds; attempt += 1) {
    try {
      const health = await fetch(`http://127.0.0.1:${PORT}/v1/health`, {
        signal: AbortSignal.timeout(1000),
      });
      if (health.ok) return true;
    } catch {
      // Not up yet.
    }
    sleep(1000);
  }
  return false;
}

/* --------------------------------------------------------------- the parts */

function fixChain() {
  const target = `${tmpdir()}/AppleWWDRCAG3.cer`;
  console.log(`  downloading ${WWDR}`);
  const got = run("curl", ["-fsSL", "-o", target, WWDR]);
  if (!got.ok) {
    console.log(`  ${cross} could not download it: ${got.out.trim()}`);
    return false;
  }
  const subject = run("openssl", [
    "x509",
    "-inform",
    "DER",
    "-in",
    target,
    "-noout",
    "-subject",
  ]).out;
  if (!/Apple Worldwide Developer Relations/.test(subject)) {
    console.log(`  ${cross} that file is not Apple's intermediate; nothing imported`);
    return false;
  }
  const imported = run("security", [
    "import",
    target,
    "-k",
    `${process.env.HOME}/Library/Keychains/login.keychain-db`,
  ]);
  console.log(`  ${imported.ok ? tick : cross} ${imported.out.trim()}`);
  return imported.ok;
}

/**
 * `pod install`, with the one thing CocoaPods needs that a shell does not always hand it: it
 * normalises every path as Unicode and dies on an ASCII-8BIT locale, in a Ruby backtrace that
 * names `unicode_normalize` and never says the word locale. Run it after adding a dependency
 * with a native side. The build after it is a long one — every pod is new to the derived data.
 */
function installPods() {
  console.log("\nLinking the native dependencies. A minute or two.\n");
  const linked = run("pod", ["install"], {
    cwd: IOS,
    env: { ...process.env, LANG: "en_US.UTF-8", LC_ALL: "en_US.UTF-8" },
    maxBuffer: 64 * 1024 * 1024,
  });
  if (!linked.ok) {
    console.log(`  ${cross} pod install failed:`);
    console.log(`      ${linked.out.trim().split("\n").slice(-8).join("\n      ")}`);
    return false;
  }
  console.log(`  ${tick} linked`);
  console.log(
    "      The next build compiles every pod again: give it the first build's quarter hour.",
  );
  return true;
}

/**
 * The archive for TestFlight (`testflight.mjs`), sent to App Store Connect with the API key when
 * there is one, else as Xcode's account, and then the words for what is left, which only the
 * account holder can do. The build number is stamped into the generated Info.plist first, since
 * TestFlight takes each number once.
 */
function testflight(team) {
  const dir = `${IOS}/${TESTFLIGHT_DIR}`;
  const archive = `${dir}/Chips.xcarchive`;
  const options = `${dir}/ExportOptions.plist`;
  const key = storeKey().key;
  run("mkdir", ["-p", dir]);
  writeFileSync(options, exportOptions(team));
  const number =
    rest.includes("--export") && existsSync(archive)
      ? archivedNumber(archive)
      : archiveNew(archive, key);
  if (number === undefined) return false;
  const exported = run("xcodebuild", exportArgs(archive, options, dir, key), {
    cwd: IOS,
    maxBuffer: 64 * 1024 * 1024,
  });
  if (!exported.ok) {
    console.log(`  ${cross} the upload failed:`);
    for (const line of uploadFailure(exported.out)) console.log(`      ${line}`);
    return false;
  }
  console.log(`  ${tick} uploaded\n`);
  for (const line of uploadWords(number)) console.log(line);
  console.log("");
  return true;
}

/**
 * `ship` with the phone in reach: a build installed from this Mac, numbered from the clock as a
 * TestFlight one is, so the phone's copy is newer than every TestFlight build before it and older
 * than the next. It is not opened: the phone may be in somebody's hand, doing something else.
 */
function shipDirect(device) {
  const number = stampBuildNumber();
  if (number === undefined) return false;
  if (!build(device, { open: false })) {
    console.log(
      "      If the phone has left the Wi-Fi, `pnpm phone ship` again sends it through TestFlight.",
    );
    return false;
  }
  console.log(
    `\nBuild ${number} is on ${device.name}. It starts the next time the app is opened.\n`,
  );
  return true;
}

/** The build number an archive was made with, to export it again. */
function archivedNumber(archive) {
  const read = run("/usr/libexec/PlistBuddy", [
    "-c",
    "Print :ApplicationProperties:CFBundleVersion",
    `${archive}/Info.plist`,
  ]);
  const number = read.ok ? read.out.trim() : undefined;
  console.log(`\nSending build ${number ?? "?"} from the archive the last run made.\n`);
  return number;
}

/**
 * A new build number in the generated Info.plists: its number, or nothing. The push extension gets
 * the same number, or App Store Connect warns that it differs (ITMS-90473).
 */
function stampBuildNumber() {
  const number = buildNumber();
  for (const plist of [INFO_PLIST, SEAL_PLIST]) {
    const stamped = run("/usr/libexec/PlistBuddy", ["-c", `Set :CFBundleVersion ${number}`, plist]);
    if (!stamped.ok) {
      console.log(`  ${cross} could not set the build number: ${stamped.out.trim()}`);
      return undefined;
    }
  }
  return number;
}

/** A new build number, then the archive: its number, or nothing. */
function archiveNew(archive, key) {
  const number = stampBuildNumber();
  if (number === undefined) return undefined;
  console.log(`\nArchiving build ${number}. As long as a first build: a quarter of an hour.\n`);
  const archived = run("xcodebuild", archiveArgs(archive, key), {
    cwd: IOS,
    env: stampedEnv(REPO),
    maxBuffer: 64 * 1024 * 1024,
  });
  if (!archived.ok) {
    console.log(`  ${cross} the archive failed:`);
    for (const line of archived.out
      .split("\n")
      .filter((l) => /error:/.test(l))
      .slice(0, 5))
      console.log(`      ${line.trim()}`);
    return undefined;
  }
  console.log(`  ${tick} archived`);
  return number;
}

/**
 * The App Store Connect API key in `~/.appstoreconnect/chips.json` (`apiKeyFrom`), when its `.p8`
 * is there too; a config whose key file is missing is said, not passed over for Xcode's account.
 */
function storeKey() {
  const config = `${homedir()}/${API_KEY_CONFIG}`;
  if (!existsSync(config)) return {};
  const key = apiKeyFrom(readFileSync(config, "utf8"), homedir());
  if (key === undefined) return { problem: `${config} does not name a Key ID and an Issuer ID` };
  if (!existsSync(key.path)) return { problem: keyMissing(key) };
  return { key };
}

/** Whether Xcode can sign and send it to App Store Connect, said before the archive's quarter hour. */
function checkStoreSigning() {
  const { key, problem } = storeKey();
  if (key !== undefined) {
    report("ok", "App Store Connect", `the API key ${key.keyId}, to sign and upload with`);
    return;
  }
  if (problem !== undefined) {
    report("bad", "App Store Connect", problem, XCODE_ACCOUNT_FIX);
    return;
  }
  const accounts = run("defaults", [
    "read",
    "com.apple.dt.Xcode",
    "DVTDeveloperAccountManagerAppleIDLists",
  ]).out;
  if (signedInToXcode(accounts)) {
    report("ok", "App Store Connect", "an Apple ID in Xcode, to sign and upload as");
    return;
  }
  report(
    "bad",
    "App Store Connect",
    "no Apple ID in Xcode to sign and upload as",
    XCODE_ACCOUNT_FIX,
  );
}

function build(device, { open }) {
  console.log(
    `\nBuilding for ${device.name}. The first one takes a quarter of an hour; later ones do not.\n`,
  );
  const built = run(
    "xcodebuild",
    [
      "-workspace",
      "Chips.xcworkspace",
      "-scheme",
      "Chips",
      "-configuration",
      "Release",
      "-destination",
      device.simulator ? `platform=iOS Simulator,id=${device.udid}` : `id=${device.udid}`,
      "-derivedDataPath",
      "build",
      // A simulator build is not signed, so there is no profile to update and no device to
      // register; asking for either only invites Xcode to talk to Apple about nothing.
      ...(device.simulator
        ? []
        : ["-allowProvisioningUpdates", "-allowProvisioningDeviceRegistration"]),
      "COMPILER_INDEX_STORE_ENABLE=NO",
      "build",
    ],
    {
      cwd: IOS,
      env: stampedEnv(REPO),
      stdio: ["ignore", "pipe", "pipe"],
      maxBuffer: 64 * 1024 * 1024,
    },
  );

  if (!built.ok) {
    const errors = built.out
      .split("\n")
      .filter((l) => /error:/.test(l))
      .slice(0, 5);
    console.log(`  ${cross} the build failed:`);
    for (const line of errors) console.log(`      ${line.trim()}`);
    if (errors.length === 0)
      console.log(`      ${built.out.split("\n").slice(-8).join("\n      ")}`);
    return false;
  }
  console.log(`  ${tick} built`);

  const installed = device.simulator
    ? run("xcrun", ["simctl", "install", device.udid, SIM_APP])
    : run("xcrun", ["devicectl", "device", "install", "app", "--device", device.identifier, APP]);
  if (!installed.ok) {
    console.log(
      `  ${cross} install failed: ${installed.out.trim().split("\n").slice(-3).join(" ")}`,
    );
    return false;
  }
  console.log(`  ${tick} installed`);
  if (open) launch(device, undefined);
  return true;
}

/**
 * The app, opened on the phone — with a URL for it to open when there is one, which is how a
 * pairing code reaches it without anybody typing.
 */
function launch(device, url) {
  if (device.simulator) return launchInSimulator(device, url);
  const launched = run("xcrun", [
    "devicectl",
    "device",
    "process",
    "launch",
    "--device",
    device.identifier,
    // A URL is a launch option, and iOS hands launch options to a launch: an app that is already
    // running is only brought forward, and the code with it goes nowhere.
    ...(url === undefined ? [] : ["--terminate-existing", "--payload-url", url]),
    BUNDLE_ID,
  ]);
  if (launched.ok) {
    console.log(`  ${tick} ${url === undefined ? "launched" : "launched, with the code"}`);
    return true;
  }
  if (/not.*unlocked|Locked/.test(launched.out)) {
    console.log(`  ${warn} the phone is locked. Unlock it and run this again.`);
  } else {
    console.log(
      `  ${warn} it would not launch from here: ${launched.out.trim().split("\n").pop() ?? ""}`,
    );
  }
  return false;
}

/**
 * The same, in a simulator, where `simctl` does the two jobs `devicectl` does with one flag. An
 * app that is already up is stopped first for the same reason `--terminate-existing` is there for
 * a phone: a URL handed to a running app is a URL, not a launch, and the screen it is on stays.
 */
function launchInSimulator(device, url) {
  run("xcrun", ["simctl", "terminate", device.udid, BUNDLE_ID]);
  const opened =
    url === undefined
      ? run("xcrun", ["simctl", "launch", device.udid, BUNDLE_ID])
      : run("xcrun", ["simctl", "openurl", device.udid, url]);
  if (opened.ok) {
    console.log(`  ${tick} ${url === undefined ? "launched" : "launched, with the code"}`);
    return true;
  }
  console.log(
    `  ${warn} it would not open in the simulator: ${opened.out.trim().split("\n").pop() ?? ""}`,
  );
  return false;
}

/**
 * A pairing code from this machine. `chips pair --issue` asks with this machine's own device
 * when that is still in the workspace, and with the token the running server left beside its
 * database when it is not (ADR 0048), so there is nothing to restart and no log to read.
 */
function issueCode() {
  const issued = spawnSync("pnpm", ["chips", "pair", "--issue"], { cwd: REPO, encoding: "utf8" });
  const printed = `${issued.stdout ?? ""}`;
  const code = /^\s*code\s+([A-Z2-9]{3}-[A-Z2-9]{3})\s*$/m.exec(printed)?.[1];
  const server = /^\s*server\s+(https?:\/\/\S+)\s*$/m.exec(printed)?.[1];
  if (issued.status === 0 && code && server) return { code, server, printed };

  console.log(`  ${cross} could not get a pairing code: ${reasonIn(issued.stderr ?? "")}`);
  if (!existsSync(OPERATOR_TOKEN)) {
    console.log("      The running server left no operator token (it predates this checkout), and");
    console.log(
      "      this machine's own device cannot ask. A restart fixes both: pnpm phone server",
    );
  } else if (listeners().length === 0) {
    console.log("      Nothing is listening. Start the server: pnpm phone server");
  }
  return undefined;
}

/**
 * What a failed command actually said. An uncaught error's output is the message, a stack, and
 * Node's version banner last of all, and the banner is the one line that explains nothing.
 */
function reasonIn(stderr) {
  const said = /^\w*Error: (.+)$/m.exec(stderr)?.[1];
  if (said) return said;
  const lines = stderr
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "" && !/^at /.test(line) && !/^Node\.js v/.test(line));
  return lines.at(-1) ?? "no answer";
}

/**
 * The phones in this workspace, as id to when each was last seen. Reading the database is the
 * same claim the operator token makes — whoever can read this directory can read the workspace —
 * so it needs no credential and cannot be refused. Browsers, the desktop app and this machine's
 * own CLI are left out, so anything that moves in here is a phone.
 */
function phonesSeen() {
  const read = run("sqlite3", [
    "-readonly",
    WORKSPACE_DB,
    "select id, coalesce(last_seen_at, '') from devices where revoked_at is null" +
      " and name not like '%browser%' and name not like '%CLI%' and name != 'Chips for Mac';",
  ]);
  const seen = new Map();
  if (!read.ok) return seen;
  for (const line of read.out.split("\n")) {
    const [id, at = ""] = line.trim().split("|");
    if (id !== undefined && id !== "") seen.set(id, at);
  }
  return seen;
}

/**
 * Whether the app has reached the server since `was` was taken. A phone that is new to the
 * workspace has paired; one that was already in it and has been seen since opened with the key it
 * was already holding, which is what a reinstall leaves alone. The second is the ordinary case,
 * and waiting for a pairing it does not need is what used to make this sit here for three minutes.
 */
function phoneArrived(was) {
  for (const [id, at] of phonesSeen()) {
    // A row with no time has been written but never connected, which is a pairing that took and
    // an app that then could not use it. That is not in, so it is not what ends the wait.
    if (at === "") continue;
    if (!was.has(id)) return "paired";
    if (at > (was.get(id) ?? "")) return "returned";
  }
  return undefined;
}

/**
 * Whether a phone opened a socket since the launch, by the server's log, which names the device
 * behind every socket. The registry's last seen is written at most once a minute, so a new build
 * that connects within a minute of the old one and then locks never moves it: on 12 October 2026
 * the phone was back through the relay and this said it "did not reach the server". A socket is
 * the app using its key, which is what the registry's word stands for.
 */
function phoneOpened(was, since) {
  const phones = phonesSeen();
  const opened = devicesThatOpened(since).find((id) => phones.has(id));
  if (opened === undefined) return undefined;
  return was.has(opened) ? "returned" : "paired";
}

/**
 * What one second of waiting says. The server's log announcing a pairing is deliberately not a
 * success here: it says the code was accepted, not that the app can use what it was given, and
 * the two came apart on a simulator whose rebuilt bundle could not read the Keychain the old one
 * wrote. The registry is the one that knows, because a device is in it *and* has been seen; or a
 * phone's socket opening, which is the same thing said sooner (`phoneOpened`).
 */
function pairingTick(was, since) {
  if (/pairing refused/.test(since)) return "refused";
  return phoneArrived(was) ?? phoneOpened(was, since);
}

/**
 * The phone paired, with nobody touching it: the code goes to the app as the URL it is
 * launched with, the app pairs, and the server's log says so. A phone that was already paired
 * takes no code, so the device registry is watched as well, and the log for its socket opening —
 * it comes back with the key it holds, and that is the run finishing, not the run failing.
 */
function pairPhone(device, issued) {
  const link = `chips://pair?${new URLSearchParams({ pair: issued.code, v: "1", lan: issued.server })}`;
  const before = existsSync(SERVE_LOG) ? readFileSync(SERVE_LOG, "utf8").length : 0;
  const was = phonesSeen();
  if (!launch(device, link)) return false;

  if (!existsSync(SERVE_LOG)) {
    console.log("  (the server is not the launch agent, so its log cannot confirm the pairing;");
    console.log("   if the app shows the queue, it worked)");
    return true;
  }
  const it = device.simulator ? "simulator" : "phone";
  process.stdout.write(`  waiting for the ${it} to take the code `);
  for (let waited = 0; waited < PAIR_WAIT_SECONDS; waited += 1) {
    sleep(1000);
    process.stdout.write(".");
    const verdict = pairingTick(was, readFileSync(SERVE_LOG, "utf8").slice(before));
    if (verdict === "paired") {
      console.log(
        `\n  ${tick} paired: ${device.name} is in the workspace, and the app is on its queue`,
      );
      return true;
    }
    if (verdict === "returned") {
      console.log(`\n  ${tick} ${device.name} is in: already paired, opened with the key it holds`);
      return true;
    }
    if (verdict === "refused") {
      console.log(`\n  ${cross} the server refused the code. Run this again for a fresh one.`);
      return false;
    }
  }
  return sayHowToPairByHand(device, issued, before);
}

/**
 * The wait ran out. Either the code was taken and the app could not then use what it was given,
 * which has one cause and one cure, or the app never got as far as asking and is sitting on its
 * pairing screen with the code still good.
 */
function sayHowToPairByHand(device, issued, before) {
  const it = device.simulator ? "simulator" : "phone";
  console.log(`\n  ${warn} the ${it} did not reach the server in ${PAIR_WAIT_SECONDS} seconds.`);
  if (/device paired/.test(readFileSync(SERVE_LOG, "utf8").slice(before))) {
    console.log("      The code was taken, so the app has a device here and then could not open a");
    console.log("      connection with it — the key it kept is not one this build can read. A");
    console.log("      bundle rebuilt under another signing identity cannot see what the one");
    console.log("      before it wrote. Clearing the app and running this again settles it:");
    console.log(
      device.simulator
        ? `        xcrun simctl uninstall ${device.udid} ${BUNDLE_ID}`
        : "        delete Chips on the phone, then run this again",
    );
    return false;
  }
  console.log("      So the app is waiting on its pairing screen, and the code has to go in.");
  if (issued.printed === "") {
    console.log(
      `      Open Chips on the ${it}, tap Set up my own Chips, then Type a pairing code instead, and enter:`,
    );
    console.log(`        code     ${issued.code}`);
    console.log(`        server   ${issued.server}`);
    return false;
  }
  console.log("      Or open Chips on the phone and scan this from inside the app —");
  console.log("      the Camera app would open it in Safari, where nothing can be paired:");
  console.log(
    issued.printed
      .split("\n")
      .slice(-1 - qrHeight(issued.printed))
      .join("\n"),
  );
  return false;
}

/** How many lines of the printed code are the QR: everything from the first block character. */
function qrHeight(printed) {
  const lines = printed.split("\n");
  const first = lines.findIndex((line) => /[█▀▄]/.test(line));
  return first === -1 ? 0 : lines.length - first;
}

/**
 * Pair the phone, or say how to. With the phone plugged in and the app on it, the code goes
 * straight to the app; otherwise the code and its QR are printed for the app's own scanner.
 */
/** The newest file under a path, as a Unix time, or NaN when there is nothing to stat. */
function newestMtime(path) {
  return Number(
    run("sh", [
      "-c",
      `find ${path} -type f -print0 2>/dev/null | xargs -0 stat -f %m 2>/dev/null | sort -nr | head -1`,
    ]).out.trim(),
  );
}

/**
 * `connect` pairs the build that is on the phone; it does not rebuild. When the source has moved
 * on since that build, the phone is running old code and a pairing against it proves nothing new
 * — so say so, and name the command that ships the change. `pnpm phone` (build and install) does.
 */
function warnIfStaleBuild(device) {
  const app = appFor(device);
  if (!existsSync(app)) return;
  const built = newestMtime(app);
  const source = Math.max(newestMtime(`${MOBILE}/src`), newestMtime(`${MOBILE}/app`));
  if (Number.isFinite(built) && Number.isFinite(source) && source > built) {
    const mins = Math.max(1, Math.round((source - built) / 60));
    console.log(
      `  ${warn} the installed build is older than your changes by ${mins} min. \`connect\` only pairs;`,
    );
    console.log("      to put the new code on the phone, build and install it: pnpm phone");
  }
}

/**
 * No code to offer, and pairing was not what was asked for: the build is on the phone, so open it.
 * A phone that has paired before holds its key in the keychain, which a reinstall leaves alone, so
 * it reconnects with that — the usual run has nothing left to do. Only a phone that has never
 * paired needs a code, and that one this cannot finish.
 */
function withoutACode(device) {
  if (device === undefined || !appInstalled(device)) return false;
  console.log("      Opening it anyway: a phone that has paired before reconnects with the key it");
  console.log("      holds, which a reinstall leaves alone. Only a first pairing needs a code.");
  return launch(device, undefined);
}

function connect(device, given, { mustPair = true } = {}) {
  console.log(device?.simulator ? "\nPairing the simulator" : "\nPairing the phone");
  warnIfStaleBuild(device);
  const issued = given ?? issueCode();
  // `connect` was asked to pair, so no code is a failure. A build that is already on the phone is
  // not: it shipped, which is what was asked for, and the phone's own key carries the rest.
  if (!issued) return mustPair ? false : withoutACode(device);
  // Said first, so that if the phone does not take it by itself there is something to type
  // while the code is still good: Set up my own Chips, Type a pairing code instead, then these
  // two lines.
  console.log(`  ${tick} code     ${issued.code}`);
  console.log(`    server   ${issued.server}`);

  if (device === undefined) {
    console.log(`  ${warn} no phone is plugged in, so here is the code for the app's scanner:`);
    console.log(issued.printed);
    console.log(
      "  Scan it from inside Chips, not with the Camera app: the Camera opens it in Safari,",
    );
    console.log("  and a browser on a plain-HTTP address cannot pair.");
    return true;
  }
  if (!appInstalled(device)) {
    console.log(
      `  ${cross} Chips is not on ${device.name} yet. Put it there, which also pairs it:`,
    );
    console.log("      pnpm phone");
    return false;
  }
  return pairPhone(device, issued);
}

/** Tailscale, wherever it is: the app bundle's binary on a Mac, or one on the path. */
function tailscale(args) {
  const bundled = "/Applications/Tailscale.app/Contents/MacOS/Tailscale";
  const found = run(existsSync(bundled) ? bundled : "tailscale", args);
  return found.ok ? found.out : "";
}

/**
 * An HTTPS address for this machine, when tailscaled is terminating TLS in front of the server.
 *
 * This is the address to prefer over every other: a browser will not make a device key outside
 * a secure context, so the web app is unusable over plain HTTP anywhere but loopback, and an
 * installed phone app then needs no cleartext exception either.
 */
function tailnetHttpsUrl() {
  const serving = tailscale(["serve", "status"]);
  const proxied = new RegExp(`(https://[^\\s]+)[^\\n]*\\n?[^\\n]*127\\.0\\.0\\.1:${PORT}`);
  const match = proxied.exec(serving);
  return match?.[1]?.replace(/\/$/, "");
}

/**
 * The address to put in the QR, best first: what the person said, then TLS on the tailnet, then
 * the tailnet itself, then the home network. A tailnet address beats a home one because it is
 * the same address at home and on a train, which is the whole point of carrying the app.
 */
function phoneFacingAddress() {
  if (process.env.CHIPS_PUBLIC_URL) return process.env.CHIPS_PUBLIC_URL;
  const secure = tailnetHttpsUrl();
  if (secure) return secure;
  const mine = addressesOfThisMac();
  const tailnet = mine.find((a) => /^100\./.test(a));
  const home = mine.find((a) => /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(a));
  return `http://${tailnet ?? home ?? "127.0.0.1"}:${PORT}`;
}

/**
 * The server as a launch agent: started at login, restarted when it stops, and no longer a
 * child of whichever terminal happened to start it. This is what makes the phone work tomorrow
 * as well as today.
 */
async function installAgent() {
  const template = `${REPO}packaging/launchd/chat.chips.serve.plist`;
  const target = `${process.env.HOME}/Library/LaunchAgents/chat.chips.serve.plist`;
  const address = phoneFacingAddress();
  const pnpm = run("sh", ["-c", "command -v pnpm"]).out.trim();
  const node = run("sh", ["-c", "dirname $(command -v node)"]).out.trim();

  let plist = readFileSync(template, "utf8")
    .replaceAll("CHIPS_CHECKOUT", REPO.replace(/\/$/, ""))
    .replaceAll("CHIPS_PNPM", pnpm)
    .replaceAll("CHIPS_NODE_DIR", node)
    .replaceAll("CHIPS_HOME", process.env.HOME);
  // The address a phone dials. Nothing here needs dev mode: the server leaves its operator
  // token beside the database, and that is what issues a code from this machine.
  plist = plist.replace(
    "<key>CHIPS_LOG_PRETTY</key>",
    `<key>CHIPS_PUBLIC_URL</key>\n    <string>${address}</string>\n    <key>CHIPS_LOG_PRETTY</key>`,
  );
  writeFileSync(target, plist);

  const uid = run("id", ["-u"]).out.trim();
  const label = `gui/${uid}/chat.chips.serve`;

  // launchd holds the plist it was given, so a changed one means out and in again rather than
  // a restart. Bootout is not instant, and bootstrapping a label that is still there fails with
  // "Input/output error", which says nothing about what is wrong.
  if (run("launchctl", ["print", label]).ok) {
    run("launchctl", ["bootout", label]);
    for (let attempt = 0; attempt < 20 && run("launchctl", ["print", label]).ok; attempt += 1) {
      sleep(500);
    }
  }
  // Anything still holding the port is not the agent's, and the agent cannot bind over it.
  for (const { pid } of listeners()) {
    console.log(`  stopping chipsd ${pid}, which the agent replaces`);
    run("kill", [pid]);
  }

  let loaded = run("launchctl", ["bootstrap", `gui/${uid}`, target]);
  for (let attempt = 0; attempt < 3 && !loaded.ok; attempt += 1) {
    sleep(1000);
    loaded = run("launchctl", ["bootstrap", `gui/${uid}`, target]);
  }
  console.log(
    `  ${loaded.ok ? tick : cross} launch agent ${loaded.ok ? "loaded" : loaded.out.trim()}`,
  );
  if (!loaded.ok) return false;
  console.log(`      serving on ${address}, restarted when it stops, started at login`);
  console.log(`      log: ${SERVE_LOG}`);

  process.stdout.write("  waiting for it to answer ");
  const up = await waitForHealth(60);
  console.log(up ? ` ${tick}` : ` ${cross}`);
  if (!up) {
    console.log(`  ${cross} it did not come up in a minute. Its log is ${SERVE_LOG}`);
    return false;
  }
  return true;
}

/* ------------------------------------------------------------------ the run */

const [, , command = "all", ...rest] = process.argv;
const option = (name) => {
  const at = rest.indexOf(name);
  return at === -1 ? undefined : rest[at + 1];
};
const givenCode = option("--code");
const wantedDevice = rest.find(
  (a, i) => !a.startsWith("-") && rest[i - 1] !== "--code" && rest[i - 1] !== "--server",
);

if (command === "pods") {
  process.exit(installPods() ? 0 : 1);
}

if (command === "fix-chain") {
  process.exit(fixChain() ? 0 : 1);
}

if (command === "server") {
  console.log("\nThe server, permanently");
  if (!(await installAgent())) process.exit(1);
  // The server it just started is ready to pair with. A phone Xcode can reach now gets paired;
  // otherwise the code is printed for the app's scanner.
  const phone = deviceMeant(connectedDevices(), undefined, coreDeviceList());
  const row = phone === undefined ? undefined : coreDeviceRow(phone.name);
  const device =
    phone !== undefined && row?.reachable
      ? { ...phone, identifier: row.identifier ?? phone.udid }
      : undefined;
  process.exit(connect(device, undefined, { mustPair: false }) ? 0 : 1);
}

// A simulator is the same app without the parts that need Apple: nothing is signed, so the
// certificate, the team and the push entitlement the team decides are not in its way, and there
// is no cable and no Developer Mode to check either. Everything about the project still counts.
const onSimulator = command === "sim";
const shipping = command === "ship" ? shipWay(wantedDevice) : undefined;
const forTestFlight = command === "testflight" || shipping?.direct === false;

/**
 * Everything that has to be true before a build, in one pass. It is a pass rather than a script
 * because it is run twice when the first pass found something this tool can mend: the second is
 * both the repair's proof and where the signing identity and the device come from, each of which
 * a mend can change.
 */
async function preflight() {
  findings.length = 0;
  console.log("\nThe Mac");
  checkXcode();
  const signing = onSimulator ? "unsigned" : checkSigning();
  const team = onSimulator ? undefined : checkTeam();
  if (team !== undefined) reconcileFreeTeam(team.free);
  if (forTestFlight) checkStoreSigning();
  if (forTestFlight && team?.free !== false) {
    report(
      "bad",
      "A paid team",
      "TestFlight takes a build signed by the Apple Developer Program",
      "Enrol the Apple ID at developer.apple.com, then build once with `pnpm phone` so Xcode knows.",
    );
  }

  console.log("\nThe project");
  checkBabelPreset();
  checkNativeProject();
  checkPods();
  checkNode();
  checkNetworkKeys();
  checkWebBuild();
  // An archive is for any iPhone, and talks to no server here.
  if (forTestFlight) return { identity: signing, device: undefined, team: team?.id };

  console.log(onSimulator ? "\nThe simulator" : "\nThe phone");
  const found = onSimulator ? findSimulator(wantedDevice) : findDevice(wantedDevice);

  console.log("\nThe server");
  await checkServer();
  return { identity: signing, device: found };
}

/** What this tool can put right, it puts right, in the order the checks found it. */
async function mendAll() {
  console.log("\nPutting these right");
  for (const finding of broken()) {
    if (finding.mend === undefined) continue;
    console.log(`  ${finding.mend.says}`);
    if (!(await finding.mend.run())) console.log(`  ${cross} that did not work`);
  }
  console.log("\nChecking again");
}

let { identity, device, team } = await preflight();
// `doctor` is the one that only looks. Everything else mends what it can and carries on, so the
// answer to "the browser app is older than its source" is a browser app, not a command to type.
// One mend can uncover the next: a project made again has its pods to link. Three rounds at most,
// so a mend that keeps failing stops with what it said.
for (
  let round = 0;
  round < 3 && command !== "doctor" && broken().some((f) => f.mend !== undefined);
  round++
) {
  await mendAll();
  ({ identity, device, team } = await preflight());
}

// A code somebody already has needs no phone here and no server to ask, only a place to send it.
const given =
  givenCode === undefined
    ? undefined
    : {
        code: givenCode.toUpperCase(),
        server: option("--server") ?? advertisedAddress() ?? phoneFacingAddress(),
        printed: "",
      };

const stop = broken().filter(
  (f) => !(command === "connect" && /^(iPhone|Simulator)$/.test(f.what)),
);
if (stop.length > 0) {
  const mine = stop.filter((f) => f.mend !== undefined).length;
  console.log(
    `\n${stop.length} thing${stop.length === 1 ? "" : "s"} to fix first. Each is above, with what to do about it.`,
  );
  // On `doctor` nothing was mended, so say which of them would not have needed saying at all.
  if (mine > 0 && command === "doctor") {
    console.log(`${mine} of them \`pnpm phone\` puts right itself.`);
  }
  console.log("");
  process.exit(1);
}

if (command === "doctor") {
  console.log("\nAll clear. `pnpm phone` builds it, installs it and pairs it.");
  console.log("`pnpm phone sim` does the same in a booted simulator.\n");
  process.exit(0);
}

if (command === "connect") {
  process.exit(connect(device, given) ? 0 : 1);
}

if (forTestFlight) {
  process.exit(identity && team !== undefined && testflight(team) ? 0 : 1);
}

if (!identity || !device) process.exit(1);
if (shipping !== undefined) process.exit(shipDirect(device) ? 0 : 1);
if (!build(device, { open: command === "build" })) process.exit(1);
if (command === "all" || onSimulator)
  process.exit(connect(device, given, { mustPair: false }) ? 0 : 1);
console.log("");
