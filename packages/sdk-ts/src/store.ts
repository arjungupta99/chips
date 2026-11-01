/**
 * What a harness keeps across a restart, so a restart loses nothing and leaves nothing hanging:
 * the last `seq` it heard (a decision made while it was down still reaches it), the events it sent
 * that the server never answered (sent again, which the idempotency key makes safe), and the runs
 * it started that never ended (ended for it when it comes back, so no thinking bubble waits for
 * ever). `connect({ store: fileStore(path) })`; without a store, all of it lives as long as the
 * process does.
 */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

/** A run this harness started and has not ended: enough to end it after a restart. */
export interface OpenRun {
  readonly runId: string;
  readonly spaceId: string;
  /** The agent it was started as, when it was one (ADR 0087). */
  readonly agentId?: string | undefined;
}

export interface HarnessState {
  readonly since?: number | undefined;
  readonly outbox: readonly Readonly<Record<string, unknown>>[];
  readonly runs: readonly OpenRun[];
}

/** Where the state is kept. `load` is read once, at connect; `save` is called after changes. */
export interface HarnessStore {
  readonly load: () => HarnessState | undefined;
  readonly save: (state: HarnessState) => void;
}

/**
 * A JSON file only its user can read, written whole and renamed into place so a crash mid-write
 * leaves the last good one. Its folder is made when missing.
 */
export function fileStore(path: string): HarnessStore {
  return {
    load() {
      if (!existsSync(path)) return undefined;
      try {
        const parsed = JSON.parse(readFileSync(path, "utf8")) as Partial<HarnessState>;
        return {
          ...(typeof parsed.since === "number" ? { since: parsed.since } : {}),
          outbox: Array.isArray(parsed.outbox) ? parsed.outbox : [],
          runs: Array.isArray(parsed.runs) ? parsed.runs : [],
        };
      } catch {
        // A file nobody can read is a fresh start, not a harness that cannot start.
        return undefined;
      }
    },
    save(state) {
      mkdirSync(dirname(path), { recursive: true });
      const next = `${path}.next`;
      writeFileSync(next, `${JSON.stringify(state)}\n`, { mode: 0o600 });
      renameSync(next, path);
    },
  };
}

/** A store in memory, for tests and for a harness that keeps its state somewhere of its own. */
export function memoryStore(
  initial?: HarnessState,
): HarnessStore & { readonly state: () => HarnessState | undefined } {
  let kept = initial;
  return {
    load: () => kept,
    save: (state) => {
      kept = state;
    },
    state: () => kept,
  };
}
