/**
 * A browser tab whose computer was updated under it (everything in step, 13 November 2026).
 *
 * The computer serves the web app, so a tab is in step the moment it loads. One left open across
 * an update keeps the old code against the new computer. It hears the computer's version in every
 * hello (`serverVersion`), and when that is no longer the one it first heard, it reloads itself at
 * the next quiet moment: the tab out of sight or left alone for half a minute, nothing typed and
 * unsent, no file waiting in the composer, no sheet or dialog open, and the computer connected,
 * since a reload while it can't be reached lands on the browser's own error page. It comes back to
 * the room and section it was on. When no quiet moment comes within five minutes, a line says so,
 * with Reload.
 *
 * Only in a browser. Chips for Mac carries its own copy of the web app, so a reload there brings
 * back the same code; the app updates itself instead.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { Tab } from "./Sidebar.tsx";

/** Where the tab was, kept across its own reload. */
export interface Place {
  readonly tab: Tab;
  readonly spaceId?: string | undefined;
}

export const PLACE_KEY = "chips.updated.place";
/** How often a tab waiting to reload looks for a quiet moment. */
export const QUIET_CHECK_MS = 2000;
/** How long it waits for one before it asks. */
export const ASK_AFTER_MS = 5 * 60_000;
/** How long the person must have left the tab alone, unless it is out of sight. */
export const IDLE_MS = 30_000;
export const UPDATED_LINE = "Chips was updated on your computer.";

const TABS: readonly Tab[] = ["spaces", "agents", "audit", "you", "search"];

/** The kinds of `<input>` a person types words or numbers into. One with no type is a text field. */
const TYPED_INPUTS: readonly string[] = [
  "text",
  "number",
  "search",
  "email",
  "url",
  "tel",
  "password",
];

/** Whether a field holds something typed: a text area, or an input of a kind that is typed into. */
function holdsTyped(field: Element): boolean {
  const input = field as HTMLTextAreaElement | HTMLInputElement;
  const typed = field.tagName === "TEXTAREA" || TYPED_INPUTS.includes(input.type);
  return typed && input.value.trim() !== "";
}

/**
 * Nothing would be lost by a reload now: no words typed and not sent, in a field of any kind or an
 * editable line, no file staged in the composer and not sent (its chips, `ui-composer__attachments`),
 * and no sheet or dialog open.
 */
export function quietNow(doc: Document = document): boolean {
  if (doc.querySelector('[role="dialog"], [aria-modal="true"], dialog[open]') !== null)
    return false;
  if (doc.querySelector(".ui-composer__attachments") !== null) return false;
  if ([...doc.querySelectorAll("textarea, input")].some(holdsTyped)) return false;
  for (const line of doc.querySelectorAll('[contenteditable="true"]')) {
    if ((line.textContent ?? "").trim() !== "") return false;
  }
  return true;
}

function sessionStore(): Storage | undefined {
  try {
    return globalThis.sessionStorage;
  } catch {
    return undefined;
  }
}

/** Keep where the tab is, for the reload to come back to. */
export function keepPlace(place: Place, storage: Storage | undefined = sessionStore()): void {
  try {
    storage?.setItem(PLACE_KEY, JSON.stringify(place));
  } catch {
    // Kept or not, the reload goes ahead: the tab opens where it would anyway.
  }
}

/** Where a reload for an update left the tab, taken once: a later reload of its own opens as usual. */
export function takePlace(storage: Storage | undefined = sessionStore()): Place | undefined {
  try {
    const kept = storage?.getItem(PLACE_KEY);
    if (kept === null || kept === undefined) return undefined;
    storage?.removeItem(PLACE_KEY);
    const read = JSON.parse(kept) as { tab?: unknown; spaceId?: unknown };
    const tab = TABS.find((each) => each === read.tab);
    if (tab === undefined) return undefined;
    return { tab, ...(typeof read.spaceId === "string" ? { spaceId: read.spaceId } : {}) };
  } catch {
    return undefined;
  }
}

export interface UpdatedOptions {
  /** The computer's version as its last hello said, or none yet. */
  readonly serverVersion: string | undefined;
  /** Where the tab is now, kept when it reloads. */
  readonly place: () => Place;
  /** False in Chips for Mac, where a reload brings back the same code. */
  readonly enabled: boolean;
  /**
   * Whether the connection to the computer is open. While it isn't, the tab neither reloads nor
   * offers to: the computer serves the page, so a reload then would bring the browser's error.
   */
  readonly connected: boolean;
  readonly reload?: (() => void) | undefined;
  readonly quiet?: (() => boolean) | undefined;
}

/**
 * Whether the line asking to reload shows, and the reload it offers. The tab reloads by itself at
 * a quiet moment first; the line comes only when none does, and only while the computer is
 * connected.
 */
export function useUpdatedUnder(options: UpdatedOptions): {
  readonly asking: boolean;
  readonly reloadNow: () => void;
} {
  const first = useRef<string | undefined>(undefined);
  const [stale, setStale] = useState(false);
  const [asking, setAsking] = useState(false);
  const latest = useRef(options);
  latest.current = options;

  // Reads the latest options, so it is the same function for the life of the tab.
  const reloadNow = useCallback(() => {
    keepPlace(latest.current.place());
    (latest.current.reload ?? (() => globalThis.location.reload()))();
  }, []);

  useEffect(() => {
    const version = options.serverVersion;
    if (!options.enabled || version === undefined) return;
    if (first.current === undefined) first.current = version;
    else if (version !== first.current) setStale(true);
  }, [options.serverVersion, options.enabled]);

  useEffect(() => {
    if (!stale) return;
    const startedAt = Date.now();
    let touched = Date.now();
    const touch = () => {
      touched = Date.now();
    };
    const kinds = ["pointerdown", "keydown", "wheel", "touchstart"] as const;
    for (const kind of kinds) globalThis.addEventListener(kind, touch, { passive: true });
    const leftAlone = () =>
      globalThis.document?.visibilityState === "hidden" || Date.now() - touched >= IDLE_MS;
    const timer = setInterval(() => {
      // Not while the computer can't be reached: the wait goes on until it can.
      if (latest.current.connected && leftAlone() && (latest.current.quiet ?? quietNow)()) {
        clearInterval(timer);
        reloadNow();
      } else if (Date.now() - startedAt >= ASK_AFTER_MS) {
        setAsking(true);
      }
    }, QUIET_CHECK_MS);
    return () => {
      clearInterval(timer);
      for (const kind of kinds) globalThis.removeEventListener(kind, touch);
    };
  }, [stale, reloadNow]);

  return { asking: asking && options.connected, reloadNow };
}

/** The line, when a quiet moment never came. */
export function UpdatedLine(props: { readonly onReload: () => void }) {
  return (
    <div className="updated-line" role="status" data-testid="updated-line">
      <span>{UPDATED_LINE}</span>
      <button type="button" className="updated-line-reload" onClick={props.onReload}>
        Reload
      </button>
    </div>
  );
}
