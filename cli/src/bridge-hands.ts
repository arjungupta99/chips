/**
 * The hands `chips serve` gives its server for the bridges in its own data folder
 * (`docs/proposals/bridges-keep-current.md`, A): what is here, a release staged beside the one
 * running, one service switched to it, and the journal told how it went. The server decides which
 * release and when; everything here works on files the CLI already owns.
 */

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { keptJoin } from "@chipschat/harness";
import type { Connector } from "@chipschat/protocol";
import type { BridgeHands, KeptBridge, LocalBridge } from "@chipschat/server";
import {
  bridgesHere,
  checksumsHere,
  noteJournal,
  packageSpec,
  type RestartService,
  readJournal,
  type ServiceFileOf,
  stagedHere,
  stageRelease,
  switchService,
  versionInUse,
} from "./bridges.js";
import { isBridgeCard } from "./cards.js";
import { serviceEnvironment } from "./service.js";

export interface HandsDeps {
  /** The cards this Chips carries, read when the hands are asked: a release may change them. */
  readonly cards: () => Promise<readonly Connector[]>;
  readonly bridges: string;
  readonly registry: string;
  /** The version of the Node the bridges' services run on. */
  readonly nodeVersion: string;
  readonly env: Readonly<Record<string, string | undefined>>;
  /** Starts a kept service again; with `afresh`, from its file loaded again. */
  readonly restart: RestartService;
  /** The file keep wrote for a kept service, by its label (`bridgeServicePath`). */
  readonly serviceFile?: ServiceFileOf | undefined;
  /**
   * How many times this login's service manager has started a kept service (`startsOf` in
   * `service.ts`); none where nothing says, as in a test that gives none.
   */
  readonly starts?: ((label: string) => Promise<number | undefined>) | undefined;
  /**
   * What a harness's own command says of its release, run in the environment its bridge's
   * service runs in (`harnessVersionOf` in `harness-version.ts`); none where it can't be told.
   */
  readonly versionOf?:
    | ((program: string, env: HandsDeps["env"]) => Promise<string | undefined>)
    | undefined;
  readonly fetch?: typeof fetch | undefined;
  /**
   * The harness a card's kept key joined as, for the service of `label`; the SDK's key store, in
   * the environment the service runs in, unless a test says.
   */
  readonly harnessOf?: ((cardName: string, label: string) => string | undefined) | undefined;
}

/** How long the harness a card's key joined as is kept before the key store is asked again. */
export const HARNESS_KEPT_MS = 60 * 60_000;

/**
 * The file a bridge's service was kept with: a launch agent on a Mac, a user unit on Linux, as the
 * SDK's `keepRunning` writes it.
 */
export function bridgeServicePath(
  label: string,
  machine: { readonly platform: string; readonly home: string; readonly env: HandsDeps["env"] },
): string | undefined {
  if (machine.platform === "darwin") {
    return join(machine.home, "Library", "LaunchAgents", `${label}.plist`);
  }
  if (machine.platform !== "linux") return undefined;
  const xdg = machine.env["XDG_CONFIG_HOME"];
  const config = xdg !== undefined && xdg !== "" ? xdg : join(machine.home, ".config");
  return join(config, "systemd", "user", `${label}.service`);
}

/**
 * The environment a kept bridge runs in: the server's, under what its service file sets. The
 * service names the server's address (`CHIPS_URL`) and where its key is (`CHIPS_NO_KEYCHAIN`), so
 * its kept key is found where the bridge itself finds it.
 */
function serviceEnvOf(label: string, env: HandsDeps["env"]): HandsDeps["env"] {
  const path = bridgeServicePath(label, { platform: process.platform, home: homedir(), env });
  let contents: string | undefined;
  try {
    contents = path === undefined ? undefined : readFileSync(path, "utf8");
  } catch {
    contents = undefined;
  }
  return { ...env, ...serviceEnvironment(contents) };
}

export function bridgeHands(deps: HandsDeps): BridgeHands {
  const ask =
    deps.harnessOf ??
    ((name: string, label: string) =>
      keptJoin(name, { env: serviceEnvOf(label, deps.env) }).joined?.harnessId ?? undefined);
  // The key store is the Keychain on a Mac, a process each time: asked once an hour per card.
  const known = new Map<string, { readonly harnessId: string | undefined; readonly at: number }>();
  const harnessOf = (name: string, label: string) => {
    const kept = known.get(label);
    if (kept !== undefined && Date.now() - kept.at < HARNESS_KEPT_MS) return kept.harnessId;
    const harnessId = ask(name, label);
    known.set(label, { harnessId, at: Date.now() });
    return harnessId;
  };
  return {
    list: async () => {
      const cards = (await deps.cards()).filter(isBridgeCard);
      return bridgesHere(deps.bridges).map(({ folder, record }): LocalBridge => {
        const journal = readJournal(folder);
        const naming = cards.find(
          (card) =>
            record.kept[card.id] !== undefined &&
            packageSpec(card.package)?.name === record.package,
        );
        const kept = Object.entries(record.kept).map(([id, each]): KeptBridge => {
          const card = cards.find((one) => one.id === id);
          let harnessId: string | undefined;
          try {
            harnessId = card === undefined ? undefined : harnessOf(card.name, each.label);
          } catch {
            harnessId = undefined;
          }
          return {
            id,
            label: each.label,
            harnessId,
            startedOn: journal.startedOn?.[each.label],
          };
        });
        return {
          package: record.package,
          major: naming === undefined ? undefined : packageSpec(naming.package)?.major,
          inUse: versionInUse(folder),
          recorded: record.version,
          previous: journal.previous,
          staged: stagedHere(folder),
          verified: checksumsHere(folder),
          kept,
          skips: journal.skips ?? {},
          trying: journal.trying,
          proving: journal.proving ?? {},
          last: journal.last ?? {},
        };
      });
    },
    stage: async (pkg, version, integrity) =>
      await stageRelease({
        registry: deps.registry,
        name: pkg,
        version,
        integrity,
        bridges: deps.bridges,
        nodeVersion: deps.nodeVersion,
        fetch: deps.fetch,
      }),
    switchTo: async (pkg, label, version, trying) =>
      await switchService({
        bridges: deps.bridges,
        name: pkg,
        label,
        version,
        trying,
        restart: deps.restart,
        serviceFile: deps.serviceFile,
      }),
    note: async (pkg, change) => await noteJournal(deps.bridges, pkg, change),
    starts: async (label) => await deps.starts?.(label),
    harnessVersion: async (pkg, label) => {
      if (deps.versionOf === undefined) return undefined;
      // The card kept as this service names the harness's own command (`program`).
      const record = bridgesHere(deps.bridges).find((each) => each.record.package === pkg)?.record;
      const id = Object.entries(record?.kept ?? {}).find(([, each]) => each.label === label)?.[0];
      const card = (await deps.cards()).find((each) => each.id === id);
      if (card?.program === undefined) return undefined;
      return await deps.versionOf(card.program, serviceEnvOf(label, deps.env));
    },
  };
}
