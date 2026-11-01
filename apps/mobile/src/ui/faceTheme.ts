/**
 * Which colours the faces wear on this phone (ADR 0176): Soothing, the deep grounds every face
 * has worn since the Folded marks, or Bright, a lighter and livelier sister of each with dark
 * letters on it. Only the squares change — a space's face, an agent's, a person's, and what is
 * drawn in a face's own colour beside it — never the rest of the palette.
 *
 * Held as the appearance is (`appearance.ts`): one value outside React, applied before the first
 * screen from what was chosen last time, kept in `prefs` and never told to the workspace. Each
 * thing that paints a face asks for the theme, as each thing that paints a surface asks for the
 * palette, so a choice in You repaints every face that is showing.
 *
 * The wire stores a ground's index, and the two tables share their indices, so a face chosen in
 * either theme is the same choice in the other: nothing is saved again when the theme changes.
 */

import { createContext, useContext, useSyncExternalStore } from "react";
import { readSetting, SETTINGS, writeSetting } from "../prefs";
import { FACE_INK, ICON_GROUNDS, ICON_GROUNDS_BRIGHT } from "./tokens";

export type FaceTheme = "soothing" | "bright";

export const FACE_THEMES: readonly { readonly value: FaceTheme; readonly label: string }[] = [
  { value: "soothing", label: "Soothing" },
  { value: "bright", label: "Bright" },
];

let current: FaceTheme = "soothing";
const listeners = new Set<() => void>();

function isFaceTheme(value: unknown): value is FaceTheme {
  return value === "soothing" || value === "bright";
}

function apply(theme: FaceTheme): void {
  current = theme;
  for (const listener of listeners) listener();
}

/** What was chosen last time, applied. Read once, at launch, before the first screen. */
export async function loadFaceTheme(): Promise<FaceTheme> {
  const stored = await readSetting(SETTINGS.faces).catch(() => undefined);
  const theme = isFaceTheme(stored) ? stored : "soothing";
  apply(theme);
  return theme;
}

/** Choose, for good: every face repaints now, and the choice is written down for next time. */
export function chooseFaceTheme(theme: FaceTheme): void {
  apply(theme);
  void writeSetting(SETTINGS.faces, theme).catch(() => undefined);
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const read = () => current;

/**
 * A theme held for everything inside, whatever this phone chose: You's two previews, each of
 * which shows its own theme while the rest of the screen shows the one in use.
 */
const Held = createContext<FaceTheme | undefined>(undefined);
export const FacesIn = Held.Provider;

/** The theme the faces here wear: one held round them, else this phone's choice. */
export function useFaceTheme(): FaceTheme {
  const held = useContext(Held);
  const chosen = useSyncExternalStore(subscribe, read, read);
  return held ?? chosen;
}

/** Each Soothing ground's index, for finding its sister. */
const AT = new Map<string, number>(ICON_GROUNDS.map((ground, index) => [ground, index]));

/**
 * A ground as the theme paints it. Faces are handed the Soothing ground their index names, and
 * this is where Bright takes over: at the moment of painting. A colour from neither table — the
 * page, a cell — and a ground that is already Bright pass through unchanged.
 */
export function paintedGround(ground: string, theme: FaceTheme): string {
  if (theme === "soothing") return ground;
  const at = AT.get(ground);
  return at === undefined ? ground : (ICON_GROUNDS_BRIGHT[at] ?? ground);
}

export interface FacePaint {
  readonly theme: FaceTheme;
  /** A face's ground as this theme paints it. */
  readonly ground: (ground: string) => string;
  /** The letters on a face, and anything else drawn in ink over a ground. */
  readonly ink: string;
}

const PAINTS: Readonly<Record<FaceTheme, FacePaint>> = {
  soothing: { theme: "soothing", ground: (ground) => ground, ink: FACE_INK.soothing },
  bright: {
    theme: "bright",
    ground: (ground) => paintedGround(ground, "bright"),
    ink: FACE_INK.bright,
  },
};

/** How the faces here are painted: the same object for as long as the theme holds. */
export function useFacePaint(): FacePaint {
  return PAINTS[useFaceTheme()];
}
