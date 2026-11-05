/**
 * How much room the window has, in the words the screens decide by.
 *
 * `wide` is an iPad, or an iPad in the larger part of a split: from here a list and the thing it
 * opens sit side by side, a column of text stops growing at a readable width, and on the web
 * target the tab bar stands on the left as a rail. It is the window that decides and never the
 * device: an iPad in the narrow third of a split is a phone, and the screens behave like one
 * there.
 *
 * A phone on its side is not wide, though it has the width: it has no height, and a list beside
 * a room four hundred points tall is a list beside nothing. So both dimensions have to clear
 * the line: 700 points across and 600 down, which every iPad has in either orientation and no
 * phone has on its side.
 *
 * 700 is a list of 300 beside a room of 400, and a room is never narrower than a phone's (ADR
 * 0256). Until 1 November 2026 the line was 768, and an iPad mini upright (744) kept the phone's
 * one column because a list of 360 beside it left the room 384 (ADR 0177). `roomy` was the line
 * below it, wider than any phone, where a sheet is a card in the middle rather than a panel across
 * the bottom; the two lines are one now, and `roomy` keeps its name where a sheet asks it.
 *
 * Until 3 November 2026 a window 1100 across had a sidebar of its own beside the list (ADR 0256).
 * The tabs float at every wide width now (ADR 0276, `chrome.tsx`), so no width asks for one.
 */

import { useWindowDimensions } from "react-native";

export const WIDE = 700;
export const TALL = 600;
export const ROOMY = WIDE;

export interface Layout {
  readonly wide: boolean;
  readonly roomy: boolean;
  readonly landscape: boolean;
}

export function isWide(width: number, height: number): boolean {
  return width >= WIDE && height >= TALL;
}

export function isRoomy(width: number, height: number): boolean {
  return isWide(width, height);
}

export function useLayout(): Layout {
  const { width, height } = useWindowDimensions();
  return {
    wide: isWide(width, height),
    roomy: isRoomy(width, height),
    landscape: width > height,
  };
}
