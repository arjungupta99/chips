/**
 * A room taking a new width beside the columns (ADR 0284's second addendum), as the iPad's room
 * takes one (ADR 0279): once, with every bubble gliding from where it was to where it lands.
 *
 * Laid out again at every width on the way, the room's lines wrapped again on every frame, the
 * list heard each row change height, and the room's spring chased every row's new place a frame
 * at a time: measured at 1440 with a space's details opening, bubbles' tops turned back up to ten
 * times and a bubble's edge jumped 190 pixels in a frame (Arjun, 7 November 2026: "I am seeing
 * some abruptness. everything should look very polished").
 *
 * Now, once the room's words have gone (`Columns`' lead), what stands in the room is noted where it
 * is drawn (`noteGlide`). The columns set off, and in the same frame the lines take the room's new
 * width and hold it while the room's box moves round them (`startGlide`): nothing in them is laid
 * out again until they have landed. Each bubble, face and picture is drawn where it was and glides
 * to where it is laid out on the columns' own curve and time, a bubble's box growing or shrinking
 * to its new shape as it goes. The words, laid out at the new width already, come back once all of
 * it has landed. Since the columns and the glides share one curve and one start, a bubble goes one
 * way, from its old place to its new one, however the room's edges move.
 */

import { PANE_MS } from "../Columns.tsx";

/** The columns' curve (`--pane-ease`, the iPad's `PadBarMotion`). */
const PANE_EASE = "cubic-bezier(0.32, 0.72, 0, 1)";

/**
 * What is drawn in the room while its words are away, and so what glides: a line's bubble, the face
 * at a reply's foot, the pictures under it, a card, and a fold of agents talking. Its route, its
 * time and its words are away with the rest of the words.
 */
const GLIDES = ".msg > .ui-avatar, .msg-body > :not(.msg-route), .chatter-toggle";

/** The room's lines: a column of 928 at most, 89.6% of the room, and 18 clear of either side. */
const LINES_MOST = 928;
const LINES_SHARE = 0.896;
const LINES_CLEAR = 18;

/** What stood in the room, and where it was drawn. */
export type GlideNote = readonly { readonly el: HTMLElement; readonly at: DOMRect }[];

/**
 * What stands in the room within sight of its window, where it is drawn now: the glide's start.
 * Nothing far off the window glides; it is laid out where it lands.
 */
export function noteGlide(list: HTMLElement): GlideNote {
  const window = list.getBoundingClientRect();
  if (window.width === 0) return [];
  const near = window.height;
  const noted: { el: HTMLElement; at: DOMRect }[] = [];
  for (const el of list.querySelectorAll<HTMLElement>(GLIDES)) {
    const at = el.getBoundingClientRect();
    if (at.bottom < window.top - near || at.top > window.bottom + near) continue;
    noted.push({ el, at });
  }
  return noted;
}

/** The padding either side of the room's lines in a room this wide, as the stylesheet says it. */
function linesClear(room: number): number {
  return Math.max(LINES_CLEAR, (room - Math.min(LINES_MOST, room * LINES_SHARE)) / 2);
}

/**
 * The lines take a room `room` wide and hold it, and everything noted glides from where it was
 * drawn to where it is laid out now. `keep` keeps the reader's place as the lines take the width,
 * before anything is read where it lands: the list's new end, or the line they were reading up the
 * space where it stood. What it gives back lets the lines go, landed or not, and `landed` is told
 * then.
 *
 * Kept after the glides had set off, by the list's own hold a frame later, every line up the space
 * was drawn a whole move off at the start and glided back, and the line being read ended up 431
 * pixels from where it was as a space's details closed (Arjun, 7 November 2026: "the scroll
 * position bounces a lot if I am somewhere in the middle").
 *
 * Nothing is laid out again on the way. Everything is read where it lands before anything is drawn
 * off its place: read after the first glides had started, a row was measured at its bubble's old
 * height, and every row snapped to its new place as the glide let go. A bubble whose shape changes
 * is laid out in a box that holds both shapes, the space under it kept as its new shape leaves it,
 * and drawn clipped from its old shape to its new one: grown and shrunk as a box, its words (away)
 * wrapped again at every size on the way, and what stood under it moved twice.
 */
export function startGlide(
  list: HTMLElement,
  noted: GlideNote,
  room: number,
  keep: () => void,
  landed: () => void = () => undefined,
): () => void {
  list.dataset["held"] = "true";
  list.style.setProperty("--held-room", `${room}px`);
  list.style.setProperty("--held-clear", `${linesClear(room)}px`);
  keep();

  // Where each lands, and how tall its row is, all read before any of it is drawn elsewhere.
  const landing = landingOf(noted);
  const rows = lockRows(landing);
  const boxes = landing
    .filter(reshapes)
    .map((each) => ({ ...each, box: holdBoth(each.el, each.at, each.now) }));
  // Read again once the boxes hold both shapes, before anything glides.
  const moving = [
    ...landing.flatMap((each) => glideTo(each, each.el.getBoundingClientRect())),
    ...boxes.map(clipBetween),
  ];

  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    clearTimeout(timer);
    for (const each of moving) each.cancel();
    for (const { el } of boxes) letBoxGo(el);
    for (const row of rows) row.style.height = "";
    delete list.dataset["held"];
    list.style.removeProperty("--held-room");
    list.style.removeProperty("--held-clear");
    landed();
  };
  // Let go as the columns come to rest, where the lines are laid out as they hold.
  const timer = setTimeout(release, PANE_MS + 20);
  return release;
}

/** Held where they land until let go: ended first, a frame showed a box at both shapes unclipped. */
const TIMING: KeyframeAnimationOptions = { duration: PANE_MS, easing: PANE_EASE, fill: "forwards" };

/** What was noted, where it lands: in its row, and at which side of it (`right`, a line of yours). */
interface Landing {
  readonly el: HTMLElement;
  readonly at: DOMRect;
  readonly now: DOMRect;
  readonly row: HTMLElement | null;
  readonly right: boolean;
}

function landingOf(noted: GlideNote): Landing[] {
  return noted
    .filter(({ el }) => el.isConnected && typeof el.animate === "function")
    .map(({ el, at }) => {
      const row = el.closest<HTMLElement>(".msgs > *");
      return {
        el,
        at,
        now: el.getBoundingClientRect(),
        row,
        right: row?.dataset["mine"] === "true",
      };
    });
}

/** Each row at the height it lands at, whatever is drawn in it on the way. */
function lockRows(landing: readonly Landing[]): HTMLElement[] {
  const rows = new Map<HTMLElement, number>();
  for (const { row } of landing) {
    if (row !== null && !rows.has(row)) rows.set(row, row.getBoundingClientRect().height);
  }
  for (const [row, height] of rows) row.style.height = `${height}px`;
  return [...rows.keys()];
}

/** A bubble whose shape changes. */
function reshapes({ el, at, now }: Landing): boolean {
  return (
    el.classList.contains("bub") && (moves(at.width - now.width) || moves(at.height - now.height))
  );
}

/** From where it was drawn to where it is laid out (`from`), by its side of the row. */
function glideTo({ el, at, right }: Landing, from: DOMRect): Animation[] {
  const x = right ? at.right - from.right : at.left - from.left;
  const y = at.top - from.top;
  if (!moves(x) && !moves(y)) return [];
  return [el.animate([{ transform: `translate(${x}px, ${y}px)` }, { transform: "none" }], TIMING)];
}

/** A bubble's box drawn clipped from its old shape to its new one, from its side of the row. */
function clipBetween({
  el,
  at,
  now,
  right,
  box,
}: Landing & { readonly box: { readonly width: number; readonly height: number } }): Animation {
  const corners = cornersOf(el);
  const clipTo = (shape: DOMRect) => {
    const across = `${box.width - shape.width}px`;
    const down = `${box.height - shape.height}px`;
    return right
      ? `inset(0 0 ${down} ${across} round ${corners})`
      : `inset(0 ${across} ${down} 0 round ${corners})`;
  };
  return el.animate([{ clipPath: clipTo(at) }, { clipPath: clipTo(now) }], TIMING);
}

/**
 * A bubble laid out in a box that holds its old shape and its new one, from its new shape's corner
 * (where it lands), the space under it kept as its new shape: what stands under it stays put.
 */
function holdBoth(el: HTMLElement, at: DOMRect, now: DOMRect): { width: number; height: number } {
  const width = Math.max(at.width, now.width);
  const height = Math.max(at.height, now.height);
  const under = Number.parseFloat(getComputedStyle(el).marginBottom) || 0;
  el.style.boxSizing = "border-box";
  el.style.maxWidth = "none";
  el.style.width = `${width}px`;
  el.style.height = `${height}px`;
  el.style.marginBottom = `${under - (height - now.height)}px`;
  el.style.overflow = "hidden";
  return { width, height };
}

function letBoxGo(el: HTMLElement): void {
  for (const name of [
    "boxSizing",
    "maxWidth",
    "width",
    "height",
    "marginBottom",
    "overflow",
  ] as const) {
    el.style[name] = "";
  }
}

/** A bubble's four corners, for a clip drawn round as the bubble is. */
function cornersOf(el: HTMLElement): string {
  const style = getComputedStyle(el);
  const first = (value: string) => value.split(" ")[0] ?? "0px";
  return [
    style.borderTopLeftRadius,
    style.borderTopRightRadius,
    style.borderBottomRightRadius,
    style.borderBottomLeftRadius,
  ]
    .map(first)
    .join(" ");
}

/** Half a pixel or more: under that is no move. */
function moves(px: number): boolean {
  return Math.abs(px) >= 0.5;
}
