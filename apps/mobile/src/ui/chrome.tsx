/**
 * What stands around an iPad's panes, and what puts it away (ADR 0256, ADR 0276).
 *
 * On an iPad the tabs are Chips' own at every width, never iPadOS's pill (ADR 0276): a bar of glass
 * at the window's bottom left, across the foot of the list, with the gold + at its end
 * (`PadBar.tsx`). It never takes a column of its own, so the room and a third column keep their
 * widths whatever it does. Until 5 November 2026 it was a smaller capsule with ☰ in it, and ☰ grew a
 * sidebar up out of it over the list; Arjun's words that day: "the hamburger icon and floating
 * section needs to go away. The bottom tab bar needs to become slightly bigger (with the new extra
 * space)".
 *
 * Details once opened stay open from space to space until they are closed, as an inspector does on
 * a Mac, and so does a list put away: `details` and `listHidden` are those.
 *
 * Each tab's split says where its detail stands (`feet`): with its list put away or stepped aside,
 * the detail starts at the window's left edge under the bar, and a narrow one has the bar fold down
 * to the tab in front while that tab is in front, so the room's composer keeps its width
 * (`Split.tsx`).
 *
 * Held in memory, as what is open beside a tab's list is (`opened.tsx`): a relaunch opens with the
 * list in and the details closed.
 */

import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from "react";
import { Platform } from "react-native";
import { FIELD, FIELD_FOOT } from "../spaces/fieldShape";
import { useDuo } from "./duo";
import { useLayout } from "./layout";

/**
 * The bar: 16 in from the window's left, 56 tall, and the gold + as tall as it, 10 past its end.
 * Its middle stands level with a room's composer, so the gold + and the composer's + are on one
 * line (Arjun, 5 November 2026: "the + icon alignment is important"). The capsule before it stood
 * its middle 5 points lower than the composer's.
 */
export const PAD_BAR = {
  left: 16,
  height: 56,
  gap: 10,
  plus: 56,
  /** The bar's middle, over the safe area's foot: the composer field's (`fieldShape.ts`). */
  middle: FIELD_FOOT + FIELD / 2,
} as const;

/** Narrower than this, a detail under the bar has it fold down to the tab in front. */
const NARROW_DETAIL = 700;

/** What the split in front says about its detail's foot. */
export interface Foot {
  /** The detail starts at the window's left edge, under the bar. */
  readonly atEdge: boolean;
  /** How wide the detail is. */
  readonly width: number;
  /**
   * How long the panes wait before they move (`PaneLead`): the bar waits as long before it folds
   * or opens out over the detail's foot, so it goes with them and not ahead of them.
   */
  readonly lead: number;
}

/** Where a detail's foot stands, which is all that says whether the bar folds over it. */
type Shape = Pick<Foot, "atEdge" | "width">;

interface Chrome {
  /** A space's details are open: a third column of them stands beside each room (ADR 0276). */
  readonly details: boolean;
  readonly setDetails: (details: boolean) => void;
  /**
   * The room's Universe stands in that column instead (ADR 0276's addendum). One or the other:
   * opening either puts the other away.
   */
  readonly universe: boolean;
  readonly setUniverse: (universe: boolean) => void;
  /** The list beside a room is put away, and the room has the window. */
  readonly listHidden: boolean;
  readonly setListHidden: (hidden: boolean) => void;
  /** What each tab's split says about its detail's foot, by the tab's name. */
  readonly feet: Readonly<Partial<Record<string, Foot>>>;
  readonly setFoot: (tab: string, foot: Foot) => void;
}

const NOTHING: Chrome = {
  details: false,
  setDetails: () => {},
  universe: false,
  setUniverse: () => {},
  listHidden: false,
  setListHidden: () => {},
  feet: {},
  setFoot: () => {},
};

const ChromeContext = createContext<Chrome>(NOTHING);

export function ChromeProvider({ children }: { readonly children: ReactNode }) {
  // What stands in the column beside a room: its details, its Universe, or nothing.
  const [beside, setBeside] = useState<"details" | "universe" | undefined>(undefined);
  const setDetails = useCallback(
    (on: boolean) => setBeside((now) => (on ? "details" : now === "details" ? undefined : now)),
    [],
  );
  const setUniverse = useCallback(
    (on: boolean) => setBeside((now) => (on ? "universe" : now === "universe" ? undefined : now)),
    [],
  );
  const [listHidden, setListHidden] = useState(false);
  const [feet, setFeet] = useState<Readonly<Partial<Record<string, Foot>>>>({});
  const setFoot = useCallback((tab: string, foot: Foot) => {
    setFeet((now) => {
      const was = now[tab];
      if (
        was !== undefined &&
        was.atEdge === foot.atEdge &&
        was.width === foot.width &&
        was.lead === foot.lead
      ) {
        return now;
      }
      return { ...now, [tab]: foot };
    });
  }, []);
  const value = useMemo(
    () => ({
      details: beside === "details",
      setDetails,
      universe: beside === "universe",
      setUniverse,
      listHidden,
      setListHidden,
      feet,
      setFoot,
    }),
    [beside, setDetails, setUniverse, listHidden, feet, setFoot],
  );
  return <ChromeContext.Provider value={value}>{children}</ChromeContext.Provider>;
}

export function useChrome(): Chrome {
  return useContext(ChromeContext);
}

/**
 * Whether the tabs are Chips' bar at the bottom left: an iPad's window wide enough for a list beside
 * what it opens. In the narrow part of a split screen an iPad is a phone, and iPadOS's own bar
 * stands at the foot. The web keeps its rail (`_layout.web.tsx`), Android its Material bar, and the
 * iPhone Duo its column (`SideColumn.tsx`).
 */
export function usePadBar(): boolean {
  const { wide } = useLayout();
  const { column } = useDuo();
  return IOS && wide && column === 0;
}

/**
 * How wide the whole bar is over a list `list` wide: the bar and the + run across the list's foot,
 * 16 in from each side, as the iPhone's run across the phone (`barShape.ts`).
 */
export function barAcross(list: number): number {
  return list - PAD_BAR.left * 2 - PAD_BAR.gap - PAD_BAR.plus;
}

/**
 * Whether the bar folds over a detail's foot, down to the tab in front: where the detail starts at
 * the window's edge under it and is narrow, so a room's composer keeps its width.
 */
export function barFolds(foot: Shape | undefined): boolean {
  return foot?.atEdge === true && foot.width < NARROW_DETAIL;
}

/** How wide the bar is over a detail's foot, over a list `list` wide: whole, or folded round. */
export function barWidth(foot: Shape | undefined, list: number): number {
  return barFolds(foot) ? PAD_BAR.height : barAcross(list);
}

/**
 * How far in from the window's left a detail's foot starts so the bar and the + stand clear of it:
 * where the detail starts at the window's edge, under them, on an iPad. Nothing anywhere else.
 */
export function barClear(width: number): number {
  return PAD_BAR.left + width + PAD_BAR.gap + PAD_BAR.plus + PAD_BAR.gap;
}

const IOS = Platform.OS === "ios";
