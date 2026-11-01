/**
 * `chips disconnect <harness>` — undo what `connect` wrote.
 *
 * It reads the record rather than guessing: `connect` wrote down which files it touched and
 * which keychain accounts it filled, and this takes exactly those back. Undo is a delete
 * (blueprint, Nothing hidden), and like `connect` it says what it is about to do first.
 *
 * The harness itself stays. Its spaces, its runs and its receipts are the workspace's history,
 * and deleting a participant would take that with it; what goes is this machine's end of the
 * connection. The token is withdrawn on the server, so nothing left on disk can speak for the
 * harness afterwards.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { type Connection, findConnection, type Harness, readConnections } from "../connections.js";
import { type CliDevice, call, loadDevice } from "../device.js";
import {
  adapterFor,
  connectAgain,
  connectionShapeOf,
  type HarnessAdapter,
  harnessAdapters,
} from "../harnesses.js";
import { connectionsPath } from "../home.js";
import { type Keychain, openKeychain } from "../keychain.js";
import { type Console, facts, heading } from "../output.js";

export interface DisconnectOptions {
  readonly harness: Harness;
  readonly console: Console;
  readonly assumeYes?: boolean;
  readonly device?: CliDevice | undefined;
  readonly keychain?: Keychain;
  readonly connectionsFile?: string;
  /** The adapters to read; the manifest's, unless a test hands in its own. */
  readonly adapters?: readonly HarnessAdapter[] | undefined;
}

export interface Disconnected {
  readonly declined: boolean;
  /** How many tokens were withdrawn on the server. */
  readonly tokensRevoked: number;
}

export async function disconnect(options: DisconnectOptions): Promise<Disconnected> {
  const { console: out, harness } = options;
  const adapters = options.adapters ?? harnessAdapters;
  const file = options.connectionsFile ?? connectionsPath();
  // By the adapter's word while it made only one harness here, or by the harness's name or id.
  const connection = findConnection(readConnections(file), harness);
  if (connection === undefined) {
    throw new Error(`${adapterFor(harness, adapters)?.name ?? harness} is not connected here.`);
  }
  const adapter = adapterFor(connection.harness, adapters);
  const name = connection.displayName;
  // A record from an older build is taken back like a custom harness's: what it wrote is in
  // the record, and what it left is nothing this build knows about.
  const shape = connectionShapeOf(connection.harness, adapters);

  out.out(heading(`Disconnect ${name}`));
  out.out("\n  This will:\n");
  for (const change of [
    ...connection.wrote.map((path) => `take the Chips entries out of ${path}`),
    ...shape.leaves,
    "withdraw its tokens, so nothing on this machine can speak for it",
    "forget the secrets in the keychain and the record of the connection",
    `leave the harness ${connection.displayName} and everything it has done`,
  ]) {
    out.out(`    · ${change}`);
  }
  out.out("");
  if (options.assumeYes !== true && !(await out.confirm("  Go ahead?"))) {
    out.out("\n  Nothing was changed.\n");
    return { declined: true, tokensRevoked: 0 };
  }

  const tokensRevoked = await revokeTokens(connection, options);
  forgetConnection(connection, { keychain: options.keychain, connectionsFile: file });

  out.out(heading(`${name} is disconnected`));
  out.out(
    facts([
      ["tokens withdrawn", String(tokensRevoked)],
      ["harness", `${connection.displayName} kept, with its spaces`],
    ]),
  );
  out.out(
    adapter === undefined
      ? `\n  \`${connectAgain(connection, adapters)}\` connects it again; this build has no adapter called ${connection.harness}.\n`
      : `\n  \`${connectAgain(connection, adapters)}\` puts it back.\n`,
  );
  return { declined: false, tokensRevoked };
}

/**
 * Withdraw every token this harness still has. A server that cannot be reached is not a reason
 * to stop: the local end goes regardless, and the tokens can be withdrawn from the harness's
 * card. Saying so is better than failing halfway.
 */
async function revokeTokens(connection: Connection, options: DisconnectOptions): Promise<number> {
  const device = options.device ?? loadDevice();
  if (device === undefined) return 0;
  try {
    const held = await call<{ tokens: { id: string; revoked_at: string | null }[] }>(
      device,
      "GET",
      `/v1/harnesses/${connection.harnessId}/tokens`,
    );
    let revoked = 0;
    for (const token of held.tokens) {
      if (token.revoked_at !== null) continue;
      await call(device, "DELETE", `/v1/harnesses/${connection.harnessId}/tokens/${token.id}`);
      revoked += 1;
    }
    return revoked;
  } catch (error) {
    options.console.err(
      `The tokens could not be withdrawn (${String(error)}). Withdraw them from the harness's card in Chips.`,
    );
    return 0;
  }
}

/**
 * Forget this machine's end of a connection: the secret in the keychain, and the record, with the
 * file written the way `writeConnection` writes it. `disconnect` and `remove` both end here; what
 * the server holds is theirs to take back first.
 */
export function forgetConnection(
  gone: Connection,
  where: { readonly keychain?: Keychain | undefined; readonly connectionsFile: string },
): void {
  (where.keychain ?? openKeychain()).remove(gone.account);
  const kept = readConnections(where.connectionsFile).filter(
    (each) => each.harnessId !== gone.harnessId,
  );
  mkdirSync(dirname(where.connectionsFile), { recursive: true, mode: 0o700 });
  writeFileSync(where.connectionsFile, `${JSON.stringify(kept, null, 2)}\n`, { mode: 0o600 });
}
