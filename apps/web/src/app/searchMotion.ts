/**
 * How Search's results come and go on the Mac and the web (ADR 0189), as on the phone: core's
 * `searchArrivals` says which rows a change brought and where each stands in the wave, and this
 * moves the list's rows by the Web Animations API, which the browser runs off the main thread.
 *
 * - **A row that arrives** fades up and rises into its place, a beat after the row above it.
 * - **A row that stays** is taken from where it was drawn to where it now stands (its offset before
 *   the change, played back to nothing). Each move is added to any still running, so a second
 *   change while rows are moving carries on from where they are drawn rather than jumping.
 * - **A row that goes** is drawn once more where it stood, a copy no one can reach, and fades
 *   there under the rows that close over it, from as strong as it was drawn: one typed away while
 *   it was still fading up does not flash whole first (`fadingUp`). The copy lies in a layer of
 *   its own under the list (`ghosts`), whose children React never draws, so nothing of React's is
 *   touched.
 * - **Only what is in view moves.** A row off the window is laid out by the browser alone, so a
 *   search of every space costs no more than the rows that can be seen.
 * - **Measured as drawn.** A row the browser has not drawn yet stands at a guessed height
 *   (`content-visibility: auto`) until the frame is painted, so the rows a change brings near the
 *   top are laid out in full before anything is measured (`OPENED`), and where every row stands is
 *   read again whenever the list changes size. Measured on the guess, the rows under the new ones
 *   were moved from the wrong place and jumped once drawn (the browser, 17 October 2026).
 * - **Where it was on the screen.** A change can move the whole list: the chips come under the
 *   field with the first letter and go with the last, and a shorter list can scroll it back. A row
 *   that stays, a row that goes and whatever else fades out over the list (`data-leaving`, the
 *   backdrop) are each taken from where they were on the screen, not where they were in the list,
 *   so nothing fading jumps with it (3 November 2026: "everything should have smooth transitions").
 * - **Nothing found waits for the typing to pause** (`data-hold`): while a search is still to be
 *   asked for, the line saying it found nothing arrives once typing has paused as long as the
 *   messages wait to be asked for (`SEARCH_PAUSE_MS`), so a quick next letter takes it away before
 *   it is seen rather than flashing it.
 *
 * A rise and a move are on UIKit's spring, the phone's, drawn here as CSS's `linear()` from core's
 * `springCurve`; a browser without `linear()` gets a Bézier close to it. With less motion asked
 * for, nothing travels: rows fade, and a row that stays is simply where it now is.
 */

import {
  arrivalDelay,
  SEARCH_ARRIVAL,
  SEARCH_PAUSE_MS,
  type SearchItem,
  searchArrivals,
  springCurve,
} from "@chipschat/core";
import { type RefObject, useLayoutEffect, useRef } from "react";

const { fade, fadeMs, leaveMs, rise, spring } = SEARCH_ARRIVAL;
const FADE = `cubic-bezier(${fade.join(", ")})`;
/** A spring's look, for a browser that cannot draw `linear()`. */
const NEAR_SPRING = "cubic-bezier(0.25, 0.8, 0.3, 1)";

/** Rows this far beyond the window are moved too: one coming into it, or one leaving it. */
const MARGIN = 160;

/** The arriving rows among this many from the top are laid out in full as they come. */
const OPENED = 60;

/** The spring as an easing and how long it runs, worked out once, when a row first moves. */
let springEasing: { readonly easing: string; readonly ms: number } | undefined;
function springLike(): { readonly easing: string; readonly ms: number } {
  if (springEasing !== undefined) return springEasing;
  const { ms, shares } = springCurve(spring);
  const linear = `linear(${shares.map((share) => Math.round(share * 10_000) / 10_000).join(", ")})`;
  const drawable = typeof CSS !== "undefined" && CSS.supports("transition-timing-function", linear);
  springEasing = { easing: drawable ? linear : NEAR_SPRING, ms };
  return springEasing;
}

/** A row as it was laid out in the list: where, and how big. */
interface Laid {
  readonly element: HTMLElement;
  readonly top: number;
  readonly left: number;
  readonly width: number;
  readonly height: number;
}

interface Drawn {
  readonly items: readonly SearchItem[];
  readonly rows: ReadonlyMap<string, Laid>;
  /** How far down the screen the list's top stood: the scrolling column's place, less its scroll. */
  readonly at: number;
}

/** The list's rows by their key (`data-key`), with where each is laid out in the list. */
function rowsOf(list: HTMLElement): Drawn["rows"] {
  const rows = new Map<string, Laid>();
  for (const child of list.children) {
    if (!(child instanceof HTMLElement)) continue;
    const key = child.dataset["key"];
    if (key === undefined) continue;
    rows.set(key, {
      element: child,
      top: child.offsetTop,
      left: child.offsetLeft,
      width: child.offsetWidth,
      height: child.offsetHeight,
    });
  }
  return rows;
}

/** How far down the screen the list's top stands, in the scrolling column's own terms. */
function atOf(list: HTMLElement): number {
  const scroller = list.parentElement;
  return scroller === null ? 0 : scroller.offsetTop - scroller.scrollTop;
}

/** The part of the list the window shows, with a margin either side, in the list's own terms. */
function inViewOf(list: HTMLElement): (top: number, height: number) => boolean {
  const scroller = list.parentElement;
  const from = (scroller?.scrollTop ?? 0) - list.offsetTop - MARGIN;
  const to = from + (scroller?.clientHeight ?? window.innerHeight) + 2 * MARGIN;
  return (top, height) => top + height > from && top < to;
}

function lessMotion(): boolean {
  return (
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * Moves the rows of `list` as `items` changes: each a `<li data-key>` child, keyed as the items
 * are. A row that goes fades in `ghosts`, an empty layer laid where the list starts, under it.
 * Called on every render; when nothing has come, gone or moved, nothing is animated.
 */
export function useResultsMotion(
  list: RefObject<HTMLElement | null>,
  ghosts: RefObject<HTMLElement | null>,
  items: readonly SearchItem[],
): void {
  const drawn = useRef<Drawn | undefined>(undefined);
  const opened = useRef<readonly HTMLElement[]>([]);
  useLayoutEffect(() => {
    const element = list.current;
    if (element === null) return;
    const before = drawn.current;
    const arrivals = searchArrivals(before?.items, items);
    open(element, arrivals, opened);
    const now: Drawn = { items, rows: rowsOf(element), at: atOf(element) };
    drawn.current = now;
    // A browser with no Web Animations (a test's document) draws the list as it is.
    if (before === undefined || typeof element.animate !== "function") return;
    play(element, ghosts.current, arrivals, before, now);
  }, [list, ghosts, items]);
  // Where the rows stand, read again as the list changes size: a row drawn at last, a window
  // narrowed, words that wrap. Read after the browser has laid the list out, before it is painted.
  useLayoutEffect(() => {
    const element = list.current;
    if (element === null || typeof ResizeObserver === "undefined") return;
    const watcher = new ResizeObserver(() => {
      const now = drawn.current;
      if (now !== undefined) {
        drawn.current = { items: now.items, rows: rowsOf(element), at: atOf(element) };
      }
    });
    watcher.observe(element);
    return () => watcher.disconnect();
  }, [list]);
}

/** What a change does to the rows in view: those it brought arrive, those it kept move, those it dropped go. */
function play(
  list: HTMLElement,
  layer: HTMLElement | null,
  arrivals: ReadonlyMap<string, number>,
  before: Drawn,
  now: Drawn,
): void {
  const inView = inViewOf(list);
  const less = lessMotion();
  // How far the list itself moved on the screen: a row is taken from where it was seen.
  const shift = before.at - now.at;
  for (const [key, row] of now.rows) {
    const order = arrivals.get(key);
    if (order !== undefined) {
      if (inView(row.top, row.height)) arrive(row.element, order, less);
      continue;
    }
    const was = before.rows.get(key);
    if (!less && moved(was, row, shift, inView)) move(row.element, was.top + shift - row.top);
  }
  if (layer !== null) gone(layer, list.offsetTop + shift, before, now, inView);
  if (list.parentElement !== null) hold(list.parentElement, shift);
}

/** What holds each fading thing over the list where it was seen, and how far from its place. */
const holding = new WeakMap<Element, { readonly still: Animation; readonly by: number }>();

/**
 * Each thing over the list that is fading out (`data-leaving`, the backdrop) kept where it was seen
 * while the list moves under it, until it is gone; one that stops fading is let go, back to where
 * the list puts it.
 */
function hold(scroller: HTMLElement, shift: number): void {
  for (const child of scroller.children) {
    const held = holding.get(child);
    if (!child.hasAttribute("data-leaving")) {
      held?.still.cancel();
      holding.delete(child);
      continue;
    }
    if (shift === 0 || !(child instanceof HTMLElement) || typeof child.animate !== "function") {
      continue;
    }
    const by = shift + (held?.by ?? 0);
    held?.still.cancel();
    const at = { transform: `translateY(${by}px)` };
    holding.set(child, { still: child.animate([at, at], { duration: 1, fill: "forwards" }), by });
  }
}

/** The rows a change dropped from where the window shows, each faded where it stood. */
function gone(
  layer: HTMLElement,
  listTop: number,
  before: Drawn,
  now: Drawn,
  inView: (top: number, height: number) => boolean,
): void {
  for (const [key, was] of before.rows) {
    if (!now.rows.has(key) && inView(was.top, was.height)) leave(layer, listTop, was);
  }
}

/** Whether a row kept by a change has moved on the screen, where the window shows it before or after. */
function moved(
  was: Laid | undefined,
  row: Laid,
  shift: number,
  inView: (top: number, height: number) => boolean,
): was is Laid {
  if (was === undefined || Math.abs(was.top + shift - row.top) < 0.5) return false;
  return inView(was.top, was.height) || inView(row.top, row.height);
}

/**
 * The rows that have just arrived near the top, laid out in full rather than at the browser's guess,
 * so they are measured as they will be drawn; the ones opened for the change before go back to being
 * laid out only near the window, at the size they were last drawn.
 */
function open(
  list: HTMLElement,
  arrivals: ReadonlyMap<string, number>,
  opened: { current: readonly HTMLElement[] },
): void {
  for (const row of opened.current) row.style.removeProperty("content-visibility");
  const now: HTMLElement[] = [];
  const children = list.children;
  for (let at = 0; at < Math.min(children.length, OPENED); at += 1) {
    const row = children[at];
    if (!(row instanceof HTMLElement)) continue;
    const key = row.dataset["key"];
    if (key === undefined || !arrivals.has(key)) continue;
    row.style.setProperty("content-visibility", "visible");
    now.push(row);
  }
  opened.current = now;
}

/** Each arriving row's fade up, while it runs: how strong a row that goes was drawn. */
const fadingUp = new WeakMap<HTMLElement, Animation>();

/** How strong a row is drawn: whole, unless its fade up is still on its way. */
function strengthOf(row: HTMLElement): number {
  const fade = fadingUp.get(row);
  if (fade === undefined || fade.playState === "finished") return 1;
  return fade.effect?.getComputedTiming().progress ?? 0;
}

/**
 * In on the wave: up from `rise` under its place, fading up, `order` beats after the first; a row
 * held (`data-hold`) waits as long again as typing has to pause before the messages are asked for.
 */
function arrive(row: HTMLElement, order: number, less: boolean): void {
  const delay = arrivalDelay(order) + (row.dataset["hold"] === undefined ? 0 : SEARCH_PAUSE_MS);
  const fading = row.animate([{ opacity: 0 }, { opacity: 1 }], {
    duration: fadeMs,
    delay,
    easing: FADE,
    fill: "backwards",
  });
  fadingUp.set(row, fading);
  if (less) return;
  const { easing, ms } = springLike();
  row.animate([{ transform: `translateY(${rise}px)` }, { transform: "translateY(0)" }], {
    duration: ms,
    delay,
    easing,
    fill: "backwards",
    composite: "add",
  });
}

/** From `by` pixels off its new place, to it: added to any move still running. */
function move(row: HTMLElement, by: number): void {
  const { easing, ms } = springLike();
  row.animate([{ transform: `translateY(${by}px)` }, { transform: "translateY(0)" }], {
    duration: ms,
    easing,
    composite: "add",
  });
}

/**
 * A row gone from the list, drawn once more where it stood and faded there: a copy, out of the
 * reading order and the pointer's way, under the rows that close over it.
 */
function leave(layer: HTMLElement, listTop: number, was: Laid): void {
  const from = strengthOf(was.element);
  if (from <= 0.02) return;
  const ghost = was.element.cloneNode(true) as HTMLElement;
  ghost.removeAttribute("data-key");
  // Unlit, and nameless: the arrows find a row by its id, and the copy is no row (ADR 0263).
  ghost.removeAttribute("data-lit");
  for (const named of ghost.querySelectorAll("[id]")) named.removeAttribute("id");
  ghost.inert = true;
  ghost.style.top = `${listTop + was.top}px`;
  ghost.style.left = `${was.left}px`;
  ghost.style.width = `${was.width}px`;
  ghost.style.height = `${was.height}px`;
  layer.append(ghost);
  const fading = ghost.animate([{ opacity: from }, { opacity: 0 }], {
    duration: leaveMs * from,
    easing: FADE,
    fill: "forwards",
  });
  const gone = () => ghost.remove();
  fading.addEventListener("finish", gone);
  fading.addEventListener("cancel", gone);
}
