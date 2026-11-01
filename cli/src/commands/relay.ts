/**
 * `chips relay` — the switchboard, from the same binary (M4.1, ADR 0038).
 *
 * A relay is a box somebody runs for their phones: this machine, a small VPS, the same Mac mini
 * behind a tunnel. It reads the same configuration table as everything else — `CHIPS_RELAY_HOST`
 * and `CHIPS_RELAY_PORT` are where it listens — and prints the two addresses a server and a phone
 * dial. It forwards ciphertext and reads none of it. `CHIPS_RELAY_ALLOW_KEYS` keeps it to the
 * servers its operator names. Given the Chips app's Expo access token (`CHIPS_PUSH_ACCESS_TOKEN`),
 * it also sends pushes for servers that have none (ADR 0246), which is how the hosted one runs.
 */

import { type ChipsConfig, createLogger, exitOnUncaught } from "@chipschat/platform";
import { pushDoorOf, type RunningRelay, startRelay } from "@chipschat/relay";
import { type Console, facts, heading } from "../output.js";

export interface RelayOptions {
  readonly config: ChipsConfig;
  readonly console: Console;
  /** This release's version, for `GET /health`. */
  readonly version?: string | undefined;
  /** Whether the process ends, after saying why, on a throw nobody caught (SEC-17). */
  readonly exitsOnUncaught?: boolean;
}

export async function relay(options: RelayOptions): Promise<RunningRelay> {
  const { config, console: out } = options;
  const logger = createLogger({
    level: config.log.level,
    pretty: config.log.pretty,
    name: "chips-relay",
  });
  if (options.exitsOnUncaught === true) exitOnUncaught(logger);
  const allowKeys = config.relay.allowKeys;
  const pushDoor = pushDoorOf(config.push);
  const running = await startRelay({
    host: config.relay.host,
    port: config.relay.port,
    maxSessionsPerServer: config.relay.maxSessionsPerServer,
    allowKeys,
    countsFile: config.relay.countsFile,
    push: pushDoor,
    version: options.version,
    logger,
  });
  out.out(heading("Chips Relay is running"));
  out.out(
    facts([
      ["address", running.url],
      [
        "servers dial",
        `${running.url}/v1/serve — set CHIPS_RELAY_URL=${running.url} on the server`,
      ],
      ["phones dial", `${running.url}/v1/connect — in every pairing QR the server prints`],
      ["health", `http://${config.relay.host}:${running.port}/health`],
      [
        "serves",
        allowKeys === undefined
          ? "any server that proves its key"
          : `${allowKeys.length === 1 ? "the one server" : `the ${allowKeys.length} servers`} in CHIPS_RELAY_ALLOW_KEYS`,
      ],
      [
        "pushes",
        pushDoor === undefined
          ? "none (CHIPS_PUSH_ACCESS_TOKEN opens the push door)"
          : `POST /v1/push, sent on to ${new URL(pushDoor.upstream).host}`,
      ],
      ["sees", "which server spoke to which phone, and when; nothing of what they said"],
      [
        "keeps",
        config.relay.countsFile === undefined
          ? "each day's counts in the log alone (CHIPS_RELAY_COUNTS_FILE keeps them)"
          : `each day's counts, how many and never which, in ${config.relay.countsFile}`,
      ],
    ]),
  );
  out.out(
    "\n  Put TLS in front of it before the internet does; the tunnel inside is ciphertext either way.\n",
  );
  return running;
}
