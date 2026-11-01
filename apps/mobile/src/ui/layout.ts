/**
 * How much room the window has, in the two words the screens decide by.
 *
 * `wide` is an iPad, or an iPad in the larger half of a split: from here a list and the thing it
 * opens sit side by side, a column of text stops growing at a readable width, and on the web
 * target the tab bar stands on the left as a rail. It is the window that decides and never the
 * device — an iPad in the narrow third of a split is a phone, and the screens behave like one
 * there.
 *
 * A phone on its side is not wide, though it has the width: it has no height, and a list beside
 * a room four hundred points tall is a list beside nothing. So both dimensions have to clear
 * the line — 768 points across, where the navigator, Apple's size classes and the blueprint's
 * breakpoints all agree a regular width begins, and 600 down, which every iPad has in either
 * orientation and no phone has on its side.
 *
 * `roomy` is the window wider than any phone, which is less than wide: an iPad mini upright is 744
 * points, which UIKit counts a regular width already — its tab bar stands at the top — and a list
 * beside a room there would leave the room 384 points, so it keeps the phone's one column. What
 * needs only the width goes on that: a sheet is a card in the middle rather than a panel across
 * the bottom, the + window a card's width, a room's name as long as the bar allows rather than as
 * long as a phone's does (the iPad mini simulator, 16 October 2026; ADR 0177).
 */

import { useWindowDimensions } from "react-native";

export const WIDE = 768;
export const TALL = 600;
export const ROOMY = 700;

export interface Layout {
  readonly wide: boolean;
  readonly roomy: boolean;
  readonly landscape: boolean;
}

export function isWide(width: number, height: number): boolean {
  return width >= WIDE && height >= TALL;
}

export function isRoomy(width: number, height: number): boolean {
  return width >= ROOMY && height >= TALL;
}

export function useLayout(): Layout {
  const { width, height } = useWindowDimensions();
  return { wide: isWide(width, height), roomy: isRoomy(width, height), landscape: width > height };
}
