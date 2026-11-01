/**
 * `chips join <link>` (ADR 0122): a harness written in anything but TypeScript joins the way one on
 * `@chipschat/harness` does, and gets the four lines it reads, ready for a shell to take in:
 *
 *   eval "$(chips join http://100.64.0.7:4431/j/chips_j_…)"
 *
 * With a link a person made in Chips, it is allowed already. With only an address, it asks, prints
 * the code to compare to standard error, and waits for a person to allow it. What it is handed is
 * kept as `join()` keeps it, so running it again with the same name prints the same lines and asks
 * nothing. Only the four lines go to standard output.
 */

import { hostname } from "node:os";
import { JoinError, type Joined, join } from "@chipschat/harness";
import type { Environment } from "@chipschat/platform";
import type { Console } from "../output.js";
import { environmentLines } from "./custom.js";

export interface JoinCommandOptions {
  /** A join link, or a server's address to ask at with a code. */
  readonly target: string | undefined;
  readonly name?: string | undefined;
  readonly console: Console;
  readonly env: Environment;
  /** The SDK's `join()`; a test passes its own. */
  readonly join?: typeof join;
}

/** The four lines, each an `export` a shell takes in, quoted so nothing in them is read twice. */
export function exportLines(joined: Joined): string[] {
  return environmentLines({
    url: joined.url,
    harnessId: joined.harnessId,
    token: joined.token,
    spaceId: joined.spaceId,
  }).map((line) => {
    const [name, ...value] = line.split("=");
    return `export ${name}='${value.join("=").replaceAll("'", "'\\''")}'`;
  });
}

export async function joinChips(options: JoinCommandOptions): Promise<number> {
  const out = options.console;
  const target = options.target?.trim();
  if (target === undefined || target === "") {
    out.err(
      'Give it the link Chips made: `eval "$(chips join <link>)"`. Or a server\'s address, to ask.',
    );
    return 1;
  }
  const name = options.name ?? `Harness on ${hostname()}`;
  const link = target.includes("/j/") ? target : undefined;
  try {
    const joined = await (options.join ?? join)({
      ...(link === undefined ? { url: target } : { link }),
      name,
      software: "chips join",
      env: options.env,
      onCode: (code, url) => out.err(`Allow ${name} in Chips at ${url}. Its code is ${code}.`),
    });
    for (const line of exportLines(joined)) out.out(line);
    return 0;
  } catch (error) {
    out.err(error instanceof JoinError || error instanceof Error ? error.message : String(error));
    return 1;
  }
}
