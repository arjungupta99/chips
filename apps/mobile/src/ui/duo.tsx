/**
 * The iPhone Duo's column and fold (ADR 0256, the mock's section 11), as the screens decide by them.
 *
 * On iOS 27.1 the Duo stands an app's bars in a column down one edge, folded or open, with the
 * status bar at its top, and keeps the column clear in the safe area. UIKit's own bars go there by
 * themselves: a room's back button stands at the column's top (the Duo simulator, 2 November 2026).
 * The tabs and the gold + are drawn by Chips (ADR 0233), so Chips draws them there too
 * (`SideColumn.tsx`), in place of the bar at the foot.
 *
 * Open, the inner screen folds down the middle, and a list and the room it opens stand one on each
 * page (`Split.tsx`).
 *
 * What the screen is said by one view at the root of the window (`modules/duo`): which side the
 * column is on, how wide it is, the lane down it UIKit keeps its own buttons in, how far down UIKit
 * stands its bars across the top, and where the fold is and whether it is kept clear. Elsewhere, on
 * the web and on any phone but the Duo, there is no column and no fold, and nothing here changes a
 * thing.
 */

import { requireNativeView, requireOptionalNativeModule } from "expo";
import {
  type ComponentType,
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useState,
} from "react";
import { Platform, StyleSheet, type ViewStyle } from "react-native";

/** A frame in the window's points. */
export interface Frame {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** The fold, with the margins UIKit keeps round it for anything pressed. */
export interface Fold extends Frame {
  /**
   * Whether anything pressed keeps off it: half open. Open flat, nothing need, and the two pages
   * still meet there.
   */
  readonly active: boolean;
}

export interface Duo {
  /** The side the column stands on, or none. */
  readonly side: "left" | "right" | undefined;
  /** Its width: the safe area on that side, or 0 with no column. */
  readonly column: number;
  /**
   * The lane down the column that UIKit stands its own buttons in: under the status at its top,
   * over the home indicator at its foot. A room's back button stands at its top.
   */
  readonly bar: Frame | undefined;
  /**
   * How far down UIKit stands its bars across the top: 24 points, folded and open, as on an iPad.
   * The status bar is in the column, so the window's top inset is 0 and says nothing of it; 0 with
   * no column.
   */
  readonly top: number;
  /** The fold, while the inner screen is open; nothing folded and on any other phone. */
  readonly fold: Fold | undefined;
}

const NONE: Duo = { side: undefined, column: 0, bar: undefined, top: 0, fold: undefined };

/** Given by `DuoProvider`; a test gives it a Duo of its own. */
export const DuoContext = createContext<Duo>(NONE);

/** The Duo's column and fold, or none of them. */
export function useDuo(): Duo {
  return useContext(DuoContext);
}

/** Where the two pages meet: the middle of the fold, if it runs down the screen. */
export function foldLine(fold: Fold | undefined): number | undefined {
  if (fold === undefined || fold.height < fold.width) return undefined;
  return Math.round(fold.x + fold.width / 2);
}

/**
 * Where a card that stands in the middle of the screen goes while the Duo is half open: the page
 * beside the column, off the fold and its margins, as UIKit slides its own sheets off it (Apple's
 * Designing for iPhone Duo). In the middle, the New space card's field and a sheet's rows stood
 * across the crease (the simulator, 2 November 2026). Open flat, nothing need keep off the fold, and
 * a card stands in the middle as on an iPad; nothing then, nor on any other phone.
 */
export function pageOffFold(
  duo: Duo,
  width: number,
): { readonly x: number; readonly width: number } | undefined {
  const { fold, side, column } = duo;
  if (fold === undefined || !fold.active || foldLine(fold) === undefined) return undefined;
  if (side === "left") return { x: column, width: Math.floor(fold.x) - column };
  const x = Math.ceil(fold.x + fold.width);
  return { x, width: width - (side === "right" ? column : 0) - x };
}

/** What the native view says, as the event carries it. */
export function readDuo(said: {
  readonly edge?: unknown;
  readonly column?: unknown;
  readonly bar?: unknown;
  readonly top?: unknown;
  readonly fold?: unknown;
}): Duo {
  const side = said.edge === "left" || said.edge === "right" ? said.edge : undefined;
  const column = side !== undefined && typeof said.column === "number" ? said.column : 0;
  const bar = side !== undefined ? frameOf(said.bar) : undefined;
  const top = side !== undefined && typeof said.top === "number" ? said.top : 0;
  const at = frameOf(said.fold);
  const fold =
    at === undefined
      ? undefined
      : { ...at, active: (said.fold as { active?: unknown }).active === true };
  if (side === undefined && fold === undefined) return NONE;
  return { side, column, bar, top, fold };
}

function frameOf(value: unknown): Frame | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const { x, y, width, height } = value as Record<string, unknown>;
  if (typeof x !== "number" || typeof y !== "number") return undefined;
  if (typeof width !== "number" || typeof height !== "number") return undefined;
  return { x, y, width, height };
}

interface NativeProps {
  readonly onDuo: (event: { readonly nativeEvent: Parameters<typeof readDuo>[0] }) => void;
  readonly pointerEvents: "none";
  readonly style: ViewStyle;
}

let watch: ComponentType<NativeProps> | null | undefined;

function nativeWatch(): ComponentType<NativeProps> | null {
  if (watch === undefined) {
    watch =
      Platform.OS === "ios" && requireOptionalNativeModule("ChipsDuo") !== null
        ? requireNativeView<NativeProps>("ChipsDuo")
        : null;
  }
  return watch;
}

/** Holds what the Duo says for every screen under it, and the view that says it. */
export function DuoProvider({ children }: { readonly children: ReactNode }) {
  const [duo, setDuo] = useState<Duo>(NONE);
  const onDuo = useCallback<NativeProps["onDuo"]>((event) => {
    const next = readDuo(event.nativeEvent);
    setDuo((last) => (same(last, next) ? last : next));
  }, []);
  const Watch = nativeWatch();
  return (
    <DuoContext.Provider value={duo}>
      {Watch === null ? null : <Watch onDuo={onDuo} pointerEvents="none" style={styles.fill} />}
      {children}
    </DuoContext.Provider>
  );
}

function same(a: Duo, b: Duo): boolean {
  return (
    a.side === b.side &&
    a.column === b.column &&
    a.top === b.top &&
    a.fold?.active === b.fold?.active &&
    sameFrame(a.bar, b.bar) &&
    sameFrame(a.fold, b.fold)
  );
}

function sameFrame(a: Frame | undefined, b: Frame | undefined): boolean {
  return a?.x === b?.x && a?.y === b?.y && a?.width === b?.width && a?.height === b?.height;
}

const styles = StyleSheet.create({
  fill: { position: "absolute", left: 0, top: 0, right: 0, bottom: 0 },
});
