/**
 * `chips remove <harness>` — take a harness out of the workspace.
 *
 * `disconnect` takes back this machine's end and keeps the harness; this takes the harness out
 * for everyone. The server withdraws every token it has, so its sockets close, and marks it
 * removed: it leaves the lists a harness is picked from, its home rooms stop being homes, and the
 * log records it. What it said stays, under its name, because that is the workspace's history.
 *
 * The server goes first. A refusal leaves this machine as it was, so the command can be run again
 * once whatever stopped it is settled. Removing a harness that is removed already is not an
 * error, so one removed from the app can still be cleaned off this machine this way. A harness
 * connected from somewhere else is removed by its id, with nothing here to forget.
 */

import { type Connection, findConnection, readConnections } from "../connections.js";
import { type CliDevice, call, loadDevice } from "../device.js";
import { connectionsPath } from "../home.js";
import type { Keychain } from "../keychain.js";
import { type Console, facts, heading } from "../output.js";
import { forgetConnection } from "./disconnect.js";

export interface RemoveOptions {
  /** A harness id, a harness's name, or the adapter this machine connected it with (`custom`). */
  readonly harness: string;
  readonly console: Console;
  readonly assumeYes?: boolean;
  readonly device?: CliDevice | undefined;
  readonly keychain?: Keychain;
  readonly connectionsFile?: string;
}

export type Removed =
  | { readonly declined: true }
  | {
      readonly declined: false;
      readonly harnessId: string;
      /** The server had removed it before this call, from here or from an app. */
      readonly alreadyRemoved: boolean;
      /** How many tokens the server withdrew. None when it was removed already. */
      readonly tokensRevoked: number;
      /** Whether this machine had a record of it, and forgot it and its secret. */
      readonly forgotten: boolean;
    };

/** What `DELETE /v1/harnesses/:id` answers. */
interface RemovedAnswer {
  readonly harness_id: string;
  readonly removed_at: string;
  readonly tokens_revoked: number;
  readonly sockets_closed: number;
  readonly already_removed: boolean;
  readonly event_id?: string;
}

/** The harness a word means: the record this machine keeps of it, or an id with none here. */
interface Target {
  readonly harnessId: string;
  readonly name: string;
  readonly connection: Connection | undefined;
}

function targetOf(wanted: string, connectionsFile: string): Target {
  const connection = findConnection(readConnections(connectionsFile), wanted);
  if (connection !== undefined) {
    return { harnessId: connection.harnessId, name: connection.displayName, connection };
  }
  if (wanted.startsWith("hrn_")) return { harnessId: wanted, name: wanted, connection: undefined };
  throw new Error(`${wanted} is not connected here. Give its id instead: \`chips remove hrn_…\`.`);
}

export async function remove(options: RemoveOptions): Promise<Removed> {
  const { console: out } = options;
  const file = options.connectionsFile ?? connectionsPath();
  const target = targetOf(options.harness, file);
  const device = options.device ?? loadDevice();
  if (device === undefined) {
    throw new Error("This machine is not paired with a server: `chips pair <code>` first.");
  }

  if (!(await agreed(target, options))) {
    out.out("\n  Nothing was changed.\n");
    return { declined: true };
  }

  // A refusal is thrown in the server's words, before anything here is touched.
  const answer = await call<RemovedAnswer>(device, "DELETE", `/v1/harnesses/${target.harnessId}`);
  const { connection } = target;
  if (connection !== undefined) {
    forgetConnection(connection, { keychain: options.keychain, connectionsFile: file });
  }

  sayRemoved(out, target, answer);
  return {
    declined: false,
    harnessId: target.harnessId,
    alreadyRemoved: answer.already_removed,
    tokensRevoked: answer.tokens_revoked,
    forgotten: connection !== undefined,
  };
}

/** Say what removing it will do, and ask. `--yes` has answered already. */
async function agreed(target: Target, options: RemoveOptions): Promise<boolean> {
  const out = options.console;
  out.out(heading(`Remove ${target.name}`));
  out.out("\n  This will:\n");
  for (const change of [
    "withdraw every token it has, so nothing can speak for it",
    "remove it from the workspace: it leaves Harnesses, the + and add-a-member",
    "make its home spaces ordinary spaces, so they can be archived or deleted",
    ...(target.connection === undefined
      ? []
      : ["forget the secret in the keychain and the record of the connection"]),
    `keep what ${target.name} said, under its name`,
  ]) {
    out.out(`    · ${change}`);
  }
  out.out("");
  return options.assumeYes === true || (await out.confirm("  Go ahead?"));
}

function sayRemoved(out: Console, target: Target, answer: RemovedAnswer): void {
  out.out(
    heading(
      answer.already_removed ? `${target.name} was removed already` : `${target.name} is removed`,
    ),
  );
  out.out(
    facts([
      ["tokens withdrawn", String(answer.tokens_revoked)],
      ["removed", answer.removed_at],
      [
        "this machine",
        target.connection === undefined
          ? "had no record of it"
          : "forgot its secret and the record of the connection",
      ],
    ]),
  );
  out.out("");
}
