/**
 * What stands around an iPad's panes, and what puts it away (ADR 0256, ADR 0276).
 *
 * On an iPad the tabs are Chips' own at every width, never iPadOS's pill (ADR 0276). At rest they
 * are a capsule of glass at the window's bottom left, ☰ and the four tabs' marks with the gold +
 * beside it; ☰ opens the sidebar up out of it, floating over the list, with the pinned spaces and
 * the workspaces, and a tab, a pinned space or a tap beside it puts it back (`Sidebar.tsx`). It never
 * takes a column of its own, so the room and a third column keep their widths whatever it does.
 * Arjun's words, 3 November 2026: "I think that menu should always be on the left as floating
 * (accessible through hamburger menu)", then "the tab left section should always 'float' and not
 * specifically occupy left column", then "make the minimized tab bar at the bottom left".
 *
 * Details once opened stay open from space to space until they are closed, as an inspector does on
 * a Mac, and so does a list put away: `details` and `listHidden` are those.
 *
 * Each tab's split says where its detail stands (`feet`): with its list put away or stepped aside,
 * the detail starts at the window's left edge under the capsule, and a narrow one has the capsule
 * fold down to ☰ and the + while that tab is in front, so the room's composer keeps its width
 * (`Split.tsx`).
 *
 * Held in memory, as what is open beside a tab's list is (`opened.tsx`): a relaunch opens with the
 * sidebar shut, the list in and the details closed.
 */

import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from "react";
import { Platform } from "react-native";
import { useDuo } from "./duo";
import { useLayout } from "./layout";

/** The open sidebar's width, its glass inset from the window's edges. */
export const SIDEBAR_WIDTH = 272;

/**
 * The capsule at rest: where it stands from the window's left and bottom, how tall it is, and how
 * wide with the four tabs in it, or with ☰ alone. The gold + stands a gap past its end.
 */
export const CAPSULE = { left: 16, height: 48, wide: 233, narrow: 48, gap: 10, plus: 44 } as const;

/** Narrower than this, a detail under the capsule has it fold down to ☰ and the +. */
const NARROW_DETAIL = 700;

/** What the split in front says about its detail's foot. */
export interface Foot {
  /** The detail starts at the window's left edge, under the capsule. */
  readonly atEdge: boolean;
  /** How wide the detail is. */
  readonly width: number;
}

interface Chrome {
  /** The sidebar is out, floating over the list. */
  readonly open: boolean;
  readonly setOpen: (open: boolean) => void;
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
  open: false,
  setOpen: () => {},
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
  const [open, setOpen] = useState(false);
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
      if (was !== undefined && was.atEdge === foot.atEdge && was.width === foot.width) return now;
      return { ...now, [tab]: foot };
    });
  }, []);
  const value = useMemo(
    () => ({
      open,
      setOpen,
      details: beside === "details",
      setDetails,
      universe: beside === "universe",
      setUniverse,
      listHidden,
      setListHidden,
      feet,
      setFoot,
    }),
    [open, beside, setDetails, setUniverse, listHidden, feet, setFoot],
  );
  return <ChromeContext.Provider value={value}>{children}</ChromeContext.Provider>;
}

export function useChrome(): Chrome {
  return useContext(ChromeContext);
}

/**
 * Whether the tabs are Chips' capsule and floating sidebar: an iPad's window wide enough for a list
 * beside what it opens. In the narrow part of a split screen an iPad is a phone, and iPadOS's own bar
 * stands at the foot. The web keeps its rail (`_layout.web.tsx`), Android its Material bar, and the
 * iPhone Duo its column (`SideColumn.tsx`).
 */
export function usePadSidebar(): boolean {
  const { wide } = useLayout();
  const { column } = useDuo();
  return IOS && wide && column === 0;
}

/**
 * How wide the capsule is over a detail's foot: the four tabs in it, or ☰ alone where the detail
 * starts at the window's edge under it and is narrow.
 */
export function capsuleWidth(foot: Foot | undefined): number {
  return foot?.atEdge && foot.width < NARROW_DETAIL ? CAPSULE.narrow : CAPSULE.wide;
}

/**
 * How far in from the window's left a detail's foot starts so the capsule and the + stand clear of
 * it: where the detail starts at the window's edge, under them, on an iPad. Nothing anywhere else.
 */
export function capsuleClear(width: number): number {
  return CAPSULE.left + width + CAPSULE.gap + CAPSULE.plus + CAPSULE.gap;
}

const IOS = Platform.OS === "ios";
