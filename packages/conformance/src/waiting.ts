/** Waiting on the fake's log, and on what is not in it, for the scenario and the checks. */

import type { FakeChips } from "./fake-chips.js";
import type { StoredEvent } from "./workspace.js";

export const POLL_MS = 200;

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** What the harness said: as itself, or as one of its agents, beside which it is named (ADR 0087). */
export function byHarness(event: StoredEvent, harnessId: string): boolean {
  return (
    event.actor.id === harnessId ||
    (event.actor as { harness_id?: string }).harness_id === harnessId
  );
}

/** The first event that matches within the time, or nothing. */
export async function within(
  chips: FakeChips,
  match: (event: StoredEvent) => boolean,
  ms: number,
): Promise<StoredEvent | undefined> {
  try {
    return await chips.waitFor((event) => (match(event) ? event : undefined), ms);
  } catch {
    return undefined;
  }
}

/** The first thing `read` finds within the time, asked every `POLL_MS`: for what no event says. */
export async function until<T>(read: () => T | undefined, ms: number): Promise<T | undefined> {
  const deadline = Date.now() + ms;
  for (;;) {
    const found = read();
    if (found !== undefined || Date.now() >= deadline) return found;
    await sleep(POLL_MS);
  }
}
