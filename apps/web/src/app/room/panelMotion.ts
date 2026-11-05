/**
 * The run panel coming and going beside a room (ADR 0268 §9, its addendum): it stands there only
 * while a run is going, so in the middle of a room it comes when a run starts and goes when it ends.
 * Until 3 November it did both in one frame: the room's column, its field and the buttons at the
 * head's end jumped 150 and 300 pixels sideways between one frame and the next.
 *
 * Now the panel slides in from the window's edge and back out to it, and what the room lays out
 * anew is drawn where it was and glides to where it is (a FLIP), on `--motion-slow` and `--ease`,
 * by transform and opacity alone. The grid changes a render after the panel is asked for, so the
 * room is measured where it stood first: both measures are taken before the frame is painted.
 *
 * A room opened is drawn as it is, at once, panel and all, as the iPad opens one (ADR 0256): only a
 * panel that comes or goes in the room that is open moves. So does nothing with Reduce Motion, or
 * with no screen to ask (a test's).
 */

import { useLayoutEffect, useRef, useState } from "react";
import { motionMs } from "../motionTokens.ts";
import { ease, reduceMotion } from "../viewer/open.ts";

/**
 * What the room lays out anew when the panel comes or goes, each measured where its content starts,
 * and what of it moves: the field's contents and not its band, whose ground and rule across the
 * room's foot, moved, stood over the sidebar's foot and short of the panel.
 */
const MOVED = [
  { measured: ".conv > .msgs", moves: ".conv > .msgs" },
  { measured: ".conv > .ui-composer", moves: ".conv > .ui-composer > *" },
  { measured: ".conv-h-r", moves: ".conv-h-r" },
] as const;

/** How the panel is drawn: come in this room, going from it, or simply there. */
export type PanelMotion = "came" | "leaving" | undefined;

export interface Panel<T> {
  /** Whether the shell lays the panel's column out. */
  readonly laid: boolean;
  /** What the panel shows: what is asked for, or what it showed as it goes. */
  readonly shown: T | undefined;
  readonly motion: PanelMotion;
}

/**
 * The panel for `side` beside the room `roomId`: laid out, shown and moving as above. `side` is
 * what the shell would show; the panel keeps showing what it last showed while it goes.
 */
export function usePanelMotion<T>(side: T | undefined, roomId: string | undefined): Panel<T> {
  const on = side !== undefined;
  const [laid, setLaid] = useState(on);
  const [motion, setMotion] = useState<PanelMotion>(undefined);
  const last = useRef(side);
  const room = useRef(roomId);
  /** Where the room stood as the panel was asked to come or go, and whether it is to be laid out. */
  const first = useRef<{ readonly at: ReadonlyMap<string, number>; readonly laid: boolean }>(
    undefined,
  );
  /** Stops waiting for the slide under way to end. */
  const waiting = useRef<(() => void) | undefined>(undefined);
  if (side !== undefined) last.current = side;

  useLayoutEffect(() => {
    const sameRoom = room.current === roomId;
    room.current = roomId;
    if (on === laid) return;
    waiting.current?.();
    waiting.current = undefined;
    if (!sameRoom || !moves()) {
      setMotion(undefined);
      setLaid(on);
      return;
    }
    first.current = { at: places(), laid: on };
    setMotion(on ? "came" : "leaving");
    setLaid(on);
    waiting.current = untilSlid(on ? "runpanel-in" : "runpanel-out", () => setMotion(undefined));
  }, [on, laid, roomId]);

  // The pass the grid changed in: measured where it stood before, the room glides from there. Not
  // the pass it was measured in, whose effects run straight after: the grid is as it was then, and
  // until 4 November the two measures were the same, nothing glided, and the room jumped.
  useLayoutEffect(() => {
    const before = first.current;
    if (before === undefined || before.laid !== laid) return;
    first.current = undefined;
    glide(before.at, places());
  });

  useLayoutEffect(() => () => waiting.current?.(), []);

  // Asked for, it is drawn once its column is laid out; no longer asked for, it is drawn while its
  // column is still there (the pass before the grid changes, kept mounted) and while it goes.
  const kept = !on && (laid || motion === "leaving");
  return {
    laid,
    shown: on ? (laid ? side : undefined) : kept ? last.current : undefined,
    motion: on || kept ? motion : undefined,
  };
}

/** How long past its own length a slide is waited for, should its end never come. */
const LATE_MS = 1000;

/**
 * Calls `ended` once the panel's slide (`keyframes`, as `styles.css` names it) has ended, as the
 * page says, and not on a clock of the slide's length: on a loaded machine a slide starts a frame or
 * more after it is asked for, and the clock took its `data-motion` away before it had ended, which
 * cancelled it (approval-loop's check for the page at rest, waiting on every animation, was handed
 * an abort, 4 November). The clock stays, later, for a slide whose end never comes: one put away
 * first. Returns what stops the waiting.
 */
function untilSlid(keyframes: string, ended: () => void): () => void {
  const onEnd = (event: AnimationEvent) => {
    const panel = event.target;
    if (event.animationName !== keyframes || !(panel instanceof Element)) return;
    if (!panel.classList.contains("runpanel")) return;
    stop();
    ended();
  };
  const late = setTimeout(() => {
    stop();
    ended();
  }, slowMs() + LATE_MS);
  document.addEventListener("animationend", onEnd, true);
  function stop(): void {
    clearTimeout(late);
    document.removeEventListener("animationend", onEnd, true);
  }
  return stop;
}

/** Where what the room lays out anew starts, across the window. */
function places(): ReadonlyMap<string, number> {
  const out = new Map<string, number>();
  for (const { measured } of MOVED) {
    const element = document.querySelector<HTMLElement>(measured);
    if (element === null) continue;
    const padding = Number.parseFloat(getComputedStyle(element).paddingLeft) || 0;
    out.set(measured, element.getBoundingClientRect().left + padding);
  }
  return out;
}

/** Each drawn where it was, gliding to where it is. */
function glide(before: ReadonlyMap<string, number>, after: ReadonlyMap<string, number>): void {
  const duration = slowMs();
  const easing = ease();
  for (const { measured, moves } of MOVED) {
    const was = before.get(measured);
    const now = after.get(measured);
    if (was === undefined || now === undefined || Math.abs(was - now) < 0.5) continue;
    for (const element of document.querySelectorAll<HTMLElement>(moves)) {
      if (typeof element.animate !== "function") continue;
      element.animate([{ transform: `translateX(${was - now}px)` }, { transform: "none" }], {
        duration,
        easing,
      });
    }
  }
}

function slowMs(): number {
  return motionMs("--motion-slow");
}

/** Whether the panel moves at all: not with Reduce Motion, nor with no screen to ask. */
function moves(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return !reduceMotion();
}
