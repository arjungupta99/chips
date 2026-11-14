/**
 * A harness kept running (setup audit HS-15): a launch agent on a Mac, a systemd user unit on
 * Linux, that runs the bridge again at login and whenever it stops, so closing the terminal it
 * joined from, or restarting the machine, doesn't take it offline in Chips. The CLI keeps
 * `chips serve` running the same way (`cli/src/service.ts`); this is that, for a harness on the
 * SDK, which cannot depend on the CLI.
 *
 * A bridge writes it once it has joined, so the service carries the server's address (`CHIPS_URL`)
 * and finds the key `join()` kept, and needs no link. Each file says it was written here; one
 * without those words is somebody's own, a launch agent written by hand, and is left exactly as
 * it is and said, since its label is the same and a second copy would answer everything twice.
 *
 * A bridge kept on the Node that Chips for Mac carries names the app in its launch agent, so macOS's
 * background-item notice and Login Items say Chips rather than Node (ADR 0218's addendum).
 *
 * What the files say is worked out purely; `keepRunning` and `stopKeeping` write them and run the
 * service manager's commands.
 */

import { execFileSync } from "node:child_process";
import {
  accessSync,
  chmodSync,
  constants,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import type { Environment } from "./keep.js";
import { reportStep } from "./steps.js";

const MARK = "Written by a Chips harness's keep";

export type ServiceKind = "launchd" | "systemd";

/** What to keep running, and how. */
export interface KeepSpec {
  /** Its label, `chat.chips.<name>`: `chat.chips.hermes`, `chat.chips.acp.codex`. */
  readonly label: string;
  /** The program and its words: `[process.execPath, "--import", "tsx", "src/main.ts"]`. */
  readonly command: readonly [string, ...string[]];
  /** Where it runs from: the bridge's own folder. */
  readonly folder: string;
  /** Its environment: the server it joined, a PATH that finds its agent (`keepEnvironment`). */
  readonly environment: Readonly<Record<string, string>>;
  /** What it says goes here; by default `~/Library/Logs/chips-<name>.log`, or under `~/.local/state/chips`. */
  readonly logFile?: string | undefined;
}

/** Where the machine keeps things, and which machine it is. */
export interface Machine {
  readonly platform: string;
  readonly home: string;
  readonly env: Environment;
}

/** The service's file, worked out: which manager, where it goes, and what it says. */
export interface ServiceFile {
  readonly kind: ServiceKind;
  readonly path: string;
  readonly contents: string;
  readonly logFile: string;
}

/** A command, as its words. */
export type Command = readonly [string, ...string[]];

/** What became of a keep, or a stop. */
export interface Kept {
  /**
   * `kept` running; `theirs`, a file of somebody's own was there and left; `unsupported`, no
   * manager here; `off`, `CHIPS_KEEP=off` said not to (a test running a card's line as written);
   * `failed`, the manager wouldn't start it, which `why` says and the person was told.
   */
  readonly state: "kept" | "theirs" | "unsupported" | "off" | "failed";
  readonly path?: string | undefined;
  readonly logFile?: string | undefined;
  readonly why?: string | undefined;
}

export function serviceKind(platform: string): ServiceKind | undefined {
  if (platform === "darwin") return "launchd";
  if (platform === "linux") return "systemd";
  return undefined;
}

const machineOf = (given: Partial<Machine> = {}): Machine => ({
  platform: given.platform ?? process.platform,
  home: given.home ?? homedir(),
  // biome-ignore lint/style/noProcessEnv: the environment is where the machine says where things go.
  env: given.env ?? process.env,
});

/** `chat.chips.acp.codex` → `chips-acp-codex`: the name its log is kept under. */
const logName = (label: string) =>
  `${label.replace(/^chat\.chips\./, "chips-").replace(/\./g, "-")}.log`;

/** The service's file for `spec` on `machine`, or nothing where there is no service manager. */
export function serviceFile(spec: KeepSpec, given: Partial<Machine> = {}): ServiceFile | undefined {
  const machine = machineOf(given);
  const kind = serviceKind(machine.platform);
  if (kind === undefined) return undefined;
  if (kind === "launchd") {
    const logFile = spec.logFile ?? join(machine.home, "Library", "Logs", logName(spec.label));
    const path = join(machine.home, "Library", "LaunchAgents", `${spec.label}.plist`);
    return {
      kind,
      path,
      logFile,
      contents: launchdPlist(spec, logFile, appHolding(spec.command[0])),
    };
  }
  const xdg = (name: string, fallback: string) => {
    const set = machine.env[name];
    return set !== undefined && set !== "" ? set : join(machine.home, fallback);
  };
  const logFile =
    spec.logFile ?? join(xdg("XDG_STATE_HOME", ".local/state"), "chips", logName(spec.label));
  const path = join(xdg("XDG_CONFIG_HOME", ".config"), "systemd", "user", `${spec.label}.service`);
  return { kind, path, logFile, contents: systemdUnit(spec, logFile) };
}

const xml = (text: string): string =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * The Mac app whose bundle holds `program`, by its bundle identifier: the Node Chips for Mac
 * carries, `Chips.app/Contents/Resources/chips/runtime/node`, is `chat.chips.desktop`'s. Nothing
 * for a program outside an app, or an app whose `Info.plist` doesn't say. macOS names a launch
 * agent after the app it names only when the program is signed by that app's team, which
 * `pnpm desktop` does for the Node it carries.
 */
export function appHolding(
  program: string,
  read: (path: string) => string = (path) => readFileSync(path, "utf8"),
): string | undefined {
  const app = /^(.+?\.app)\/Contents\//.exec(program)?.[1];
  if (app === undefined) return undefined;
  try {
    const info = read(join(app, "Contents", "Info.plist"));
    return /<key>CFBundleIdentifier<\/key>\s*<string>([^<]+)<\/string>/.exec(info)?.[1];
  } catch {
    return undefined;
  }
}

/** `AssociatedBundleIdentifiers`, naming the app the agent is credited to, when there is one. */
const associatedApp = (app: string | undefined): string =>
  app === undefined
    ? ""
    : `  <key>AssociatedBundleIdentifiers</key>\n  <array>\n    <string>${xml(app)}</string>\n  </array>\n`;

/**
 * The launch agent: run from login, run again whenever it stops; credited to `app`, by its bundle
 * identifier, where its program is inside one.
 */
export function launchdPlist(spec: KeepSpec, logFile: string, app?: string): string {
  const args = spec.command.map((word) => `    <string>${xml(word)}</string>`).join("\n");
  const env = Object.entries(spec.environment)
    .map(([key, value]) => `    <key>${xml(key)}</key>\n    <string>${xml(value)}</string>`)
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<!-- ${MARK}. Its bridge's \`npm run keep -- --stop\` stops it and removes this file. -->
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${xml(spec.label)}</string>
${associatedApp(app)}  <key>ProgramArguments</key>
  <array>
${args}
  </array>
  <key>WorkingDirectory</key>
  <string>${xml(spec.folder)}</string>
  <key>EnvironmentVariables</key>
  <dict>
${env}
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${xml(logFile)}</string>
  <key>StandardErrorPath</key>
  <string>${xml(logFile)}</string>
</dict>
</plist>
`;
}

/**
 * The systemd user unit: run from login, run again whenever it stops. Each setting is written as
 * systemd reads that one. A command's words and an environment's assignments go in quotes. A
 * folder and a log are the rest of their line and take no quotes: systemd reads a quoted folder
 * as a path that isn't absolute and refuses the unit whole, which is how every keep on Linux
 * failed while this wrote one in quotes. A `%` is doubled everywhere, since one alone names
 * something of systemd's own, and a `$` in the command too, since one alone there is a variable.
 */
export function systemdUnit(spec: KeepSpec, logFile: string): string {
  const literal = (value: string) => value.replace(/%/g, "%%");
  const quote = (value: string) =>
    `"${literal(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  const word = (value: string) => quote(value.replace(/\$/g, "$$$$"));
  const env = Object.entries(spec.environment)
    .map(([key, value]) => `Environment=${quote(`${key}=${value}`)}`)
    .join("\n");
  return `# ${MARK}. Its bridge's \`npm run keep -- --stop\` stops it and removes this file.
[Unit]
Description=${spec.label}
After=network-online.target

[Service]
ExecStart=${spec.command.map(word).join(" ")}
WorkingDirectory=${literal(spec.folder)}
${env}
Restart=always
RestartSec=5
StandardOutput=append:${literal(logFile)}
StandardError=append:${literal(logFile)}

[Install]
WantedBy=default.target
`;
}

/** Run it now: load the agent (afresh, when it is loaded), or enable the unit and start it again. */
export function startCommands(
  kind: ServiceKind,
  label: string,
  path: string,
  uid: number,
): readonly Command[] {
  if (kind === "launchd") {
    return [
      ["launchctl", "enable", `gui/${uid}/${label}`],
      ["launchctl", "bootout", `gui/${uid}/${label}`],
      ["launchctl", "bootstrap", `gui/${uid}`, path],
    ];
  }
  return [
    ["systemctl", "--user", "daemon-reload"],
    ["systemctl", "--user", "enable", `${label}.service`],
    ["systemctl", "--user", "restart", `${label}.service`],
  ];
}

/** Stop it, and keep it from starting at the next login. */
export function stopCommands(kind: ServiceKind, label: string, uid: number): readonly Command[] {
  if (kind === "launchd") return [["launchctl", "bootout", `gui/${uid}/${label}`]];
  return [["systemctl", "--user", "disable", "--now", `${label}.service`]];
}

/** Unloading an agent that isn't loaded is how a first start begins, and how a second stop ends. */
const mayFail = (command: Command) => command[0] === "launchctl" && command[1] === "bootout";

/**
 * What `chips connect` hands a bridge for this run alone (ADR 0218): the link, which is spent once
 * taken up; the Node to keep it on and the line that stops it, which keep has used by the time it
 * writes the service; and the steps it reports, which only that `chips connect` reads.
 */
const HANDED_OVER: ReadonlySet<string> = new Set([
  "CHIPS_JOIN_LINK",
  "CHIPS_NODE",
  "CHIPS_STOP_COMMAND",
  "CHIPS_STEPS",
]);

/**
 * What a kept bridge needs from the shell it was joined from: the server's address, so `join()`
 * finds the key it kept; the PATH, so its agent's command is found; Chips's own settings (never
 * what was handed over for the run alone, the spent link among them); and the names a bridge asks
 * for, where they are set. Given the `node` it is kept on, that node's folder comes first on the
 * PATH: an agent run as `#!/usr/bin/env node` (an ACP adapter) finds it on a machine with no Node
 * of its own.
 */
export function keepEnvironment(
  url: string,
  // biome-ignore lint/style/noProcessEnv: the shell it joined from is what it takes with it.
  env: Environment = process.env,
  names: readonly string[] = [],
  node?: string,
): Record<string, string> {
  const kept: Record<string, string> = { CHIPS_URL: url };
  for (const [name, value] of Object.entries(env)) {
    if (value === undefined || value === "") continue;
    if (
      name === "PATH" ||
      names.includes(name) ||
      (name.startsWith("CHIPS_") && !HANDED_OVER.has(name))
    )
      kept[name] = value;
  }
  kept["CHIPS_URL"] = url;
  if (node !== undefined) kept["PATH"] = nodeFirst(dirname(node), kept["PATH"]);
  return kept;
}

/** `folder` first on a PATH, and nowhere else on it. */
function nodeFirst(folder: string, path: string | undefined): string {
  const rest = (path ?? "").split(delimiter).filter((each) => each !== "" && each !== folder);
  return [folder, ...rest].join(delimiter);
}

/**
 * Whether this process is the copy its machine keeps running under `label`, started by launchd or
 * systemd from the file `keepRunning` wrote, and not one a person ran by hand. launchd tells what
 * it starts the job's name (`XPC_SERVICE_NAME`). systemd says which process it started
 * (`SYSTEMD_EXEC_PID`, from systemd 248); before that it says only that a unit started this or
 * something above it (`INVOCATION_ID`), which a shell opened from a unit hands on, so there it
 * counts only with no terminal to write to. A harness asks this to wait for its server when it
 * starts (`connect({ waitForServer })`), where a person who runs it by hand hears at once.
 */
export function runsKept(
  label: string,
  given: {
    readonly env?: Environment;
    readonly pid?: number;
    readonly terminal?: boolean;
  } = {},
): boolean {
  // biome-ignore lint/style/noProcessEnv: what started this process is said in its environment.
  const env = given.env ?? process.env;
  if (env["XPC_SERVICE_NAME"] === label) return true;
  const started = env["SYSTEMD_EXEC_PID"] ?? "";
  if (started !== "") return started === String(given.pid ?? process.pid);
  const terminal = given.terminal ?? process.stdout.isTTY === true;
  return (env["INVOCATION_ID"] ?? "") !== "" && !terminal;
}

/**
 * The node a kept bridge runs on: the one `chips connect` hands over (`CHIPS_NODE`), named by a
 * path an upgrade of Chips keeps (`~/.local/lib/chips/current/runtime/node`, or inside Chips.app);
 * else the first on the PATH, as `npm start` runs it (`nodeOnPath`).
 */
export function keptNode(
  // biome-ignore lint/style/noProcessEnv: `chips connect` hands its Node over in the environment.
  env: Environment = process.env,
): string {
  const given = env["CHIPS_NODE"];
  return given !== undefined && given !== "" ? given : nodeOnPath(env);
}

/**
 * The node a kept bridge runs on: the first on the PATH, as `npm start` runs it, which is the link
 * a package manager keeps (Homebrew's `/opt/homebrew/bin/node`); `process.execPath` is the
 * version's own folder, which the next upgrade removes, and the service with it. This process's
 * own where none is on the PATH.
 */
export function nodeOnPath(
  // biome-ignore lint/style/noProcessEnv: the shell it joined from is what it takes with it.
  env: Environment = process.env,
): string {
  for (const folder of (env["PATH"] ?? "").split(delimiter)) {
    if (folder === "") continue;
    try {
      accessSync(join(folder, "node"), constants.X_OK);
      return join(folder, "node");
    } catch {
      // Not here.
    }
  }
  return process.execPath;
}

interface Running {
  readonly machine?: Partial<Machine> | undefined;
  /** Runs a command, throwing when it fails, and answers its output; the machine's own by default. */
  readonly run?: ((command: Command) => unknown) | undefined;
  readonly uid?: number | undefined;
  /** How long to wait between tries to load it again while launchd lets the old copy go (250 ms). */
  readonly retryMs?: number | undefined;
  /** Where a word for the person who kept it goes: standard error by default. */
  readonly say?: ((line: string) => void) | undefined;
}

/** Wait here: the service's file and commands are all synchronous, and a bridge does nothing meanwhile. */
const pause = (ms: number) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

/** Tries at loading the launch agent: `bootout` returns before a running bridge has gone. */
const LOAD_TRIES = 40;

const runOf = (options: Running) =>
  options.run ??
  ((command: Command) =>
    execFileSync(command[0], command.slice(1), {
      encoding: "utf8",
      // What it printed on failing is what says why: no session, no bus.
      stdio: ["ignore", "pipe", "pipe"],
    }));

/** A command of the service manager's that failed, and what it printed. */
class Refused extends Error {
  constructor(
    readonly command: Command,
    readonly printed: string,
  ) {
    super(`${command.join(" ")} failed`);
  }
}

/** What a failed command printed: its standard error and output, as `execFileSync` hands them. */
function printedBy(error: unknown): string {
  if (typeof error !== "object" || error === null) return String(error);
  const { stderr, stdout, message } = error as {
    stderr?: unknown;
    stdout?: unknown;
    message?: unknown;
  };
  const said = [stderr, stdout]
    .map((each) => (typeof each === "string" ? each.trim() : ""))
    .join("\n")
    .trim();
  return said !== "" ? said : typeof message === "string" ? message : "";
}

/**
 * Why the service manager wouldn't keep it, in words a person can act on. Over SSH to a Mac nobody
 * is logged in to at its screen launchd has no session to start one in, and without a systemd user
 * session (WSL, `su`, most containers) systemctl finds no bus; both say only that (the onboarding
 * audit, Part 2, items 9 and 12). `chips up` says the same of its own service.
 */
export function refusedWords(command: Command, printed: string): string {
  const first = printed.split("\n")[0]?.trim() ?? "";
  if (
    command[0] === "launchctl" &&
    /Bootstrap failed: (5|125)|Domain does not support|Could not find domain/.test(printed)
  ) {
    return "Nobody is logged in to this Mac at its screen, so it can't be kept running from here";
  }
  if (
    command[0] === "systemctl" &&
    /Failed to connect to (user scope )?bus|DBUS_SESSION_BUS_ADDRESS|not been booted with systemd/.test(
      printed,
    )
  ) {
    return "This shell has no systemd user session, so it can't be kept running from here";
  }
  return `It couldn't be kept running: \`${command.join(" ")}\` failed${first === "" ? "" : ` (${first})`}`;
}

const ours = (path: string) => !existsSync(path) || readFileSync(path, "utf8").includes(MARK);

/** One command run, tried again while launchd lets a stopped copy go, and let fail where that's fine. */
function runOne(command: Command, run: (command: Command) => unknown, retryMs: number): void {
  // `launchctl bootout` returns while the copy it stops is still going, and loading again before
  // it has gone fails (status 5): try again, for about ten seconds.
  const tries = command[0] === "launchctl" && command[1] === "bootstrap" ? LOAD_TRIES : 1;
  for (let tried = 1; ; tried += 1) {
    try {
      run(command);
      return;
    } catch (error) {
      if (mayFail(command)) return;
      if (tried >= tries) throw new Refused(command, printedBy(error));
      pause(retryMs);
    }
  }
}

/** The commands, in order, on the machine's own manager unless `options.run` says otherwise. */
function runAll(commands: readonly Command[], options: Running): void {
  const run = runOf(options);
  for (const command of commands) runOne(command, run, options.retryMs ?? 250);
}

const uidOf = (options: Running) => options.uid ?? process.getuid?.() ?? 0;

/**
 * On Linux, a user's units run only while they are logged in, unless systemd keeps that user's
 * manager running from boot ("lingering"), which `chips up` turns on for the server
 * (`cli/src/service.ts`); this is that, for a harness on a machine that only runs one. Asked first,
 * because turning it on over SSH is refused even when it is on; then turned on, which a local
 * session may do without a password. False when it is off and stays off.
 */
function lingers(options: Running): boolean {
  const run = runOf(options);
  const uid = String(uidOf(options));
  try {
    const on = run(["loginctl", "show-user", uid, "--property=Linger", "--value"]);
    if (typeof on === "string" && on.trim() === "yes") return true;
  } catch {
    // Not answered: turning it on may work all the same.
  }
  try {
    run(["loginctl", "enable-linger", uid]);
    return true;
  } catch {
    return false;
  }
}

/** Where keep's word to the person goes: standard error, beside the bridge's own. */
const sayOf = (options: Running) =>
  options.say ?? ((line: string) => void process.stderr.write(`${line}\n`));

/**
 * Write the service and run it, replacing one written here before. A file of somebody's own at
 * that place is left as it is: `theirs`.
 */
export function keepRunning(spec: KeepSpec, options: Running = {}): Kept {
  // A test runs a card's line as a person does, and must never leave a real service behind.
  if (machineOf(options.machine).env["CHIPS_KEEP"] === "off") return { state: "off" };
  const file = serviceFile(spec, options.machine);
  if (file === undefined) return { state: "unsupported" };
  if (!ours(file.path)) return { state: "theirs", path: file.path, logFile: file.logFile };
  reportStep("keeping", { label: spec.label }, machineOf(options.machine).env);
  mkdirSync(dirname(file.path), { recursive: true });
  mkdirSync(dirname(file.logFile), { recursive: true });
  // Read by its user only: a bridge may carry a password its harness needs.
  writeFileSync(file.path, file.contents, { mode: 0o600 });
  chmodSync(file.path, 0o600);
  try {
    runAll(startCommands(file.kind, spec.label, file.path, uidOf(options)), options);
  } catch (error) {
    if (!(error instanceof Refused)) throw error;
    // Nothing half kept: no file left to start it at the next login beside this copy.
    try {
      runAll(stopCommands(file.kind, spec.label, uidOf(options)), options);
    } catch {
      // It never started, so there is nothing to stop.
    }
    rmSync(file.path, { force: true });
    const why = refusedWords(error.command, error.printed);
    sayOf(options)(`${why}. It runs here instead, while this terminal is open.`);
    return { state: "failed", why };
  }
  if (file.kind === "systemd" && !lingers(options)) {
    sayOf(options)(
      "It stops when you log out. To keep it running on a machine nobody logs in to, run this once: sudo loginctl enable-linger $USER",
    );
  }
  return { state: "kept", path: file.path, logFile: file.logFile };
}

/** Stop a service written here, and remove its file. One of somebody's own is left: `theirs`. */
export function stopKeeping(
  label: string,
  options: Running = {},
): { readonly state: "stopped" | "none" | "theirs" | "unsupported"; readonly path?: string } {
  const file = serviceFile(
    { label, command: ["-"], folder: "/", environment: {} },
    options.machine,
  );
  if (file === undefined) return { state: "unsupported" };
  if (!existsSync(file.path)) return { state: "none", path: file.path };
  if (!ours(file.path)) return { state: "theirs", path: file.path };
  runAll(stopCommands(file.kind, label, uidOf(options)), options);
  rmSync(file.path);
  return { state: "stopped", path: file.path };
}
