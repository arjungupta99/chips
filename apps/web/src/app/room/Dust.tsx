/**
 * A message breaking into dust as it is deleted, and forming again from it on Undo (ADR 0167): the
 * desktop's half of what the phone draws (`apps/mobile/src/spaces/Dust.tsx`).
 *
 * The specks are core's (`makeSpecks`, `speckAt`), so they move here as they do on the phone; they
 * are painted on one canvas over the whole window, drawn into `document.body` for the reason the
 * line's menu is (`LineMenu.tsx`): the room's rows live deep in a scroller whose `contain` and
 * `content-visibility` would redefine what fixed means for anything inside it. The bubble itself
 * is wiped by a mask whose edge crosses it from the left as the specks let go, set on the element
 * each frame rather than through React, so a deletion draws no row again until it is over.
 *
 * Their colours are the bubble's own, read from the page as drawn: your own wear the room's field
 * at the height they stand in the list (`colourField.ts`), anybody else's their ground. Any colour
 * the stylesheet can say — a variable, `oklch`, a `color-mix` — is turned into its three channels
 * by painting it on a one-pixel canvas and reading the pixel back.
 *
 * With Reduce Motion there is no dust: the bubble fades, and the room closes at once.
 */

import { DUST_MS, makeSpecks, type Speck, speckAt, WIPE_MS, WIPE_SOFT } from "@chipschat/core";
import {
  createContext,
  type ReactNode,
  type RefObject,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

/**
 * Lines on their way back by Undo, by id: put here before the store is told, so the row drawn for
 * the line again knows it is one coming back, and opens its place and forms there rather than
 * simply being there. The row takes itself off as it is drawn.
 */
export const returning = new Set<string>();

/** How long a row takes to close over a line gone, or to open for one coming back. */
export const CLOSE_MS = 240;
/** What a row's closing and opening move. */
const SIZES = new Set(["height", "margin-bottom"]);
/** The bubble fades in this long with Reduce Motion, where there is no dust. */
const FADE_MS = 220;

type Rgb = readonly [number, number, number];

/** One deletion's dust, as the canvas draws it. */
interface Ask {
  readonly box: DOMRect;
  readonly specks: readonly (Speck & { readonly fill: string })[];
  readonly backwards: boolean;
  /** Each frame, with the clock: where the wipe is is the row's to draw. */
  readonly onFrame: (t: number) => void;
  readonly onDone: () => void;
  start?: number;
}

/** How a row asks for dust: the same object for the room's life, so no row draws again for it. */
export interface DustRoom {
  readonly ask: (ask: Omit<Ask, "start">) => () => void;
  /** Reduce Motion: no dust. */
  readonly still: () => boolean;
  /** The room's list, whose height the field your own bubbles wear is spread over. */
  readonly list: () => HTMLElement | null;
  /** A line has gone for the reader alone: the room offers Undo. */
  readonly hidden: (lineId: string) => void;
}

const Room = createContext<DustRoom | undefined>(undefined);

export function useDustRoom(): DustRoom | undefined {
  return useContext(Room);
}

/** The room's dust: the canvas over the window, and the way its rows ask for some. */
export function DustProvider({
  list,
  onHidden,
  children,
}: {
  readonly list: RefObject<HTMLElement | null>;
  readonly onHidden: (lineId: string) => void;
  readonly children: ReactNode;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const told = useRef(onHidden);
  told.current = onHidden;
  const asks = useRef<Ask[]>([]);
  const frame = useRef<number | undefined>(undefined);
  const [room] = useState<DustRoom>(() => {
    const draw = (now: number) => {
      frame.current = undefined;
      asks.current = drawn(canvas.current, asks.current, now);
      if (asks.current.length > 0) frame.current = requestAnimationFrame(draw);
    };
    return {
      ask: (ask) => {
        const held: Ask = { ...ask };
        asks.current = [...asks.current, held];
        frame.current ??= requestAnimationFrame(draw);
        return () => {
          asks.current = asks.current.filter((each) => each !== held);
        };
      },
      still: () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true,
      list: () => list.current,
      hidden: (lineId) => told.current(lineId),
    };
  });
  useEffect(
    () => () => {
      if (frame.current !== undefined) cancelAnimationFrame(frame.current);
    },
    [],
  );
  return (
    <Room value={room}>
      {children}
      {/* Only paint, and outside every landmark: hidden from a screen reader, which had it as
          content of its own (17 October 2026, the approval loop's accessibility check). */}
      {createPortal(
        // biome-ignore lint/a11y/noAriaHiddenOnFocusable: a canvas with no tabindex takes no focus.
        <canvas ref={canvas} className="dust" data-testid="dust" aria-hidden="true" />,
        document.body,
      )}
    </Room>
  );
}

/** One frame of every deletion's dust; what is still in the air after it. */
function drawn(canvas: HTMLCanvasElement | null, asks: readonly Ask[], now: number): Ask[] {
  const context = canvas?.getContext("2d");
  if (canvas === null || context === null || context === undefined) return [];
  sized(canvas);
  const scale = window.devicePixelRatio || 1;
  context.setTransform(scale, 0, 0, scale, 0, 0);
  context.clearRect(0, 0, canvas.width, canvas.height);
  const left: Ask[] = [];
  for (const ask of asks) {
    ask.start ??= now;
    const run = Math.min(DUST_MS, now - ask.start);
    const t = ask.backwards ? DUST_MS - run : run;
    ask.onFrame(t);
    painted(context, ask, t);
    if (run < DUST_MS) left.push(ask);
    else ask.onDone();
  }
  context.globalAlpha = 1;
  return left;
}

/** One deletion's specks, where they are at `t`. */
function painted(context: CanvasRenderingContext2D, ask: Ask, t: number): void {
  for (const speck of ask.specks) {
    const at = speckAt(speck, t, ask.box);
    if (at === undefined) continue;
    context.globalAlpha = at.opacity;
    context.fillStyle = speck.fill;
    context.fillRect(at.x - at.size / 2, at.y - at.size / 2, at.size, at.size);
  }
}

/** The canvas the size of the window, in the screen's own pixels. */
function sized(canvas: HTMLCanvasElement): void {
  const scale = window.devicePixelRatio || 1;
  const width = Math.round(window.innerWidth * scale);
  const height = Math.round(window.innerHeight * scale);
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
}

/** What a row is doing about its line: breaking away, or forming again. */
export interface Breaking {
  /** What happens once it has broken: gone for the reader, or for everyone. Nothing, forming. */
  readonly after?: "me" | "everyone" | undefined;
  readonly backwards: boolean;
  /** Back by Undo: the room opens the line's place first, and it forms there. */
  readonly opens?: boolean | undefined;
}

interface Calls {
  readonly onWiped: () => void;
  readonly onDone: () => void;
}

/** One row's breaking, from the frame it starts to the one it is over. */
interface Run {
  readonly row: HTMLElement;
  /** What is wiped, and where the dust comes from: the bubble, or the files alone. */
  readonly words: HTMLElement | null;
  readonly breaking: Breaking;
  readonly room: DustRoom;
  readonly calls: RefObject<Calls>;
  readonly timers: ReturnType<typeof setTimeout>[];
  over: boolean;
  cancel?: (() => void) | undefined;
}

/**
 * The wipe and the dust for one row, while it breaks or forms. `row` is the `.msg`. `onWiped` is
 * when the line may go (the wipe has crossed it, and for the reader alone the room has closed
 * over it); `onDone` when the dust has settled, or the line formed again.
 *
 * Before the first paint, so a line coming back is never seen before it forms. The dust of a line
 * breaking outlives its row: it is in the air while the room closes, and after the line has gone.
 */
export function useCrumble(
  row: RefObject<HTMLElement | null>,
  breaking: Breaking | undefined,
  calls: Calls,
): void {
  const room = useDustRoom();
  const latest = useRef(calls);
  latest.current = calls;
  // biome-ignore lint/correctness/useExhaustiveDependencies: once for each breaking, as it is asked
  useLayoutEffect(() => {
    const element = row.current;
    if (breaking === undefined || element === null || room === undefined) return;
    const run: Run = {
      row: element,
      // A message's bubble or its body; anything else that breaks (a rule allowed always, ADR
      // 0195) marks what is wiped itself.
      words: (element.querySelector(".bub") ??
        element.querySelector(".msg-body") ??
        element.querySelector("[data-crumbles]")) as HTMLElement | null,
      breaking,
      room,
      calls: latest,
      timers: [],
      over: false,
    };
    if (room.still()) fade(run);
    else begin(run);
    return () => ended(run);
  }, [breaking]);
}

function later(run: Run, ms: number, then: () => void): void {
  run.timers.push(setTimeout(then, ms));
}

function ended(run: Run): void {
  run.over = true;
  // A line forming stops with its row, and stands at its own height; a line breaking leaves its
  // dust to settle.
  if (run.breaking.backwards) {
    run.cancel?.();
    unset(run.row);
  }
  for (const timer of run.timers) clearTimeout(timer);
  clear(run.row, run.words);
}

/** The wipe has crossed: for the reader alone the row closes over the place, then the line goes. */
function wiped(run: Run, closing: boolean): void {
  if (run.over) return;
  if (run.breaking.after !== "me" || !closing) {
    run.calls.current.onWiped();
    return;
  }
  close(run.row);
  later(run, CLOSE_MS, () => run.calls.current.onWiped());
}

/** No dust, with Reduce Motion: the row fades out, or in. */
function fade(run: Run): void {
  const { row, breaking } = run;
  row.setAttribute("data-breaking", "fade");
  if (breaking.backwards) {
    requestAnimationFrame(() => {
      if (!run.over) row.setAttribute("data-breaking", "unfade");
    });
  }
  later(run, FADE_MS, () => {
    if (!breaking.backwards) wiped(run, false);
    clear(row, run.words);
    run.calls.current.onDone();
  });
}

function begin(run: Run): void {
  const { row, breaking } = run;
  row.setAttribute("data-breaking", breaking.backwards ? "back" : "away");
  if (breaking.backwards) mask(run.words, 1, 1);
  if (breaking.opens === true) {
    // A line back by Undo opens its place in the room first, covered, then forms in it.
    open(run);
    later(run, CLOSE_MS, () => dust(run));
  } else dust(run);
}

function dust(run: Run): void {
  const { words, breaking, room } = run;
  if (run.over || words === null) return;
  const box = words.getBoundingClientRect();
  if (box.width <= 0 || box.height <= 0) {
    // Nothing to draw it over: the line goes, or comes back, at once.
    if (!breaking.backwards) wiped(run, false);
    clear(run.row, words);
    run.calls.current.onDone();
    return;
  }
  const paint = paints(run.row, words, room.list());
  const seen = { gone: false, forming: false };
  run.cancel = room.ask({
    box,
    backwards: breaking.backwards,
    specks: makeSpecks(box).map((speck) => ({ ...speck, fill: paint(speck) })),
    onFrame: (t) => framed(run, box, t, seen),
    onDone: () => {
      if (run.over) return;
      if (breaking.backwards) clear(run.row, words);
      run.calls.current.onDone();
    },
  });
}

/** Where the wipe is at `t`, and what that lets happen. */
function framed(
  run: Run,
  box: DOMRect,
  t: number,
  seen: { gone: boolean; forming: boolean },
): void {
  const { breaking } = run;
  // Over for the row — its line gone, or a tombstone drawn in the very element that was wiped —
  // the specks fly on, and the mask is left alone.
  if (run.over) return;
  mask(run.words, box.width, Math.min(1, Math.max(0, t / WIPE_MS)));
  if (!breaking.backwards && !seen.gone && t >= WIPE_MS) {
    seen.gone = true;
    wiped(run, true);
  }
  // What hangs off the bubble comes back as the bubble forms.
  if (breaking.backwards && !seen.forming && t <= WIPE_MS) {
    seen.forming = true;
    run.row.setAttribute("data-breaking", "forming");
  }
}

/** The wipe's edge at `wiped` of the way across: gone to its left, there to its right. */
function mask(element: HTMLElement | null, width: number, wiped: number): void {
  if (element === null) return;
  const edge = wiped * (width + 2 * WIPE_SOFT) - WIPE_SOFT;
  const image = `linear-gradient(to right, transparent ${edge - WIPE_SOFT}px, #000 ${edge + WIPE_SOFT}px)`;
  element.style.maskImage = image;
  element.style.webkitMaskImage = image;
}

function clear(row: HTMLElement, words: HTMLElement | null): void {
  row.removeAttribute("data-breaking");
  if (words === null) return;
  words.style.maskImage = "";
  words.style.webkitMaskImage = "";
}

/**
 * The row closes over the place its line stood, and the space under it with it: the room's list
 * spaces its rows by a margin under each (`.msgs > *`), so closed, the row is nothing at all, and
 * the line going changes nothing more. To less than nothing — a margin taken past nought, as
 * though the space were the list's gap — the rows either side stood twelve pixels too close until
 * the line went, and then jumped apart (the web, 15 October 2026).
 */
function close(row: HTMLElement): void {
  row.style.height = `${row.getBoundingClientRect().height}px`;
  row.style.marginBottom = getComputedStyle(row).marginBottom;
  row.style.overflow = "hidden";
  void row.offsetHeight;
  row.style.transition = `height ${CLOSE_MS}ms var(--ease), margin-bottom ${CLOSE_MS}ms var(--ease)`;
  row.style.height = "0px";
  row.style.marginBottom = "0px";
}

/**
 * The row opens for a line coming back, from nothing to its own height, measured as it stands of
 * itself: an open asked for again finds the last one's nothing on it (React's strict mode runs a
 * layout effect twice, and the second open measured the first's start, and opened from nothing to
 * nothing, and the row came in whole at the end).
 */
function open(run: Run): void {
  const { row } = run;
  unset(row);
  const height = row.getBoundingClientRect().height;
  const space = getComputedStyle(row).marginBottom;
  row.style.overflow = "hidden";
  row.style.height = "0px";
  row.style.marginBottom = "0px";
  void row.offsetHeight;
  row.style.transition = `height ${CLOSE_MS}ms var(--ease), margin-bottom ${CLOSE_MS}ms var(--ease)`;
  row.style.height = `${height}px`;
  row.style.marginBottom = space;
  // Its own again once it has opened, when the transition says so: a timer of the transition's
  // length went off a frame or two before it had, and the last eleven pixels came in one frame.
  // The timer is for a transition that never ends, the row put away first.
  const opened = (event?: TransitionEvent) => {
    if (event !== undefined && (event.target !== row || event.propertyName !== "height")) return;
    row.removeEventListener("transitionend", opened);
    unset(row);
  };
  row.addEventListener("transitionend", opened);
  later(run, CLOSE_MS * 2, opened);
}

/**
 * The row as it stands of itself, its height its own again — at once, its opening or closing
 * stopped where it was, so what it measures next is its own and not a step of the last one.
 */
function unset(row: HTMLElement): void {
  for (const running of row.getAnimations?.() ?? []) {
    if (running instanceof CSSTransition && SIZES.has(running.transitionProperty)) {
      running.cancel();
    }
  }
  row.style.height = "";
  row.style.marginBottom = "";
  row.style.overflow = "";
  row.style.transition = "";
}

/**
 * Each speck's colour: the words' ink for some, and the bubble's ground for the rest, a little
 * lighter or darker. Your own bubble's ground is the field where it stands in the list: violet at
 * the top, blue in the middle, teal at the foot.
 */
function paints(
  row: HTMLElement,
  words: HTMLElement,
  list: HTMLElement | null,
): (speck: Speck) => string {
  const style = getComputedStyle(words);
  const ink = channels(style.color) ?? [80, 80, 80];
  const ground = groundOf(row, words, list, channels(style.backgroundColor) ?? ink);
  const box = words.getBoundingClientRect();
  return (speck) => {
    if (speck.ink) return css(ink);
    const base = ground(box.top + speck.v * box.height);
    return css([base[0] + speck.shade, base[1] + speck.shade, base[2] + speck.shade]);
  };
}

/** The bubble's ground at a height on the page: its own colour, or for yours the field's there. */
function groundOf(
  row: HTMLElement,
  words: HTMLElement,
  list: HTMLElement | null,
  flat: Rgb,
): (y: number) => Rgb {
  const moving = CSS.supports?.("animation-timeline: view()") === true;
  const field =
    row.getAttribute("data-mine") === "true" && list !== null && moving
      ? fieldOf(words, list)
      : undefined;
  return field ?? (() => flat);
}

/** The field your own bubbles wear, by where in the list a point is. */
function fieldOf(words: HTMLElement, list: HTMLElement): ((y: number) => Rgb) | undefined {
  const [top, middle, foot] = ["--mine-top", "--mine-middle", "--mine-foot"].map((name) =>
    resolved(words, `var(${name})`),
  );
  if (top === undefined || middle === undefined || foot === undefined) return undefined;
  const { top: from, height } = list.getBoundingClientRect();
  return (y) => {
    const along = (y - from) / Math.max(height, 1);
    return along <= 0.5
      ? mixed(top, middle, Math.max(0, along) * 2)
      : mixed(middle, foot, Math.min(1, (along - 0.5) * 2));
  };
}

/** A colour the stylesheet says, as the page draws it, by a probe standing where it is said. */
function resolved(near: HTMLElement, colour: string): Rgb | undefined {
  const probe = document.createElement("span");
  probe.style.color = colour;
  probe.style.display = "none";
  near.appendChild(probe);
  const said = getComputedStyle(probe).color;
  probe.remove();
  return channels(said);
}

let pixel: CanvasRenderingContext2D | null | undefined;

/** Any CSS colour's three channels, painted on one pixel and read back; none if it is clear. */
function channels(colour: string): Rgb | undefined {
  if (pixel === undefined) {
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    pixel = canvas.getContext("2d", { willReadFrequently: true });
  }
  if (pixel === null) return undefined;
  pixel.clearRect(0, 0, 1, 1);
  pixel.fillStyle = "#000";
  pixel.fillStyle = colour;
  pixel.fillRect(0, 0, 1, 1);
  const [r = 0, g = 0, b = 0, a = 0] = pixel.getImageData(0, 0, 1, 1).data;
  return a < 8 ? undefined : [r, g, b];
}

function mixed(from: Rgb, to: Rgb, by: number): Rgb {
  return [
    from[0] + (to[0] - from[0]) * by,
    from[1] + (to[1] - from[1]) * by,
    from[2] + (to[2] - from[2]) * by,
  ];
}

function css([r, g, b]: Rgb): string {
  const at = (n: number) => Math.round(Math.max(0, Math.min(255, n)));
  return `rgb(${at(r)} ${at(g)} ${at(b)})`;
}
