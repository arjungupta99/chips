/**
 * The messages, with only the rows near the viewport in the DOM.
 *
 * A space holds every line it has ever had, and Phase 1 put every one of them on the
 * page: a thousand messages rendered, but the main thread stayed busy for seconds afterwards,
 * and ten thousand would not have met the plan's 60 fps budget (Phase 1 review, finding 1).
 * This keeps the rows in view — and a margin on either side, so a scroll finds them already
 * there — and stands two spacers in for the rest, sized from what the rows measured. A row
 * nobody has seen yet is assumed to be `ESTIMATE` tall; the moment it is on screen its real
 * height replaces the guess and the spacers follow.
 *
 * The rows stay direct children of `.msgs`, because that is where the space's layout
 * lives — a message aligns itself left or right, a system line centres — so this component
 * finds them by walking from the top spacer rather than wrapping them in anything.
 *
 * Staying at the end of the space is this component's job, because it is the component
 * that moves the ground: measuring a row changes how tall the list is, and a scrollbar that
 * jumps must not be mistaken for a reader who has scrolled away. So while the reader is at the
 * end the window is anchored there rather than derived from the scroll position, the scroller
 * is taken back to the bottom after every render and every change of size in the room, and
 * following ends only when the reader actually moves back up the space — not when the ground
 * moves under them. How it goes there is the room's motion (`room/roomMotion.ts`, ADR 0242): on
 * the room's spring, everything drawn where it was until it gets there, as on the phone; at once
 * under Reduce Motion, and while the room opens, so its first frame is already at its end.
 *
 * Up the space, the ground moves too: the rows above the reader are drawn at a guess and
 * measured as they come into the window, and a photo in one finishes decoding later, and each
 * moves everything under it. So there the row in the middle of the window is held where it
 * stood (`held`), the scroller moved by however far it was pushed, as the browser's own scroll
 * anchoring would — which is off on `.msgs`, since it fought following the end, and which the
 * Mac app's WebKit does not have. Without it, a line a search landed on drifted down and off the
 * screen as the rows over it were measured (ADR 0132's addendum).
 *
 * The row is held by itself, not by where it stands in the list. A line deleted over it moved
 * every row after it up a place, and the hold, looking for the row by its old place, found the
 * next one and put the scroller back by a whole row; Undo did it again the other way (the web,
 * 15 October 2026, on Arjun's "the scrolling moves abruptly", ADR 0167).
 *
 * So are the window's ends. A line drawn above rows already on the page — a harness's word the
 * room held while its run was at work, let go after the lines that came since (ADR 0147, point
 * 12) — moved every row under it down a place, and a window kept as places stopped one short:
 * the newest row was taken off the page and drawn again a render later as a new element. A photo
 * there flashed back in, and the viewer's return gave the focus to a tile that had gone, so it
 * fell to the page (`e2e/viewer.spec.ts` at a phone's height, 18 October 2026). The window keeps
 * which rows it begins and ends with, and finds them again each time it draws.
 *
 * A container that reports no height — before layout, and under jsdom — tells us nothing about
 * what is in view, so everything is rendered. That is what keeps the component tests honest.
 */

import {
  Fragment,
  type ReactNode,
  type RefObject,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { type RoomMotion, roomMotion } from "./room/roomMotion.ts";

/** How tall a row nobody has measured is assumed to be. */
const ESTIMATE = 64;
/** Rows kept in the DOM above and below the viewport. */
const OVERSCAN = 8;
/** What `.msgs` puts between one child and the next; a row's place has to count it. */
const GAP = 12;
/**
 * How many times a jump aims again, each time with what the rows drawn on the way measured,
 * before it settles for where it is. A guess far from a row unmeasured is put right in a few.
 */
const AIMS = 12;

/**
 * The rows are whatever the space view makes of its lines — a line, or a run of harness-to-
 * harness lines folded into one (M3.3) — so the list is generic over them; it needs only how
 * many there are and how to draw each.
 */
export interface MessageListProps<T> {
  readonly items: readonly T[];
  /** What a row is, wherever it stands: its line's id, or its fold's or day's. */
  readonly keyOf: (item: T) => string;
  /** The scrolling element the rows live in. */
  readonly scroller: RefObject<HTMLDivElement | null>;
  readonly row: (item: T) => ReactNode;
  /** A row to jump to (M5.4): a pin's, or a search hit's. The nonce makes the same row again a jump. */
  readonly focus?: Focus | undefined;
  /** How many lines of yours the room has sent: each takes the reader to the end (`homeward`). */
  readonly sent?: number | undefined;
}

export interface Focus {
  readonly index: number;
  readonly nonce: number;
}

/** As much of the scrolling element as following needs. Named so a test can stand one in. */
export interface Scroller {
  readonly scrollTop: number;
  readonly scrollHeight: number;
  readonly clientHeight: number;
}

interface Visible {
  readonly first: number;
  /** Exclusive. */
  readonly last: number;
  readonly before: number;
  readonly after: number;
  /** The row the window begins with, by its key, found again wherever a line drawn above moves it. */
  readonly head?: string | undefined;
  /** And the row it ends with. */
  readonly tail?: string | undefined;
}

export function MessageList<T>(props: MessageListProps<T>) {
  const { items, keyOf, scroller } = props;
  const heights = useRef<number[]>([]);
  const anchor = useRef<HTMLDivElement>(null);
  const foot = useRef<HTMLDivElement>(null);
  const indices = useRef(new WeakMap<Element, number>());
  const observer = useRef<ResizeObserver>(null);
  const [visible, setVisible] = useState<Visible>(everything(items.length));
  const shown = useRef(visible);
  /** True while the reader is at the end of the space, so new lines carry them along. */
  const following = useRef(true);
  const lastTop = useRef(0);
  /** The furthest down the reader could be last time, so a list that shrank is told from a scroll. */
  const lastMax = useRef(0);
  /** Up the space: the row in the middle of the window, and how far below the scroller's top. */
  const held = useRef<Held | undefined>(undefined);
  /** How the room's rows and scroll go from where they were drawn to where they are laid out. */
  const motion = useRef<RoomMotion | undefined>(undefined);
  /**
   * How many rows were on the page, to the last drawn, when the room was last laid out: a row past
   * them has just landed. Not how many it knew of: a line is drawn a pass after the list hears of
   * it, once the window has caught up, and counted then it was an old line, drawn again.
   */
  const had = useRef(0);
  /** How much of the list each row on the page took when last seen (`grownUnder`). */
  const standingAt = useRef(new WeakMap<Element, number>());

  /**
   * The scrolling element. React gives a parent its ref only after its children's layout effects
   * have run, so on the room's first pass it is the rows' own parent: without it the first pass
   * could neither narrow the window nor go to the end, and the room was drawn once at the top of
   * its history and then jumped down to its end (the site's clip of the Mac, 28 October 2026).
   */
  const list = useCallback(
    () => scroller.current ?? anchor.current?.parentElement ?? null,
    [scroller],
  );

  /**
   * The rows on the page now: what lies between the spacers, read off the page. Not counted out
   * from `shown`, which is the window asked for, and which a scroll changes before React has drawn
   * it. Counted out, a window one row shorter took the rows from the old page and left its last
   * off; where that last row was a long reply across the middle of the window, no row was noted as
   * held, the hold put the scroller back to the row's old place, and every scroll down was undone
   * (Arjun, 14 October 2026: the Garage door room stuck short of its end).
   */
  const drawn = useCallback(() => rowsBetween(anchor.current, foot.current), []);

  /** The rows as this last drew, for a window worked out after it, by a scroll or a measure. */
  const listed = useRef({ items, keyOf });
  listed.current = { items, keyOf };

  const recompute = useCallback(() => {
    const places = windowOf(list(), heights.current, following.current);
    if (places === undefined) return;
    const next = named(places, listed.current.items, listed.current.keyOf);
    if (same(next, shown.current)) return;
    shown.current = next;
    setVisible(next);
  }, [list]);

  /**
   * Take the reader back to the last row, as the room moves (`roomMotion`), and lay out what
   * changed. Cheap, and a no-op when nothing has. Up the space it only notes where the rows are.
   */
  const stick = useCallback(() => {
    const el = list();
    if (el === null) return;
    // Each scroll the room makes, so the scroll event it causes is not read as the reader moving.
    motion.current ??= roomMotion(el, (top) => {
      lastTop.current = top;
    });
    const lines = indices.current;
    motion.current.laidOut(following.current, {
      indexOf: (row) => lines.get(row),
      had: had.current,
    });
    had.current = lastOf(drawn(), indices.current) + 1;
    if (!following.current) return;
    // And how long the list was then, so a list that grew is not read as the reader moving back.
    lastTop.current = el.scrollTop;
    lastMax.current = Math.max(0, el.scrollHeight - el.clientHeight);
  }, [list, drawn]);
  // Done with on leaving, and made again on coming back (as React's strict mode does at once).
  useEffect(
    () => () => {
      motion.current?.stop();
      motion.current = undefined;
    },
    [],
  );

  /** Put the held row back where it stood, wherever what was drawn or measured above it moved it. */
  const hold = useCallback(
    (rows: readonly Element[]) => {
      const el = scroller.current;
      const at = held.current;
      if (el === null || at === undefined || following.current) return;
      // Gone from the page — the line deleted, or windowed out — there is nothing to hold by.
      if (!rows.includes(at.row)) return;
      const moved = topIn(el, at.row) - at.top;
      if (Math.abs(moved) < 0.5) return;
      el.scrollTop += moved;
      // The ground moved, not the reader: the scroll this causes is not them going back.
      lastTop.current = el.scrollTop;
    },
    [scroller],
  );

  /** Which row to hold from here: the one across the middle of the window, while up the space. */
  const note = useCallback(
    (rows: readonly Element[]) => {
      const el = scroller.current;
      if (el === null || following.current) {
        held.current = undefined;
        return;
      }
      held.current = middleOf(el, rows, indices.current) ?? held.current;
    },
    [scroller],
  );

  // The rows and their guesses follow the space's length.
  if (heights.current.length !== items.length) growTo(heights.current, items.length);
  // The window's rows where they stand now, which is not where they stood if a line has been put
  // in or taken out above them since it was worked out.
  const first = Math.min(placeOf(items, keyOf, visible.head, visible.first), items.length);
  const last = Math.max(
    first,
    Math.min(placeOf(items, keyOf, visible.tail, visible.last - 1) + 1, items.length),
  );

  /**
   * Jump to a row (M5.4): the list stops following the end, scrolls to where the row is
   * estimated to be, and centres it once it has been drawn and measured — aiming again with what
   * was measured on the way while it is not drawn yet. Once per jump: the room hands a new focus
   * object every time it draws, and a reader who has scrolled on from the line is not pulled
   * back to it by the next line to arrive. Its nonce, or its coming at all (a line the room did
   * not have yet), is what makes a jump.
   *
   * A row already drawn is glided to, centred, as the phone glides its list to a row it has (ADR
   * 0268 addendum); one up the space that is not is put in place at once, as the phone places one
   * unseen, and so is any while the room is opening, which opens at its line as it is.
   * Until 3 November every jump went at once, a reply's quote to the line it answers too, and the
   * next search hit in the same room.
   */
  const focus = useRef(props.focus);
  focus.current = props.focus;
  const jump = props.focus?.nonce;
  const landing = useRef<number | undefined>(undefined);
  const aims = useRef(0);
  // Once the room's first two frames are drawn: a jump before then is the room opening at a line.
  const opened = useRef(false);
  useEffect(() => {
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => {
        opened.current = true;
      });
    });
    return () => cancelAnimationFrame(frame);
  }, []);
  useLayoutEffect(() => {
    const el = scroller.current;
    const index = focus.current?.index;
    if (jump === undefined || index === undefined || el === null) return;
    following.current = false;
    aims.current = 0;
    // Where the reader was is not to be kept: they are going to the line.
    held.current = undefined;
    const there = drawn().find((row) => indices.current.get(row) === index);
    if (there !== undefined && opened.current && glides()) {
      landing.current = undefined;
      there.scrollIntoView?.({ block: "center", behavior: "smooth" });
      return;
    }
    landing.current = index;
    el.scrollTop = offsetOf(heights.current, index);
    lastTop.current = el.scrollTop;
    recompute();
  }, [jump, recompute, scroller, drawn]);

  /**
   * A line of yours sent from up the space: the room follows it to the end, as the phone's follows
   * yours (`useFollowOwn`), on the room's spring from within a window of the end, and at once from
   * further up, where a glide would cross rows not drawn; the line lands there as any line does
   * (ADR 0268 addendum). Until 3 November a send from up the space left the reader there, and the
   * line out of sight.
   */
  const sent = props.sent ?? 0;
  // biome-ignore lint/correctness/useExhaustiveDependencies: a line sent is what takes it home.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (sent === 0 || el === null || following.current) return;
    following.current = true;
    held.current = undefined;
    landing.current = undefined;
    const gap = el.scrollHeight - el.clientHeight - el.scrollTop;
    if (gap > el.clientHeight || !glides()) {
      el.scrollTop = el.scrollHeight;
      lastTop.current = el.scrollTop;
      motion.current?.moved();
    }
    recompute();
    stick();
  }, [sent]);

  useEffect(() => {
    const el = scroller.current;
    if (el === null) return;
    const onScroll = () => {
      // A scroll the list made itself — a hold — is not the reader moving, and the row it holds
      // was noted where the hold put it. Noted again here, it was noted where a row closing over
      // it had taken it since, and the next hold put back only half of each frame's closing.
      const ours = Math.abs(el.scrollTop - lastTop.current) < 0.5;
      follow(el, following, lastTop, lastMax);
      recompute();
      if (!ours) note(drawn());
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", recompute);
    return () => {
      el.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", recompute);
    };
  }, [recompute, scroller, note, drawn]);

  // Made before the rows are first measured, so that it watches them from the room's first frame.
  useLayoutEffect(() => {
    if (typeof ResizeObserver === "undefined") return;
    // A row can change height after React is done with it — a photo finishing its decode — and
    // the spacers would keep the old number without this. So can what stands under the rows (a
    // thinking row's call strip opening) and the list itself (the window, the field growing),
    // which move the end. And so did every row on the room's first frame while rows were laid out
    // at the stylesheet's guess (`content-visibility`, until 3 November): a room that did not hear
    // of it stayed at the top of its history until the next line came (the site's clip of the Mac,
    // 28 October 2026).
    const sizes = new WeakMap<Element, number>();
    const watcher = new ResizeObserver((entries) => {
      const targets = entries.map((entry) => entry.target);
      const el = list();
      const under = grownUnder(el, held.current, targets, indices.current, standingAt.current);
      const rowsMoved = measure(heights.current, indices.current, targets);
      // Under a pixel is not a row moving, but it is still the scroll's to take: noted and not
      // taken, a closing row's last frames left the lines under it a pixel or two up.
      if (!rowsMoved && !resized(targets, indices.current, sizes) && under === 0) return;
      const rows = drawn();
      hold(rows);
      // A line under the held row that grew or shrank in the window takes the scroll with it, so
      // the lines under it stand still and those over it move, as the phone's list does from its
      // foot (ADR 0167): a line breaking into dust there closed the lines under it up.
      if (el !== null && under !== 0 && !following.current) {
        el.scrollTop += under;
        lastTop.current = el.scrollTop;
      }
      recompute();
      stick();
      note(rows);
    });
    observer.current = watcher;
    return () => {
      watcher.disconnect();
      observer.current = null;
    };
  }, [recompute, stick, hold, note, drawn, list]);

  // Measure what was just drawn. Running after every render is what makes a guess temporary:
  // the first paint of a row replaces its estimate, and the spacers close the difference.
  useLayoutEffect(() => {
    const rows = drawn();
    for (const [offset, element] of rows.entries()) {
      indices.current.set(element, first + offset);
    }
    watch(observer, rows, list());
    // Seen as React drew it: a line coming back stands at nothing as it starts to open (`Dust`).
    for (const row of rows) {
      if (!standingAt.current.has(row)) standingAt.current.set(row, standing(row));
    }
    measure(heights.current, indices.current, rows);
    hold(rows);
    land(rows);
    // Both, every time: a line that arrived below the window changes no measurement but does
    // change how tall the bottom spacer is, and a reader at the end has to be put back there
    // after every row that finds its real height.
    recompute();
    stick();
    note(rows);
  });

  /** The row a jump is after: centred once it is drawn, and aimed for again until it is. */
  function land(rows: readonly Element[]): void {
    const index = landing.current;
    const el = scroller.current;
    if (index === undefined || el === null) return;
    const target = rows.find((row) => indices.current.get(row) === index);
    if (target !== undefined) {
      landing.current = undefined;
      target.scrollIntoView?.({ block: "center" });
    } else if (aims.current < AIMS) {
      aims.current += 1;
      el.scrollTop = offsetOf(heights.current, index);
    } else {
      landing.current = undefined;
    }
    lastTop.current = el.scrollTop;
  }

  // React attaches a parent's ref after its children's layout effects have run, so on the very
  // first pass the scroller is not there to be measured and everything is still on the page.
  // This is the pass that narrows it, and it runs after every render for the same reason.
  useEffect(() => {
    recompute();
    stick();
  });

  return (
    <Fragment>
      <div
        className="msgs-spacer"
        data-testid="rows-before"
        ref={anchor}
        style={{ height: visible.before }}
      />
      {items.slice(first, last).map((item) => props.row(item))}
      <div className="msgs-spacer" ref={foot} style={{ height: visible.after }} />
    </Fragment>
  );
}

/** A row held still up the space: which, and how far below the scroller's top it stood. */
interface Held {
  readonly row: Element;
  readonly top: number;
}

/** How far below the scroller's top edge a row stands, as drawn now. */
function topIn(el: Element, row: Element): number {
  return row.getBoundingClientRect().top - el.getBoundingClientRect().top;
}

/** The row across the middle of the window. Nothing for a scroller that has no height yet. */
function middleOf(
  el: Element,
  rows: readonly Element[],
  indices: WeakMap<Element, number>,
): Held | undefined {
  const box = el.getBoundingClientRect();
  if (box.height === 0) return undefined;
  const middle = box.top + box.height / 2;
  for (const row of rows) {
    const edge = row.getBoundingClientRect();
    if (edge.bottom >= middle && indices.has(row)) return { row, top: edge.top - box.top };
  }
  return undefined;
}

/** The place in the space of the last of `rows` that is a row of it; less than nought for none. */
function lastOf(rows: readonly Element[], indices: WeakMap<Element, number>): number {
  let last = -1;
  for (const row of rows) last = Math.max(last, indices.get(row) ?? -1);
  return last;
}

/** Every row, for a list nobody can measure yet. */
function everything(count: number): Visible {
  return { first: 0, last: count, before: 0, after: 0 };
}

/** Grow or shrink the heights to the space's length, new rows at the estimate. */
function growTo(heights: number[], count: number): void {
  if (heights.length > count) heights.length = count;
  while (heights.length < count) heights.push(ESTIMATE + GAP);
}

/**
 * Which rows the viewport is over, plus the margin. The walk is linear in the number of rows —
 * ten thousand additions, tens of microseconds — which is what a scroll can afford, where
 * rendering ten thousand rows is not.
 */
function windowOf(
  el: HTMLElement | null,
  heights: readonly number[],
  following: boolean,
): Visible | undefined {
  if (el === null) return undefined;
  const height = el.clientHeight;
  if (height === 0) return everything(heights.length);
  if (following) return endOf(heights, height);
  const top = el.scrollTop;
  const bottom = top + height;
  let first = 0;
  let offset = 0;
  while (first < heights.length && offset + (heights[first] as number) <= top) {
    offset += heights[first] as number;
    first += 1;
  }
  let last = first;
  let tail = offset;
  while (last < heights.length && tail < bottom) {
    tail += heights[last] as number;
    last += 1;
  }
  const from = Math.max(0, first - OVERSCAN);
  const to = Math.min(heights.length, last + OVERSCAN);
  return { first: from, last: to, before: total(heights, 0, from), after: total(heights, to) };
}

/** The last rows: what a reader who has not scrolled away is looking at. */
function endOf(heights: readonly number[], height: number): Visible {
  let first = heights.length;
  let filled = 0;
  while (first > 0 && filled < height) {
    first -= 1;
    filled += heights[first] as number;
  }
  const from = Math.max(0, first - OVERSCAN);
  return { first: from, last: heights.length, before: total(heights, 0, from), after: 0 };
}

function total(heights: readonly number[], from: number, to = heights.length): number {
  let sum = 0;
  for (let index = from; index < to; index += 1) sum += heights[index] as number;
  return sum;
}

function same(a: Visible, b: Visible): boolean {
  return (
    a.first === b.first &&
    a.last === b.last &&
    a.before === b.before &&
    a.after === b.after &&
    a.head === b.head &&
    a.tail === b.tail
  );
}

/** A window worked out by places, with the rows at its two ends named. */
function named<T>(window: Visible, items: readonly T[], keyOf: (item: T) => string): Visible {
  const head = items[window.first];
  const tail = items[window.last - 1];
  return {
    ...window,
    head: head === undefined ? undefined : keyOf(head),
    tail: tail === undefined ? undefined : keyOf(tail),
  };
}

/**
 * Where a row stands now: at its old place, as it almost always is, or wherever a line put in or
 * taken out above it has moved it. A row that has gone, or a window that never named one, keeps
 * the old place.
 */
function placeOf<T>(
  items: readonly T[],
  keyOf: (item: T) => string,
  key: string | undefined,
  place: number,
): number {
  if (key === undefined) return place;
  const there = items[place];
  if (there !== undefined && keyOf(there) === key) return place;
  const found = items.findIndex((item) => keyOf(item) === key);
  return found < 0 ? place : found;
}

/** The elements between the two spacers: the rows the last render put on the page. */
function rowsBetween(top: HTMLDivElement | null, bottom: HTMLDivElement | null): Element[] {
  const rows: Element[] = [];
  let node = top?.nextElementSibling ?? null;
  while (node !== null && node !== bottom) {
    rows.push(node);
    node = node.nextElementSibling;
  }
  return rows;
}

/** Record what the rows actually measure. True when any of them moved. */
function measure(
  heights: number[],
  indices: WeakMap<Element, number>,
  rows: readonly Element[],
): boolean {
  let moved = false;
  for (const element of rows) {
    const index = indices.get(element);
    const under = marginUnder(element);
    const height = (element as HTMLElement).offsetHeight + under;
    if (index === undefined || height <= under || heights[index] === height) continue;
    heights[index] = height;
    moved = true;
  }
  return moved;
}

/** What the bubbles of one turn stand apart by (ADR 0268), in place of `.msgs`'s gap. */
const TURN_GAP = 2;

/**
 * What a row carries under it: `.msgs`'s gap, or the two pixels between the bubbles of one turn,
 * which the row says by its place (`data-place`, as the stylesheet reads it).
 */
function marginUnder(element: Element): number {
  const place = element instanceof HTMLElement ? element.dataset["place"] : undefined;
  return place === "first" || place === "middle" ? TURN_GAP : GAP;
}

/**
 * Whether the reader is still at the end. They stop following by scrolling back up the
 * space, and start again by returning to the last row. Measuring rows moves the
 * scrollbar without anyone touching it, which is why a gap on its own does not end it.
 */
export function follow(
  el: Scroller,
  following: RefObject<boolean>,
  lastTop: RefObject<number>,
  lastMax: RefObject<number>,
): void {
  const max = Math.max(0, el.scrollHeight - el.clientHeight);
  const gap = max - el.scrollTop;
  // A list that got shorter takes the reader up with it: the browser clamps `scrollTop` to the
  // new maximum, and that is the ground moving, not somebody scrolling back. Only a fall bigger
  // than the fall in the maximum is theirs. Without this, a replay whose rows measure shorter
  // than the estimate they were given stops following partway down a long space, and the
  // newest message is left off the screen (found by an end-to-end reload over 500 messages).
  //
  // A list that grew can too: laying out what arrived can move `scrollTop` back as it goes. The
  // Mac app's WebKit took the room up 120 pixels as a picture 240 pixels tall decoded at its end,
  // and the approval card under it stayed below the fold (the demo's walk, 21 October 2026). So
  // only a fall bigger than the change in the maximum, either way, is theirs.
  const moved = Math.abs(lastMax.current - max);
  const wentBack = el.scrollTop < lastTop.current - moved - 4;
  lastTop.current = el.scrollTop;
  lastMax.current = max;
  following.current = gap < 48 || (following.current && !wentBack);
}

/**
 * Watch exactly the rows on the page, the list, and what stands in it beside them; the rows that
 * have scrolled away are no longer ours.
 */
function watch(
  observer: RefObject<ResizeObserver | null>,
  rows: readonly Element[],
  el: Element | null,
): void {
  const watcher = observer.current;
  if (watcher === null) return;
  watcher.disconnect();
  for (const element of rows) watcher.observe(element);
  if (el === null) return;
  watcher.observe(el);
  for (const element of el.children) {
    if (!rows.includes(element) && !element.classList.contains("msgs-spacer")) {
      watcher.observe(element);
    }
  }
}

/**
 * Whether something in the room that is not a row changed height: a thinking row, an approval
 * card, the list itself. Each is reported once as it is first watched, which is no change.
 */
function resized(
  targets: readonly Element[],
  indices: WeakMap<Element, number>,
  sizes: WeakMap<Element, number>,
): boolean {
  let changed = false;
  for (const target of targets) {
    if (indices.has(target)) continue;
    const height = (target as HTMLElement).offsetHeight;
    const was = sizes.get(target);
    sizes.set(target, height);
    if (was !== undefined && was !== height) changed = true;
  }
  return changed;
}

/**
 * How much the lines in the window at or under the held row have grown (less than nought, shrunk)
 * since they were last drawn: a line breaking into dust, a photo in one decoding, a card folding.
 * Each row's height is noted as React draws it, and as it changes (`seen`), with the space under it
 * as it stands: a row closing over a line gone takes that too, and missed, the lines under it rose
 * by the list's gap. What a row first measures as it is drawn is not a change: a guess put right
 * moves nothing here, and the hold has those.
 */
function grownUnder(
  el: Element | null,
  held: Held | undefined,
  targets: readonly Element[],
  indices: WeakMap<Element, number>,
  seen: WeakMap<Element, number>,
): number {
  let grown = 0;
  const bottom = el?.getBoundingClientRect().bottom ?? 0;
  for (const target of targets) {
    if (!indices.has(target) || el === null) continue;
    const height = standing(target);
    const was = seen.get(target);
    seen.set(target, height);
    if (was !== undefined && was !== height && underHeld(held, target, bottom)) {
      grown += height - was;
    }
  }
  return grown;
}

/** Whether a row is the held row or under it, and in the window (its top over `bottom`). */
function underHeld(held: Held | undefined, row: Element, bottom: number): boolean {
  if (held === undefined || !held.row.isConnected) return false;
  const under =
    row === held.row ||
    (held.row.compareDocumentPosition(row) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
  return under && row.getBoundingClientRect().top < bottom;
}

/** How much of the list a row takes as it stands now: its height and the space under it. */
function standing(row: Element): number {
  if (!(row instanceof HTMLElement) || !row.isConnected) return 0;
  return row.offsetHeight + (Number.parseFloat(getComputedStyle(row).marginBottom) || 0);
}

/** Where a row starts, by the guesses and measurements so far, each carrying its margin. */
function offsetOf(heights: readonly number[], index: number): number {
  return total(heights, 0, Math.min(index, heights.length));
}

/** Whether a jump to a row on the page glides: not with Reduce Motion, nor with no screen to ask. */
function glides(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
