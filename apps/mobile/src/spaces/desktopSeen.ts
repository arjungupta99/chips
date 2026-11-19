/**
 * What this phone has seen on each space's Desktop tab (ADR 0227's addendum of 17 November 2026):
 * the rows it has shown there, and since when it has kept them. Universe's Desktop tab wears a gold
 * dot for a row somebody else brought since then that this phone hasn't shown on Desktop yet
 * (core's `desktopNews`), until the tab is opened. Arjun, 17 November 2026: "I want to show a yellow
 * dot in the universe-->Desktop tap button, when there is new content available there for the first
 * time".
 *
 * A fact about this phone, kept beside Universe's own (`universeSeen.ts`) in `prefs`: the iPad keeps
 * its own, so opening Desktop there leaves the phone's dot lit. The day this is first read, `since`
 * is that moment, so what each Desktop already had counts as seen.
 */

import type { ProjectChange, Universe } from "@chipschat/core";
import { type DesktopRow, type DesktopSeen, desktopNews, desktopRowsOf } from "@chipschat/core";
import { useCallback, useSyncExternalStore } from "react";
import { readSetting, SETTINGS, writeSetting } from "../prefs";

const ROWS: readonly DesktopRow[] = ["program", "page"];

/** Since when this phone has kept what Desktop has; nothing until it has been read. */
let since: string | undefined;
const seen = new Map<string, readonly DesktopRow[]>();
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

function written(): void {
  if (since === undefined) return;
  const value = JSON.stringify({ since, spaces: Object.fromEntries(seen) });
  void writeSetting(SETTINGS.desktopSeen, value).catch(() => undefined);
}

/** The rows of a stored list that are rows; anything else is dropped. */
function rowsIn(value: unknown): readonly DesktopRow[] {
  if (!Array.isArray(value)) return [];
  return ROWS.filter((row) => value.includes(row));
}

/**
 * What was kept last time, read once at launch. Nothing kept (the first launch with the dot) starts
 * keeping now, and says so; a record that can't be read starts now too, without writing over it.
 */
export async function loadDesktopSeen(now: () => Date = () => new Date()): Promise<void> {
  let stored: string | undefined;
  try {
    stored = await readSetting(SETTINGS.desktopSeen);
  } catch {
    since ??= now().toISOString();
    told();
    return;
  }
  const kept = parsed(stored);
  if (kept === undefined) {
    since ??= now().toISOString();
    written();
  } else {
    since ??= kept.since;
    // Opened since launch is newer than what was written before it.
    for (const [spaceId, rows] of Object.entries(kept.spaces)) {
      if (!seen.has(spaceId)) seen.set(spaceId, rowsIn(rows));
    }
  }
  told();
}

function parsed(
  stored: string | undefined,
): { readonly since: string; readonly spaces: Record<string, unknown> } | undefined {
  if (stored === undefined) return undefined;
  try {
    const value: unknown = JSON.parse(stored);
    if (typeof value !== "object" || value === null) return undefined;
    const { since: at, spaces } = value as { since?: unknown; spaces?: unknown };
    if (typeof at !== "string" || Number.isNaN(Date.parse(at))) return undefined;
    const kept = typeof spaces === "object" && spaces !== null ? spaces : {};
    return { since: at, spaces: kept as Record<string, unknown> };
  } catch {
    return undefined;
  }
}

/** What this phone keeps of a space's Desktop: nothing until the record has been read. */
export function desktopSeenOf(spaceId: string): DesktopSeen | undefined {
  return since === undefined ? undefined : { since, rows: seen.get(spaceId) ?? [] };
}

/**
 * The rows a space's Desktop tab wears its dot for, and what opening the tab does: keep every row
 * it has now as seen, so the dot goes out and stays out for them.
 */
export function useDesktopNews(
  spaceId: string,
  universe: Universe | undefined,
  changes: readonly ProjectChange[] | undefined,
  selfId: string,
): { readonly news: readonly DesktopRow[]; readonly opened: () => void } {
  useSyncExternalStore(subscribe, read, read);
  const news = desktopNews(universe, changes, selfId, desktopSeenOf(spaceId));
  const opened = useCallback(() => {
    if (universe === undefined) return;
    const was = seen.get(spaceId) ?? [];
    const now = desktopRowsOf(universe).map((each) => each.row);
    const rows = ROWS.filter((row) => was.includes(row) || now.includes(row));
    if (rows.length === was.length) return;
    seen.set(spaceId, rows);
    told();
    written();
  }, [spaceId, universe]);
  return { news, opened };
}

/** Forget everything kept, for a test. */
export function forgetDesktopSeen(): void {
  since = undefined;
  seen.clear();
  told();
}
