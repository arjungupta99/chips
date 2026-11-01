/**
 * How the room moves on the web and the Mac (ADR 0242): the phone's model (ADR 0074, ADR 0075,
 * core's `roomMotion.ts`), on the page's own frames.
 *
 * Whatever changes in a room — a line landing, a thinking or status row coming or going, a
 * hand-off, a picture finishing its decode, the call strip opening under a thinking row — the
 * browser lays the room out at its new size at once, and the list put the reader back at its end in
 * the same breath: the whole conversation went up a row between one frame and the next (Arjun,
 * 28 October 2026: "the video is too jumpy", of the site's clip of the Mac). Now, from the frame a
 * change is drawn in, everything in the room is drawn where it was and goes to where it is laid out
 * on the room's spring:
 *
 * - The list's scroll stays where it was drawn and goes to the end on the spring, while the reader
 *   is there. Most of a change is this: the rows over a line that landed rise as the list scrolls,
 *   and the line comes up into view from under the fold.
 * - Each row is drawn where it was, its `translate` taking up whatever the scroll does not: a row
 *   under a line that landed over it (the thinking rows under a hand-off) holds still on the glass
 *   while the line comes in above it, and the rows over a row that went close over its place.
 * - A move that lands on a move keeps its speed, and everything keeps the room's one clock.
 * - A row that lands comes in under the row above it as that row is drawn, at its speed, and fades
 *   up as it comes. Where that is behind the row after it (a line landing over the thinking rows),
 *   it comes out from behind that row: no row is drawn over the row after it, so a row's faces
 *   and name do not show through the open ground beside that row's bubble.
 * - What goes from under the lines — a thinking row as its reply lands, a card once answered —
 *   fades where it stood while the rows close over its place. A line that goes has its own way of
 *   going (its dust, ADR 0167), and a line that leaves the window is only out of sight.
 *
 * Up the space the list keeps the reader's place itself (`MessageList`'s hold), and nothing here
 * moves what it lays out. With Reduce Motion, in a tab nobody can see, or with no screen to ask (a
 * test's), everything goes at once. So does whatever is laid out before the room's first frame has
 * been drawn: a room opens at its end.
 *
 * A row's place is read from the layout, without its translate, and the end the list goes to leaves
 * out what a row drawn below its place adds: the browser lets a list scroll as far as its rows are
 * drawn, and that would have taken the end with it.
 */

import {
  ROOM_CLOCK,
  ROOM_FADE_IN_MS,
  ROOM_FADE_OUT_MS,
  type RoomClock,
  type RoomMove,
  roomMoveAt,
  roomMoved,
  roomStarted,
  roomTicked,
} from "@chipschat/core";

/** The phone's fade, `1 − (1 − t)²`, as a curve the page can play: easing out, exactly. */
const FADE_EASING = "cubic-bezier(0.3333, 0.6667, 0.6667, 1)";
/** The phone's fade out, Reanimated's timing curve: easing in and out, on a square. */
const FADE_OUT_EASING = "cubic-bezier(0.455, 0.03, 0.515, 0.955)";
/** A scroll this far from where the room put it is the reader's, and the room lets go of it. */
const TAKEN_PX = 1;

export interface RoomMotion {
  /**
   * What the page lays out now, each row from where it was drawn. With the reader at the end
   * (`atEnd`) the list goes there, on the spring or at once; up the space the scroll is theirs.
   */
  readonly laidOut: (atEnd: boolean, lines: Lines) => void;
  /** Done with the list: nothing more is moved, and nothing is left drawn off its place. */
  readonly stop: () => void;
}

/** Which of the list's rows are the space's lines, as the list counts them. */
export interface Lines {
  /** Where in the space a row is, if it is one of its lines rather than what stands under them. */
  readonly indexOf: (row: Element) => number | undefined;
  /**
   * How many lines were on the page, to the last drawn, when the room was last laid out: a line new
   * to the page before them is one it had, drawn again as it comes near the window, which does not
   * arrive.
   */
  readonly had: number;
}

/**
 * How a change is laid out: on the room's spring, at the end; at once, at the end (Reduce Motion, a
 * hidden tab, a room still opening); or up the space, where the reader's place is the list's to keep.
 */
export type Way = "moving" | "atOnce" | "away";

/** A row as the room last laid it out: its top in the list, and its move from there. */
export interface Laid {
  readonly top: number;
  readonly move: RoomMove | undefined;
}

/**
 * Where the scroll is drawn for a change laid out with the list's end at `end`: where it was
 * (`was`), on its way to the end at the speed it had; at the end; or, up the space, where it stands
 * (`stands`). Drawn where it was unless the list is now shorter than that.
 */
export function scrollOf(
  way: Way,
  { was, stands, end }: { readonly was: number; readonly stands: number; readonly end: number },
  scroll: RoomMove | undefined,
  at: number,
): { readonly top: number; readonly scroll: RoomMove | undefined } {
  if (way === "away") return { top: stands, scroll: undefined };
  if (way === "atOnce") return { top: end, scroll: undefined };
  const top = Math.min(was, end);
  const velocity = scroll === undefined ? 0 : roomMoveAt(scroll, at).velocity;
  if (top === end && velocity === 0) return { top, scroll: undefined };
  return { top, scroll: { offset: top - end, velocity, since: at } };
}

/**
 * Each row's move for a change, in the list's order: drawn where it was, from where it is now laid
 * out. On the glass a row stood at its old top less the old scroll, plus where its move had it; it
 * is laid out at its new top less the new scroll (`scrolled`, the new less the old), and its move
 * takes up the difference, at the speed it had. A row new to the list comes in under the row above
 * it, with that row's move, and `arrives`; unless it is an `old` line drawn again. At once, nothing
 * is off its place; up the space, nothing new is, and what was going goes on.
 */
export function carried<K>(
  way: Way,
  laidBefore: (row: K) => Laid | undefined,
  places: ReadonlyMap<K, number>,
  {
    scrolled,
    at,
    old,
  }: { readonly scrolled: number; readonly at: number; readonly old: (row: K) => boolean },
): Map<K, Laid & { readonly arrives: boolean }> {
  const next = new Map<K, Laid & { readonly arrives: boolean }>();
  let above: RoomMove | undefined;
  for (const [row, top] of places) {
    const prior = laidBefore(row);
    const arrives = prior === undefined && way === "moving" && !old(row);
    let move: RoomMove | undefined;
    if (arrives) move = above;
    else if (prior !== undefined && way === "moving")
      move = roomMoved(prior.move, prior.top - top + scrolled, at);
    else if (prior !== undefined && way === "away") move = prior.move;
    next.set(row, { top, move, arrives });
    above = move;
  }
  return next;
}

/** How big a row is drawn, and where across the screen. */
interface Box {
  readonly height: number;
  readonly left: number;
  readonly width: number;
}

/**
 * A row on the page: as laid out, its box, and the translate and the clip off its foot it was last
 * drawn with, in pixels.
 */
interface Placed extends Box {
  laid: Laid;
  drawn: number;
  clipped: number;
}

/**
 * The room's motion over `list`, the scrolling element its rows are children of. `placed` is told
 * each scroll the room makes, so the list does not take it for the reader's.
 */
export function roomMotion(list: HTMLElement, placed: (top: number) => void): RoomMotion {
  let rows = new Map<Element, Placed>();
  /** The scroll on its way to the end: drawn this far from it, on the spring. */
  let scroll: RoomMove | undefined;
  /** Where the scroll goes: the end, as last laid out. */
  let goal = 0;
  /**
   * Where the scroll was drawn: where the room last put it, or the reader did. Kept, not read back
   * from the list between layouts: a read there lays the list out with whatever has changed since,
   * a row closing a step, and the browser has already taken the scroll up with a list grown
   * shorter, which is the change this room is about to draw (ADR 0167's delete, at the end).
   */
  let drawnTop = list.scrollTop;
  let clock: RoomClock = ROOM_CLOCK;
  let frame: number | undefined;
  /** Once the room's first frame has been drawn: until then, everything goes at once. */
  let opened = false;
  let opening: number | undefined;

  const onScroll = () => {
    if (scroll !== undefined) return;
    const top = byReader(list, drawnTop);
    if (top !== undefined) drawnTop = top;
  };
  list.addEventListener("scroll", onScroll, { passive: true });

  /** The scroll put at `top`; read back where the list is laid out, as it is in a layout. */
  const place = (top: number, laidOut: boolean) => {
    list.scrollTop = top;
    drawnTop = laidOut ? list.scrollTop : top;
    placed(drawnTop);
  };

  const step = (time: number) => {
    frame = undefined;
    clock = roomTicked(clock, time);
    const taken = scroll === undefined ? undefined : byReader(list, drawnTop);
    if (taken !== undefined) {
      // The reader took the list: it is theirs from where they put it.
      scroll = undefined;
      drawnTop = taken;
    } else if (scroll !== undefined) {
      const now = roomMoveAt(scroll, clock.at);
      if (now.settled) scroll = undefined;
      place(goal + now.offset, false);
    }
    if (draw(rows, clock.at) || scroll !== undefined) frame = requestAnimationFrame(step);
  };

  const open = () => {
    if (opened || opening !== undefined || list.clientHeight === 0) return;
    // Two frames: what the first is laid out with, after its frame callbacks, goes at once too.
    opening = requestAnimationFrame(() => {
      opening = requestAnimationFrame(() => {
        opening = undefined;
        opened = true;
      });
    });
  };

  return {
    laidOut: (atEnd, lines) => {
      open();
      const way = wayOf(atEnd, opened);
      if (way === "moving") clock = roomStarted(clock, performance.now());
      const at = clock.at;
      const { places, boxes, end } = laidOutIn(list, rows);
      const was = drawnTop;
      const drawn = scrollOf(way, { was, stands: list.scrollTop, end }, scroll, at);
      scroll = drawn.scroll;
      goal = end;
      const scrolled = drawn.top - was;
      const before = rows;
      const old = (row: Element) => (lines.indexOf(row) ?? Number.POSITIVE_INFINITY) < lines.had;
      const next = carried(way, (row) => before.get(row)?.laid, places, { scrolled, at, old });
      rows = relaid(before, next, boxes);
      if (way === "moving") wentFromFoot(list, before, rows, lines, was);
      if (atEnd) place(drawn.top, true);
      else drawnTop = drawn.top;
      if (draw(rows, at) || scroll !== undefined) frame ??= requestAnimationFrame(step);
    },
    stop: () => {
      if (frame !== undefined) cancelAnimationFrame(frame);
      if (opening !== undefined) cancelAnimationFrame(opening);
      frame = undefined;
      opening = undefined;
      list.removeEventListener("scroll", onScroll);
      for (const [row, each] of rows) {
        shift(row, each, 0);
        clip(row, each, 0);
      }
      rows = new Map();
      scroll = undefined;
    },
  };
}

/**
 * Where the reader put the list, if it was they who moved it from where the room drew it (`drawn`):
 * not the browser, taking the scroll up with a list grown shorter under it, which leaves it at the
 * list's end.
 */
function byReader(list: HTMLElement, drawn: number): number | undefined {
  const top = list.scrollTop;
  if (Math.abs(top - drawn) <= TAKEN_PX) return undefined;
  const end = list.scrollHeight - list.clientHeight;
  if (top < drawn && top >= end - TAKEN_PX) return undefined;
  return top;
}

/** How this change is laid out: at the end, on the spring once the room has opened and it moves. */
function wayOf(atEnd: boolean, opened: boolean): Way {
  if (!atEnd) return "away";
  return opened && moves() ? "moving" : "atOnce";
}

/**
 * The rows on the page after a change, each with its move: a row that arrives fades up, and a row
 * no longer on the page is left at its place.
 */
function relaid(
  rows: ReadonlyMap<Element, Placed>,
  next: ReadonlyMap<Element, Laid & { readonly arrives: boolean }>,
  boxes: ReadonlyMap<Element, Box>,
): Map<Element, Placed> {
  const placed = new Map<Element, Placed>();
  for (const [row, each] of next) {
    if (each.arrives) fadeUp(row);
    const was = rows.get(row);
    placed.set(row, {
      ...(boxes.get(row) ?? { height: 0, left: 0, width: 0 }),
      laid: { top: each.top, move: each.move },
      drawn: was?.drawn ?? 0,
      clipped: was?.clipped ?? 0,
    });
  }
  for (const [row, each] of rows) {
    if (placed.has(row)) continue;
    shift(row, each, 0);
    clip(row, each, 0);
  }
  return placed;
}

/**
 * Each row's translate for `at` on the room's clock, and what of it is clipped where it would be
 * drawn over the row after it; whether any row is still on its way.
 */
function draw(rows: ReadonlyMap<Element, Placed>, at: number): boolean {
  let going = false;
  let above: [Element, Placed] | undefined;
  for (const [row, each] of rows) {
    const offset = offsetAt(each, at);
    if (offset !== 0) going = true;
    shift(row, each, offset);
    if (above !== undefined) clip(above[0], above[1], overlap(above[1], each));
    above = [row, each];
  }
  if (above !== undefined) clip(above[0], above[1], 0);
  return going;
}

/** How far a row is drawn from where it is laid out at `at`; once its move is done, nothing. */
function offsetAt(each: Placed, at: number): number {
  const { top, move } = each.laid;
  if (move === undefined) return 0;
  const now = roomMoveAt(move, at);
  if (!now.settled) return now.offset;
  each.laid = { top, move: undefined };
  return 0;
}

/** How far the foot of a row, as drawn, reaches past the top of the row after it, as drawn. */
function overlap(row: Placed, next: Placed): number {
  const past = row.laid.top + row.height + row.drawn - (next.laid.top + next.drawn);
  return past > 0.5 ? Math.min(past, row.height) : 0;
}

/**
 * Where the top of each row of the list is laid out, in its order, from the top of what scrolls and
 * with its translate taken off; and where the scroll stands at the list's end. That is the
 * scroller's own end, less what a row drawn below its place adds past the foot of what is laid out
 * and the list's padding: the browser lets a list scroll as far as its rows are drawn. The spacers
 * that stand in for rows off the page are not rows.
 */
function laidOutIn(
  list: HTMLElement,
  rows: ReadonlyMap<Element, Placed>,
): {
  readonly places: Map<Element, number>;
  readonly boxes: Map<Element, Box>;
  readonly end: number;
} {
  const box = list.getBoundingClientRect();
  const origin = box.top + list.clientTop - list.scrollTop;
  const places = new Map<Element, number>();
  const boxes = new Map<Element, Box>();
  let foot = 0;
  let lowest = 0;
  for (const child of list.children) {
    const edge = child.getBoundingClientRect();
    const drawn = rows.get(child)?.drawn ?? 0;
    const top = edge.top - origin - drawn;
    foot = Math.max(foot, top + edge.height);
    lowest = Math.max(lowest, top + edge.height + drawn);
    if (child.classList.contains("msgs-spacer")) continue;
    places.set(child, top);
    boxes.set(child, { height: edge.height, left: edge.left, width: edge.width });
  }
  const padding = Number.parseFloat(getComputedStyle(list).paddingBottom) || 0;
  const past = Math.max(0, lowest - foot - padding);
  return { places, boxes, end: Math.max(0, list.scrollHeight - list.clientHeight - past) };
}

/** A row drawn `px` below where it is laid out (above, for less than nought). */
function shift(row: Element, each: Placed, px: number): void {
  if (each.drawn === px) return;
  each.drawn = px;
  (row as HTMLElement).style.translate = px === 0 ? "" : `0 ${px}px`;
}

/** A row with `px` of its foot clipped away; the rest of it, and whatever it lets stray, not. */
function clip(row: Element, each: Placed, px: number): void {
  if (each.clipped === px) return;
  each.clipped = px;
  (row as HTMLElement).style.clipPath = px === 0 ? "" : `inset(-100vmax -100vmax ${px}px)`;
}

/** A row that has landed fades up as it rises, unless it comes in by an animation of its own. */
function fadeUp(row: Element): void {
  if (typeof row.animate !== "function" || row.getAnimations().length > 0) return;
  row.animate([{ opacity: 0 }, { opacity: 1 }], { duration: ROOM_FADE_IN_MS, easing: FADE_EASING });
}

/** What went from under the lines since the last change, faded where it stood at the scroll then. */
function wentFromFoot(
  list: HTMLElement,
  before: ReadonlyMap<Element, Placed>,
  now: ReadonlyMap<Element, Placed>,
  lines: Lines,
  top: number,
): void {
  for (const [row, each] of before) {
    const gone = !now.has(row) && !row.isConnected;
    if (gone && lines.indexOf(row) === undefined) fadeOut(list, row, each, top);
  }
}

/**
 * What went from under the lines, faded where it stood: the row itself, which the page has let go
 * of, drawn over the list in a frame of the list's size, where it was drawn when the scroll stood at
 * `top`, until it has faded. Nothing in it is anything to find or to read out any more.
 */
function fadeOut(list: HTMLElement, row: Element, each: Placed, top: number): void {
  const node = row as HTMLElement;
  if (typeof node.animate !== "function") return;
  const box = list.getBoundingClientRect();
  const frame = document.createElement("div");
  frame.setAttribute("aria-hidden", "true");
  frame.style.cssText = `position:fixed;left:${box.left}px;top:${box.top}px;width:${box.width}px;height:${box.height}px;overflow:hidden;pointer-events:none`;
  for (const named of [node, ...node.querySelectorAll("[data-testid]")]) {
    named.removeAttribute("data-testid");
  }
  node.removeAttribute("role");
  node.removeAttribute("aria-live");
  const at = each.laid.top + list.clientTop - top + each.drawn;
  node.style.cssText += `;position:absolute;margin:0;left:${each.left - box.left}px;top:${at}px;width:${each.width}px;translate:none;clip-path:none`;
  frame.append(node);
  document.body.append(frame);
  // Put back on a page, what it had already played plays again; it is as it was, at their ends.
  for (const playing of node.getAnimations({ subtree: true })) {
    if (Number.isFinite(playing.effect?.getTiming().iterations ?? 1)) playing.finish();
  }
  node.animate([{ opacity: 1 }, { opacity: 0 }], {
    duration: ROOM_FADE_OUT_MS,
    easing: FADE_OUT_EASING,
    fill: "forwards",
  });
  // A timer, not the animation's end: a page that holds its animations (the film's) never ends it.
  setTimeout(() => frame.remove(), ROOM_FADE_OUT_MS + 40);
}

/** Whether the room moves at all: not with Reduce Motion, nor in a hidden tab, nor with no screen to ask. */
function moves(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  if (document.visibilityState === "hidden") return false;
  return !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
