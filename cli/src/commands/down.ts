/**
 * `chips down`: stop the login service `chips up` installed, and keep it from starting at the next
 * login until `chips up` runs again (ADR 0121). A service somebody else wrote is left alone.
 */

import type { Machine } from "@chipschat/platform";
import type { Console } from "../output.js";
import {
  type Command,
  mayFail,
  serviceKind,
  servicePath,
  stateOf,
  stopCommands,
} from "../service.js";

export interface DownDeps {
  readonly machine: Machine;
  readonly uid: number;
  readonly readFile: (path: string) => string | undefined;
  readonly run: (command: Command) => Promise<{ readonly ok: boolean; readonly output: string }>;
}

export async function down(out: Console, deps: DownDeps): Promise<boolean> {
  const kind = serviceKind(deps.machine.platform);
  const path = kind === undefined ? undefined : servicePath(kind, deps.machine);
  const state = stateOf(path === undefined ? undefined : deps.readFile(path));
  if (kind === undefined || state === "none") {
    out.out(
      "  There is no Chips login service on this machine. A Chips running in a terminal stops with Ctrl-C.",
    );
    return true;
  }
  if (state === "foreign") {
    out.err(`  The service at ${path} was not written by \`chips up\`, so Chips leaves it alone.`);
    return false;
  }
  for (const command of stopCommands(kind, deps.uid)) {
    const ran = await deps.run(command);
    if (!ran.ok && !mayFail(command)) {
      out.err(`  \`${command.join(" ")}\` failed:\n${ran.output.trim()}`);
      return false;
    }
  }
  out.out("  ✓ Stopped. It will not start at login until you run `chips up` again.");
  return true;
}
