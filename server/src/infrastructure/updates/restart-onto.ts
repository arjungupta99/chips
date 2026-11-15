/**
 * A computer Chips for Mac carries, starting again on the release the app now holds (everything in
 * step, phase 5; ADR 0298). Chips for Mac swaps its bundle whole when it updates itself, and the
 * computer goes on running the release it started on. Riding the sweep, at most once a minute, it
 * reads the version of the release in the app; when that is newer than its own and nothing is
 * going on anywhere (no run, no ask waiting, no message for five minutes), its login service is
 * started again, on the new release, and asked again an hour on if this process is still here.
 * Any hour: the files under it are the new release's already.
 * The bridges on that Mac run on, and phones ride the restart out as any reconnect.
 */

import type { Clock, Logger } from "@chipschat/platform";
import type { RestartOnto } from "../../application/ports/self-update.js";
import type { Busy } from "../store/harness-quiet.js";
import { laterThan } from "./bridge-updater.js";

/** How often it looks. */
export const RESTART_CHECK_MS = 60_000;
/** How long nothing must have been said anywhere. */
export const RESTART_STILL_MS = 5 * 60_000;
/**
 * How long after it asked to be started again it asks once more. A restart that took ends this
 * process within the second, so one still here an hour on wasn't started again: its service
 * wasn't loaded just then, or `launchctl` couldn't be run.
 */
export const RESTART_AGAIN_MS = 60 * 60_000;

export interface RestartWatch {
  readonly tick: () => void;
  /** The release in the app it will start again on, when one newer than this computer is there. */
  readonly waiting: () => string | undefined;
  /** Resolves once the look a tick started is done; for tests. */
  readonly settled: () => Promise<void>;
}

export function restartWatch(deps: {
  readonly hands: RestartOnto;
  readonly version: string;
  readonly quiet: (sinceIso: string) => Promise<Busy | undefined>;
  readonly clock: Clock;
  readonly logger: Logger;
}): RestartWatch {
  let lookedAt = Number.NEGATIVE_INFINITY;
  let looking: Promise<void> = Promise.resolve();
  let busy = false;
  let askedAt = Number.NEGATIVE_INFINITY;

  const waiting = () => {
    const onDisk = deps.hands.onDisk();
    return onDisk !== undefined && laterThan(onDisk, deps.version) ? onDisk : undefined;
  };

  const look = async (now: number) => {
    const onto = waiting();
    if (onto === undefined || now - askedAt < RESTART_AGAIN_MS) return;
    const still = new Date(now - RESTART_STILL_MS).toISOString();
    if ((await deps.quiet(still)) !== undefined) return;
    askedAt = now;
    deps.logger.info({ from: deps.version, to: onto }, "starting again on the app's new release");
    deps.hands.restart();
  };

  return {
    tick: () => {
      const now = deps.clock.nowMs();
      if (busy || now - lookedAt < RESTART_CHECK_MS) return;
      lookedAt = now;
      busy = true;
      looking = look(now)
        .catch((error: unknown) => deps.logger.error({ err: error }, "restart onto failed"))
        .finally(() => {
          busy = false;
        });
    },
    waiting,
    settled: async () => await looking,
  };
}
