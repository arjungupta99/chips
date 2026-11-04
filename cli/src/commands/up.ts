/**
 * `chips up`: the first run, and every run after it (ADR 0121).
 *
 * One command takes a machine from an installed `chips` to a browser that is already paired and a
 * QR for the phone. It asks one question, who can reach Chips, and only when it has to. Then it
 * starts the server: as a login service when this is an installed `chips` on a Mac or on Linux,
 * else in this terminal. It opens the browser with a single-use code in the address's fragment,
 * which the page redeems at once and strips, and it prints a QR for the phone. Run again, it
 * finds the server answering and only opens the browser and shows the QR, unless the settings it
 * would write differ from its service's: then it writes them in and restarts it.
 *
 * What it does is decided by `planUp`, purely, from what it found. Everything it touches (the
 * network, the service manager, the browser, files) comes in as `UpDeps`, so a test drives every
 * path without a launch agent.
 */

import { dirname, join } from "node:path";
import {
  CHIPS_RELAY,
  type ChipsConfig,
  ENVIRONMENT_BINDINGS,
  type Environment,
  type Machine,
  reachableUrl,
} from "@chipschat/platform";
import { appPairingUrl, type PairingOffer, pairingUrl } from "@chipschat/protocol";
import { operatorTokenPath, sqlitePathFrom } from "@chipschat/server";
import type { Console } from "../output.js";
import {
  chosenReach,
  hereUrl,
  isHomeAddress,
  type Networks,
  type Reach,
  type ReachChoice,
  reachChoices,
  tailnetAddress,
} from "../reach.js";
import { logFile, type Release } from "../release.js";
import {
  type Command,
  lingerCommand,
  lingeringCommand,
  mayFail,
  type ServiceKind,
  type ServiceSpec,
  type ServiceState,
  serviceEnvironment,
  serviceFile,
  serviceKind,
  servicePath,
  startCommands,
  stateOf,
} from "../service.js";
import type { OperatorServer } from "./pair.js";
import { qr, type ServeOptions, type Serving } from "./serve.js";

export interface UpFlags {
  /** `--reach`: the answer, so nobody is asked. */
  readonly reach?: Reach | undefined;
  /** `--no-service` turns it off: run in this terminal instead. */
  readonly service: boolean;
  /** `--no-open` turns it off: print the browser's link instead of opening it. */
  readonly open: boolean;
  /** `--json`: one line of JSON on stdout and nothing else there. */
  readonly json: boolean;
  /** `--yes`: take the first answer that isn't the Chips relay rather than asking (ADR 0245). */
  readonly yes: boolean;
  /** Whether a person is at the terminal to be asked. */
  readonly interactive: boolean;
}

export type Health = "chips" | "other" | "none";

export interface UpDeps {
  readonly machine: Machine;
  /**
   * Chips's config directory on this machine, where `server.json` says where the server is, for a
   * harness here to find it (`join()`, ADR 0122).
   */
  readonly configHome: string;
  readonly release: Release | undefined;
  /**
   * What a service runs `serve` with: the install's own Node and its CLI, by its stable link.
   * Undefined from a checkout.
   */
  readonly command: readonly [string, ...string[]] | undefined;
  /** The Mac app the install came inside, by its bundle identifier, which its service names. */
  readonly app: string | undefined;
  readonly uid: number;
  readonly health: (url: string) => Promise<Health>;
  /**
   * The version the Chips answering at an address says it is, from its health; nothing when it
   * says none. Absent, `chips up` doesn't ask, and a running Chips is as good as this one.
   */
  readonly runningVersion?: ((url: string) => Promise<string | undefined>) | undefined;
  readonly networks: () => Promise<Networks>;
  readonly readFile: (path: string) => string | undefined;
  readonly writeFile: (path: string, contents: string) => void;
  /** Makes a folder and those above it, as `mkdir -p` does. */
  readonly makeDirectory: (path: string) => void;
  readonly exists: (path: string) => boolean;
  readonly run: (command: Command) => Promise<{ readonly ok: boolean; readonly output: string }>;
  readonly serve: (options: ServeOptions) => Promise<Serving>;
  readonly requestCode: (operator: OperatorServer) => Promise<{
    readonly code: string;
    readonly url: string;
    readonly relay: string | undefined;
    readonly serverKey: string | undefined;
  }>;
  readonly open: (url: string) => Promise<boolean>;
  readonly choose: (question: string, choices: readonly string[]) => Promise<number>;
  /** Polls until the check is true or the time is up; says which. */
  readonly waitFor: (check: () => Promise<boolean>, timeoutMs: number) => Promise<boolean>;
}

export interface UpOptions {
  readonly config: ChipsConfig;
  readonly console: Console;
  readonly flags: UpFlags;
  readonly deps: UpDeps;
}

export interface Up {
  readonly ok: boolean;
  /** The server runs in this process and the caller holds it open. */
  readonly hold: boolean;
  readonly stop?: (() => Promise<void>) | undefined;
}

/** What `chips up` does, from what it found. */
export type UpPath =
  | "already-running"
  | "service"
  | "foreground"
  | "foreign-service"
  | "port-taken";

export function planUp(found: {
  readonly health: Health;
  readonly state: ServiceState;
  readonly kind: ServiceKind | undefined;
  readonly wantService: boolean;
  readonly release: boolean;
  readonly reachGiven: boolean;
  /** Whether the settings it would write differ from those its running service has. */
  readonly changed: boolean;
  /**
   * Whether what runs is another release than this one: the install line put a new one in place
   * and the server running is still the one before (the stranger review, 4 November 2026).
   */
  readonly stale?: boolean | undefined;
}): UpPath {
  if (found.health === "other") return "port-taken";
  const canService = found.wantService && found.release && found.kind !== undefined;
  if (found.health === "chips") {
    // Running already. A new `--reach`, settings its file doesn't have, or another release
    // running than this one are reasons to start a service of our own again, and nothing else is.
    const rewrite = found.reachGiven || found.changed || found.stale === true;
    return canService && found.state === "ours" && rewrite ? "service" : "already-running";
  }
  if (!canService) return "foreground";
  return found.state === "foreign" ? "foreign-service" : "service";
}

/** What an answer sets: what the server binds, and the address and relay it names. */
export type Answer = Pick<ReachChoice, "reach" | "host" | "publicUrl" | "relay">;

/** The service `chips up` found here, and what a file written now would carry. */
interface Found {
  readonly state: ServiceState;
  /** What the next file carries, whatever the answer (`carriedSettings`). */
  readonly carried: Readonly<Record<string, string>>;
  /** The answer a running service of our own was given, when no `--reach` names another. */
  readonly kept: Answer | undefined;
  /** The settings writing the kept answer again would change; none when nothing is kept. */
  readonly changes: readonly string[];
}

/** A code, and the address and relay a device is told beside it. */
type Codes = () => Promise<{ code: string; url: string; offer: PairingOffer }>;

/** A server, started or found: how to get codes from it, and whether this process holds it. */
interface Started {
  readonly codes: Codes;
  readonly hold: boolean;
  readonly stop?: (() => Promise<void>) | undefined;
  readonly service: ServiceKind | "none";
  /** Where this machine reaches it. */
  readonly local: string;
  /** What is said when no phone can reach it: how to let one in, for how it runs. */
  readonly noPhone: string;
}

export async function up(options: UpOptions): Promise<Up> {
  const { config, console: out, flags, deps } = options;
  const port = config.server.port;
  const kind = serviceKind(deps.machine.platform);
  const file = kind === undefined ? undefined : servicePath(kind, deps.machine);
  const contents = file === undefined ? undefined : deps.readFile(file);
  const health = await deps.health(hereUrl(config.server.host, port));
  const found = foundService(options, contents, health);
  const running =
    health === "chips" ? await deps.runningVersion?.(hereUrl(config.server.host, port)) : undefined;
  const stale =
    deps.release !== undefined && running !== undefined && running !== deps.release.version;

  const path = planUp({
    health,
    state: found.state,
    kind,
    wantService: flags.service,
    release: deps.release !== undefined,
    reachGiven: flags.reach !== undefined,
    changed: found.changes.length > 0,
    stale,
  });
  const refused = refusal(path, port, file);
  if (refused !== undefined) {
    out.err(refused);
    return { ok: false, hold: false };
  }
  const workspace = await prepare(path, options, found);
  if (workspace === undefined) return { ok: false, hold: false };

  const before = stale ? running : undefined;
  const started = await startOrFind(path, options, workspace.choice, kind, found, before);
  if ("problem" in started) {
    out.err(started.problem);
    return { ok: false, hold: false };
  }
  const { local } = started;
  // A harness on this machine finds its server here (ADR 0122): `join()` reads it last of all.
  deps.writeFile(join(deps.configHome, "server.json"), `${JSON.stringify({ url: local })}\n`);
  const links = await showLinks(started, port, flags, deps, (line) => {
    if (!flags.json) out.out(line);
  });
  if (flags.json) {
    out.out(
      JSON.stringify({
        url: local,
        pair_link: links.pairLink,
        phone_link: links.phoneLink ?? null,
        data_dir: config.data.dir,
        log_file: logFile(deps.machine),
        service: started.service,
        reach: workspace.choice?.reach ?? null,
        already_running: path === "already-running",
        created: workspace.created,
      }),
    );
  }
  return { ok: true, hold: started.hold, stop: started.stop };
}

/**
 * Before starting anything: whether the workspace is new, and who can reach it. A server already
 * running keeps what it has, so it is asked nothing; given new settings, it keeps its answer.
 * Undefined when the answer cannot be given.
 */
async function prepare(
  path: UpPath,
  options: UpOptions,
  found: Found,
): Promise<{ readonly choice: Answer | undefined; readonly created: boolean } | undefined> {
  const { config, console: out, flags, deps } = options;
  if (path === "already-running") return { choice: undefined, created: false };
  if (found.kept !== undefined) return { choice: found.kept, created: false };
  const created = !deps.exists(sqlitePathFrom(config.data.databaseUrl));
  const relay = found.carried["CHIPS_RELAY_URL"];
  const choice = await pickReach(out, flags, deps, config.server.port, relay);
  if (choice === undefined) return undefined;
  if (!flags.json) {
    out.out(
      `  ✓ ${created ? "Made" : "Found"} your workspace  ${tilde(config.data.dir, deps.machine)}`,
    );
    out.out(`  ✓ ${choice.done}`);
  }
  return { choice, created };
}

/** What `chips up` says when it will not go on, or nothing when it will. */
function refusal(path: UpPath, port: number, file: string | undefined): string | undefined {
  if (path === "port-taken") {
    return `Something other than Chips answers on port ${port}. Stop it, or run \`chips up --port <n>\`.`;
  }
  if (path !== "foreign-service") return undefined;
  return [
    "A Chips launch agent that `chips up` did not write is already installed:",
    `  ${file}`,
    `It is not answering on port ${port}. Chips leaves it as it is. Start it the way it was set`,
    "up, or run `chips up --no-service` to run Chips in this terminal instead.",
  ].join("\n");
}

/** Why a running service was started again: its changed settings, a new release, or both. */
function whyStartedAgain(
  found: Found,
  release: Release | undefined,
  before: string | undefined,
): string[] {
  const lines: string[] = [];
  if (found.kept !== undefined && found.changes.length > 0) {
    lines.push(`  ✓ Restarted Chips with its changed settings: ${found.changes.join(", ")}`);
  }
  if (before !== undefined && release !== undefined) {
    lines.push(`  ✓ Started Chips again on ${release.version} (it was ${before})`);
  }
  return lines;
}

/** The server: started in this process, started as a service, or found running. */
async function startOrFind(
  path: UpPath,
  options: UpOptions,
  choice: Answer | undefined,
  kind: ServiceKind | undefined,
  found: Found,
  /** The release that was running, when it wasn't this one. */
  before?: string | undefined,
): Promise<Started | { readonly problem: string }> {
  const { config, console: out, flags, deps } = options;
  const say = (line: string) => {
    if (!flags.json) out.out(line);
  };
  if (path === "foreground" && choice !== undefined) {
    return await startHere(options, choice, found.carried, say);
  }
  if (path === "service" && choice !== undefined && kind !== undefined) {
    const started = await startService(config, deps, choice, kind, found.carried);
    if (!started.ok) return { problem: started.problem };
    for (const line of whyStartedAgain(found, deps.release, before)) say(line);
    for (const line of await startsWhen(kind, deps)) say(line);
    const local = hereUrl(choice.host, config.server.port);
    return { ...askingServer(config, local, deps), service: kind };
  }
  return foundRunning(options, found.state, say);
}

/**
 * A Chips found running, which this run leaves as it is. When `--reach` was given and can't
 * change it, that is said, and how a phone gets in is said for how it runs.
 */
function foundRunning(
  options: UpOptions,
  state: ServiceState,
  say: (line: string) => void,
): Started {
  const { config, flags, deps } = options;
  const local = hereUrl(config.server.host, config.server.port);
  say(`  ✓ Chips is already running at ${local}`);
  const kept = flags.reach === undefined ? undefined : keepsItsReach(state, flags.service);
  if (kept !== undefined) say(kept);
  const runs = kept !== undefined ? "told" : state === "none" ? "terminal" : "service";
  return { ...askingServer(config, local, deps), service: "none", noPhone: noPhone(runs) };
}

/** The server started in this process, which holds it until Ctrl-C. */
async function startHere(
  options: UpOptions,
  choice: Answer,
  carried: Readonly<Record<string, string>>,
  say: (line: string) => void,
): Promise<Started> {
  const { config, console: out, deps } = options;
  const serving = await deps.serve({
    config: servedWith(config, choice, carried),
    console: out,
    announce: false,
    logTo: logFile(deps.machine),
    version: deps.release?.version,
    opensMacApp: true,
    exitsOnUncaught: true,
  });
  say(
    deps.release === undefined
      ? "  ✓ Running in this terminal (Ctrl-C stops it); from a checkout there is no login service"
      : "  ✓ Running in this terminal (Ctrl-C stops it)",
  );
  const port = config.server.port;
  // What a phone dials: the server's own answer, as it gives one to a service's `chips up`.
  const publicUrl = carried["CHIPS_PUBLIC_URL"] ?? choice.publicUrl;
  const url = reachableUrl({ publicUrl, host: choice.host, port });
  return {
    codes: async () => ({ code: serving.issueCode() ?? "", url, offer: serving.offer }),
    hold: true,
    stop: serving.stop,
    service: "none",
    local: hereUrl(choice.host, port),
    noPhone: noPhone("terminal"),
  };
}

/** A server here that this process doesn't hold: codes come from asking it. */
function askingServer(
  config: ChipsConfig,
  local: string,
  deps: UpDeps,
): Pick<Started, "codes" | "hold" | "local" | "noPhone"> {
  const operator = { serverUrl: local, tokenPath: operatorTokenPath(config) };
  return {
    codes: async () => {
      const issued = await deps.requestCode(operator);
      const offer =
        issued.relay === undefined ? {} : { relay: issued.relay, key: issued.serverKey ?? "" };
      return { code: issued.code, url: issued.url, offer };
    },
    hold: false,
    local,
    noPhone: noPhone("service"),
  };
}

/**
 * Why a `--reach` given to a Chips already running changes nothing, when it can't: one running in
 * a terminal keeps what it started with, and a service this run doesn't rewrite keeps its own.
 * Nothing when it can, since then `chips up` rewrites it.
 */
function keepsItsReach(state: ServiceState, wantService: boolean): string | undefined {
  if (state === "none") {
    return "  ! It runs in a terminal, so `--reach` can't change it. Stop it there (Ctrl-C) and run the\n    same `chips up` again.";
  }
  if (state === "foreign") {
    return "  ! It runs from a service `chips up` didn't write, so `--reach` can't change it.";
  }
  return wantService
    ? undefined
    : "  ! It runs as this machine's service, which `--no-service` leaves as it is. Run the same\n    `chips up` without `--no-service` to change who can reach it.";
}

/**
 * What `chips up` says when no phone can reach Chips. A service is rewritten by `chips up` with a
 * new `--reach`, but a Chips in a terminal has to be stopped first, or `chips up` only finds it
 * running and says this again; and once that has been said, it isn't said twice.
 */
function noPhone(runs: "service" | "terminal" | "told"): string {
  const none = "\n  Only this machine can reach Chips, so there is no code for a phone.";
  if (runs === "told") return none;
  return runs === "service"
    ? `${none} To add one, run\n  \`chips up --reach relay\` for the Chips relay, or \`chips up --reach lan\` for this Wi-Fi.`
    : `${none} To add one, stop Chips\n  in its terminal (Ctrl-C) and run \`chips up --reach relay\` for the Chips relay, or\n  \`chips up --reach lan\` for this Wi-Fi.`;
}

/**
 * When the service runs, as `chips up` says it. A launch agent runs from login. On Linux it runs
 * from boot when lingering can be turned on, and otherwise only while somebody is logged in, which
 * on a headless box is never: that is said, with the line that fixes it.
 */
async function startsWhen(kind: ServiceKind, deps: UpDeps): Promise<string[]> {
  const fromLogin = "  ✓ Starts when you log in (`chips down` stops it)";
  if (kind === "launchd") return [fromLogin];
  const lingering = await deps.run(lingeringCommand(deps.uid));
  const on = lingering.ok && lingering.output.trim() === "yes";
  if (on || (await deps.run(lingerCommand(deps.uid))).ok) {
    return [
      "  ✓ Starts when this machine starts, and runs after you log out (`chips down` stops it)",
    ];
  }
  return [
    fromLogin,
    "  ! It stops when you log out, and your harnesses' bridges with it. To keep them running on\n    a machine nobody logs in to, run this once: sudo loginctl enable-linger $USER",
  ];
}

/**
 * Where a browser for this machine is: on it; on the person's own computer, when they reached this
 * one over SSH; or nowhere, on Linux with no display. Only the first is opened, so a Mac mini
 * reached over SSH doesn't open a page on its own screen and say it opened one.
 */
export function browserFor(machine: Machine): "here" | "ssh" | "none" {
  const set = (name: string) => (machine.environment[name] ?? "") !== "";
  if (set("SSH_CONNECTION") || set("SSH_TTY")) return "ssh";
  if (machine.platform === "linux" && !set("DISPLAY") && !set("WAYLAND_DISPLAY")) return "none";
  return "here";
}

/**
 * How a browser gets paired: the link, whether it opened or not. Over SSH, the page is reached
 * through a tunnel from the person's own computer, where it is loopback too, so it can make a key.
 */
function pairLines(where: "here" | "ssh" | "none", opened: boolean, link: string, port: number) {
  if (opened) return `  ✓ Opened in your browser, already paired:\n    ${link}`;
  if (where !== "ssh") return `  Open this in a browser on this machine to pair it:\n    ${link}`;
  const url = new URL(link);
  return [
    "  To pair a browser, run this on your own computer, then open the link there:",
    `    ssh -L ${port}:${url.hostname}:${port} <this machine>`,
    `    http://127.0.0.1:${port}/${url.hash}`,
  ].join("\n");
}

/** The browser, opened already paired, and the phone's QR when a phone could reach it. */
async function showLinks(
  started: Started,
  port: number,
  flags: UpFlags,
  deps: UpDeps,
  say: (line: string) => void,
): Promise<{ readonly pairLink: string; readonly phoneLink: string | undefined }> {
  const browser = await started.codes();
  const pairLink = pairingUrl(started.local, browser.code);
  const where = browserFor(deps.machine);
  const opened = flags.open && where === "here" ? await deps.open(pairLink) : false;
  say(pairLines(where, opened, pairLink, port));
  // A phone reaches a server with a relay from anywhere, whatever it is bound to (ADR 0121's
  // addendum): the QR carries the relay and the server's key beside the address.
  const phone = await started.codes();
  const relay = phone.offer.relay;
  const phoneLink =
    isLoopbackUrl(phone.url) && relay === undefined
      ? undefined
      : appPairingUrl(phone.url, phone.code, phone.offer);
  if (phoneLink === undefined) {
    say(started.noPhone);
  } else {
    // The QR is `chips://pair`, which only the app opens: a phone's camera does nothing with it.
    say(
      relay === undefined
        ? "\n  In the Chips app, scan this\n"
        : `\n  In the Chips app, scan this. It reaches Chips from anywhere, through the relay\n  at ${hostOf(relay)}.\n`,
    );
    say(await qr(phoneLink));
  }
  say("  Next: add an agent in the browser. Something not right? `chips doctor`\n");
  return { pairLink, phoneLink };
}

/** What `chips up` says when `--reach` names an answer this machine can't give. */
const MISSING: Readonly<Record<Reach, string>> = {
  tailnet:
    "This machine is not on a tailnet: Tailscale is not running, or not installed. Choose `--reach lan` or `--reach local`.",
  lan: "This machine has no home-network address. Choose `--reach relay` or `--reach local`.",
  relay:
    "Chips already has a relay of its own (CHIPS_RELAY_URL), which every answer goes through. Choose another `--reach`.",
  local: "Every machine can be reached from itself.",
};

async function pickReach(
  out: Console,
  flags: UpFlags,
  deps: UpDeps,
  port: number,
  relay: string | undefined,
): Promise<ReachChoice | undefined> {
  const choices = reachChoices(await deps.networks(), port, relay);
  if (flags.reach === undefined && flags.interactive && !flags.json && !flags.yes) {
    const at = await deps.choose(
      "Who should be able to reach Chips?",
      choices.map((each) => each.label),
    );
    return choices[at] ?? choices[0];
  }
  // The Chips relay waits for its owner to choose it (ADR 0245), so `--yes` doesn't.
  if (flags.reach === undefined && flags.yes) {
    return choices.find((each) => each.reach !== "relay") ?? choices[choices.length - 1];
  }
  const chosen = chosenReach(choices, flags.reach);
  if ("missing" in chosen) {
    out.err(MISSING[chosen.missing]);
    return undefined;
  }
  return chosen;
}

/** Write the service's file, start it, and wait for it to answer. */
async function startService(
  config: ChipsConfig,
  deps: UpDeps,
  answer: Answer,
  kind: ServiceKind,
  carried: Readonly<Record<string, string>>,
): Promise<{ ok: true } | { ok: false; problem: string }> {
  if (deps.command === undefined) {
    return { ok: false, problem: "This chips has no install to run as a service." };
  }
  const log = logFile(deps.machine);
  const spec: ServiceSpec = {
    command: deps.command,
    app: deps.app,
    logFile: log,
    environment: serviceSettings(config, answer, carried),
  };
  const path = servicePath(kind, deps.machine);
  deps.writeFile(path, serviceFile(kind, spec));
  // systemd opens the log before it starts Chips, and makes no folder for it: without this, a
  // fresh Linux machine's service stopped at once with 209/STDOUT (29 October 2026).
  deps.makeDirectory(dirname(log));
  for (const command of startCommands(kind, path, deps.uid)) {
    const ran = await deps.run(command);
    if (!ran.ok && !mayFail(command)) return { ok: false, problem: failed(command, ran.output) };
  }
  const local = hereUrl(answer.host, config.server.port);
  const answered = await deps.waitFor(async () => (await deps.health(local)) === "chips", 30_000);
  if (!answered) {
    return { ok: false, problem: `Chips did not start within 30 seconds. Its log is ${log}.` };
  }
  return { ok: true };
}

/**
 * What a command that starts the service printed when it failed. `systemctl --user` with no user
 * session to talk to (under `su`, in most containers, on WSL) says only that it found no bus,
 * which is not something a person can act on.
 */
function failed(command: Command, output: string): string {
  const said = `\`${command.join(" ")}\` failed:`;
  const printed = output.trim();
  const noSession =
    /Failed to connect to (user scope )?bus|DBUS_SESSION_BUS_ADDRESS|not been booted with systemd/;
  if (command[0] !== "systemctl" || (printed !== "" && !noSession.test(printed))) {
    return `${said}\n${printed}`;
  }
  return [
    `${said} ${printed.split("\n")[0] ?? ""}`.trimEnd(),
    "This shell has no systemd user session, so Chips can't run as a service from it. Run",
    "`chips up --no-service` to run Chips in this terminal, or log in as this user over SSH or at",
    "the desktop and run `chips up` there.",
  ].join("\n");
}

/** The configuration a server in this terminal runs with: who can reach it, and its relay. */
function servedWith(
  config: ChipsConfig,
  answer: Answer,
  carried: Readonly<Record<string, string>>,
): ChipsConfig {
  return {
    ...config,
    server: {
      ...config.server,
      host: answer.host,
      publicUrl: carried["CHIPS_PUBLIC_URL"] ?? answer.publicUrl,
    },
    relay: { ...config.relay, url: carried["CHIPS_RELAY_URL"] ?? answer.relay },
  };
}

/** launchd's own PATH has no Homebrew: this one lets the server find ffmpeg and whisper. */
const SERVICE_PATH = "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin";

/**
 * Everything the service's file says to run Chips with: what it carries, under who can reach it,
 * its port and its workspace, which `up` decides. An address or a relay of the person's own wins
 * over the one the answer names.
 */
export function serviceSettings(
  config: ChipsConfig,
  answer: Answer,
  carried: Readonly<Record<string, string>>,
): Record<string, string> {
  const { PATH: path, ...settings } = carried;
  const publicUrl = settings["CHIPS_PUBLIC_URL"] ?? answer.publicUrl;
  const relay = settings["CHIPS_RELAY_URL"] ?? answer.relay;
  return {
    ...settings,
    CHIPS_HOST: answer.host,
    CHIPS_PORT: String(config.server.port),
    CHIPS_DATA_DIR: config.data.dir,
    ...(publicUrl === undefined ? {} : { CHIPS_PUBLIC_URL: publicUrl }),
    ...(relay === undefined ? {} : { CHIPS_RELAY_URL: relay }),
    PATH: path ?? SERVICE_PATH,
  };
}

/**
 * What the service carries from one `chips up` to the next, since launchd and systemd read no
 * shell profile: everything in the file `chips up` wrote before, whether an earlier run or a
 * person put it there, under the `CHIPS_` settings this shell exports (push's token, the media
 * tools, the attachment secret and the rest Chips documents). The shell wins, and a setting it
 * exports empty is taken out. What an answer wrote is the answer's to say again (`answered`).
 */
export function carriedSettings(
  environment: Environment,
  existing: Readonly<Record<string, string>> = {},
): Record<string, string> {
  const carried: Record<string, string> = {};
  for (const [name, value] of Object.entries(existing)) {
    if (!answered(name, value)) carried[name] = value;
  }
  for (const [name] of ENVIRONMENT_BINDINGS) {
    const value = environment[name];
    if (value !== undefined) carried[name] = value;
  }
  return Object.fromEntries(Object.entries(carried).filter(([, value]) => value !== ""));
}

/**
 * Whether a setting in a file `chips up` wrote came from the answer rather than from the person:
 * what it binds, the Chips relay, and the bare tailnet or home-network address it named. An
 * older `chips up` froze this Wi-Fi's address in (the new-person sweep's finding 4), and carried,
 * it would outlive the answer.
 */
function answered(name: string, value: string): boolean {
  if (name === "CHIPS_HOST") return true;
  if (name === "CHIPS_RELAY_URL") return value === CHIPS_RELAY;
  return name === "CHIPS_PUBLIC_URL" && answerUrl(value) !== undefined;
}

/** Which answer wrote a `CHIPS_PUBLIC_URL`: a bare tailnet or home-network address, by which. */
function answerUrl(url: string | undefined): "tailnet" | "lan" | undefined {
  const address = /^http:\/\/(\d{1,3}(?:\.\d{1,3}){3}):\d+\/?$/.exec(url ?? "")?.[1];
  if (address === undefined) return undefined;
  if (tailnetAddress(address) !== undefined) return "tailnet";
  return isHomeAddress(address) ? "lan" : undefined;
}

/**
 * The answer a service's file was written with, read back, so that new settings are written in
 * without asking again: what it binds, and the tailnet address and Chips relay it names. A home
 * network's address it names is left behind.
 */
export function keptAnswer(existing: Readonly<Record<string, string>>): Answer {
  const host = existing["CHIPS_HOST"] ?? "127.0.0.1";
  const named = existing["CHIPS_PUBLIC_URL"];
  const tailnet = answerUrl(named) === "tailnet";
  const relay = existing["CHIPS_RELAY_URL"] === CHIPS_RELAY ? CHIPS_RELAY : undefined;
  const local: Reach = host === "127.0.0.1" ? "local" : "lan";
  const onTailnet = tailnet || tailnetAddress(host) !== undefined;
  return {
    reach: relay !== undefined ? "relay" : onTailnet ? "tailnet" : local,
    host,
    publicUrl: tailnet ? named : undefined,
    relay,
  };
}

/**
 * The service here: whose it is, what a file written now carries, and, for a running one of our
 * own with no `--reach`, the answer it keeps and which settings writing it again would change.
 */
function foundService(options: UpOptions, contents: string | undefined, health: Health): Found {
  const { config, flags, deps } = options;
  const state = stateOf(contents);
  const existing = state === "ours" ? serviceEnvironment(contents) : undefined;
  const carried = carriedSettings(deps.machine.environment, existing);
  if (existing === undefined || health !== "chips" || flags.reach !== undefined) {
    return { state, carried, kept: undefined, changes: [] };
  }
  const kept = keptAnswer(existing);
  const next = serviceSettings(config, kept, carried);
  const names = new Set([...Object.keys(existing), ...Object.keys(next)]);
  const changes = [...names].filter((name) => existing[name] !== next[name]).sort();
  return { state, carried, kept, changes };
}

/** A relay as a person reads it: `relay.chipschat.ai` rather than `wss://relay.chipschat.ai`. */
function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

function isLoopbackUrl(url: string): boolean {
  const host = new URL(url).hostname;
  return host === "127.0.0.1" || host === "localhost" || host === "[::1]";
}

/** `~/Library/…` rather than `/Users/ada/Library/…`, for a line a person reads. */
export function tilde(path: string, machine: Machine): string {
  return path.startsWith(`${machine.home}/`)
    ? join("~", path.slice(machine.home.length + 1))
    : path;
}
