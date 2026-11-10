/**
 * `chips doctor` — what is wrong, and the one thing to do about it.
 *
 * M2.1's acceptance is that it detects and explains five induced failures. The checks are
 * therefore written as data rather than as a script: each one is a name, a question, and — when
 * the answer is no — a sentence saying what to do and a link to the page that says more. A
 * check that cannot say what to do about its own failure is not a check, it is a log line.
 *
 * Everything it needs is injected: the clock, the fetch, the file reads. That is what lets the
 * test induce a failure rather than describe one.
 */

import { existsSync, statfsSync } from "node:fs";
import { dirname } from "node:path";
import { type Environment, processEnvironment } from "@chipschat/platform";
import { type Connection, nameFor, readConnections } from "../connections.js";
import { type CliDevice, loadDevice, signRequest } from "../device.js";
import {
  adapterFor,
  connectAgain,
  connectionShapeOf,
  type HarnessAdapter,
  harnessAdapters,
} from "../harnesses.js";
import { configHome } from "../home.js";
import { type Keychain, openKeychain } from "../keychain.js";
import { type Console, facts, heading } from "../output.js";
import { type Here, hereChecks } from "./doctor-here.js";

import type { Finding, Health } from "./finding.js";

export type { Finding, Health } from "./finding.js";

export interface DoctorOptions {
  readonly console: Console;
  readonly device?: CliDevice | undefined;
  readonly connections?: readonly Connection[];
  readonly keychain?: Keychain;
  readonly environment?: Environment;
  readonly fetch?: typeof globalThis.fetch;
  readonly now?: () => number;
  /** Free space where the workspace lives, in bytes. Injected so a test can starve it. */
  readonly freeBytes?: () => number | undefined;
  /** The adapters to read; the manifest's, unless a test hands in its own. */
  readonly adapters?: readonly HarnessAdapter[] | undefined;
  /** This machine: its chips, and the server it may run (ADR 0121). Absent, not checked. */
  readonly here?: Here | undefined;
}

const DOCS = "https://chipschat.ai/operate/cli/#chips-doctor";
/** Below this, media processing and the log will start failing rather than slowing down. */
const LOW_DISK_BYTES = 512 * 1024 * 1024;
/** A signature is refused outside this window, so a clock this far out cannot talk at all. */
const CLOCK_SKEW_MS = 60_000;

export async function doctor(options: DoctorOptions): Promise<Finding[]> {
  const environment = options.environment ?? processEnvironment();
  const device = options.device === undefined ? loadDevice() : options.device;
  const connections = options.connections ?? readConnections();
  const keychain = options.keychain ?? openKeychain(environment);
  const call = options.fetch ?? globalThis.fetch;
  const adapters = options.adapters ?? harnessAdapters;

  const findings: Finding[] = [];
  if (options.here !== undefined) findings.push(...(await hereChecks(options.here, call)));
  findings.push(pairingCheck(device, options.here));
  if (device !== undefined) {
    findings.push(await reachableCheck(device, call));
    findings.push(await clockCheck(device, call, options.now ?? Date.now));
  }
  findings.push(
    ...connections.map((each) => tokenCheck(each, nameFor(each, connections), keychain)),
  );
  findings.push(
    ...(await harnessChecks(connections, device, call, options.now ?? Date.now, adapters)),
  );
  findings.push(diskCheck(environment, options.freeBytes));
  return findings;
}

/** What each connected harness has to say for itself: its token, and when it last spoke. */
async function harnessChecks(
  connections: readonly Connection[],
  device: CliDevice | undefined,
  call: typeof fetch,
  now: () => number,
  adapters: readonly HarnessAdapter[],
): Promise<Finding[]> {
  const findings: Finding[] = [];
  for (const connection of connections) {
    // Each harness's checks and fixes go by what to type to mean it and no other (`nameFor`).
    const called = nameFor(connection, connections);
    if (adapterFor(connection.harness, adapters) === undefined) {
      findings.push(unknownAdapterCheck(connection, called, adapters));
    }
    if (device !== undefined) {
      findings.push(await tokenLiveCheck(connection, called, { device, call, now, adapters }));
      const connected = await connectedCheck(connection, called, { device, call });
      if (connected !== undefined) findings.push(connected);
      const agents = await agentsCheck(connection, called, { device, call });
      if (agents !== undefined) findings.push(agents);
    }
  }
  return findings;
}

/**
 * Whether the harness is connected now, by its socket, as the server sees it (ADR 0083's state).
 * Nothing when the server cannot be asked or does not know it; the token check says why.
 */
async function connectedCheck(
  connection: Connection,
  called: string,
  asking: { readonly device: CliDevice; readonly call: typeof fetch },
): Promise<Finding | undefined> {
  const target = "/v1/participants";
  try {
    const response = await asking.call(`${connection.serverUrl}${target}`, {
      headers: signRequest(asking.device, "GET", target),
    });
    if (!response.ok) return undefined;
    const { participants } = (await response.json()) as {
      participants: {
        id: string;
        state?: { connected?: boolean; trouble?: { reason?: string } };
      }[];
    };
    const state = participants.find((each) => each.id === connection.harnessId)?.state;
    if (state?.connected === undefined) return undefined;
    const check = `${called} now`;
    if (!state.connected) {
      return {
        check,
        health: "warn",
        detail: "Not connected. Messages to it wait until it is.",
        fix: `Start ${called}, or check its own log for why it cannot reach Chips.`,
        docs: DOCS,
      };
    }
    const trouble = state.trouble?.reason;
    return trouble === undefined
      ? { check, health: "ok", detail: "Connected." }
      : { check, health: "warn", detail: `Connected, and says: ${trouble}` };
  } catch {
    return undefined;
  }
}

/** How many agents a doctor's line names before it says how many more. */
const AGENTS_NAMED = 5;

/**
 * Who a harness takes part in rooms as (ADR 0087): its agents, from the directory a person reads.
 * Nothing when the server has no agents to say, or cannot be asked; the token check says why.
 */
async function agentsCheck(
  connection: Connection,
  called: string,
  asking: { readonly device: CliDevice; readonly call: typeof fetch },
): Promise<Finding | undefined> {
  const target = "/v1/participants";
  try {
    const response = await asking.call(`${connection.serverUrl}${target}`, {
      headers: signRequest(asking.device, "GET", target),
    });
    if (!response.ok) return undefined;
    const { participants } = (await response.json()) as {
      participants: {
        kind: string;
        display_name: string;
        harness_id?: string;
        lead?: boolean;
        state?: string;
      }[];
    };
    const agents = participants.filter(
      (each) => each.kind === "agent" && each.harness_id === connection.harnessId,
    );
    if (agents.length === 0) return undefined;
    const archived = agents.filter((each) => each.state === "archived").length;
    const named = agents
      .filter((each) => each.state !== "archived")
      .sort((a, b) => Number(b.lead === true) - Number(a.lead === true))
      .slice(0, AGENTS_NAMED)
      .map((each) => (each.lead === true ? `${each.display_name} (Lead)` : each.display_name));
    const more = agents.length - archived - named.length;
    return {
      check: `agents:${called}`,
      health: "ok",
      detail: `${connection.displayName} speaks as ${agents.length} agent${agents.length === 1 ? "" : "s"}${named.length === 0 ? "" : `: ${named.join(", ")}${more > 0 ? ` and ${more} more` : ""}`}${archived === 0 ? "" : `; ${archived} archived`}.`,
    };
  } catch {
    return undefined;
  }
}

/**
 * A record from an older build naming an adapter this one no longer has — `jacobian`, until
 * 12 September 2026, when its adapter moved into Jacobian's own repository (ADR 0051). Its token
 * still works and the checks below still run, reading it as a custom harness; what changes is
 * the words, and that `connect` will not make another under that name.
 */
function unknownAdapterCheck(
  connection: Connection,
  called: string,
  adapters: readonly HarnessAdapter[],
): Finding {
  return {
    check: `adapter:${called}`,
    health: "warn",
    detail: `${connection.displayName} was connected as \`${connection.harness}\`, an adapter this build does not have; it is read as a custom harness.`,
    fix: `Leave it — its token works — or \`chips disconnect ${called}\` withdraws its tokens and forgets it, and \`${connectAgain(connection, adapters)}\` makes it a new one.`,
    docs: DOCS,
  };
}

/**
 * Is there a credential at all? Everything else is downstream of this one. Before `chips up` has
 * run here, the next step for a new owner is `chips up`; after, this machine's own server gives
 * the code to pair with.
 */
function pairingCheck(device: CliDevice | undefined, here: Here | undefined): Finding {
  if (device === undefined) {
    return {
      check: "pairing",
      health: "bad",
      detail: "This machine has no device key.",
      fix:
        here?.upHasRun === true
          ? pairWithTheServerHere(here.local)
          : "Run `chips up` to start Chips on this machine, or `chips pair <code> --server <address>` to use one that runs on another.",
      docs: DOCS,
    };
  }
  return {
    check: "pairing",
    health: "ok",
    detail: `Paired with ${device.serverUrl} as ${device.displayName}.`,
  };
}

/** How this machine pairs with its own server: a code from it, then the code, where it answers. */
function pairWithTheServerHere(local: string): string {
  const server = local === "http://127.0.0.1:4431" ? "" : ` --server ${local}`;
  return `Run \`chips pair --issue\` for a code, then \`chips pair <code>${server}\` with it.`;
}

/** Is the server there, and does it still know this key? */
async function reachableCheck(device: CliDevice, call: typeof fetch): Promise<Finding> {
  try {
    const target = "/v1/participants";
    const response = await call(`${device.serverUrl}${target}`, {
      headers: signRequest(device, "GET", target),
    });
    if (response.status === 401) {
      return {
        check: "credential",
        health: "bad",
        detail: "The server does not accept this device key.",
        fix: "The device was revoked, or the workspace was replaced. Pair again: `chips pair <code>`.",
        docs: DOCS,
      };
    }
    if (!response.ok) {
      return {
        check: "server",
        health: "bad",
        detail: `${device.serverUrl} answered ${response.status}.`,
        fix: "Check the server's log, which says why.",
        docs: DOCS,
      };
    }
    return { check: "server", health: "ok", detail: `${device.serverUrl} answers, and knows us.` };
  } catch (failure) {
    return {
      check: "server",
      health: "bad",
      detail: `${device.serverUrl} is not answering (${failure instanceof Error ? failure.message : String(failure)}).`,
      fix: "Start it with `chips up` on the machine it runs on. If it moved, pair again: `chips pair <code> --server <address>`.",
      docs: DOCS,
    };
  }
}

/**
 * A device signature carries a timestamp and the server refuses one too far out, so a clock an
 * hour wrong looks exactly like an attack. Worth naming before somebody debugs their auth.
 */
async function clockCheck(
  device: CliDevice,
  call: typeof fetch,
  now: () => number,
): Promise<Finding> {
  try {
    const response = await call(`${device.serverUrl}/v1/health`);
    const date = response.headers.get("date");
    if (date === null) {
      return { check: "clock", health: "ok", detail: "The server did not date its answer." };
    }
    const skew = Math.abs(Date.parse(date) - now());
    if (skew > CLOCK_SKEW_MS) {
      return {
        check: "clock",
        health: "bad",
        detail: `This machine's clock is ${Math.round(skew / 1000)} s from the server's.`,
        fix: "Turn on automatic time on both machines; a signature outside a minute is refused.",
        docs: DOCS,
      };
    }
    return { check: "clock", health: "ok", detail: `Within ${Math.round(skew / 1000)} s.` };
  } catch {
    return { check: "clock", health: "warn", detail: "Could not read the server's time." };
  }
}

/** Is the token still where `connect` put it? */
function tokenCheck(connection: Connection, called: string, keychain: Keychain): Finding {
  const secret = keychain.get(connection.account);
  if (secret === undefined) {
    return {
      check: `token:${called}`,
      health: "bad",
      detail: `No token for ${connection.displayName} in the ${connection.secretStore}.`,
      fix: `Run \`chips connect ${called} --rotate\` to mint another.`,
      docs: DOCS,
    };
  }
  return {
    check: `token:${called}`,
    health: "ok",
    detail: `${connection.displayName}'s token is in the ${keychain.kind}.`,
  };
}

/**
 * Does the harness's token still work? This is the check that catches a revoked token, which
 * looks like nothing at all from the harness's side until it tries to speak.
 */
async function tokenLiveCheck(
  connection: Connection,
  called: string,
  asking: {
    readonly device: CliDevice;
    readonly call: typeof fetch;
    readonly now: () => number;
    readonly adapters: readonly HarnessAdapter[];
  },
): Promise<Finding> {
  const { device, call, now, adapters } = asking;
  const target = `/v1/harnesses/${connection.harnessId}/tokens`;
  try {
    const response = await call(`${connection.serverUrl}${target}`, {
      headers: signRequest(device, "GET", target),
    });
    if (!response.ok) {
      return {
        check: `harness:${called}`,
        health: "bad",
        detail: `The server does not know ${connection.displayName} any more.`,
        fix: `Run \`${connectAgain(connection, adapters)}\` to register it again.`,
        docs: DOCS,
      };
    }
    const { tokens } = (await response.json()) as {
      tokens: { revoked_at: string | null; last_used_at?: string | null }[];
    };
    const live = tokens.filter((token) => token.revoked_at === null);
    if (live.length === 0) {
      return {
        check: `harness:${called}`,
        health: "bad",
        detail: `Every token for ${connection.displayName} has been revoked.`,
        fix: `Run \`chips connect ${called} --rotate\` to mint another.`,
        docs: DOCS,
      };
    }
    return spokeCheck(connection, called, live, now, adapters);
  } catch (failure) {
    return {
      check: `harness:${called}`,
      health: "bad",
      detail: `Could not ask about ${connection.displayName} (${failure instanceof Error ? failure.message : String(failure)}).`,
      fix: "Start the server with `chips up` on the machine it runs on.",
      docs: DOCS,
    };
  }
}

/**
 * A live token says nothing about whether the harness holds it. Its last use does: a harness that
 * runs on another machine and has never spoken is a block that was never pasted, which is the
 * failure this is most likely to be asked about.
 */
function spokeCheck(
  connection: Connection,
  called: string,
  live: readonly { last_used_at?: string | null }[],
  now: () => number,
  adapters: readonly HarnessAdapter[],
): Finding {
  const check = `harness:${called}`;
  const count = `${live.length} live token${live.length === 1 ? "" : "s"}`;
  const used = live
    .map((token) => (token.last_used_at == null ? Number.NaN : Date.parse(token.last_used_at)))
    .filter((at) => Number.isFinite(at));
  if (used.length > 0) {
    const minutes = Math.max(0, Math.round((now() - Math.max(...used)) / 60_000));
    const ago = minutes === 0 ? "just now" : `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
    return {
      check,
      health: "ok",
      detail: `${connection.displayName} has ${count}; last spoke ${ago}.`,
    };
  }
  return {
    check,
    health: "warn",
    detail: `${connection.displayName} has ${count}, and has never used one: it has not connected.`,
    fix: connectionShapeOf(connection.harness, adapters).notYetUsed,
    docs: DOCS,
  };
}

/** Room for the log, the attachments and the thumbnails. */
function diskCheck(
  environment: Environment,
  free: (() => number | undefined) | undefined,
): Finding {
  const where = configHome(environment);
  const bytes = free === undefined ? freeSpace(where) : free();
  if (bytes === undefined) {
    return { check: "disk", health: "warn", detail: "Could not read the free space." };
  }
  if (bytes < LOW_DISK_BYTES) {
    return {
      check: "disk",
      health: "bad",
      detail: `${Math.round(bytes / 1024 / 1024)} MB free where Chips writes.`,
      fix: "Free some space: the event log and the attachments both need room to grow.",
      docs: DOCS,
    };
  }
  return {
    check: "disk",
    health: "ok",
    detail: `${Math.round(bytes / 1024 / 1024 / 1024)} GB free.`,
  };
}

/**
 * Bytes available to this user where Chips writes. `statfs`, not `stat`: a filesystem answer.
 * Asked of the nearest folder that exists, since on a fresh machine the config folder does not.
 */
function freeSpace(path: string): number | undefined {
  let at = path;
  while (!existsSync(at) && dirname(at) !== at) at = dirname(at);
  try {
    const stats = statfsSync(at);
    return stats.bavail * stats.bsize;
  } catch {
    return undefined;
  }
}

/**
 * The findings, printed the way a person reads them: what is wrong first, then what is worth
 * knowing. A warning's fix is printed under the failures', and only a failure fails the command.
 */
export function report(out: Console, findings: readonly Finding[]): number {
  const bad = findings.filter((each) => each.health === "bad");
  const warned = findings.filter((each) => each.health === "warn" && each.fix !== undefined);
  out.out(heading(headingOf(bad.length, warned.length)));
  out.out(
    facts(findings.map((finding) => [`${MARK[finding.health]} ${finding.check}`, finding.detail])),
  );
  if (bad.length + warned.length > 0) out.out("");
  for (const finding of [...bad, ...warned]) {
    out.out(`  ${finding.check}: ${finding.fix ?? ""}`);
    if (finding.docs !== undefined) out.out(`    ${finding.docs}`);
  }
  out.out("");
  return bad.length === 0 ? 0 : 1;
}

const MARK: Record<Health, string> = { ok: "·", warn: "!", bad: "x" };

/**
 * The line over the findings: "Everything checks out" only when nothing is worth a word, so it is
 * never heading a warning (the onboarding audit, item 35).
 */
function headingOf(bad: number, warned: number): string {
  if (bad > 0) return `${bad} to fix`;
  if (warned === 0) return "Everything checks out";
  return warned === 1
    ? "Nothing to fix, one thing worth knowing"
    : `Nothing to fix, ${warned} things worth knowing`;
}
