/**
 * A list and the thing it opens, side by side: the Spaces and the room, the fleet and a
 * profile. Only on a wide screen — the route that renders this decides, from `useLayout`, and
 * on a phone renders the list alone and pushes the thing it opens.
 *
 * The list keeps a fixed width and the detail takes the rest, which is the desktop's own
 * proportion and the one every mail and messages app on an iPad has taught a thumb to expect. The
 * width is 340, or 300 in a window under 900 points, where 340 would leave the room less than a
 * phone's: an iPad mini upright (744) and an 11-inch upright (834) (ADR 0256).
 *
 * The list can be put away, from a room's bar on Spaces, and the room then has the window (ADR 0256).
 *
 * On the iPhone Duo open, the list runs to the fold and the room stands on the other page, up to the
 * column iOS keeps down the screen's edge for its bars (`duo.tsx`, ADR 0256). Across the fold the
 * room stood half on each page and under the column, its top right button under the clock (the
 * simulator, 2 November 2026). Half open, UIKit keeps what is pressed off the fold and twenty points
 * either side of it, and so do the pages: the list stops where that begins and the room starts where
 * it ends, the ground between them, where the list's Select and the room's first button stood a few
 * points into it (`pagesOf`).
 *
 * On an iPad the detail's width is said rather than left to flex: the window less the list and the
 * sidebar. A turned iPad is laid out once at its new size before Chips hears of it, with the old
 * sidebar still standing, and a room squeezed for that one layout and widened again in the next
 * kept its bubbles at the squeezed width, cut off (the simulator, 1 November 2026). Said, the room
 * keeps its width through the first layout and changes it once, in the second.
 *
 * Each side says which it is (`useSplitSide`): a screen's name in the list stays at the list's
 * own edge, where a name on a page of its own lines up with the column the page is (`Screen`).
 *
 * A page one level deeper than the detail stands in a third column on its right, 420 across, and
 * the detail narrows for it (ADR 0276): an agent's message history beside its card, a harness's part
 * or job beside its page, a person beside People. Arjun's words, 3 November 2026: "a level 3 detail
 * section could show up as third column, with middle section then compressed a bit". The detail is
 * never narrower than 540 for it: where the list would leave it less, the list steps aside while the
 * third column stands (an iPad on its side under 13 inches, and any iPad upright). Where even that
 * would not fit (an iPad mini upright, the iPhone Duo), the third level stands in the detail's
 * place, as it did before, and its pane's × becomes its way back (`Pane`).
 *
 * They move rather than appear (`PaneMotion.tsx`): the third column grows in from the window's
 * right edge as the detail narrows, the list slides out to the left where it steps aside, and each
 * goes back the same way. Arjun, 3 November 2026: "the third column appears without any transition,
 * abruptly, please make it smooth transition".
 */

import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Platform, StyleSheet, useWindowDimensions, View, type ViewStyle } from "react-native";
import { CAPSULE, capsuleClear, capsuleWidth, useChrome, usePadSidebar } from "./chrome";
import { type Fold, foldLine, useDuo } from "./duo";
import { useKept, Widening } from "./PaneMotion";
import { usePalette } from "./theme";
import { SPACE } from "./tokens";
import { useWindowInsets } from "./windowInsets";

/** The list's width in a window this wide. Enough for a title and a line of preview. */
export function listWidth(windowWidth: number): number {
  return windowWidth >= 900 ? 340 : 300;
}

type Side = "list" | "detail" | "third";

/** The third column's width: a page one level deeper, beside the page it came from (ADR 0276). */
export const THIRD = 420;

/** The narrowest the detail gets beside a third column. Narrower, and the list steps aside. */
const DETAIL_LEAST = 540;

/**
 * How wide a group beside the list grows, as iPadOS's own Settings has it: its cards stop at 896
 * and stand in the middle of what is left, and never come nearer an edge than a group's margin. On
 * a 13-inch upright that is the margin; on its side, 70 points either side (the simulator, iPadOS
 * 26.5, 3 November 2026).
 */
const PANE_GROUP = 896;

/** The column a page or a room stands in beside the list: its groups, and their margins (`Screen`). */
export const PANE_COLUMN = PANE_GROUP + SPACE.lg * 2;

/**
 * How much of a room's width its lines take beside the list, up to `PANE_COLUMN`: the share that
 * is the page's column in a pane of 1036, a 13-inch on its side, so a room there has a page's
 * margins, and the same proportion wherever it stands (`useRoomColumn`).
 */
export const ROOM_SHARE = PANE_COLUMN / 1036;

/**
 * Whether this window has room for a third column beside the detail: an iPad's, 960 across or more.
 * The iPhone Duo keeps its two pages.
 */
export function useThirdFits(): boolean {
  const { width } = useWindowDimensions();
  const { column, fold } = useDuo();
  return SAID && column === 0 && fold === undefined && width >= THIRD + DETAIL_LEAST;
}

/** Whether the list keeps its place beside the detail and a third column, or steps aside for them. */
export function useListBesideThird(): boolean {
  const { width } = useWindowDimensions();
  return width - listWidth(width) - THIRD >= DETAIL_LEAST;
}

const SideContext = createContext<Side | undefined>(undefined);

/** Which side of a split this is drawn on, or nothing outside one. */
export function useSplitSide(): Side | undefined {
  return useContext(SideContext);
}

/**
 * What stands in a column of 420 of its own: a sheet docked beside a room or standing in the third
 * column (`Sheet`). It lays out as the third column's pages do, at the column's width.
 */
export function ThirdSide({ children }: { readonly children: ReactNode }) {
  return <SideContext.Provider value="third">{children}</SideContext.Provider>;
}

/**
 * The window's side insets a page keeps clear: those of the edges it stands at. A split's list
 * stands at the window's left and not its right, and its detail stops short of the iPhone Duo's
 * column, so neither keeps the column's inset: it put 84 points of nothing inside the list on the
 * Duo open (the simulator, 2 November 2026). An iPad keeps nothing at its sides.
 */
export function useSides(): { readonly left: number; readonly right: number } {
  const insets = useWindowInsets();
  const side = useSplitSide();
  const duo = useDuo();
  if (side === "list") return { left: insets.left, right: 0 };
  if (side === "detail" || side === "third") {
    const column = duo.side === "right" ? duo.column : 0;
    return { left: 0, right: Math.max(0, insets.right - column) };
  }
  return { left: insets.left, right: insets.right };
}

const DetailWidth = createContext<number | undefined>(undefined);

/**
 * Where a sheet opened inside the detail stands instead of over the window: the third column, while
 * it is open (ADR 0276's addendum; Arjun, 3 November 2026: "When we tap option in the Agent tab -->
 * agent details, all options should open in the third column instead of popup"). Each sheet shows
 * itself under its own name, so one closing does not take away the one opened after it; one opened
 * while another stands there closes the other, as a page replaces a page.
 */
export interface ThirdHost {
  /** Opened: it takes the column, closing whatever stood there. */
  readonly show: (id: string, node: ReactNode, close: () => void) => void;
  /** Drawn again while open: what it holds now, if it is still the one standing there. */
  readonly update: (id: string, node: ReactNode) => void;
  readonly hide: (id: string) => void;
  /** A page of the caller's opens in the column: the sheet standing there closes for it. */
  readonly dismiss: () => void;
}

const ThirdHostContext = createContext<ThirdHost | undefined>(undefined);

/** The third column a sheet opened here stands in, where the split offers it; else nothing. */
export function useThirdHost(): ThirdHost | undefined {
  return useContext(ThirdHostContext);
}

/**
 * How wide the detail beside the list is, where the split says it (an iPad, `SAID`); nothing
 * elsewhere. The media page lays its grid out by it, and a third column says its own (ADR 0276).
 */
export function useDetailWidth(): number | undefined {
  return useContext(DetailWidth);
}

export function Split({
  tab,
  list,
  detail,
  third,
  away = false,
  docked = 0,
  sheetsBeside = false,
}: {
  /**
   * The tab it stands on, whose capsule folds down to ☰ beside a narrow detail at the window's edge
   * while that tab is in front (`chrome.tsx`). Without it, it says nothing.
   */
  readonly tab?: string;
  readonly list: ReactNode;
  readonly detail: ReactNode;
  /** A page one level deeper than the detail, in a third column where it fits (ADR 0276). */
  readonly third?: ReactNode;
  /** The list is put away, and the detail has the window. It stays drawn where it was read to. */
  readonly away?: boolean;
  /**
   * How much of the detail a column of its own takes at its right: a space's details, which the
   * room stands beside itself (`RoomPane`). What is left is how wide the room is under the capsule.
   */
  readonly docked?: number;
  /** A sheet opened in the detail stands in the third column, where one fits (`useThirdHost`). */
  readonly sheetsBeside?: boolean;
}) {
  const palette = usePalette();
  const { host, sheet } = useSheetBeside(sheetsBeside);
  const deeper = sheet ?? third;
  const { across, gap, hidden, columned, said } = useWidths(deeper, away);
  // Where a third column does not fit, the deeper page has the detail's place.
  const shown = present(deeper) && !columned ? deeper : detail;
  const { clear, foot } = useCapsuleBeside(
    tab,
    hidden,
    said === undefined ? undefined : said - docked,
  );
  const listed = (
    <ListSide
      across={across}
      foot={foot}
      folded={gap > 0}
      hidden={hidden}
      boxed={said !== undefined}
    >
      {list}
    </ListSide>
  );
  const fold = gap > 0 && !hidden ? <View style={{ width: gap }} testID="split-fold" /> : null;
  const inDetail = (
    <SideContext.Provider value="detail">
      <FootClear.Provider value={clear}>
        <ThirdHostContext.Provider value={host}>
          <DetailWidth.Provider value={said}>{shown}</DetailWidth.Provider>
        </ThirdHostContext.Provider>
      </FootClear.Provider>
    </SideContext.Provider>
  );
  if (said === undefined) {
    return (
      <View style={[styles.row, { backgroundColor: palette.bg }]} testID="split">
        {listed}
        {fold}
        <View style={styles.detail} testID="split-detail">
          {inDetail}
        </View>
      </View>
    );
  }
  return (
    // The page's ground under the Duo's column, which the room stops short of.
    <Moving
      list={listed}
      fold={fold}
      detail={inDetail}
      third={columned ? deeper : undefined}
      widths={{ list: hidden ? 0 : across, detail: said, third: columned ? THIRD : 0 }}
    />
  );
}

/**
 * The list's side: the list's width, room at its foot for the capsule, and its rule unless the Duo's
 * fold stands there instead. Where its width moves, it is the window's height in its box and steps
 * aside as a box of none it slides out of, out of reach of a tap and VoiceOver; anywhere else it is
 * put away.
 */
function ListSide({
  across,
  foot,
  folded,
  hidden,
  boxed,
  children,
}: {
  readonly across: number;
  readonly foot: number;
  readonly folded: boolean;
  readonly hidden: boolean;
  readonly boxed: boolean;
  readonly children: ReactNode;
}) {
  const palette = usePalette();
  return (
    <View
      style={[
        styles.list,
        { width: across, borderColor: palette.line, paddingBottom: foot },
        folded ? styles.unruled : null,
        boxed ? styles.boxed : null,
        hidden && !boxed ? styles.away : null,
      ]}
      pointerEvents={hidden ? "none" : "auto"}
      accessibilityElementsHidden={hidden}
      importantForAccessibility={hidden ? "no-hide-descendants" : "auto"}
      testID="split-list"
    >
      <SideContext.Provider value="list">{children}</SideContext.Provider>
    </View>
  );
}

/**
 * The split where an iPad says its widths: the list, the detail and the third column each a box
 * whose width moves on one curve (`PaneMotion.tsx`), so the three always add up to the window and
 * the detail is laid out at each width between. The third column's page is kept while its box
 * shrinks away, and the list is laid out at its own width while its box steps aside.
 */
function Moving({
  list,
  fold,
  detail,
  third,
  widths,
}: {
  readonly list: ReactNode;
  readonly fold: ReactNode;
  readonly detail: ReactNode;
  readonly third: ReactNode;
  readonly widths: { readonly list: number; readonly detail: number; readonly third: number };
}) {
  const palette = usePalette();
  const still = useTurned();
  const kept = useKept(present(third) ? third : undefined);
  return (
    <View style={[styles.row, { backgroundColor: palette.bg }]} testID="split">
      <Widening width={widths.list} still={still} style={styles.listBox}>
        {list}
      </Widening>
      {fold}
      <Widening width={widths.detail} still={still} testID="split-detail">
        {detail}
      </Widening>
      <Widening width={widths.third} still={still} style={styles.thirdBox}>
        {kept === undefined ? null : (
          <View style={[styles.third, { borderColor: palette.line }]} testID="split-third">
            <SideContext.Provider value="third">
              <DetailWidth.Provider value={THIRD}>{kept}</DetailWidth.Provider>
            </SideContext.Provider>
          </View>
        )}
      </Widening>
    </View>
  );
}

/**
 * The sheet standing in the third column, and the host a sheet in the detail shows itself through:
 * offered only where the caller asks for it and a third column fits.
 */
function useSheetBeside(asked: boolean) {
  const [sheet, setSheet] = useState<{ readonly id: string; readonly node: ReactNode }>();
  // The sheet standing there, and how to close it when another takes its place.
  const standing = useRef<{ readonly id: string; readonly close: () => void }>(undefined);
  const host = useMemo<ThirdHost>(
    () => ({
      show: (id, node, close) => {
        const was = standing.current;
        standing.current = { id, close };
        if (was !== undefined && was.id !== id) was.close();
        setSheet({ id, node });
      },
      update: (id, node) => {
        if (standing.current?.id === id) setSheet({ id, node });
      },
      hide: (id) => {
        if (standing.current?.id === id) standing.current = undefined;
        setSheet((now) => (now?.id === id ? undefined : now));
      },
      dismiss: () => standing.current?.close(),
    }),
    [],
  );
  const fits = useThirdFits();
  return { host: asked && fits ? host : undefined, sheet: sheet?.node };
}

/**
 * Whether the window has just changed its width: turned, or resized in Stage Manager. Then each
 * part takes its new width at once, as UIKit lays a turned window out, rather than growing into it.
 */
function useTurned(): boolean {
  const { width } = useWindowDimensions();
  const last = useRef(width);
  const turned = last.current !== width;
  useEffect(() => {
    last.current = width;
  }, [width]);
  return turned;
}

/**
 * The capsule at the window's bottom left (`Sidebar.tsx`, ADR 0276), on an iPad: the list keeps
 * room at its foot for it, and a detail standing at the window's edge under it keeps its foot clear
 * of it (`useFootClear`). The split tells its tab how its detail stands, which narrows the capsule.
 */
function useCapsuleBeside(tab: string | undefined, hidden: boolean, said: number | undefined) {
  const pad = usePadSidebar();
  const { setFoot } = useChrome();
  const atEdge = pad && hidden;
  const width = said ?? 0;
  useEffect(() => {
    if (tab !== undefined && pad) setFoot(tab, { atEdge, width });
  }, [tab, pad, atEdge, width, setFoot]);
  // A room stands its lines in from its edges (`useRoomColumn`), already that far clear of the capsule.
  const centred = (width - Math.min(PANE_COLUMN, width * ROOM_SHARE)) / 2;
  return {
    clear: atEdge ? Math.max(0, capsuleClear(capsuleWidth({ atEdge, width })) - centred) : 0,
    foot: pad ? CAPSULE.height + CAPSULE_FOOT : 0,
  };
}

const FootClear = createContext(0);

/**
 * What keeps a detail's foot clear of the capsule and the gold +: a room's composer, where the list
 * is put away or has stepped aside and the room starts at the window's edge under them (ADR 0276).
 * Nothing anywhere else.
 */
export function useFootClear(): ViewStyle | null {
  const clear = useContext(FootClear);
  return clear > 0 ? { paddingLeft: clear } : null;
}

/** What the list keeps clear under the capsule, past its height: the gap under it and over it. */
const CAPSULE_FOOT = 16;

function present(node: ReactNode): boolean {
  return node !== undefined && node !== null && node !== false;
}

/**
 * How wide each part of the split is: the list, or nothing while it is put away or has stepped aside
 * for a third column; the third column where there is one; and the detail, the rest.
 */
function useWidths(third: ReactNode, away: boolean) {
  const { width } = useWindowDimensions();
  const { column, fold } = useDuo();
  const { across, gap } = pagesOf(fold, width);
  const fits = useThirdFits();
  const beside = useListBesideThird();
  const columned = present(third) && fits;
  const hidden = away || (columned && !beside);
  // The sidebar floats over the list and takes no column of its own (ADR 0276).
  const taken = (hidden ? 0 : across + gap) + column + (columned ? THIRD : 0);
  return { across, gap, hidden, columned, said: SAID ? width - taken : undefined };
}

/**
 * How wide the list is and what stands between it and the detail: on the Duo open, the list runs to
 * the fold's middle, or, half open, to where the fold's margins begin, with the fold and its margins
 * between; anywhere else, the list's own width and nothing between.
 */
export function pagesOf(
  fold: Fold | undefined,
  width: number,
): { readonly across: number; readonly gap: number } {
  const line = foldLine(fold);
  if (fold === undefined || line === undefined) return { across: listWidth(width), gap: 0 };
  if (!fold.active) return { across: line, gap: 0 };
  const across = Math.floor(fold.x);
  return { across, gap: Math.ceil(fold.x + fold.width) - across };
}

/** Where the detail's width is said: an iPad's window, which a turn lays out before Chips hears. */
const SAID = Platform.OS === "ios";

const styles = StyleSheet.create({
  row: { flex: 1, flexDirection: "row" },
  list: { borderRightWidth: StyleSheet.hairlineWidth },
  // The fold's own ground stands between the pages, and the crease is the rule.
  unruled: { borderRightWidth: 0 },
  away: { display: "none" },
  detail: { flex: 1 },
  // The list's box keeps it at its right edge, so it slides out to the left as the box shrinks; the
  // third's keeps it at its left, so it slides in from the window's edge as the box grows.
  listBox: { overflow: "hidden", alignItems: "flex-end" },
  boxed: { flex: 1 },
  thirdBox: { overflow: "hidden", alignItems: "flex-start" },
  third: { flex: 1, width: THIRD, borderLeftWidth: StyleSheet.hairlineWidth },
});
