/**
 * Where the new-space window is on each frame, as arithmetic (`Window.tsx` draws it).
 *
 * The window grows out of the + and folds back into it, and fills the screen on a send. A view
 * that changed its size on every frame would commit the whole tree each time (ADR 0061), so the
 * window is laid out once, the size of the screen, and what is seen of it is cut by four clips
 * that only ever move. Each is the screen's size with rounded corners, and each is moved so that
 * one of its corners stands on one corner of the rect the window is at: what all four let through
 * is that rect, rounded at every corner, at any size from the + to the whole screen. What is
 * inside the last of them is moved back, so it stays where it was laid out in the window.
 *
 * Two springs drive it, one across and one up, a little out of step, which is what makes the
 * growth look poured rather than scaled (`docs/proposals/new-space-mocks.html`, FIG 1).
 */

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface Shift {
  readonly x: number;
  readonly y: number;
}

/** The four clips' moves, outermost first, and the move that puts what is inside back. */
export interface Clips {
  readonly corners: readonly [Shift, Shift, Shift, Shift];
  readonly inside: Shift;
}

function between(from: number, to: number, share: number): number {
  "worklet";
  return from + (to - from) * share;
}

/**
 * The rect between two, with the sides taken `across` of the way and the top and bottom `down`
 * of it: the two springs.
 */
export function pour(from: Rect, to: Rect, across: number, down: number): Rect {
  "worklet";
  return {
    x: between(from.x, to.x, across),
    width: between(from.width, to.width, across),
    y: between(from.y, to.y, down),
    height: between(from.height, to.height, down),
  };
}

/**
 * How far each clip moves for the window to be seen as `rect` on a screen of `screen`'s size.
 * The clips are nested, so each move is from where the one outside it left it: the first puts a
 * top-left corner on the rect's, the second a top-right, the third a bottom-right and the fourth
 * a bottom-left. Nothing larger than the screen can be cut this way, and nothing needs to be.
 */
export function clipsFor(rect: Rect, screen: { width: number; height: number }): Clips {
  "worklet";
  return {
    corners: [
      { x: rect.x, y: rect.y },
      { x: rect.width - screen.width, y: 0 },
      { x: 0, y: rect.height - screen.height },
      { x: screen.width - rect.width, y: 0 },
    ],
    inside: { x: -rect.x, y: screen.height - rect.y - rect.height },
  };
}

/** One axis of `windowRect`: from the + to the card, and on from the card to the screen. */
function side(
  fromAt: number,
  fromSize: number,
  cardAt: number,
  cardSize: number,
  screenAt: number,
  screenSize: number,
  share: number,
): { at: number; size: number } {
  "worklet";
  if (share <= 1) {
    return {
      at: between(fromAt, cardAt, share),
      size: Math.max(0, between(fromSize, cardSize, share)),
    };
  }
  return {
    at: between(cardAt, screenAt, share - 1),
    size: between(cardSize, screenSize, share - 1),
  };
}

/**
 * Where the window is, on the two springs. From nought to one each takes the window from the +
 * to the card above the keyboard; from one to two, on a send, from the card to `fill`, where the
 * room it makes will stand: the whole screen on a phone, and the half beside the list on an iPad
 * (`fillRect`). A spring that overshoots one on the way up carries on a little towards it — the
 * ones that open the window no longer do, since that read as the card breathing in and out — and
 * one that overshoots nought on the way down is held at no size rather than turned inside out.
 */
export function windowRect(from: Rect, card: Rect, fill: Rect, across: number, down: number): Rect {
  "worklet";
  const x = side(from.x, from.width, card.x, card.width, fill.x, fill.width, across);
  const y = side(from.y, from.height, card.y, card.height, fill.y, fill.height, down);
  return { x: x.at, width: x.size, y: y.at, height: y.size };
}

/** As wide as the card gets on a wide screen: a name and a row of faces, not a line across an iPad. */
export const CARD_MOST = 560;

/**
 * Where the card stands across the screen: the screen's width less a gap at each side on a phone,
 * and on a wide screen no wider than `CARD_MOST`, in the middle. Stretched across an iPad, the
 * faces stood at its left end with two thirds of a glass card empty beside them (the iPad
 * simulator, 15 October 2026).
 */
export function cardAcross(
  screenWidth: number,
  gap: number,
  wide: boolean,
): {
  readonly x: number;
  readonly width: number;
} {
  const full = screenWidth - 2 * gap;
  if (!wide || full <= CARD_MOST) return { x: gap, width: full };
  return { x: (screenWidth - CARD_MOST) / 2, width: CARD_MOST };
}

/**
 * Where a room made from the + will stand, which the window fills on a send before it dissolves
 * into it: the whole screen on a phone, and on a wide screen the half beside the list, which is
 * where the room opens there (`app/(tabs)/index.tsx`). Filling the whole iPad, the window left a
 * page the size of the screen to dissolve into a room a third narrower.
 */
export function fillRect(
  screen: { readonly width: number; readonly height: number },
  list: number | undefined,
): Rect {
  if (list === undefined) return { x: 0, y: 0, width: screen.width, height: screen.height };
  return { x: list, y: 0, width: screen.width - list, height: screen.height };
}

/**
 * Where the window grows from when there is no + of this app's to measure: an iPad's, which is the
 * system's own button in a tab bar this app is not told the place of. Out of the top of the screen,
 * in the middle, where the bar stands over a regular width; a point, so it pours out of nothing.
 */
export function topMiddle(screenWidth: number, top: number): Rect {
  return { x: screenWidth / 2, y: top, width: 0, height: 0 };
}

/** Held between nought and one. */
export function clamp01(value: number): number {
  "worklet";
  return Math.min(1, Math.max(0, value));
}

/** Within half a point: a bubble that has moved less than that has not moved. */
export function same(a: Rect, b: Rect): boolean {
  "worklet";
  return (
    Math.abs(a.x - b.x) < 0.5 &&
    Math.abs(a.y - b.y) < 0.5 &&
    Math.abs(a.width - b.width) < 0.5 &&
    Math.abs(a.height - b.height) < 0.5
  );
}

/**
 * What is known of the room's first bubble while the words are on their way to it, from one frame
 * to the next (`BubbleWatch.tsx`).
 */
export interface Watch {
  /** Where it was on the last frame it was measured. */
  readonly last: Rect | undefined;
  /** How many frames running it has not moved. */
  readonly still: number;
  /** When it was first measured, on the frame clock, in milliseconds. */
  readonly since: number | undefined;
  /** Whether it is standing still: the words land only on a bubble that is. */
  readonly settled: boolean;
  /** Whether the words are to go for it: once so, so from then on, wherever it goes. */
  readonly aiming: boolean;
}

export const UNWATCHED: Watch = {
  last: undefined,
  still: 0,
  since: undefined,
  settled: false,
  aiming: false,
};

/** Frames a bubble stands in one place to have settled there. */
export const STILL_FRAMES = 3;

/**
 * How long a room just opened is given to settle before the words go for its bubble wherever it
 * is, and follow it. A room lays itself out over its first frames — its field measured, a reply
 * coming in under the bubble — and words sent at once would set off for the first place it passed
 * through; held for every room to settle, they would wait out a reply's arrival on a blank page.
 */
export const SETTLE_MS = 250;

/** The watch, a frame on, with the bubble measured at `now` at `at` on the frame clock. */
export function watch(was: Watch, now: Rect, at: number): Watch {
  "worklet";
  const still = was.last !== undefined && same(was.last, now) ? was.still + 1 : 0;
  const since = was.since ?? at;
  const settled = still >= STILL_FRAMES;
  return {
    last: now,
    still,
    since,
    settled,
    aiming: was.aiming || settled || at - since >= SETTLE_MS,
  };
}
