/**
 * What a thing stands on, so a field, a pill or a card of its own knows what to fill itself with
 * (ADR 0192's addendum). Three grounds:
 *
 * - **the page**, `bg`: a list straight on the paper, as Spaces and a room are. What stands up off
 *   it is `surface2`, a step down from the paper.
 * - **the grouped ground**, `grouped`: a sheet, and a screen made of inset groups, as You is. In
 *   light it is a step under the paper and what stands on it is `raised`, white, so a card reads
 *   as in front of the ground, the way iOS groups a list. Before, the sheets drew grey cards on
 *   white and You white cards on paper (1.08 and 1.04:1), and neither read as a card at all.
 * - **a card**, `surface`: inside a group's card, where a field or a pill is a step down again.
 *
 * In dark the grouped ground is the page and `raised` is `surface2`, so nothing there moved.
 * `Group` says "card" for what is inside it; `Sheet` and a `Screen` that is `grouped` say
 * "grouped"; anything else is on the page.
 */

import { createContext, type ReactNode, useContext } from "react";
import { usePalette } from "./theme";

export type GroundKind = "page" | "grouped" | "card";

const Kind = createContext<GroundKind>("page");

/** Everything inside stands on this ground. */
export function OnGround({
  kind,
  children,
}: {
  readonly kind: GroundKind;
  readonly children: ReactNode;
}) {
  return <Kind.Provider value={kind}>{children}</Kind.Provider>;
}

export interface Ground {
  /** The ground's own colour: what a band fades to, what a mask erases with. */
  readonly ground: string;
  /** What a card, a field or a pill standing on it is filled with. */
  readonly fill: string;
  /** That fill under a thumb. */
  readonly pressed: string;
  /** What a track set into it is filled with: a segmented control's. */
  readonly sunk: string;
}

export function useGroundKind(): GroundKind {
  return useContext(Kind);
}

export function useGround(): Ground {
  const palette = usePalette();
  const kind = useContext(Kind);
  if (kind === "grouped") {
    return {
      ground: palette.grouped,
      fill: palette.raised,
      pressed: palette.raisedPress,
      sunk: palette.sunk,
    };
  }
  if (kind === "card") {
    return {
      ground: palette.surface,
      fill: palette.surface2,
      pressed: palette.surface3,
      sunk: palette.surface2,
    };
  }
  return {
    ground: palette.bg,
    fill: palette.surface2,
    pressed: palette.surface3,
    sunk: palette.surface2,
  };
}
