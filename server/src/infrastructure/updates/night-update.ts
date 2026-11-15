/**
 * A computer from the install line bringing itself to the newest release at night, when its owner
 * turned "Update this computer automatically" on (everything in step, phase 6). Off by default.
 *
 * Riding the sweep, at most every ten minutes: when the release feed (ADR 0296) has a release newer
 * than this computer, between two and five in the morning by this machine's clock, and nothing is
 * going on anywhere (no run, no ask waiting, no message for ten minutes), it starts `chips update`
 * apart from itself, once a night. The server stops while the new release starts; phones ride
 * that out as any reconnect. What happened is written by `chips update` and said in About.
 */

import type { Clock, Logger } from "@chipschat/platform";
import type { ComputerUpdatesRegistry, SelfUpdate } from "../../application/ports/self-update.js";
import type { Busy } from "../store/harness-quiet.js";
import { isRelease, laterThan } from "./bridge-updater.js";

/** How often it looks. */
export const NIGHT_CHECK_MS = 10 * 60_000;
/** The hours it may run in, by this machine's clock: from two up to five in the morning. */
export const NIGHT_FROM_HOUR = 2;
export const NIGHT_UNTIL_HOUR = 5;
/** How long nothing must have been said anywhere. */
export const NIGHT_STILL_MS = 10 * 60_000;
/** Once a night: not again within this long of the last start. */
export const NIGHT_AGAIN_MS = 20 * 60 * 60_000;

/** The latest of these versions; none among none, or among words that aren't versions. */
export function newestOf(versions: readonly string[]): string | undefined {
  let newest: string | undefined;
  for (const each of versions) {
    if (!isRelease(each)) continue;
    if (newest === undefined || laterThan(each, newest)) newest = each;
  }
  return newest;
}

export interface NightUpdate {
  readonly tick: () => void;
  /** Resolves once the look a tick started is done; for tests. */
  readonly settled: () => Promise<void>;
}

export function nightUpdate(deps: {
  readonly selfUpdate: SelfUpdate;
  readonly switch: ComputerUpdatesRegistry;
  /** The newest computer release the feed names, if it has been read. */
  readonly newest: () => string | undefined;
  readonly version: string;
  readonly quiet: (sinceIso: string) => Promise<Busy | undefined>;
  readonly clock: Clock;
  /** The hour on this machine's clock; the system's unless a test says. */
  readonly hourOf?: ((ms: number) => number) | undefined;
  readonly logger: Logger;
}): NightUpdate {
  const hourOf = deps.hourOf ?? ((ms: number) => new Date(ms).getHours());
  let lookedAt = Number.NEGATIVE_INFINITY;
  let startedAt = Number.NEGATIVE_INFINITY;
  let looking: Promise<void> = Promise.resolve();
  let busy = false;

  /** A newer release out, in the night's hours, and not started yet tonight. */
  const due = (now: number) => {
    const newest = deps.newest();
    const hour = hourOf(now);
    return (
      newest !== undefined &&
      laterThan(newest, deps.version) &&
      hour >= NIGHT_FROM_HOUR &&
      hour < NIGHT_UNTIL_HOUR &&
      now - startedAt >= NIGHT_AGAIN_MS
    );
  };

  /** The owner said so, no update is under way, and nothing is going on. */
  const allowed = async (now: number) =>
    (await deps.switch.current()).automatic &&
    deps.selfUpdate.last()?.state !== "updating" &&
    (await deps.quiet(new Date(now - NIGHT_STILL_MS).toISOString())) === undefined;

  const look = async (now: number) => {
    if (!due(now) || !(await allowed(now))) return;
    const newest = deps.newest();
    startedAt = now;
    deps.logger.info({ from: deps.version, to: newest }, "updating this computer");
    deps.selfUpdate.start();
  };

  return {
    tick: () => {
      const now = deps.clock.nowMs();
      if (busy || now - lookedAt < NIGHT_CHECK_MS) return;
      lookedAt = now;
      busy = true;
      looking = look(now)
        .catch((error: unknown) => deps.logger.error({ err: error }, "night update failed"))
        .finally(() => {
          busy = false;
        });
    },
    settled: async () => await looking,
  };
}
