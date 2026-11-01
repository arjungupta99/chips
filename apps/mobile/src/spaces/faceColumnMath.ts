/**
 * The column of faces a finger slides up from the field's faces (ADR 0229), as numbers: how tall
 * it stands, which face is under the finger, how big each face is drawn, and how fast the faces
 * scroll under a finger held at the column's top. Apart from the views that draw it
 * (`FaceColumn.tsx`), so Node can check it. Every function is a worklet: the finger is followed
 * on the UI thread.
 *
 * Heights are measured up from the column's foot, as the finger goes. The faces stand in the
 * order of the field's list (`choicesOf`): the lead at the top, Everyone at the foot, nearest the
 * thumb. In a room with more faces than the column has room for, the ones nearest Everyone show
 * first, and holding the finger at the top brings the rest down into sight (`lift`).
 */

/** One face's height in the column: a thumb's. */
export const SLOT = 44;
/** Everyone's, at the column's foot, with the hairline over it. */
export const FOOT = 48;
/** The column's own padding, over its top face and under Everyone. */
export const PAD = 5;
/** How wide it stands. */
export const WIDTH = 54;
/** Between the column's foot and the field's top. */
export const GAP = 8;
/**
 * The room kept over the column for the name of the face under the finger, which stands on its
 * top (ADR 0229's addendum): the tag's two lines and the gap under them.
 */
export const CROWN = 60;
/** How far up the finger moves before the column comes: past the wobble of a tap. */
export const START = 8;
/**
 * How far left of the column the finger may stray and still be over it: not far, as the + is
 * there. To its right there is no end: the column goes by height wherever the finger is, out to the
 * screen's edge, where a right thumb goes (ADR 0229's addendum).
 */
export const REACH_LEFT = 40;
/** And above its top, where holding still scrolls the faces. */
export const REACH_UP = 90;
/** The band at the top of the faces where a held finger scrolls them, and the fastest it goes. */
export const EDGE = 40;
export const SPEED = 560;
/** How much bigger the face under the finger is drawn, and how far the growth spreads to its neighbours. */
export const GROWTH = 0.42;
const SPREAD = 24;

/** The column's shape, for a room with `faces` faces over Everyone. */
export interface ColumnShape {
  /** How many faces stand over Everyone: every choice but Everyone. */
  readonly faces: number;
  /** How tall the window the faces show in is. */
  readonly view: number;
  /** The whole column, its padding and Everyone included. */
  readonly height: number;
  /** How far the faces can be brought down: none where they all fit. */
  readonly most: number;
}

/**
 * The column for `faces` faces, in `room` points over the field: what the field's own list may
 * stand to (`listRoom`, ADR 0113), half the window and never past the room's bar, less the gap
 * under the column and the room over it for the name. Unmeasured, every face shows.
 */
export function shapeOf(faces: number, room: number | undefined): ColumnShape {
  const all = Math.max(0, faces) * SLOT;
  const cap = room === undefined ? all : Math.max(SLOT, room - GAP - FOOT - 2 * PAD - CROWN);
  const view = Math.min(all, cap);
  return { faces: Math.max(0, faces), view, height: view + FOOT + 2 * PAD, most: all - view };
}

/** Whether the finger is beside the column, near enough to be over it: anywhere to its right. */
export function besideColumn(across: number): boolean {
  "worklet";
  return across >= -(WIDTH / 2 + REACH_LEFT);
}

/**
 * Which choice the finger is over: a face's index in the list, the lead's 0; Everyone's, which is
 * `faces`; or -1, for none. `up` is the finger's height over the column's foot and `across` how
 * far it is from the column's middle; `lift` is how far the faces have been brought down. Only
 * height decides, once the finger is beside the column, so it can go anywhere right of the faces
 * and leave them in sight.
 */
export function faceAt(up: number, across: number, shape: ColumnShape, lift: number): number {
  "worklet";
  if (!besideColumn(across)) return -1;
  const over = up - PAD;
  if (over < 0) return -1;
  if (over < FOOT) return shape.faces;
  const inView = over - FOOT;
  if (inView >= shape.view) return -1;
  const fromFoot = Math.floor((inView + lift) / SLOT);
  if (fromFoot >= shape.faces) return -1;
  return shape.faces - 1 - fromFoot;
}

/** Where a choice's middle stands, over the column's foot, with the faces brought down by `lift`. */
export function middleOf(index: number, shape: ColumnShape, lift: number): number {
  "worklet";
  if (index >= shape.faces) return PAD + FOOT / 2;
  const fromFoot = shape.faces - 1 - index;
  return PAD + FOOT + fromFoot * SLOT + SLOT / 2 - lift;
}

/**
 * How big a face is drawn: grown under the finger, a little less beside it, and as it is
 * everywhere else, or wherever the finger has left the column.
 */
export function grownBy(middle: number, up: number, across: number, shape: ColumnShape): number {
  "worklet";
  if (!besideColumn(across) || up < -GAP || up > shape.height + REACH_UP) return 1;
  const off = middle - up;
  return 1 + GROWTH * Math.exp(-(off * off) / (2 * SPREAD * SPREAD));
}

/**
 * How fast the faces come down, in points a second, under a finger held in the band at the top of
 * their window or above it, faster the further in it is; nothing once the top face is in sight,
 * or in a room whose faces all fit.
 */
export function scrollSpeed(up: number, across: number, shape: ColumnShape, lift: number): number {
  "worklet";
  if (shape.most <= 0 || lift >= shape.most || !besideColumn(across)) return 0;
  const top = PAD + FOOT + shape.view;
  if (up <= top - EDGE || up > top + REACH_UP) return 0;
  return Math.min(1, (up - (top - EDGE)) / EDGE) * SPEED;
}

/** The faces brought down by `speed` over `seconds`, never past the top face. */
export function liftedBy(lift: number, speed: number, seconds: number, shape: ColumnShape): number {
  "worklet";
  return Math.min(shape.most, Math.max(0, lift + speed * seconds));
}
