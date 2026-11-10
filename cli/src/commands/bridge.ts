/**
 * A harness connected by its card's bridge (ADR 0218): `CHIPS_JOIN_LINK='<link>' chips connect <id>`,
 * `chips disconnect <id>`, `chips connect --update`, and the bridges `chips uninstall` takes away.
 *
 * Connecting fetches the newest release of the card's major (`bridges.ts`), then runs it on
 * Chips's own Node with `--keep`: the bridge checks its harness, joins with the link, and keeps
 * itself running from login, as `npm run keep` does in its checkout. The link travels in
 * `CHIPS_JOIN_LINK`, never as a word on the command line, where a service or `ps` would keep it.
 * With no link, the bridge joins with the key already kept for its harness, so a harness first
 * connected by hand moves onto the bridge from npm with its rooms (`chips connect <id>`).
 * With `--json` each step is a line of JSON, for a sheet that ticks them off; otherwise the bridge
 * says its own sentences.
 */

import { existsSync, rmSync } from "node:fs";
import { delimiter, dirname, join } from "node:path";
import { keptJoin } from "@chipschat/harness";
import { type Connector, parseJoinLink } from "@chipschat/protocol";
import {
  BridgeError,
  type BridgeRecord,
  type BridgeStep,
  bridgeFolder,
  bridgeMain,
  bridgesHere,
  type Fetched,
  fetchBridge,
  type KeptCard,
  type PackageSpec,
  packageSpec,
  readRecord,
  runBridge,
  writeRecord,
} from "../bridges.js";
import { type BridgeCard, isBridgeCard } from "../cards.js";
import type { Console } from "../output.js";

export interface BridgeDeps {
  /** The cards this Chips carries. */
  readonly cards: readonly Connector[];
  /** `<data>/bridges`, where each bridge is unpacked. */
  readonly bridges: string;
  /** The npm registry: `CHIPS_NPM_REGISTRY`, else npm's own. */
  readonly registry: string;
  /**
   * The Node a bridge runs on and is kept on: the install's `current` one, which upgrades keep; from
   * a checkout, the PATH's, a package manager's link that its upgrades keep.
   */
  readonly node: string;
  /** The shell's environment, which the bridge runs in. */
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly console: Console;
  /** A line of JSON for each step, and nothing else on standard output. */
  readonly json?: boolean | undefined;
  readonly fetch?: typeof fetch | undefined;
  /** Starts a kept service again (`launchctl kickstart -k`, `systemctl --user restart`). */
  readonly restart?: ((label: string) => Promise<boolean>) | undefined;
}

/** A bridge's step, said: a line of JSON with `--json`, else nothing (the bridge has its words). */
function stepSaid(deps: BridgeDeps, step: BridgeStep): void {
  if (deps.json === true) deps.console.out(JSON.stringify(step));
}

/**
 * A step's few words in a terminal, once each: what a sheet shows under its steps, which a bridge
 * says only as steps (`Getting what Codex needs from npm, a large download`). Without them a
 * terminal sat silent through a download of minutes (the onboarding audit, Part 2, item 7).
 */
function detailSaid(deps: BridgeDeps, said: Set<string>): (step: BridgeStep) => void {
  return (step) => {
    const detail = step["detail"];
    if (deps.json === true || typeof detail !== "string" || detail === "" || said.has(detail)) {
      return;
    }
    said.add(detail);
    deps.console.out(`  ${detail}${/[.…!?]$/.test(detail) ? "" : "…"}`);
  };
}

/** A failure Chips found before the bridge could say anything, said either way. */
function failed(deps: BridgeDeps, sentence: string, code = 1): number {
  if (deps.json === true) deps.console.out(JSON.stringify({ step: "failed", sentence, code }));
  else deps.console.err(`  ${sentence}`);
  return code;
}

/** The PATH with `folder` first and nowhere else on it. */
function pathWith(folder: string, path: string | undefined): string {
  const rest = (path ?? "").split(delimiter).filter((each) => each !== "" && each !== folder);
  return [folder, ...rest].join(delimiter);
}

/**
 * The npm an install carries beside its Node (ADR 0288), which the ACP bridge fetches an agent's
 * adapter with on a machine that has none. A checkout's Node has none beside it, and goes without.
 */
function carriedNpm(node: string): Record<string, string> {
  const npm = join(dirname(node), "npm", "bin", "npm-cli.js");
  return existsSync(npm) ? { CHIPS_NPM: npm } : {};
}

/**
 * What the bridge runs in: the shell's environment, Chips's Node first on its PATH (an agent run
 * as `#!/usr/bin/env node` finds it), and, when it joins, what keep is handed for this run alone:
 * the link where there is one, and the npm it may need. Without a link it joins with the key it kept.
 */
function runIn(
  deps: BridgeDeps,
  card: BridgeCard,
  joining?: { readonly link: string | undefined },
): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [name, value] of Object.entries(deps.env)) if (value !== undefined) env[name] = value;
  env["PATH"] = pathWith(dirname(deps.node), deps.env["PATH"]);
  // Chips's own check, below: the bridge and the service it keeps have no use for it.
  delete env["CHIPS_CARD_NAME"];
  if (joining === undefined) return env;
  delete env["CHIPS_JOIN_LINK"];
  return {
    ...env,
    ...(joining.link === undefined ? {} : { CHIPS_JOIN_LINK: joining.link }),
    CHIPS_NODE: deps.node,
    ...carriedNpm(deps.node),
    CHIPS_STOP_COMMAND: `chips disconnect ${card.id}`,
    CHIPS_STEPS: "json",
  };
}

/** The joining step's few words when the bridge joins with the key it kept, with no link. */
export const KEY_KEPT = "With the key it already has";

/**
 * Why the card's bridge can't be run, or nothing: a name that isn't this card's, a link Chips
 * didn't make, or, with no link, no key kept for its harness at the server it would find. Said
 * before anything is downloaded.
 */
function refusal(card: BridgeCard, link: string | undefined, deps: BridgeDeps): string | undefined {
  // Chips for Mac says what its sheet called the card, which the workspace's server named. What
  // runs is this Chips's own card of that id, so a workspace can't show one harness and connect
  // another (SEC-51).
  const shown = deps.env["CHIPS_CARD_NAME"];
  if (shown !== undefined && shown !== card.name) {
    return `This workspace's card says ${shown}, but ${card.id} here connects ${card.name}, so Chips didn't connect it.`;
  }
  if (link !== undefined) {
    return parseJoinLink(link) === undefined
      ? `That isn't a link Chips made. In Chips, open Connect a harness, then ${card.name}, and copy its line again.`
      : undefined;
  }
  const kept = keptJoin(card.name, { env: deps.env });
  if (kept.joined !== undefined) return undefined;
  const copy = `In Chips, open Connect a harness, then ${card.name}, and copy its line.`;
  return kept.url === undefined
    ? `Chips isn't set here (CHIPS_URL, or chips up on this machine), so connecting ${card.name} needs a link. ${copy}`
    : `No key is kept here for ${card.name} at ${kept.url}, so connecting it needs a link. ${copy}`;
}

/** The bridge's own words, through: its log to standard error when only steps go to standard output. */
function passOn(deps: BridgeDeps): (stream: "out" | "err", line: string) => void {
  return (stream, line) =>
    stream === "out" && deps.json !== true ? deps.console.out(line) : deps.console.err(line);
}

function specOf(card: BridgeCard): PackageSpec {
  const spec = packageSpec(card.package);
  if (spec === undefined)
    throw new BridgeError(`${card.name}'s card names no package Chips can fetch.`);
  return spec;
}

/**
 * A bridge's words for where it stopped, for a sheet (ADR 0218, phase 5): a few words under the
 * step, its sentence, what to do, and a line to copy. Only these, and only as words.
 */
function stopWords(step: BridgeStep | undefined): Record<string, string> {
  const words: Record<string, string> = {};
  for (const name of ["detail", "says", "doing", "copy"]) {
    const said = step?.[name];
    if (typeof said === "string" && said.trim() !== "") words[name] = said.slice(0, 400);
  }
  return words;
}

/** The newest release of the card's major, here, with each step said. */
async function fetched(card: BridgeCard, deps: BridgeDeps): Promise<Fetched> {
  const spec = specOf(card);
  let release = "";
  const got = await fetchBridge({
    registry: deps.registry,
    spec,
    bridges: deps.bridges,
    fetch: deps.fetch,
    onRelease: (version, reused) => {
      release = version;
      stepSaid(deps, { step: "downloading", package: spec.name, version, reused });
      if (deps.json === true) return;
      deps.console.out(
        reused
          ? `  ${spec.name} ${version} is on this machine already.`
          : `  Downloading ${spec.name} ${version}…`,
      );
    },
    // How far the download is, for a sheet's kilobytes: only with `--json`.
    onProgress: (received, total) =>
      stepSaid(deps, {
        step: "downloading",
        package: spec.name,
        version: release,
        received,
        ...(total === undefined ? {} : { total }),
      }),
  });
  if (!got.reused && deps.json !== true) {
    deps.console.out("  ✓ It matches the registry's checksum.");
  }
  return got;
}

/**
 * `CHIPS_JOIN_LINK='<link>' chips connect <id>`: the card's bridge fetched, run with the link, and kept
 * running.
 * With no link, it joins with the key kept for its harness, and its joining step says so.
 */
export async function connectBridge(
  card: BridgeCard,
  link: string | undefined,
  deps: BridgeDeps,
): Promise<number> {
  const refused = refusal(card, link, deps);
  if (refused !== undefined) return failed(deps, refused);
  let got: Fetched;
  let main: string;
  try {
    got = await fetched(card, deps);
    main = bridgeMain(got.folder);
  } catch (error) {
    return failed(deps, error instanceof Error ? error.message : String(error));
  }
  stepSaid(deps, { step: "checking" });
  let label: string | undefined;
  let stopped: BridgeStep | undefined;
  const inTerminal = detailSaid(deps, new Set());
  const ran = await runBridge({
    node: deps.node,
    main,
    words: [...(card.args ?? []), "--keep"],
    env: runIn(deps, card, { link }),
    onStep: (step) => {
      if (step.step === "keeping" && typeof step["label"] === "string") label = step["label"];
      // Where it stopped, in its words for a sheet: said once, with its sentence, as it ends.
      if (step.step === "failed") {
        stopped = step;
        return;
      }
      const shown =
        link === undefined && step.step === "joining" ? { ...step, detail: KEY_KEPT } : step;
      stepSaid(deps, shown);
      inTerminal(shown);
    },
    onLine: passOn(deps),
  });
  if (ran.code !== 0) {
    // The bridge said its sentence already; `--json` carries it in the step.
    if (deps.json === true) {
      stepSaid(deps, { ...stopWords(stopped), step: "failed", sentence: ran.said, code: ran.code });
    }
    return ran.code;
  }
  const record = readRecord(got.folder);
  if (label !== undefined && record !== undefined) {
    writeRecord(got.folder, {
      ...record,
      kept: { ...record.kept, [card.id]: { label, args: card.args ?? [] } },
    });
  }
  stepSaid(deps, { step: "connected" });
  return 0;
}

/** The names of the other cards kept running through a bridge, as a person reads them. */
function namesOf(ids: readonly string[], cards: readonly Connector[]): string {
  return ids.map((id) => cards.find((each) => each.id === id)?.name ?? id).join(" and ");
}

/**
 * `chips disconnect <id>`: the bridge's own `--stop` for this card, then its download gone once no
 * other card keeps a service running on it (Claude Code and Codex share one).
 */
export async function disconnectBridge(card: BridgeCard, deps: BridgeDeps): Promise<number> {
  const out = deps.console;
  let folder: string;
  try {
    folder = bridgeFolder(deps.bridges, specOf(card).name);
  } catch (error) {
    out.err(`  ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
  const record = readRecord(folder);
  if (record === undefined) {
    out.out(`  ${card.name}'s bridge isn't on this machine, so there is nothing to stop.`);
    return 0;
  }
  let code: number;
  try {
    const ran = await runBridge({
      node: deps.node,
      main: bridgeMain(folder),
      words: [...(card.args ?? []), "--stop"],
      env: runIn(deps, card),
      onStep: () => undefined,
      onLine: passOn(deps),
    });
    code = ran.code;
  } catch (error) {
    out.err(`  ${error instanceof Error ? error.message : String(error)}`);
    code = 1;
  }
  const { [card.id]: _stopped, ...kept } = record.kept;
  const others = Object.keys(kept);
  if (others.length > 0) {
    writeRecord(folder, { ...record, kept });
    out.out(`  ${record.package} stays: ${namesOf(others, deps.cards)} still runs on it.`);
  } else {
    rmSync(folder, { recursive: true, force: true });
    out.out(`  ✓ Removed ${record.package} ${record.version} from this machine.`);
  }
  return code;
}

/**
 * `chips connect --update`, which `install.sh` runs after an upgrade: each bridge a card keeps
 * running here brought to the newest release of the major its card names now, and each of its
 * services started again, on the Node the upgrade put in place.
 */
export async function updateBridges(deps: BridgeDeps): Promise<number> {
  let code = 0;
  for (const { record } of bridgesHere(deps.bridges)) {
    const kept = Object.values(record.kept);
    if (kept.length === 0) continue;
    const updated = await updateOne(record, deps);
    const started = updated === "unnamed" ? true : await startedAgain(kept, deps);
    if (updated === "failed" || !started) code = 1;
  }
  return code;
}

/** One bridge brought to the newest release of the major its card names now. */
async function updateOne(
  record: BridgeRecord,
  deps: BridgeDeps,
): Promise<"updated" | "unnamed" | "failed"> {
  const out = deps.console;
  const ids = Object.keys(record.kept);
  const card = deps.cards
    .filter(isBridgeCard)
    .find((each) => ids.includes(each.id) && packageSpec(each.package)?.name === record.package);
  if (card === undefined) {
    out.out(
      `  ${record.package} ${record.version}: no card here names it now, so it stays as it is.`,
    );
    return "unnamed";
  }
  try {
    const got = await fetchBridge({
      registry: deps.registry,
      spec: specOf(card),
      bridges: deps.bridges,
      fetch: deps.fetch,
    });
    out.out(
      got.reused
        ? `  ${record.package} ${got.version} is the newest of its major.`
        : `  ✓ ${record.package} ${record.version} is now ${got.version}.`,
    );
    return "updated";
  } catch (error) {
    out.err(`  ${error instanceof Error ? error.message : String(error)}`);
    return "failed";
  }
}

/** Each service keep wrote for a bridge, started again; whether they all were. */
async function startedAgain(kept: readonly KeptCard[], deps: BridgeDeps): Promise<boolean> {
  let all = true;
  for (const { label } of kept) {
    if ((await deps.restart?.(label)) === true) {
      deps.console.out(`  ✓ Started ${label} again.`);
    } else {
      deps.console.err(
        `  ${label} didn't start again. \`chips connect\` with a new link sets it up afresh.`,
      );
      all = false;
    }
  }
  return all;
}

/** Every bridge kept running here stopped by its own `--stop`, for `chips uninstall`. */
export async function stopEveryBridge(deps: Omit<BridgeDeps, "cards">): Promise<void> {
  for (const { folder, record } of bridgesHere(deps.bridges)) {
    for (const kept of Object.values(record.kept)) {
      try {
        await runBridge({
          node: deps.node,
          main: bridgeMain(folder),
          words: [...kept.args, "--stop"],
          env: { ...deps.env, PATH: pathWith(dirname(deps.node), deps.env["PATH"]) },
          onStep: () => undefined,
          onLine: (_stream, line) => deps.console.out(line),
        });
      } catch (error) {
        deps.console.err(`  ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }
}
