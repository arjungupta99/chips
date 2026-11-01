/**
 * `chips connect <harness>` — point a harness at this workspace.
 *
 * M2.1's wording is the shape of this command: "explains what it will change, then writes
 * config, registers the harness, stores the token in the keychain, opens the connection". It says
 * all of it first, in one list, and does none of it until the person agrees — because it is
 * about to make a harness, mint a credential, and edit files under their home directory.
 *
 * The harness is registered through the same route the app uses, with the CLI's own paired
 * credential, so nothing here reaches around authentication into the database. `--rotate` uses
 * the routes ADR 0023 added: issue a new token, write it, then revoke the old, in that order,
 * so the harness is never without one.
 *
 * What a harness needs said or written is its adapter's business, read from the manifest in
 * `harnesses.ts` (ADR 0051) rather than branched on here. This command owns the parts that are
 * the same for every one: the harness, the token, the record, and the words.
 */

import {
  accountFor,
  type Connection,
  findConnection,
  type Harness,
  nameFor,
  readConnections,
  writeConnection,
} from "../connections.js";
import { type CliDevice, call, loadDevice } from "../device.js";
import {
  adapterFor,
  connectable,
  connectionShapeOf,
  type HarnessAdapter,
  type HarnessConnection,
  harnessAdapters,
} from "../harnesses.js";
import { connectionsPath } from "../home.js";
import { type Keychain, openKeychain } from "../keychain.js";
import { type Console, facts, heading } from "../output.js";

export interface ConnectOptions {
  readonly harness: Harness;
  readonly console: Console;
  /** Skip the question. `--yes`, for a script that has already decided. */
  readonly assumeYes?: boolean;
  /** A name for the harness. Defaults to the adapter's own. */
  readonly name?: string | undefined;
  /** Replace the token of a connection that already exists, keeping everything else. */
  readonly rotate?: boolean;
  /**
   * Whether the harness takes the autonomy dial (ADR 0046). On unless said otherwise;
   * `--no-dial` is for a harness whose permission model is its own, which declares nothing so
   * its profile draws no dial that would change nothing it could see.
   */
  readonly dial?: boolean | undefined;
  /**
   * What else it takes (ADR 0046), declared as it is registered: `--capabilities new_spaces,agents`.
   * Said beside the dial, so `chips declare` is not needed straight after.
   */
  readonly capabilities?: readonly string[] | undefined;
  readonly device?: CliDevice | undefined;
  readonly keychain?: Keychain;
  /** Where the record of what was connected lives. Injected by the tests. */
  readonly connectionsFile?: string;
  readonly now?: () => string;
  /** The adapters to read; the manifest's, unless a test hands in its own. */
  readonly adapters?: readonly HarnessAdapter[] | undefined;
}

export interface Connected {
  /** What was written down; the record as it stood when a rotation was declined; none for a new one. */
  readonly connection?: Connection | undefined;
  /** True when the person said no, and nothing was written. */
  readonly declined: boolean;
}

/**
 * The harness on the server. One that works in spaces of its own gets no direct space: it opens
 * them itself as it finds them, so a direct one would sit empty for ever with nothing able to
 * reach it (ADR 0024).
 */
async function register(
  device: CliDevice,
  shape: HarnessConnection,
  name: string,
  takes: readonly string[],
): Promise<{ harness_id: string; display_name: string; token: string; space_id?: string }> {
  return await call(device, "POST", "/v1/harnesses", {
    name,
    capabilities: takes,
    ...(shape.opensItsOwnSpaces ? { open_direct_space: false } : {}),
  });
}

/** What it is registered as taking: the adapter's dial unless `--no-dial`, and `--capabilities`. */
function takesOf(
  shape: HarnessConnection,
  dial: boolean,
  capabilities: readonly string[] | undefined,
): string[] {
  return [...new Set([...(dial ? shape.capabilities : []), ...(capabilities ?? [])])];
}

/**
 * The one extra line when a harness of this name is connected from here already: this makes a
 * second one beside it, and never touches the first. `--rotate` is what renews the first.
 */
function alongside(name: string, connections: readonly Connection[]): string[] {
  const lower = name.toLowerCase();
  const same = connections.find((each) => each.displayName.toLowerCase() === lower);
  if (same === undefined) return [];
  return [
    `make a second harness beside the \u201c${same.displayName}\u201d connected earlier (${same.harnessId}), which stays as it is; \`--rotate\` renews that one instead`,
  ];
}

/** Everything that is about to happen, said first, and the question. False when they say no. */
async function agreed(input: {
  options: ConnectOptions;
  device: CliDevice;
  keychain: Keychain;
  connections: readonly Connection[];
  adapter: HarnessAdapter;
  shape: HarnessConnection;
  name: string;
  dial: boolean;
}): Promise<boolean> {
  const { options, device, keychain, connections, adapter, shape, name, dial } = input;
  const out = options.console;
  explain(out, `Connect ${adapter.name}`, [
    `register a harness called \u201c${name}\u201d in ${device.workspaceId}`,
    `mint a token for it and put it ${where(keychain)}`,
    ...shape.changes,
    ...(dial ? [] : ["declare no autonomy dial: its permission model is its own (--no-dial)"]),
    ...((options.capabilities ?? []).length === 0
      ? []
      : [`declare that it takes ${(options.capabilities ?? []).join(", ")}`]),
    ...alongside(name, connections),
  ]);
  if (options.assumeYes === true || (await out.confirm("  Go ahead?"))) return true;
  out.out("\n  Nothing was changed.\n");
  return false;
}

/** Say what is about to happen to somebody's machine, before any of it happens. */
function explain(out: Console, title: string, changes: readonly string[]): void {
  out.out(heading(title));
  out.out("\n  This will:\n");
  for (const change of changes) out.out(`    \u00b7 ${change}`);
  out.out("");
}

function where(keychain: Keychain): string {
  return keychain.kind === "keychain"
    ? "in the login keychain"
    : "in the config directory, owner-only";
}

/** The adapter `connect` makes a harness with; an id the manifest cannot make is refused by name. */
function connectableAdapter(
  harness: Harness,
  adapters: readonly HarnessAdapter[],
): HarnessAdapter & { readonly connection: HarnessConnection } {
  const adapter = adapterFor(harness, adapters);
  if (adapter?.connection === undefined) {
    const known = connectable(adapters).map((each) => each.id);
    throw new Error(`No such harness: ${harness}. One of: ${known.join(", ")}.`);
  }
  return { ...adapter, connection: adapter.connection };
}

export async function connect(options: ConnectOptions): Promise<Connected> {
  const { console: out, harness } = options;
  const adapters = options.adapters ?? harnessAdapters;
  const device = options.device ?? loadDevice();
  if (device === undefined) {
    throw new Error(
      "This machine is not paired yet. Run `chips up` to start Chips here, or `chips pair <code>` with a code from the Chips you use.",
    );
  }
  const keychain = options.keychain ?? openKeychain();
  const file = options.connectionsFile ?? connectionsPath();
  const connections = readConnections(file);

  if (options.rotate === true) {
    // The one to renew: named by `--name`, or by the word given, which may be its name.
    const existing = findConnection(connections, options.name ?? harness);
    return await rotateExisting({ options, adapters, device, keychain, existing, file });
  }

  const adapter = connectableAdapter(harness, adapters);
  const shape = adapter.connection;
  const name = options.name ?? adapter.name;
  const dial = options.dial !== false;

  if (!(await agreed({ options, device, keychain, connections, adapter, shape, name, dial }))) {
    return { declined: true };
  }

  const added = await register(device, shape, name, takesOf(shape, dial, options.capabilities));

  const account = accountFor(harness, added.harness_id);
  keychain.set(account, added.token);

  const connection: Connection = {
    harness,
    harnessId: added.harness_id,
    displayName: added.display_name,
    serverUrl: device.serverUrl,
    ...(added.space_id === undefined ? {} : { spaceId: added.space_id }),
    account,
    secretStore: keychain.kind,
    wrote: [],
    connectedAt: (options.now ?? (() => new Date().toISOString()))(),
  };
  const all = writeConnection(connection, file);

  say(out, adapter, shape, connection, keychain, added.token, nameFor(connection, all));
  return { connection, declined: false };
}

/** What was done, and the one thing left to do about it. */
function say(
  out: Console,
  adapter: HarnessAdapter,
  shape: HarnessConnection,
  connection: Connection,
  keychain: Keychain,
  token: string,
  called: string,
): void {
  out.out(heading(`${adapter.name} is connected`));
  out.out(
    facts([
      ["harness", `${connection.displayName} (${connection.harnessId})`],
      ...(connection.spaceId === undefined
        ? []
        : ([["space", connection.spaceId]] as [string, string][])),
      ["token", where(keychain)],
      ["server", connection.serverUrl],
    ]),
  );
  shape.say(out, {
    url: connection.serverUrl,
    harnessId: connection.harnessId,
    token,
    spaceId: connection.spaceId,
  });
  out.out(`  Undo with    chips disconnect ${called}`);
  out.out("\n  `chips doctor` checks it end to end.\n");
}

/**
 * `--rotate` needs a record to rotate. A record from an older build — an adapter this build does
 * not have — rotates like a custom harness's: its token is a token, and the new one is said as the
 * four lines every harness is given.
 */
async function rotateExisting(input: {
  readonly options: ConnectOptions;
  readonly adapters: readonly HarnessAdapter[];
  readonly device: CliDevice;
  readonly keychain: Keychain;
  readonly existing: Connection | undefined;
  readonly file: string;
}): Promise<Connected> {
  const { options, adapters, existing } = input;
  if (existing === undefined) {
    const adapter = adapterFor(options.harness, adapters);
    throw new Error(
      `Nothing to rotate: ${options.name ?? adapter?.name ?? options.harness} is not connected yet.`,
    );
  }
  return await rotate({
    console: options.console,
    assumeYes: options.assumeYes,
    now: options.now,
    device: input.device,
    keychain: input.keychain,
    existing,
    file: input.file,
    name: existing.displayName,
    // The shape of the adapter it was made with, found by its record and not by the word given.
    shape: connectionShapeOf(existing.harness, adapters),
  });
}

/**
 * A new token before the old one goes (ADR 0023). The order matters: the harness keeps working
 * throughout, and a rotation that fails halfway leaves it connected rather than mute.
 */
async function rotate(input: {
  readonly console: Console;
  readonly assumeYes?: boolean | undefined;
  readonly device: CliDevice;
  readonly keychain: Keychain;
  readonly existing: Connection;
  readonly file: string;
  readonly now?: (() => string) | undefined;
  readonly name: string;
  readonly shape: HarnessConnection;
}): Promise<Connected> {
  const { console: out, device, keychain, existing } = input;
  explain(out, `Rotate ${input.name}'s token`, [
    "mint a new token and store it in place of the old one",
    "revoke the old token, which closes any socket it is holding",
  ]);
  if (input.assumeYes !== true && !(await out.confirm("  Go ahead?"))) {
    out.out("\n  Nothing was changed.\n");
    return { connection: existing, declined: true };
  }

  const before = await call<{ tokens: { id: string; revoked_at: string | null }[] }>(
    device,
    "GET",
    `/v1/harnesses/${existing.harnessId}/tokens`,
  );
  const issued = await call<{ token_id: string; token: string }>(
    device,
    "POST",
    `/v1/harnesses/${existing.harnessId}/tokens`,
    { name: existing.harness },
  );
  keychain.set(existing.account, issued.token);

  let revoked = 0;
  for (const token of before.tokens) {
    if (token.revoked_at !== null || token.id === issued.token_id) continue;
    await call(device, "DELETE", `/v1/harnesses/${existing.harnessId}/tokens/${token.id}`);
    revoked += 1;
  }

  const connection: Connection = {
    ...existing,
    secretStore: keychain.kind,
    connectedAt: (input.now ?? (() => new Date().toISOString()))(),
  };
  writeConnection(connection, input.file);
  out.out(heading("Rotated"));
  out.out(
    facts([
      ["harness", `${connection.displayName} (${connection.harnessId})`],
      ["new token", where(keychain)],
      ["withdrawn", `${revoked} older token${revoked === 1 ? "" : "s"}`],
    ]),
  );
  // The old token was in the harness's own environment or config; the new one has to get there
  // the same way.
  input.shape.say(out, {
    url: connection.serverUrl,
    harnessId: connection.harnessId,
    token: issued.token,
    spaceId: connection.spaceId,
  });
  out.out("");
  return { connection, declined: false };
}
