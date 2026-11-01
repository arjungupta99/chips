/**
 * `chips declare <harness> <capability>…` — say again what a harness takes (ADR 0046).
 *
 * A harness's manifest is said once, when it is registered, and a harness that has learnt to do
 * something new — Jacobian, taking new spaces — needs a way to say so without being registered
 * again, with a new id and none of its history. This sends the list to the server, which keeps
 * it; the clients read it the next time they read the directory.
 *
 * The list is whole: what is named is what the harness takes from now on, and what it took
 * before and is not named, it no longer does. The command says what it replaced, so a
 * capability dropped by mistake is seen and can be put back.
 */

import { findConnection, readConnections } from "../connections.js";
import { type CliDevice, call, loadDevice } from "../device.js";
import { connectionsPath } from "../home.js";
import { type Console, facts, heading } from "../output.js";

export interface DeclareOptions {
  /** A harness id, a harness's name, or the adapter this machine connected it with (`custom`). */
  readonly harness: string;
  readonly capabilities: readonly string[];
  readonly console: Console;
  readonly device?: CliDevice | undefined;
  readonly connectionsFile?: string;
}

export interface Declared {
  readonly harnessId: string;
  readonly capabilities: readonly string[];
  readonly previous: readonly string[] | null;
}

/** The id for what was typed: an id as it is, or the harness a connection on this machine names. */
function harnessIdOf(harness: string, connectionsFile: string): string {
  if (harness.startsWith("hrn_")) return harness;
  const found = findConnection(readConnections(connectionsFile), harness);
  if (found === undefined) {
    throw new Error(
      `${harness} is not connected here. Give its id instead: \`chips declare hrn_… ${"<capability>"}\`.`,
    );
  }
  return found.harnessId;
}

export async function declare(options: DeclareOptions): Promise<Declared> {
  const harnessId = harnessIdOf(options.harness, options.connectionsFile ?? connectionsPath());
  const device = options.device ?? loadDevice();
  if (device === undefined) {
    throw new Error("This machine is not paired with a server: `chips pair <code>` first.");
  }
  const answer = await call<{ capabilities: string[]; previous: string[] | null }>(
    device,
    "PATCH",
    `/v1/harnesses/${harnessId}`,
    { capabilities: options.capabilities },
  );
  const said = (list: readonly string[] | null): string =>
    list === null || list.length === 0 ? "nothing" : list.join(", ");
  options.console.out(heading(`${options.harness} declares`));
  options.console.out(
    facts([
      ["harness", harnessId],
      ["was", said(answer.previous)],
      ["now", said(answer.capabilities)],
    ]),
  );
  options.console.out("");
  return { harnessId, capabilities: answer.capabilities, previous: answer.previous };
}
