/**
 * The design tokens, on the phone.
 *
 * They are transcribed from `packages/ui/src/styles/tokens.css` rather than imported: React
 * Native has no CSS custom properties, and the alternative — a build step that turns the
 * stylesheet into an object — buys a dependency and a generated file for forty constants. The
 * cost of transcribing is that the two can drift, so `tokens.vitest.ts` reads the stylesheet
 * and fails when a value here no longer matches it.
 *
 * Light and dark hold the same names, which is the other thing that test checks.
 */

export interface Palette {
  readonly bg: string;
  readonly surface: string;
  readonly surface2: string;
  readonly surface3: string;
  readonly line: string;
  readonly line2: string;
  readonly ink: string;
  readonly ink2: string;
  readonly ink3: string;
  readonly ink4: string;
  readonly gold: string;
  readonly goldDeep: string;
  readonly goldSoft: string;
  /**
   * What a tap lands on: the chosen tab, Cancel, a tick, a sheet's action (ADR 0192). Not a status,
   * so not `amber`, though dark keeps the amber it wore before.
   */
  readonly accent: string;
  /**
   * The accent as words on a tile, the chosen tab on `surface3`: a step darker, the same hue,
   * 4.9:1 there where the accent is 3.9:1. Dark's accent is 5.5:1 there already (the web's
   * `--accent-ink`).
   */
  readonly accentInk: string;
  readonly blue: string;
  readonly blueInk: string;
  readonly blueSoft: string;
  readonly amber: string;
  readonly amberInk: string;
  readonly amberSoft: string;
  readonly red: string;
  readonly redInk: string;
  readonly redSoft: string;
  readonly green: string;
  readonly greenInk: string;
  readonly greenSoft: string;
  /** Who else reads a room: the shared tag's, and nothing else's (ADR 0234). Not a status. */
  readonly violetInk: string;
  readonly violetSoft: string;
  readonly gray: string;
  /** Everyone else's messages: a step under `surface2` in light, so the bubble keeps its edge. */
  readonly them: string;
  /**
   * What an agent's pins rest on: a neutral metal in light, where the face's colour is only where
   * the light runs; `transparent` in dark, which rests them in the face's colour, dim (ADR 0192).
   */
  readonly pinMetal: string;
  /** A sheet's ground and a screen of inset groups': under the paper in light, the page in dark. */
  readonly grouped: string;
  /** What stands up off the grouped ground, a card or a field: white in light (`ui/ground.tsx`). */
  readonly raised: string;
  /** That under a thumb. */
  readonly raisedPress: string;
  /** A track set into the grouped ground, a segmented control's: under it in light. */
  readonly sunk: string;
}

export const light: Palette = {
  bg: "#fbfbf8",
  surface: "#ffffff",
  surface2: "#f2f2ec",
  surface3: "#e7e7df",
  line: "#dfdfd7",
  line2: "#c4c4ba",
  ink: "#14161b",
  ink2: "#454851",
  ink3: "#626670",
  ink4: "#a9abb3",
  gold: "#f7c431",
  goldDeep: "#7d5b00",
  goldSoft: "#fff3c3",
  accent: "#a06306",
  accentInk: "#905400",
  blue: "#1d6aff",
  blueInk: "#1048ce",
  blueSoft: "#e6edff",
  amber: "#d76c00",
  amberInk: "#9b4a00",
  amberSoft: "#ffedd9",
  red: "#e62728",
  redInk: "#af1512",
  redSoft: "#ffe7e5",
  green: "#009b5c",
  greenInk: "#006c40",
  greenSoft: "#def5e8",
  violetInk: "#6a3fc9",
  violetSoft: "#efe8ff",
  gray: "#8c8f98",
  them: "#e5e5de",
  pinMetal: "#bbbcb4",
  grouped: "#f2f2ec",
  raised: "#ffffff",
  raisedPress: "#f2f2ec",
  sunk: "#e7e7df",
};

export const dark: Palette = {
  bg: "#0f1013",
  surface: "#191b20",
  surface2: "#20232a",
  surface3: "#2b2e37",
  line: "#2a2d35",
  line2: "#454953",
  ink: "#f1f2ed",
  ink2: "#bdbfc7",
  ink3: "#8a8d97",
  ink4: "#5f626c",
  gold: "#f7c431",
  goldDeep: "#f7ce54",
  goldSoft: "#3c3005",
  accent: "#f38b00",
  accentInk: "#f38b00",
  blue: "#5f91ff",
  blueInk: "#a9c1ff",
  blueSoft: "#19274c",
  amber: "#f38b00",
  amberInk: "#ffc07e",
  amberSoft: "#41260c",
  red: "#fe5550",
  redInk: "#ff9e98",
  redSoft: "#471e1c",
  green: "#00ba7a",
  greenInk: "#7fe3b3",
  greenSoft: "#12362a",
  violetInk: "#c6b0ff",
  violetSoft: "#2a2044",
  gray: "#6b6e78",
  them: "#20232a",
  pinMetal: "transparent",
  grouped: "#0f1013",
  raised: "#20232a",
  raisedPress: "#2b2e37",
  sunk: "#20232a",
};

/** The CSS custom property each token was transcribed from, for the drift test. */
export const CSS_NAMES: Readonly<Record<keyof Palette, string>> = {
  bg: "--bg",
  surface: "--surface",
  surface2: "--surface-2",
  surface3: "--surface-3",
  line: "--line",
  line2: "--line-2",
  ink: "--ink",
  ink2: "--ink-2",
  ink3: "--ink-3",
  ink4: "--ink-4",
  gold: "--gold",
  goldDeep: "--gold-deep",
  goldSoft: "--gold-soft",
  accent: "--accent",
  accentInk: "--accent-ink",
  blue: "--blue",
  blueInk: "--blue-ink",
  blueSoft: "--blue-soft",
  amber: "--amber",
  amberInk: "--amber-ink",
  amberSoft: "--amber-soft",
  red: "--red",
  redInk: "--red-ink",
  redSoft: "--red-soft",
  green: "--green",
  greenInk: "--green-ink",
  greenSoft: "--green-soft",
  violetInk: "--violet-ink",
  violetSoft: "--violet-soft",
  gray: "--gray",
  them: "--them",
  pinMetal: "--pin-metal",
  grouped: "--grouped",
  raised: "--raised",
  raisedPress: "--raised-press",
  sunk: "--sunk",
};

/**
 * The eight hues an avatar may wear, chosen by name. White initials pass 4.5:1 on each, which
 * is why they are a fixed list rather than a hash into the colour wheel.
 *
 * Respaced on 21 September 2026 with the palette's lift: `--avatar-7` sat 1.1 degrees from
 * `--avatar-1` and `--avatar-4` had almost no chroma, so the eight were really six. The hash in
 * `sourceColours.ts` is untouched — a name keeps its slot, and only the slot's paint changed.
 */
export const AVATAR_HUES = [
  "#b84d86",
  "#007f9a",
  "#a76341",
  "#00736d",
  "#1c6aa8",
  "#6e48c1",
  "#a94cbe",
  "#2a8452",
] as const;

/**
 * The grounds a chosen mark may sit on: the eight avatar hues above, then nineteen that belong
 * to no participant. As many as `SPACE_ICON_GROUNDS` on the wire, and the wire stores the
 * *index*: a hex would freeze the palette into every saved row, and the lift of 21 September
 * 2026 moved all eight hues.
 *
 * The first twelve are the palette of 21 September. The fifteen after them came on 26 September
 * 2026, when Arjun asked for more colours: a red, an orange, an olive, three greys and a deep
 * shade of every hue, each worked out in OKLCH at the most chroma sRGB holds. They were added
 * after the twelve so a face already chosen keeps its index; the picker lays all of them out by
 * hue and depth (`ICON_GROUND_ROWS`), which is only a display order.
 *
 * White clears 4.5:1 on each, which is what makes them a fixed list rather than a wheel: the
 * paper, the fold and the initials read on every one. No pastels, for the same reason.
 */
export const ICON_GROUNDS = [
  ...AVATAR_HUES,
  "#007c87",
  "#9c6a00",
  "#317243",
  "#7f3965",
  "#d4302e",
  "#c05502",
  "#5b6b7d",
  "#a43427",
  "#706d00",
  "#494d54",
  "#6e2026",
  "#5c3824",
  "#594414",
  "#0c4c2f",
  "#00494f",
  "#183773",
  "#4b2a6a",
  "#661e40",
  "#32353c",
] as const;

/**
 * What VoiceOver calls each ground, by the same index, and the order the picker lays them out in:
 * nine hues across and three depths down, so every colour is in view at once and its darker sister
 * is under it (option B of `docs/proposals/space-colours-mocks.html`). Core's, since the Mac and the
 * web lay out and name the same colours (ADR 0272).
 */
export {
  FACE_GROUND_NAMES as ICON_GROUND_NAMES,
  FACE_GROUND_ROWS as ICON_GROUND_ROWS,
} from "@chipschat/core";

/**
 * The same grounds in the Bright theme (ADR 0176), by the same index: each one's sister, worked
 * out by `brightGround` in `lit.ts` — the hue kept, the lightness folded into a band dark letters
 * read on, the chroma lifted — so the squares look like the ones Arjun pointed at on 15 October
 * 2026. `lit.vitest.ts` proves every one is that sum and that none is also a Soothing ground,
 * and `tokens.vitest.ts` that `tokens.css` says the same.
 */
export const ICON_GROUNDS_BRIGHT = [
  "#f76ab5",
  "#14b3d7",
  "#e58859",
  "#0cb2a9",
  "#3fa2f5",
  "#a382fe",
  "#e267fe",
  "#45ba78",
  "#11b3c3",
  "#e8a52e",
  "#57b16f",
  "#cf6faa",
  "#fe7165",
  "#fe771b",
  "#88a0bb",
  "#f7624e",
  "#b3b034",
  "#8b919c",
  "#d16467",
  "#ca713d",
  "#cda036",
  "#31a26c",
  "#119da9",
  "#5986db",
  "#9e72cb",
  "#c8638e",
  "#818691",
] as const;

/**
 * The letters on a face, in each theme: white on the deep Soothing grounds, near-black on the
 * Bright ones, where white would fall under 4.5:1. A mark keeps its white paper in both — it is
 * decoration, and drawn dark it read heavy (ADR 0176). `--on-avatar` in `tokens.css`.
 */
export const FACE_INK = { soothing: "#ffffff", bright: "#16171b" } as const;

/** `--space-1` to `--space-6`, under the names the phone's stylesheets use. */
export const SPACE = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24 } as const;

/** `--radius-xs` to `--radius-pill`. A twelve-pixel corner is twelve pixels on any screen. */
export const RADIUS = { xs: 5, sm: 8, md: 10, lg: 12, xl: 14, xxl: 16, pill: 999 } as const;

/**
 * The type scale, and the one place the phone deliberately leaves the design system behind.
 * `tokens.css` says of its own sizes: *13 to 14px on desktop, 16px on mobile*. This is iOS's
 * scale instead — body at 17 over a 22 leading, secondary at 15, caption at 13, and a screen's
 * own name at 34 — so `tokens.vitest.ts` checks the colours, the spacing and the radii against
 * the stylesheet and pointedly does not check these.
 */
export const TEXT = {
  xs: 12,
  /** Caption: a time, a snippet, the line under a name. */
  sm: 13,
  /** Secondary: a button's word, a note, anything beside the body rather than in it. */
  md: 15,
  /** Body: what a message is set in. */
  body: 17,
  lg: 18,
  xl: 20,
  /** The name of a screen, where this app still draws one itself: iOS's large title. */
  title: 34,
} as const;

/** The line height body text is set at, as `tokens.css` sets it. */
export const LEADING = 1.45;

/** The line height a bubble's words are set at on the phone: iOS's 22 on 17, not the desktop's. */
export const LEADING_PHONE = 22 / 17;

/**
 * The bubble's shape on the phone (ADR 0050): Messages' corner at Messages' type size — 18 on 17
 * — the smaller corner on the sides where two bubbles of one author meet, the padding inside, and
 * how much of the column a bubble may take before its words wrap.
 */
export const BUBBLE = {
  radius: 18,
  inner: 5,
  padX: 14,
  padY: 9,
  maxWidth: "78%",
  /**
   * As far as Dynamic Type may carry a bubble's words. A phone set to the largest accessibility
   * size draws 17pt body at nearly three times the size, which turns a room into one word a
   * line and pushes a message's time off the end of its row; a half again is the step where
   * everything still fits, and a person who needs more than that has Zoom, which magnifies the
   * whole screen rather than reflowing it.
   */
  maxScale: 1.5,
} as const;

/**
 * Your own bubbles: a teal, with white ink (Arjun, 11 September 2026 — not Messages' blue; lifted
 * to #007c87 with the rest of the palette on 21 September 2026), under the field they sample
 * (`scrollField.ts`). The desktop wears the same since 14 October 2026 (`--mine`, `--mine-ink`).
 * Outside `Palette` because it is one ground for both themes, as the avatar hues are; white
 * clears 4.5:1 on it.
 */
export const OUTGOING = { ground: "#007c87", ink: "#ffffff" } as const;

/**
 * The sheet's shape on the phone (WP5): a 24-point top corner, which is what iOS rounds its own
 * sheets at, and a scrim lighter than a dialog's — a sheet is this screen with something in
 * front of it, not another screen. Outside `RADIUS` because the design system has no
 * twenty-four, and the drift test should stay able to say so.
 */
export const SHEET = { radius: 24, scrim: 0.4 } as const;
