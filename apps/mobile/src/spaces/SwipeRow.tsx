/**
 * A Spaces row a thumb can push left, the way Mail and Messages do (22 September 2026, Arjun:
 * "sliding the space row, like we have in iOS"): Archive and Delete come out from under it, or
 * Unarchive and Delete for a room already archived. Each is a round button with a mark in it and
 * its word under it, and each asks first (`ConfirmSheet`), except Unarchive, which only puts a
 * room back.
 *
 * The row stays under the thumb and slides off like a card, its trailing corners rounding over a
 * quiet tray, and the buttons pop out from under its edge one by one (ADR 0178, `SwipeDiscs`).
 * Let go before the line, half a button in, and the row springs home; past it, it springs open
 * on its buttons and stays until one is pressed or the list is touched anywhere else (`List`).
 * Pulled past open it gives a little and springs back. No full swipe that acts on its own: the
 * sheet would come up anyway, and a thumb scrolling fast should not start one.
 *
 * A room whose changes are locked offers neither Archive nor Delete (ADR 0156), and its row slides
 * on Locked instead, a padlock that clicks shut on graphite (ADR 0178; it wore Archive's violet
 * until Arjun asked for a colour of its own, 16 October 2026); an archived one on Unarchive and
 * Locked. Locked asks nothing either: it opens the room with its sheet up, where the lock is let
 * go. A locked agent's row on the Agents tab slides on the same Locked (ADR 0199), which opens its
 * card.
 *
 * An agent's row in a room's sheet slides the same way on one red Remove (ADR 0111), which asks
 * nothing: the agent goes free, and Add puts it back.
 *
 * A Spaces row pushed the other way, right, offers what is only the person's own (ADR 0205, his B):
 * Hide, on slate, from its leading end, or Unhide on a room they hid. It asks nothing either. Pin
 * comes out before it, first from the edge, on Chips' gold (ADR 0240, his A): the room goes to the
 * top of their list and stays there, and a pinned row offers Unpin in its place.
 *
 * A room that goes, by any of these or from anywhere else, carries on off the edge its act is pushed
 * towards, its tray fading behind it, and the list folds its place shut after (ADR 0205's
 * addendum, `going`).
 *
 * The same acts are the row's accessibility actions, since a screen reader cannot swipe, and the
 * list is where those live (`List`'s `Group`). Under Jest the swipeable is a plain view
 * (`jest.setup.js`), so the buttons here are walked on a device, and the tests reach the acts
 * through the accessibility actions instead.
 */

import { type ReactNode, useRef } from "react";
import ReanimatedSwipeable, {
  type SwipeableMethods,
} from "react-native-gesture-handler/ReanimatedSwipeable";
import type { SharedValue } from "react-native-reanimated";
import * as feel from "../ui/haptics";
import type { IconName } from "../ui/icons";
import { AVATAR_HUES, dark, type Palette } from "../ui/tokens";
import { Discs, Going, useRowEdge, useTrayFade } from "./SwipeDiscs";

export type RowAct = "archive" | "unarchive" | "delete";

/** What a Spaces row pushed right offers, which is the person's alone (ADR 0205). */
export type HideAct = "hide" | "unhide";

/** And first, from its leading edge: the room pinned to the top of their list, or let go (ADR 0240). */
export type PinAct = "pin" | "unpin";

/**
 * And Locked, on a Spaces row whose room's changes are locked (ADR 0156): the room, with its sheet
 * up; and on an Agents row whose agent's changes are (ADR 0199): its card, the lock's row glowing.
 */
export type SpaceAct = RowAct | "locked";

/** What a Spaces row offers, either way it is pushed (ADR 0205). */
export type RoomAct = SpaceAct | HideAct | PinAct;

/**
 * And Remove, on an agent's or a person's row in a room's sheet (ADR 0111); and Withdraw, on an
 * open invite's row (people review, Phase 1).
 */
export type SwipeAct = RoomAct | "remove" | "withdraw";

/** How wide each button's place is: a thumb's width and a word's. */
const ACT_WIDTH = 70;

/** How hard a row pulled past open pulls back: five points of finger for one of row. */
const OVERSHOOT = 5;

/**
 * The spring a row is let go onto, open or home: quick, and a touch past where it rests before it
 * settles. The library's own is critically damped, so a row stopped dead (ADR 0178).
 */
const SETTLE = { mass: 1, stiffness: 430, damping: 29, overshootClamping: false };

const WORD: Readonly<Record<SwipeAct, string>> = {
  archive: "Archive",
  unarchive: "Unarchive",
  delete: "Delete",
  locked: "Locked",
  hide: "Hide",
  unhide: "Unhide",
  pin: "Pin",
  unpin: "Unpin",
  remove: "Remove",
  withdraw: "Withdraw",
};

const MARK: Readonly<Record<SwipeAct, IconName>> = {
  archive: "archive",
  unarchive: "unarchive",
  delete: "trash",
  locked: "lock",
  hide: "hide",
  unhide: "unhide",
  pin: "pin",
  unpin: "unpin",
  remove: "remove",
  withdraw: "remove",
};

/**
 * Locked's graphite (ADR 0178): no hue, because Locked is the one button that does nothing to the
 * room. The icon grounds' Graphite in light; a step lighter in dark, where that one sinks into the
 * tray. White clears 8.5:1 on the first and 6:1 on the second.
 */
const GRAPHITE = { light: "#494d54", dark: "#60646e" } as const;

/**
 * Hide's slate (ADR 0205): graphite with blue in it, a colour of its own beside Locked's, since
 * Hide does something, if only to the person's own list. White clears 7:1 on the first and 5.7:1
 * on the second.
 */
const SLATE = { light: "#4f5a6e", dark: "#5d6880" } as const;

/**
 * Pin's ink (ADR 0240): Chips' gold is light, so the mark on it is the ink Select's Read wears on the
 * same gold (ADR 0181's addendum), 11:1. Every other disc's mark is white.
 */
const ON_GOLD = "#14161b";

/** What each act's mark is drawn in, on its tone. */
export function actInk(act: SwipeAct): string {
  return act === "pin" || act === "unpin" ? ON_GOLD : "#ffffff";
}

/**
 * What each act is painted with. Delete and Remove are the palette's red. Archive and Unarchive borrow two of
 * the avatar hues — a violet and a blue that white clears 4.5:1 on, light or dark — because the
 * palette has no colour for putting things away, and the confirming sheet's button wears the
 * same one, so the colour under the thumb is the colour of the act. Locked is graphite, Hide
 * and Unhide are slate, and Pin and Unpin gold.
 */
export function actTone(act: SwipeAct, palette: Palette): string {
  if (act === "delete" || act === "remove" || act === "withdraw") return palette.red;
  if (act === "pin" || act === "unpin") return palette.gold;
  if (act === "locked") return palette === dark ? GRAPHITE.dark : GRAPHITE.light;
  if (act === "hide" || act === "unhide") return palette === dark ? SLATE.dark : SLATE.light;
  return act === "archive" ? AVATAR_HUES[5] : AVATAR_HUES[4];
}

/** What a row offers when it offers nothing. */
export const NO_ACTS: readonly never[] = [];
/** One array for each set of acts a row can offer, so a row offering the same is not drawn again. */
const ACT_SETS = new Map<string, readonly SwipeAct[]>();
export function actSet<A extends SwipeAct>(acts: readonly A[]): readonly A[] {
  if (acts.length === 0) return NO_ACTS;
  const key = acts.join(" ");
  const held = ACT_SETS.get(key);
  if (held !== undefined) return held as readonly A[];
  ACT_SETS.set(key, acts);
  return acts;
}

export function SwipeRow<A extends SwipeAct>({
  acts,
  leading = NO_ACTS,
  palette,
  onAct,
  onOpen,
  onClose,
  onCard = false,
  enabled = true,
  going,
  onGone = () => undefined,
  testID,
  children,
}: {
  /** What the row offers pushed left, left to right. */
  readonly acts: readonly A[];
  /**
   * What it offers pushed right, from its leading end (ADR 0205). None either way, and it is a
   * row that does not move.
   */
  readonly leading?: readonly A[];
  readonly palette: Palette;
  /** A button was pressed. The row stays open behind the sheet that asks. */
  readonly onAct: (act: A, row: SwipeableMethods) => void;
  /** The row has come open: the list closes whichever was open before. */
  readonly onOpen: (row: SwipeableMethods) => void;
  /** And has gone home again, by a swipe back or by being closed. */
  readonly onClose: (row: SwipeableMethods) => void;
  /**
   * The row wears a card's grey (`surface2`), as a room sheet's do, so the tray it slides off is
   * a step deeper; on the page's colour or a white group, the tray is that grey.
   */
  readonly onCard?: boolean;
  /**
   * Whether a thumb can push it aside: not while its list is picking rows (ADR 0181), when a press
   * picks the row and the bar at the foot holds the acts. Its buttons stay where they are.
   */
  readonly enabled?: boolean;
  /**
   * The edge its room is going off (ADR 0205's addendum): hidden or unhidden, right; archived,
   * unarchived or deleted, left. The row carries on that way from wherever the swipe left it, and
   * its tray fades behind it; `onGone` once it is off.
   */
  readonly going?: "left" | "right" | undefined;
  readonly onGone?: () => void;
  readonly testID: string;
  readonly children: ReactNode;
}) {
  const row = useRef<SwipeableMethods>(null);
  const edge = useRowEdge();
  const fade = useTrayFade();
  const content = (
    <Going going={going} fade={fade} onGone={onGone}>
      {children}
    </Going>
  );
  if (acts.length === 0 && leading.length === 0) return content;
  const discsOf = (offered: readonly A[]) =>
    offered.map((act) => ({
      key: act,
      word: WORD[act],
      mark: MARK[act],
      tone: actTone(act, palette),
      ink: actInk(act),
    }));
  const tray =
    (side: "right" | "left", offered: readonly A[]) =>
    // The library hands a render callback the offset and the row's methods, and nothing else.
    (_progress: unknown, translation: SharedValue<number>, methods: SwipeableMethods) => (
      <Discs
        discs={discsOf(offered)}
        side={side}
        width={ACT_WIDTH}
        opensAt={ACT_WIDTH / 2}
        translation={translation}
        travel={edge.travel}
        tray={onCard ? palette.surface3 : palette.surface2}
        words={palette.ink2}
        onPress={(act) => {
          feel.tap();
          onAct(act as A, methods);
        }}
        testID={testID}
        fade={fade}
      />
    );
  return (
    <ReanimatedSwipeable
      ref={row}
      testID={testID}
      enabled={enabled}
      friction={1}
      rightThreshold={ACT_WIDTH / 2}
      leftThreshold={ACT_WIDTH / 2}
      overshootRight={acts.length > 0}
      overshootLeft={leading.length > 0}
      overshootFriction={OVERSHOOT}
      animationOptions={SETTLE}
      // Clear of the screen's own edges, where a swipe is the system's.
      dragOffsetFromRightEdge={12}
      dragOffsetFromLeftEdge={12}
      childrenContainerStyle={edge.style}
      onSwipeableWillOpen={() => {
        if (row.current !== null) onOpen(row.current);
      }}
      onSwipeableClose={() => {
        if (row.current !== null) onClose(row.current);
      }}
      {...(acts.length > 0 ? { renderRightActions: tray("right", acts) } : {})}
      {...(leading.length > 0 ? { renderLeftActions: tray("left", leading) } : {})}
    >
      {content}
    </ReanimatedSwipeable>
  );
}
