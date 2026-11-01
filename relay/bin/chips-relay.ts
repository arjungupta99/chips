#!/usr/bin/env node
/**
 * `chips-relay`: one command, one port, two doors. Configuration is the same file and
 * environment as chipsd's — `CHIPS_RELAY_HOST`, `CHIPS_RELAY_PORT`,
 * `CHIPS_RELAY_MAX_SESSIONS_PER_SERVER`, `CHIPS_RELAY_ALLOW_KEYS`, `CHIPS_RELAY_COUNTS_FILE`, and
 * `CHIPS_PUSH_ACCESS_TOKEN` for the push door (ADR 0246) — so a box that runs only the relay reads
 * one table.
 */

import { createLogger, exitOnUncaught, loadConfig } from "@chipschat/platform";
import { pushDoorOf, startRelay } from "../src/index.js";

/** Set when the relay is bundled on its own (`pnpm release:relay`): what `/health` reports. */
declare const __CHIPS_RELEASE__: string | undefined;

async function main(): Promise<number> {
  const config = loadConfig();
  if (!config.ok) {
    console.error(config.error.message);
    return 1;
  }
  const { relay, log, push } = config.value;
  const logger = createLogger({ level: log.level, pretty: log.pretty, name: "chips-relay" });
  // A throw nobody caught ends the process after one line saying what, so systemd starts a clean
  // one (SEC-17); one bad request once took the hosted relay down (SEC-41).
  exitOnUncaught(logger);
  const running = await startRelay({
    host: relay.host,
    port: relay.port,
    maxSessionsPerServer: relay.maxSessionsPerServer,
    allowKeys: relay.allowKeys,
    countsFile: relay.countsFile,
    push: pushDoorOf(push),
    version: typeof __CHIPS_RELEASE__ === "string" ? __CHIPS_RELEASE__ : undefined,
    logger,
  });
  console.log(
    [
      "",
      `  Chips Relay is listening at ${running.url}`,
      "",
      `    servers dial   ${running.url}/v1/serve      (CHIPS_RELAY_URL=${running.url} on the server)`,
      `    phones dial    ${running.url}/v1/connect`,
      ...(push.accessToken === undefined ? [] : [`    pushes go      POST /v1/push, on to Expo`]),
      `    health         http://${relay.host}:${running.port}/health`,
      "",
      "  It forwards ciphertext and reads none of it. Put TLS in front before the internet does.",
      "",
    ].join("\n"),
  );

  const shutdown = async (signal: string) => {
    logger.info({ signal }, "shutting down");
    await running.close();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  return new Promise<number>(() => {});
}

process.exitCode = await main();
