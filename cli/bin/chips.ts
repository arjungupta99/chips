#!/usr/bin/env node
/**
 * `chips`.
 *
 * The interfaces layer, and nothing else: it reads arguments and configuration, calls one
 * function per command, prints what came back, and chooses an exit code. Every rule about what
 * a command means lives in `src/`, where a test can drive it without a terminal.
 */

import { existsSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import {
  type ChipsConfig,
  ConfigError,
  err,
  loadConfig,
  platformLogDir,
  processEnvironment,
} from "@chipschat/platform";
import { type Connector, HARNESS_CAPABILITIES } from "@chipschat/protocol";
import {
  createSqliteEventStore,
  mediaFound,
  migrateToLatest,
  openDatabase,
  operatorTokenPath,
  sqlitePathFrom,
} from "@chipschat/server";
import { type Flags, readArgs } from "../src/args.js";
import { NPM_REGISTRY } from "../src/bridges.js";
import {
  type BridgeCard,
  connectableLines,
  connectIds,
  isBridgeCard,
  readCards,
} from "../src/cards.js";
import {
  type BridgeDeps,
  connectBridge,
  disconnectBridge,
  stopEveryBridge,
  updateBridges,
} from "../src/commands/bridge.js";
import {
  FOLDER_OPS,
  type FolderAnswer,
  type FolderOp,
  folderAsked,
  gitPath,
  openOnMac,
  runFolder,
} from "../src/commands/folder.js";
import {
  cloneProject,
  credentialAsked,
  credentialFor,
  findRoom,
  folderFor,
  helperCommand,
} from "../src/commands/project.js";
import { configHome } from "../src/home.js";
import {
  CONFORMANCE_ADAPTERS,
  conformance,
  connect,
  connectable,
  declare,
  disconnect,
  doctor,
  down,
  exportWorkspace,
  importWorkspace,
  issuePairingCode,
  joinChips,
  loadDevice,
  pairDevice,
  pairingAsked,
  pairingFailed,
  readConnections,
  readFolder,
  relay,
  remove,
  report,
  restoreAttachments,
  serve,
  systemConsole,
  uninstall,
  up,
  writeFolder,
} from "../src/index.js";
import { forgetEverySecret } from "../src/keychain.js";
import { facts, heading } from "../src/output.js";
import { hereUrl, isReach } from "../src/reach.js";
import {
  checkoutDefaults,
  devModeRefusal,
  releaseDefaults,
  thisMachine,
  thisRelease,
  versionLine,
} from "../src/release.js";
import { restartCommand, serviceHere, serviceKind, withServiceSettings } from "../src/service.js";
import {
  installOf,
  networks,
  readText,
  removePath,
  run,
  stableNode,
  systemUpDeps,
} from "../src/system.js";

const RELEASE = thisRelease();

/** The harnesses `connect` makes: the manifest's connectable adapters (ADR 0051). */
const HARNESSES: readonly string[] = connectable().map((each) => each.id);

/**
 * An adapter this build has, or a harness connected from here: by the adapter it was made with
 * (an older build's too), its name, or its id.
 */
function knownHarness(harness: string): boolean {
  const lower = harness.toLowerCase();
  return (
    HARNESSES.includes(harness) ||
    readConnections().some(
      (each) =>
        each.harness === lower ||
        each.harnessId === harness ||
        each.displayName.toLowerCase() === lower,
    )
  );
}

function usage(harnesses: string): string {
  return [
    "chips — supervise your harnesses",
    "",
    "Usage:",
    "  chips up                        start Chips, open it in your browser, show the phone's code",
    "  chips down                      stop the login service `chips up` installed",
    "  chips uninstall                 remove an installed Chips (your workspace is kept unless you say)",
    "  chips serve                     run the server, print a pairing code, advertise it",
    "  chips relay                     run a relay phones reach a server through, from anywhere",
    "  chips pair <code>               pair this machine with a running server",
    "  chips pair --issue              a code for another device, from this one",
    '  chips join <link>               join with a link Chips made: eval "$(chips join <link>)" sets the four lines',
    "  chips connect                   what this Chips can connect",
    "  chips connect <id>              connect a harness from its card, the link from Chips in CHIPS_JOIN_LINK: fetch its bridge, join, keep it running",
    "  chips connect <id>              the same with no link, joining with the key kept for that harness: its spaces stay its own",
    "  chips connect custom            point a harness of your own at this workspace",
    "  chips connect --update          bring each bridge here to the newest release of its major, and start it again",
    "  chips disconnect <id>           stop a harness's bridge and remove it, or undo what `connect custom` wrote",
    "  chips remove <harness>          remove a harness from the workspace: its tokens, its place in the lists; its history stays",
    "  chips declare <harness> <what>…  say what a harness takes, the whole list (any of the capabilities below)",
    "  chips doctor                    check everything, and say what to do about it",
    "  chips conformance <adapter>     walk an adapter through the golden scenario; print the checklist",
    "  chips project clone <space> [folder]  the space's project, cloned here: your pushes show in the space",
    "  chips export <folder>           write this workspace to a folder",
    "  chips import <folder>           read a workspace folder into an empty database",
    "  chips help                      this message",
    "  chips --version                 which chips this is",
    "",
    `Harnesses: ${harnesses}   (a harness with an adapter of its own connects as custom; connect as many as you run)`,
    `Conformance adapters: ${CONFORMANCE_ADAPTERS.join(", ")}`,
    `Capabilities: ${Object.values(HARNESS_CAPABILITIES).join(", ")}`,
    "",
    "Flags:",
    "  --yes         do not ask before changing anything",
    "  --issue       with `pair`: print a code for another device, and a QR",
    "  --rotate      with `connect`: replace the token, keeping the harness (`chips connect <name> --rotate`)",
    "  --name <n>    with `connect` and `join`: what to call the harness",
    "  --no-dial     with `connect`: the harness has a permission model of its own; show it no autonomy dial",
    "  --capabilities <a,b>  with `connect` and `conformance`: what else the harness takes, as `declare` says it",
    "  --port <n>    with `conformance`: where the fake Chips listens (default: any free port)",
    "  --json        with `conformance`: print the report as JSON and nothing else",
    "  --json        with `connect <id>`: a line of JSON for each step",
    "  --timeout <s> with `conformance`: seconds to wait for the harness at each step",
    "  --server <u>  with `pair`: where the server is (default http://127.0.0.1:4431)",
    "  --reach <r>   with `up`: who can reach Chips: tailnet, lan, relay or local (asked when not given)",
    "  --port <n>    with `up`: the port (default 4431)",
    "  --no-service  with `up`: run in this terminal, not as a login service",
    "  --no-open     with `up`: print the browser's link instead of opening it",
    "  --json        with `up`: one line of JSON with the links and places",
    "  --remove-data with `uninstall`: remove the workspace too",
    "",
    "Configuration comes from the environment: https://chipschat.ai/start/install/#configuration",
  ].join("\n");
}

/** `chips --help` and `chips --version` as the commands they are, `help` and `version`. */
function asCommand(argv: readonly string[]): readonly string[] {
  const first = argv[0];
  if (first === "--help" || first === "-h") return ["help", ...argv.slice(1)];
  if (first === "--version" || first === "-v") return ["version", ...argv.slice(1)];
  return argv;
}

async function main(): Promise<number> {
  const out = systemConsole();
  const args = readArgs(asCommand(process.argv.slice(2)));
  if (!args.ok) {
    out.err(args.problem);
    return 1;
  }
  const { command, flags, words } = args;

  if (command === "help" || flags.help) {
    out.out(usage(await harnessesHere(command, flags)));
    return 0;
  }
  if (command === "version") {
    out.out(versionLine(RELEASE));
    return 0;
  }

  const environment = processEnvironment();
  const machine = thisMachine(environment);
  const config = configFor(command, flags, machine, environment);
  if (!config.ok) {
    out.err(config.error.message);
    return 1;
  }

  switch (command) {
    case "up":
      return await upHere(config.value, flags, out, machine);

    case "down":
      return (await down(out, { machine, uid: uid(), readFile: readText, run })) ? 0 : 1;

    case "uninstall":
      return await uninstallHere(config.value, flags, out, machine, environment);

    case "serve":
      await serve({
        config: config.value,
        console: out,
        version: RELEASE?.version,
        opensMacApp: true,
        exitsOnUncaught: true,
      });
      // `serve` holds the process open through the server's own handles.
      return await new Promise<number>(() => {});

    case "relay":
      await relay({
        config: config.value,
        console: out,
        version: RELEASE?.version,
        exitsOnUncaught: true,
      });
      // The relay holds the process open through its own listening socket.
      return await new Promise<number>(() => {});

    case "pair":
      return await pair(words, flags, out, config.value);

    case "join":
      return await joinChips({
        target: words[0],
        name: flags.name,
        console: out,
        env: environment,
      });

    case "connect":
      return await connectTo(words, flags, out, config.value, machine);

    case "disconnect":
      return await disconnectFrom(words[0], flags, out, config.value, machine);

    case "remove":
      return await removeHarness(words[0], flags, out);

    case "declare":
      return await declareFor(words, out);

    case "doctor":
      return report(out, await doctor({ console: out, here: hereFor(config.value, machine) }));

    case "conformance":
      return await conform(words[0], flags, out);

    case "project":
      return await project(words, out);

    case "export":
    case "import": {
      const folder = words[0];
      if (folder === undefined) {
        out.err(`Give a folder: \`chips ${command} ./my-workspace\`.`);
        return 1;
      }
      return await transfer(command, folder, config.value.data.databaseUrl, out);
    }

    default:
      out.err(`No such command: ${command}`);
      out.out(usage(await harnessesHere(command, flags)));
      return 1;
  }
}

/**
 * `chips project clone <room> [folder]`, and `chips project credential get`, which git runs for a
 * clone's token (ADR 0220, Phase 7). The CLI's paired device asks for each token.
 */
async function project(
  words: readonly string[],
  out: ReturnType<typeof systemConsole>,
): Promise<number> {
  const [what, room, folder] = words;
  // The Mac app's Your folder brings its own token, and needs no paired CLI.
  if (what === "folder") return await projectFolder(room);
  const device = loadDevice();
  if (device === undefined) {
    out.err(
      "Pair this machine first: `chips pair --server <address> <code>`, with a code from the app.",
    );
    return 1;
  }
  if (what === "credential") {
    // git asks `get`, then says `store` or `erase`, which keep nothing here.
    if (room !== "get") return 0;
    const asked = credentialAsked(await readStdin());
    process.stdout.write(await credentialFor(device, asked));
    return 0;
  }
  if (what !== "clone" || room === undefined) {
    out.err('Say which space: `chips project clone "<space>" [folder]`.');
    return 1;
  }
  try {
    const found = await findRoom(device, room);
    const into = await cloneProject({
      device,
      room: found,
      folder: folder ?? folderFor(found.title),
      cwd: process.cwd(),
      helper: helperCommand(process),
    });
    out.out(`${found.title}'s project is in ${into}. Push to main and the space sees your change.`);
    return 0;
  } catch (error) {
    out.err(error instanceof Error ? error.message : String(error));
    return 1;
  }
}

/**
 * `chips project folder <op> --json`, as the Mac app runs it for Your folder (ADR 0224): the room,
 * the server, the person and a project token in the environment, one line of JSON back.
 */
async function projectFolder(op: string | undefined): Promise<number> {
  const say = (answer: FolderAnswer) => {
    process.stdout.write(`${JSON.stringify(answer)}\n`);
    return answer.ok ? 0 : 1;
  };
  if (!FOLDER_OPS.includes(op as FolderOp)) {
    return say({ ok: false, why: `Say what to do: ${FOLDER_OPS.join(", ")}.` });
  }
  const environment = processEnvironment();
  const asked = folderAsked(environment);
  if ("why" in asked) return say({ ok: false, why: asked.why });
  try {
    return say(
      await runFolder(op as FolderOp, asked, {
        home: homedir(),
        open: openOnMac,
        path: gitPath(environment["PATH"]),
        env: environment,
      }),
    );
  } catch (error) {
    return say({ ok: false, why: error instanceof Error ? error.message : String(error) });
  }
}

/** Everything git wrote to a helper on its standard input. */
async function readStdin(): Promise<string> {
  const parts: Buffer[] = [];
  for await (const part of process.stdin) parts.push(part as Buffer);
  return Buffer.concat(parts).toString("utf8");
}

/** The commands about the server this machine runs, which read its service's settings. */
const ABOUT_THE_SERVER_HERE: ReadonlySet<string> = new Set(["up", "doctor", "pair"]);

/**
 * The configuration: a release's defaults under the environment (ADR 0120), a checkout's own, and
 * `up --port` over both. For the server here, the settings its service was given come between,
 * so a port an earlier `chips up` was given is the one found (`withServiceSettings`).
 */
function configFor(
  command: string,
  flags: Flags,
  machine: ReturnType<typeof thisMachine>,
  environment: ReturnType<typeof processEnvironment>,
): ReturnType<typeof loadConfig> {
  const service = ABOUT_THE_SERVER_HERE.has(command) ? serviceHere(machine, readText) : undefined;
  const loaded = loadConfig({
    file: RELEASE === undefined ? checkoutDefaults() : releaseDefaults(RELEASE, machine),
    environment: withServiceSettings(environment, service),
  });
  if (!loaded.ok) return loaded;
  const refused = devModeRefusal(RELEASE, loaded.value);
  if (refused !== undefined) {
    return err(new ConfigError([{ path: "devMode", message: refused, source: "CHIPS_DEV_MODE" }]));
  }
  if (command !== "up" || flags.port === undefined) return loaded;
  return {
    ...loaded,
    value: { ...loaded.value, server: { ...loaded.value.server, port: flags.port } },
  };
}

/**
 * This machine, for `doctor`: a server is expected here when it has a service's file, or unless
 * this machine's device is elsewhere. What that server finds for video and voice notes is looked
 * for along its service's PATH, which is not this shell's.
 */
function hereFor(config: ChipsConfig, machine: ReturnType<typeof thisMachine>) {
  const device = loadDevice();
  const service = serviceHere(machine, readText);
  const loopback =
    device === undefined || /^http:\/\/(127\.0\.0\.1|localhost)[:/]/.test(device.serverUrl);
  return {
    port: config.server.port,
    local: hereUrl(config.server.host, config.server.port),
    release: RELEASE,
    node: process.version,
    networks,
    serverExpectedHere: service !== undefined || loopback,
    upHasRun:
      service !== undefined || existsSync(join(configHome(machine.environment), "server.json")),
    media: () => mediaFound(config, service?.environment["PATH"] ?? machine.environment["PATH"]),
  };
}

function uid(): number {
  return process.getuid?.() ?? 0;
}

async function uninstallHere(
  config: ChipsConfig,
  flags: Flags,
  out: ReturnType<typeof systemConsole>,
  machine: ReturnType<typeof thisMachine>,
  environment: ReturnType<typeof processEnvironment>,
): Promise<number> {
  const done = await uninstall(
    out,
    { yes: flags.yes, removeData: flags.removeData },
    {
      machine,
      uid: uid(),
      release: RELEASE,
      install: RELEASE === undefined ? undefined : installOf(RELEASE, machine),
      data: [config.data.dir, platformLogDir(machine), configHome(environment)],
      bridges: {
        dir: bridgesDir(config),
        stop: () => stopEveryBridge({ ...bridgeDepsOf(config, out, machine, []), json: false }),
      },
      readFile: readText,
      writeFile: (path, text) => writeFileSync(path, text),
      exists: existsSync,
      remove: removePath,
      run,
      forgetSecrets: machine.platform === "darwin" ? forgetEverySecret : undefined,
    },
  );
  return done ? 0 : 1;
}

async function upHere(
  config: ChipsConfig,
  flags: Flags,
  out: ReturnType<typeof systemConsole>,
  machine: ReturnType<typeof thisMachine>,
): Promise<number> {
  if (flags.reach !== undefined && !isReach(flags.reach)) {
    out.err("`--reach` takes tailnet, lan, relay or local.");
    return 1;
  }
  const result = await up({
    config,
    console: out,
    flags: {
      reach: flags.reach,
      service: !flags.noService,
      open: !flags.noOpen,
      json: flags.json,
      yes: flags.yes,
      interactive: process.stdin.isTTY === true,
    },
    deps: systemUpDeps(machine, RELEASE),
  });
  if (!result.ok) return 1;
  // A server started in this terminal holds the process open through its own handles.
  if (result.hold) return await new Promise<number>(() => {});
  return 0;
}

async function pair(
  words: readonly string[],
  flags: Flags,
  out: ReturnType<typeof systemConsole>,
  config: ChipsConfig,
): Promise<number> {
  if (flags.issue) {
    try {
      await issuePairingCode({ console: out, operator: serverHere(config) });
      return 0;
    } catch (failure) {
      out.err(failure instanceof Error ? failure.message : String(failure));
      return 1;
    }
  }
  const asked = pairingAsked(words, flags.server);
  if (!asked.ok) {
    out.err(asked.problem);
    return 1;
  }
  try {
    const device = await pairDevice({
      serverUrl: asked.server,
      code: asked.code,
      name: "chips CLI",
    });
    out.out(heading("Paired"));
    out.out(
      facts([
        ["you", `${device.displayName} (${device.participantId})`],
        ["workspace", device.workspaceId],
        ["server", device.serverUrl],
      ]),
    );
    out.out("");
    return 0;
  } catch (failure) {
    out.err(pairingFailed(failure, asked.server));
    return 1;
  }
}

/**
 * The server this machine runs, as far as the configuration says: where it answers on this
 * machine, and where it leaves its operator token (ADR 0048). Whether one is actually running is
 * for the token file to say.
 */
function serverHere(config: ChipsConfig): { serverUrl: string; tokenPath: string } {
  const { host, port } = config.server;
  return { serverUrl: hereUrl(host, port), tokenPath: operatorTokenPath(config) };
}

/** `<data>/bridges`: where `chips connect` unpacks each harness's bridge (ADR 0218). */
function bridgesDir(config: ChipsConfig): string {
  return join(resolve(config.data.dir), "bridges");
}

/** What a bridge's command needs: the cards, where bridges go, the registry, and Chips's Node. */
function bridgeDepsOf(
  config: ChipsConfig,
  out: ReturnType<typeof systemConsole>,
  machine: ReturnType<typeof thisMachine>,
  cards: readonly Connector[],
  json = false,
): BridgeDeps {
  const kind = serviceKind(machine.platform);
  return {
    cards,
    bridges: bridgesDir(config),
    registry: machine.environment["CHIPS_NPM_REGISTRY"] || NPM_REGISTRY,
    node: stableNode(RELEASE, machine.environment),
    env: machine.environment,
    console: out,
    json,
    restart: async (label) =>
      kind === undefined ? false : (await run(restartCommand(kind, label, uid()))).ok,
  };
}

/** The cards this Chips carries; none, said, when they can't be read. */
async function cardsHere(
  config: ChipsConfig,
  out: ReturnType<typeof systemConsole>,
): Promise<readonly Connector[]> {
  try {
    return await readCards(config.server.connectors);
  } catch (failure) {
    out.err(failure instanceof Error ? failure.message : String(failure));
    return [];
  }
}

/** The ids `connect` takes, for help: the cards this Chips carries (none when unread), then the adapters. */
async function harnessesHere(command: string, flags: Flags): Promise<string> {
  const environment = processEnvironment();
  const config = configFor(command, flags, thisMachine(environment), environment);
  const cards = config.ok
    ? await readCards(config.value.server.connectors).catch((): readonly Connector[] => [])
    : [];
  return connectIds(cards, HARNESSES);
}

/** A card's harness connected through its bridge, given the link a person made in Chips. */
async function connectCard(
  card: BridgeCard,
  given: string | undefined,
  deps: BridgeDeps,
): Promise<number> {
  // Chips for Mac hands the link over in the environment, so no process list shows it. With none,
  // the bridge joins with the key kept for its harness (ADR 0218's addendum of 24 October 2026).
  return await connectBridge(card, given ?? (deps.env["CHIPS_JOIN_LINK"] || undefined), deps);
}

async function connectTo(
  words: readonly string[],
  flags: Flags,
  out: ReturnType<typeof systemConsole>,
  config: ChipsConfig,
  machine: ReturnType<typeof thisMachine>,
): Promise<number> {
  const [harness, link] = words;
  const cards = await cardsHere(config, out);
  const deps = bridgeDepsOf(config, out, machine, cards, flags.json);
  if (flags.update) return await updateBridges(deps);
  if (harness === undefined) {
    out.out(heading("What this Chips can connect"));
    const adapters = connectable().map((each) => ({
      id: each.id,
      name: each.name,
      line: "your own, given its address and a token once",
    }));
    for (const line of connectableLines(cards, adapters)) out.out(line);
    return 0;
  }
  const card = cards.filter(isBridgeCard).find((each) => each.id === harness);
  if (card !== undefined && !flags.rotate) return await connectCard(card, link, deps);
  if (!knownHarness(harness)) {
    out.err(`Which harness? One of: ${connectIds(cards, HARNESSES)}.`);
    return 1;
  }
  try {
    const result = await connect({
      harness,
      console: out,
      assumeYes: flags.yes,
      rotate: flags.rotate,
      name: flags.name,
      dial: !flags.noDial,
      capabilities: flags.capabilities,
    });
    return result.declined ? 1 : 0;
  } catch (failure) {
    // Two harnesses answering to one word, or a name that is not an adapter: said, not thrown.
    out.err(failure instanceof Error ? failure.message : String(failure));
    return 1;
  }
}

async function disconnectFrom(
  harness: string | undefined,
  flags: Flags,
  out: ReturnType<typeof systemConsole>,
  config: ChipsConfig,
  machine: ReturnType<typeof thisMachine>,
): Promise<number> {
  const cards = harness === undefined ? [] : await cardsHere(config, out);
  const card = cards.filter(isBridgeCard).find((each) => each.id === harness);
  if (card !== undefined) {
    return await disconnectBridge(card, bridgeDepsOf(config, out, machine, cards));
  }
  if (harness === undefined || !knownHarness(harness)) {
    out.err(`Which harness? One of: ${connectIds(cards, HARNESSES)}.`);
    return 1;
  }
  try {
    const result = await disconnect({
      harness,
      console: out,
      assumeYes: flags.yes,
    });
    return result.declined ? 1 : 0;
  } catch (failure) {
    out.err(failure instanceof Error ? failure.message : String(failure));
    return 1;
  }
}

/** Any harness the server knows, by its id, even one this machine has no record of. */
async function removeHarness(
  harness: string | undefined,
  flags: Flags,
  out: ReturnType<typeof systemConsole>,
): Promise<number> {
  if (harness === undefined) {
    out.err("Which harness? Give its name or id: `chips remove <harness>`.");
    return 1;
  }
  try {
    const result = await remove({ harness, console: out, assumeYes: flags.yes });
    return result.declined ? 1 : 0;
  } catch (failure) {
    out.err(failure instanceof Error ? failure.message : String(failure));
    return 1;
  }
}

async function declareFor(
  args: readonly string[],
  out: ReturnType<typeof systemConsole>,
): Promise<number> {
  const [harness, ...capabilities] = args.filter((each) => !each.startsWith("-"));
  if (harness === undefined || capabilities.length === 0) {
    out.err("Say which harness and what it takes: `chips declare <name> new_spaces`.");
    return 1;
  }
  try {
    await declare({ harness, capabilities, console: out });
    return 0;
  } catch (failure) {
    out.err(failure instanceof Error ? failure.message : String(failure));
    return 1;
  }
}

async function conform(
  adapter: string | undefined,
  flags: Flags,
  out: ReturnType<typeof systemConsole>,
): Promise<number> {
  if (adapter === undefined || !CONFORMANCE_ADAPTERS.includes(adapter)) {
    out.err(`Which adapter? One of: ${CONFORMANCE_ADAPTERS.join(", ")}.`);
    return 1;
  }
  const { exitCode } = await conformance({
    adapter,
    console: out,
    json: flags.json,
    port: flags.port,
    timeoutSeconds: flags.timeout,
    capabilities: flags.capabilities,
  });
  return exitCode;
}

/** A workspace out of this database, or into it. Both open it the same way. */
async function transfer(
  command: "export" | "import",
  folder: string,
  databaseUrl: string,
  out: ReturnType<typeof systemConsole>,
): Promise<number> {
  const connection = openDatabase({ databaseUrl });
  const attachmentsRoot = join(dirnameOf(databaseUrl), "attachments");
  try {
    await migrateToLatest(connection.db);
    if (command === "export") {
      const device = loadDevice();
      const workspace = await connection.db.selectFrom("workspaces").selectAll().executeTakeFirst();
      const workspaceId = device?.workspaceId ?? workspace?.id;
      if (workspaceId === undefined) {
        out.err("There is no workspace in this database to export.");
        return 1;
      }
      const snapshot = await exportWorkspace({
        db: connection.db,
        workspaceId,
        at: new Date().toISOString(),
      });
      const { files } = await writeFolder({ snapshot, folder, attachmentsRoot });
      out.out(heading("Exported"));
      out.out(
        facts([
          ["workspace", workspaceId],
          ["events", String(snapshot.tables["events"]?.length ?? 0)],
          ["attachments", String(files)],
          ["folder", folder],
        ]),
      );
      out.out("\n  It carries device keys and token digests. Keep it as you would a password.\n");
      return 0;
    }

    const snapshot = await readFolder(folder);
    // The same store the server uses, so the replay on the way in is the replay live traffic
    // would have done: that is what makes "identical projections" a real check.
    const store = createSqliteEventStore({
      db: connection.db,
      now: () => new Date().toISOString(),
    });
    const result = await importWorkspace({ db: connection.db, snapshot, rebuild: store.rebuild });
    const { files } = await restoreAttachments({ folder, attachmentsRoot });
    out.out(heading("Imported"));
    out.out(
      facts([
        ["workspace", result.workspaceId],
        ["rows", String(result.rows)],
        ["replayed", `${result.replayed} events into the projections`],
        ["attachments", String(files)],
      ]),
    );
    out.out("");
    return 0;
  } catch (failure) {
    out.err(failure instanceof Error ? failure.message : String(failure));
    return 1;
  } finally {
    await connection.close();
  }
}

function dirnameOf(databaseUrl: string): string {
  const path = sqlitePathFrom(databaseUrl);
  return path === ":memory:" ? "." : join(path, "..");
}

/**
 * A failure no command caught, said as its words rather than Node's stack (the onboarding audit,
 * item 6). `CHIPS_DEBUG=true` prints the stack too.
 */
process.exitCode = await main().catch((failure: unknown) => {
  const words = failure instanceof Error ? failure.message : String(failure);
  process.stderr.write(`${words}\n`);
  if (processEnvironment()["CHIPS_DEBUG"] === "true" && failure instanceof Error) {
    process.stderr.write(`${failure.stack ?? ""}\n`);
  }
  return 1;
});
