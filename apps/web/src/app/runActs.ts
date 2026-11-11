/**
 * A run's Pause, Resume and Stop as the shell carries them out (ADR 0293), for the thinking
 * bubble's menu (`RunMenu.tsx`) and a room's row menu (`RowMenu.tsx`) alike.
 */

import type { RunAct } from "@chipschat/core";

/** What a run's Pause, Resume and Stop are carried out through: the store's, from the shell. */
export interface RunActs {
  readonly pause: (spaceId: string, runId: string) => void;
  readonly resume: (spaceId: string, runId: string) => void;
  readonly stop: (spaceId: string, runId: string) => void;
}

/** One of a run's acts, carried out through the shell's. */
export function carryOutRunAct(acts: RunActs, act: RunAct, spaceId: string, runId: string): void {
  acts[act](spaceId, runId);
}
