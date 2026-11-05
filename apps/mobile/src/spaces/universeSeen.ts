/**
 * Where this phone last opened each space's Universe: the project's change it was opened at (ADR
 * 0227's addendum). Universe calls the reader (`UniverseButton`'s `calling`) for a newer change
 * somebody else made, and stops once it is opened here. Arjun, 2 November 2026: "it should keep
 * pulsing until person taps it".
 *
 * A fact about this phone, kept beside the picks in `prefs` so a call already answered stays
 * answered after the app restarts. Another device keeps its own: the Mac still calls about a report
 * read on the phone.
 */

import { type RoomProject, universeCalling, universeSeenAt } from "@chipschat/core";
import { useCallback, useSyncExternalStore } from "react";
import { readSetting, SETTINGS, writeSetting } from "../prefs";

const seen = new Map<string, string>();
const listeners = new Set<() => void>();
let version = 0;

function told(): void {
  version += 1;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const read = (): number => version;

/** What was kept last time. Read once, at launch; nonsense is nothing seen. */
export async function loadUniverseSeen(): Promise<void> {
  const stored = await readSetting(SETTINGS.universeSeen).catch(() => undefined);
  try {
    const value: unknown = stored === undefined ? undefined : JSON.parse(stored);
    if (typeof value !== "object" || value === null) return;
    for (const [spaceId, commit] of Object.entries(value)) {
      // Opened since launch is newer than what was written before it.
      if (typeof commit === "string" && !seen.has(spaceId)) seen.set(spaceId, commit);
    }
    told();
  } catch {
    // Nothing kept that can be read: each Universe calls about its newest change once more.
  }
}

/** The change a room's Universe calls about, and what opening it does: keep that change as seen. */
export function useUniverseCall(
  spaceId: string,
  project: RoomProject | undefined,
  selfId: string,
): { readonly calling: string | undefined; readonly opened: () => void } {
  useSyncExternalStore(subscribe, read, read);
  const calling = universeCalling(project, selfId, seen.get(spaceId));
  const opened = useCallback(() => {
    const at = universeSeenAt(project);
    if (at === undefined || seen.get(spaceId) === at) return;
    seen.set(spaceId, at);
    told();
    void writeSetting(SETTINGS.universeSeen, JSON.stringify(Object.fromEntries(seen))).catch(
      () => undefined,
    );
  }, [spaceId, project]);
  return { calling, opened };
}
