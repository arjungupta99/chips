/**
 * Who took new spaces when the directory was last read, kept on this phone, so the + by the tab
 * bar is there from the first frame of a launch.
 *
 * The directory comes from the server a moment after the app is up, and a + that waited for it
 * came in late with a jerk (Arjun, 24 September 2026): the slot it stands over is a tab, and a
 * tab shown while the app runs remounts the bar, which moves aside to make room. Read at launch
 * with the appearance, before anything is drawn (`app/_layout.tsx`), what was true last time
 * stands until the directory says otherwise, and the bar is laid out once. Offline, it stands.
 *
 * One workspace's, and only that one's: a phone paired afresh elsewhere draws no + it has not
 * been told of. With it, who was asked for the last room made from the +, whom the next window
 * opens on (ADR 0084).
 */

import type { Participant } from "@chipschat/core";
import { readSetting, SETTINGS, writeSetting } from "../prefs";

interface Remembered {
  readonly workspaceId: string;
  readonly harnesses: readonly { readonly id: string; readonly displayName: string }[];
  /** Who was asked for the last room made from the +. Absent from what was written before it was. */
  readonly lastAsked?: string;
}

let held: Remembered | undefined;

function isRemembered(value: unknown): value is Remembered {
  if (typeof value !== "object" || value === null) return false;
  const { workspaceId, harnesses, lastAsked } = value as Partial<Remembered>;
  return (
    typeof workspaceId === "string" &&
    (lastAsked === undefined || typeof lastAsked === "string") &&
    Array.isArray(harnesses) &&
    harnesses.every(
      (each: unknown) =>
        typeof each === "object" &&
        each !== null &&
        typeof (each as { id?: unknown }).id === "string" &&
        typeof (each as { displayName?: unknown }).displayName === "string",
    )
  );
}

/** What was written last time, held for `remembered`. Read once, at launch; nonsense is nothing. */
export async function loadRemembered(): Promise<void> {
  const stored = await readSetting(SETTINGS.newSpace).catch(() => undefined);
  try {
    const value: unknown = stored === undefined ? undefined : JSON.parse(stored);
    held = isRemembered(value) ? value : undefined;
  } catch {
    held = undefined;
  }
}

/** The harnesses that took new spaces in this workspace last time, by name, as the directory has them. */
export function remembered(workspaceId: string): Participant[] {
  if (held?.workspaceId !== workspaceId) return [];
  return held.harnesses.map((each) => ({
    id: each.id,
    kind: "harness",
    displayName: each.displayName,
  }));
}

/** Who was asked for the last room made from the + in this workspace, if anyone has been. */
export function lastAsked(workspaceId: string): string | undefined {
  return held?.workspaceId === workspaceId ? held.lastAsked : undefined;
}

/** What the directory says now, written down for next time when it is not what was. */
export function remember(workspaceId: string, harnesses: readonly Participant[]): void {
  const asked = lastAsked(workspaceId);
  write({
    workspaceId,
    harnesses: harnesses.map((each) => ({ id: each.id, displayName: each.displayName })),
    ...(asked === undefined ? {} : { lastAsked: asked }),
  });
}

/** Who a room was just asked of, for the next window to open on. */
export function rememberAsked(workspaceId: string, harnessId: string): void {
  write({
    workspaceId,
    harnesses: held?.workspaceId === workspaceId ? held.harnesses : [],
    lastAsked: harnessId,
  });
}

function write(next: Remembered): void {
  if (JSON.stringify(next) === JSON.stringify(held)) return;
  held = next;
  void writeSetting(SETTINGS.newSpace, JSON.stringify(next)).catch(() => undefined);
}
