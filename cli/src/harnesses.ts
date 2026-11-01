/**
 * The adapters `chips` knows by name, as data the commands read (ADR 0051). `connect`,
 * `disconnect` and `doctor` take a harness's id and look up here what to register, what to say
 * and what to leave; `conformance` takes an adapter's id and looks up what the kit can bring up
 * by itself. A harness whose adapter lives in its own repository — Jacobian's does, beside its
 * Telegram one — is `custom` here: the four lines are all Chips hands it, and no command names it.
 *
 * Adding a first-party adapter is one descriptor and one array element; the commands do not
 * change, which `harnesses.test.ts` proves with an adapter that exists nowhere else.
 */

import { customSubject, type Subject } from "@chipschat/conformance";
import { HARNESS_CAPABILITIES } from "@chipschat/protocol";
import { type HarnessAddress, sayCustom } from "./commands/custom.js";
import { type Connection, typed } from "./connections.js";
import type { Console } from "./output.js";

/** How `connect` registers a harness of this kind, what it says, and what `disconnect` leaves. */
export interface HarnessConnection {
  /** What its manifest declares at registration (ADR 0046). `--no-dial` empties it. */
  readonly capabilities: readonly string[];
  /** Registered with no direct space: it opens its own as it finds them (ADR 0024). */
  readonly opensItsOwnSpaces: boolean;
  /** What `connect` will have written or printed for it, named before anything is. */
  readonly changes: readonly string[];
  /** The address and the token, said once, and again on `--rotate`. */
  readonly say: (out: Console, address: HarnessAddress) => void;
  /** What `disconnect` leaves for the person to take out by hand, if anything. */
  readonly leaves: readonly string[];
  /** What `doctor` says to do when the harness has never used its token. */
  readonly notYetUsed: string;
}

/** What a conformance subject is told when it is made. */
export interface SubjectContext {
  /** Progress, a line at a time, for a report that wants to say what the harness did. */
  readonly log?: ((line: string) => void) | undefined;
}

export type SubjectFactory = (context: SubjectContext) => Subject;

export interface HarnessAdapter {
  /** `custom`: the word on the command line. */
  readonly id: string;
  readonly name: string;
  /** Absent for an exhibit nobody connects by hand. */
  readonly connection?: HarnessConnection | undefined;
  /** What the kit drives; absent for a harness this repository cannot bring up itself. */
  readonly subject?: SubjectFactory | undefined;
}

const CUSTOM_CONNECTION: HarnessConnection = {
  // A harness on the SDK reads the level and the rules Chips sends and asks accordingly, so it
  // takes the dial. One with a permission model of its own says `--no-dial`.
  capabilities: [HARNESS_CAPABILITIES.autonomy],
  opensItsOwnSpaces: false,
  changes: ["print its address and token once, for the harness's own environment"],
  say: sayCustom,
  leaves: [],
  notYetUsed: "Start the harness with its token.",
};

/** Any harness somebody wrote and runs: a token and four lines. */
export const customAdapter: HarnessAdapter = {
  id: "custom",
  name: "Custom harness",
  connection: CUSTOM_CONNECTION,
  subject: () => customSubject(),
};

export const harnessAdapters: readonly HarnessAdapter[] = [customAdapter];

export function adapterFor(
  id: string,
  adapters: readonly HarnessAdapter[] = harnessAdapters,
): HarnessAdapter | undefined {
  return adapters.find((each) => each.id === id);
}

/**
 * The command that makes this harness again: its adapter's, or custom's when this build has none,
 * with its name when that is not the adapter's own, or `chips connect custom` would come back as
 * "Custom harness".
 */
export function connectAgain(
  connection: Connection,
  adapters: readonly HarnessAdapter[] = harnessAdapters,
): string {
  const adapter = adapterFor(connection.harness, adapters) ?? customAdapter;
  return connection.displayName === adapter.name
    ? `chips connect ${adapter.id}`
    : `chips connect ${adapter.id} --name ${typed(connection.displayName)}`;
}

/** The adapters `connect` and `disconnect` take, in the manifest's order. */
export function connectable(
  adapters: readonly HarnessAdapter[] = harnessAdapters,
): readonly HarnessAdapter[] {
  return adapters.filter((each) => each.connection !== undefined);
}

/** The adapters `conformance` takes, in the manifest's order. */
export function conformable(
  adapters: readonly HarnessAdapter[] = harnessAdapters,
): readonly HarnessAdapter[] {
  return adapters.filter((each) => each.subject !== undefined);
}

/**
 * How to read a record: its adapter's shape, or a custom harness's when the record names an
 * adapter this build does not have — which every harness is on the wire, so its token can still
 * be rotated and its connection still taken back.
 */
export function connectionShapeOf(
  id: string,
  adapters: readonly HarnessAdapter[] = harnessAdapters,
): HarnessConnection {
  return adapterFor(id, adapters)?.connection ?? CUSTOM_CONNECTION;
}
