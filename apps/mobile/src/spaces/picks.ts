/**
 * Who the field's list was told a draft is for, by space (ADR 0081; everyone as `all` since ADR
 * 0113, several since ADR 0114), kept on this phone so the pick is still there when the person
 * comes back to the room, whether or not the app has restarted since. Arjun, 4 October 2026:
 * "the selections should be sticky. If I make a certain type of agent(s) selection, they should
 * remain selected when I come back to space".
 *
 * Held in a map for the field to read at once, and written to `prefs` beside the appearance: a
 * fact about this phone, which another device keeps its own of. It was the map alone until then,
 * and iOS ending the app in the background lost it.
 *
 * A send lets the pick go: where the message went is then the room's own default, read from its
 * history (core's `nextAddress`), so the field goes on saying the same thing without it.
 */

import type { AimPick } from "@chipschat/core";
import { readSetting, SETTINGS, writeSetting } from "../prefs";

const picks = new Map<string, AimPick>();

/** The pick kept for a room, if there is one. */
export function pickFor(spaceId: string): AimPick | undefined {
  return picks.get(spaceId);
}

/** Keep a room's pick, or let it go, and write the lot down for next time. */
export function keepPick(spaceId: string, pick: AimPick | undefined): void {
  if (pick === undefined) picks.delete(spaceId);
  else picks.set(spaceId, pick);
  write();
}

/**
 * Picks gone, for rooms that are no longer this phone's to come back to: those of a workspace
 * signed out of (ADR 0197), or every one when none is named.
 */
export function forgetPicks(spaceIds?: readonly string[]): void {
  if (spaceIds === undefined) picks.clear();
  else for (const spaceId of spaceIds) picks.delete(spaceId);
  write();
}

function write(): void {
  void writeSetting(SETTINGS.picks, JSON.stringify(Object.fromEntries(picks))).catch(
    () => undefined,
  );
}

function isPick(value: unknown): value is AimPick {
  return value === "all" || (Array.isArray(value) && value.every((id) => typeof id === "string"));
}

/** What was kept last time, held for `pickFor`. Read once, at launch; nonsense is nothing. */
export async function loadPicks(): Promise<void> {
  const stored = await readSetting(SETTINGS.picks).catch(() => undefined);
  try {
    const value: unknown = stored === undefined ? undefined : JSON.parse(stored);
    if (typeof value !== "object" || value === null) return;
    for (const [spaceId, pick] of Object.entries(value)) {
      // A pick made since launch is newer than what was written before it.
      if (isPick(pick) && !picks.has(spaceId)) picks.set(spaceId, pick);
    }
  } catch {
    // Nothing kept that can be read: the rooms start from their defaults.
  }
}
