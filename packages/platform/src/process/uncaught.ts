/**
 * What a process that serves others does when something nobody caught goes wrong (SEC-17): say
 * what, once, and end, so whatever runs it — launchd's `KeepAlive`, systemd's `Restart=always` —
 * starts a clean one. Carrying on after a throw nobody caught leaves the process in a state no one
 * chose; ending without a word, Node's own default, leaves nobody knowing why it went.
 */

import type { Logger } from "../logging/index.js";

/** The part of `process` this reads, so a test can hand in its own. */
export interface ProcessHost {
  on: (
    event: "uncaughtException" | "unhandledRejection",
    listener: (error: unknown) => void,
  ) => unknown;
  exit: (code: number) => void;
}

/** How long the last line has to be written before the process ends without it. */
export const LAST_LINE_MS = 1000;

export function exitOnUncaught(
  logger: Pick<Logger, "fatal" | "flush">,
  host: ProcessHost = process,
): void {
  let ending = false;
  const end = (what: string) => (error: unknown) => {
    if (ending) return;
    ending = true;
    logger.fatal({ err: error }, what);
    let exited = false;
    const exit = () => {
      if (exited) return;
      exited = true;
      host.exit(1);
    };
    setTimeout(exit, LAST_LINE_MS);
    logger.flush(exit);
  };
  host.on("uncaughtException", end("uncaught exception, exiting for a clean start"));
  host.on("unhandledRejection", end("unhandled rejection, exiting for a clean start"));
}
