/**
 * A sheet from the bottom of the glass: a scrim over the screen and a panel that comes up from
 * below the edge, and goes back down when it is let go. A thing that lives at the bottom edge is
 * seen to come from there — the motion iOS gives its own sheets — rather than appearing over the
 * room like a dialog, which is what a fade said (Arjun, 10 September 2026).
 *
 * The panel travels its own height, measured once it is laid out, so a sheet of three rows and a
 * sheet of ten both start just under the edge and stop just on it; until it is measured it stands
 * a window's height away, out of sight whatever it holds.
 *
 * On a phone, the panel is laid out as tall as a sheet may ever be, and drawn as tall as what it
 * holds: the rest of it stands below the edge, moved there. So when what it holds changes height
 * (a page of the room sheet giving way to the next, `SheetPages`), the panel's top glides to the
 * new height on the spring, with what it holds riding on it, rather than jumping a frame later.
 * A height is a layout, and one changed on every frame drops them (ADR 0061); a move is not
 * (ADR 0110). A finger can also take it anywhere on it (ADR 0175, Arjun, 15 October 2026: "drag
 * down from anywhere on the sheet"): dragged down and let go past a third of its height, or
 * flicked, it leaves, unless its caller keeps it up; let go sooner, or flicked back up, it springs
 * back. Either way it goes on at the finger's speed, so a slow let-go drifts out and a flick throws
 * it (`fall`; Arjun, 24 October 2026: it "abruptly dismisses"). A press on a
 * row that wanders a little is still a press, because the pull waits for a finger to have come
 * down ten points, the distance iOS's own pan waits for, and a move up or across lets it go. A list
 * on the sheet (`SheetScroll`) scrolls until it stands at its top, and a pull down on it then takes
 * the sheet, as iOS's own sheets do. Reduce Motion, on, takes the travel out and leaves the fade.
 *
 * `open` is the caller's, and the sheet stays mounted while it is false so that the exit can be
 * seen: the modal under the panel goes only once the panel has. A caller that unmounts the sheet
 * to close it gets no exit at all, which is why the composer keeps its sheet mounted and turns
 * `open` off; a caller that would rather mount it only while it is up turns `open` off and
 * unmounts on `onGone`, which is when the exit has finished (the line's menu).
 *
 * What goes on a sheet is the caller's, but the pieces are shared so that every sheet reads the
 * same (`SheetRows.tsx`, re-exported here): a `SheetTitle`, and a `SheetCard` of `SheetRow`s — the
 * design system's mark, a name and a line under it.
 *
 * The way out is the sheet's own: an X at the top right, on the title's line (`SheetClose`, ADR
 * 0169), so a sheet has no Cancel or Done that only closes it. A sheet whose first line is its own
 * leaves `CLOSE_ROOM` at its right. Pulled, the sheet tells the X how far it has come, and the X draws a ring that closes at the line where letting go puts the sheet away.
 *
 * The motion is React Native's own `Animated` on the native driver rather than Reanimated, which
 * cannot be loaded under Jest here (see `jest.setup.js`); one transform and one opacity need no
 * more than that. It arrives on the spring the rest of the app moves on (`IOS_SPRING`).
 *
 * **Measured at rest.** On the native driver the panel moves without the layout hearing of it:
 * React Native gives the layout the panel's new place only once a spring has finished and React
 * has drawn the sheet again, so a view on the panel measured before then is where the panel was
 * (ADR 0202's second addendum: a square tapped on the room sheet's Media & files page as it glided
 * in measured 187 points high, and the viewer flew the picture from mid-screen). The glide ends
 * when it is seen to, not when the spring's tail does, and what measures a view on the panel waits
 * for the panel to be drawn at rest (`useSheetRest`), which is at once unless it is moving.
 *
 * **Docked.** Inside `SheetDock` the same sheet is a column where it is drawn instead of a panel
 * over the window: a space's details beside its room on a wide iPad (ADR 0256). It holds the same
 * pages and the same X, with nothing to pull and no scrim, and stands while it is open. A sheet
 * opened from inside it opens as any other does.
 *
 * **On an iPad** (ADR 0256, the mock's section 7: "What opens from a button opens beside the
 * button"), a choice opens beside the button it was opened from, as iPadOS opens one: the caller
 * says what that was (`from`), and the sheet is a popover with its arrow on it (`Beside`, placed by
 * `ui/beside.ts`). Nothing dims, since what it was opened over is what the choice is about, nothing
 * pulls it, and a tap off it puts it away. Any other sheet is a task, and a card in the middle of
 * the window, as iPadOS stands a form: it comes up from the foot and goes back down, and a pull
 * takes it as on a phone. What either holds is what the phone's sheet holds.
 */

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Animated,
  Easing,
  KeyboardAvoidingView,
  type LayoutChangeEvent,
  Modal,
  type ModalProps,
  Platform,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
  type ViewStyle,
} from "react-native";
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
  type PanGestureHandlerEventPayload,
} from "react-native-gesture-handler";
import { useKeyboardContext } from "react-native-keyboard-controller";
import { ARROW, type Placed, placeBeside, type Seen, type SheetFrom, watch } from "./beside";
import { pageOffFold, useDuo } from "./duo";
import { OnGround } from "./ground";
import * as feel from "./haptics";
import { useLayout } from "./layout";
import { useEscape } from "./menuBar";
import { IOS_SPRING } from "./motion";
import { useKept, Widening } from "./PaneMotion";
import { type CloseAt, type CloseMotion, closeInLane, SheetClose } from "./SheetClose";
import { type Grip, SheetGrip } from "./SheetScroll";
import { THIRD, type ThirdHost, ThirdSide, useThirdHost } from "./Split";
import { usePalette } from "./theme";
import { RADIUS, SHEET, SPACE } from "./tokens";
import { useReduceMotion } from "./useReduceMotion";
import { useTabTop, useWindowInsets } from "./windowInsets";

export { CLOSE_ROOM } from "./SheetClose";
export { SheetPages } from "./SheetPages";
export { SheetCard, SheetRow, SheetTitle } from "./SheetRows";
export { SheetScroll } from "./SheetScroll";

/** How long the panel takes to leave; it arrives on the spring (`IOS_SPRING`), the scrim with it. */
export const SHEET_OUT_MS = 220;
/** The grabber's height. */
const GRABBER = 5;
/** With Reduce Motion on, the fade that stands in for the travel. */
const STILL_MS = 160;
/** Wider than a phone the sheet is a card (`roomy`), and this is as wide as the card gets: a form's. */
const CARD_WIDTH = 540;
/** The side of the square turned to make a popover's arrow, which stands `ARROW` out of it. */
const ARROW_SIDE = Math.round(ARROW * Math.SQRT2);
/** Let go past this much of the panel's height, or this fast (points a second), and it leaves. */
const LETS_GO = 1 / 3;
const FLICK = 800;
/**
 * How fast a sheet let go by a finger falls away, in points a second each second: from a standstill
 * the room sheet's 350 points left take about a quarter of a second, as the eased exit did.
 */
const FALL = 12_000;
/** How far a finger goes before it is a pull, or a move the sheet lets go of: iOS's own pan's. */
const SLOP = 10;
const NATIVE = Platform.OS !== "web";
/**
 * Where a glide stops being seen to move, in points and points a second: it finishes there, so the
 * layout hears where the panel is when the eye does, and not half a second later at the spring's
 * own default, a thousandth of a point.
 */
const GLIDE_REST = { restDisplacementThreshold: 0.25, restSpeedThreshold: 4 } as const;

/**
 * Inside it a sheet stands as a column this wide where it is drawn, rather than over the window;
 * outside it, nothing.
 */
export const SheetDock = createContext<number | undefined>(undefined);

/** When the panel a view is on is drawn at rest; at once, off a sheet. */
const SheetRest = createContext<() => Promise<void>>(() => Promise.resolve());

/**
 * Wait on this before measuring a view on a sheet: while the panel moves, the layout still has it
 * where it last came to rest (*Measured at rest*, at the head of this file).
 */
export function useSheetRest(): () => Promise<void> {
  return useContext(SheetRest);
}

type SheetProps = {
  readonly open: boolean;
  /**
   * The X, the scrim, the Android back button, a screen reader's escape, and a drag past the line.
   * It closes the sheet by turning `open` off in the same update; one that does not (a reader going
   * back a page, a sheet held while busy) keeps it up, and a drag comes back to rest (`useDrag`).
   */
  readonly onClose: () => void;
  /**
   * What the X does when it is not `onClose`: a sheet showing a reader goes back to its menu on a
   * drag or the back button, and its X still puts the whole sheet away.
   */
  readonly onCloseButton?: (() => void) | undefined;
  /** False while the sheet may not be put away (a delete under way): the X greys and does nothing. */
  readonly closable?: boolean;
  /** The exit has finished and the modal is down: a caller that mounts the sheet only while it
   * is up unmounts it here. */
  readonly onGone?: (() => void) | undefined;
  readonly testID?: string | undefined;
  /** Bounded callers supply a shrinking ScrollView between fixed chrome. Full uses the same modal. */
  readonly sizing?: "content" | "bounded" | "full";
  /**
   * A card that shows something rather than asks: wider than a phone it takes the window's width
   * less a margin, where any other is a form's (`CARD_WIDTH`). Universe draws a page in it, and a
   * page wants the width (Arjun, 3 November 2026: "want to be able to make use of ipad width").
   */
  readonly wide?: boolean;
  /**
   * At most this much of the window, for a sheet that would otherwise fill it. A sheet is this
   * screen with something in front of it; one that reaches the notch is another screen, and the
   * room behind it stops being the thing you are deciding about (Arjun, 21 September 2026: the
   * icon sheet at three quarters).
   */
  readonly cap?: number | undefined;
  /**
   * The sheet holds a field, and rides up on the keys when they come: a name typed into a sheet
   * the keyboard covers is typed blind (ADR 0085). On a phone it rises with the keys' own frames,
   * as far as keeps its top in sight (`useLift`, ADR 0112). Such a sheet is mounted outside any scroll
   * view that keeps the default `keyboardShouldPersistTaps`, or one that lets taps through:
   * touches travel the component tree, modal or not, and that scroll view takes the first tap
   * while the keys are up to put them away, so Save would need two (the agent card, 2 October).
   */
  readonly keyboard?: boolean;
  /**
   * The button the sheet was opened from, or where a finger pressed and held: on an iPad a choice
   * opens beside it as a popover. Without it, a sheet there is a card in the middle.
   */
  readonly from?: SheetFrom | undefined;
  readonly children: ReactNode;
};

export function Sheet(props: SheetProps) {
  const width = useContext(SheetDock);
  const host = useThirdHost();
  const { roomy } = useLayout();
  // What it was opened from is kept until it opens again: a caller that lets go of it as it closes
  // (the row whose face it was) would have it change shape on the way out.
  const kept = useRef(props.from);
  if (props.open) kept.current = props.from;
  const from = kept.current;
  // Esc puts away what stands over the window (ADR 0256); a column beside the room is not over it.
  useEscape(props.open && width === undefined && host === undefined, props.onClose);
  if (width !== undefined) return <Docked width={width} {...props} />;
  if (host !== undefined) return <InThird host={host} {...props} />;
  if (roomy && from !== undefined) return <Beside {...props} from={from} />;
  return <Rising {...props} />;
}

/**
 * The sheet as a column where it is drawn: no pull, the X its way out. It grows in from the window's
 * right edge as the room beside it narrows, and shrinks away as the room widens again, on the
 * panes' motion (`PaneMotion.tsx`, ADR 0276); what it holds stays drawn until it has gone.
 */
function Docked({ width, open, onGone, ...props }: SheetProps & { readonly width: number }) {
  const drawn = useGoneOnceAway(open, onGone);
  return (
    <Widening width={open ? width : 0} style={styles.dock}>
      {drawn ? <DockedPanel width={width} open={open} {...props} /> : null}
    </Widening>
  );
}

/**
 * The sheet as the third column of the split it was opened in (`useThirdHost`, ADR 0276's
 * addendum): what it holds stands there, under its X, while it is open, and the split moves the
 * column in and out. Drawn there rather than here, so nothing of it stands where it was opened.
 */
function InThird({ host, open, onGone, ...props }: SheetProps & { readonly host: ThirdHost }) {
  const id = useId();
  useGoneOnceAway(open, onGone);
  const close = useRef(props.onClose);
  close.current = props.onClose;
  const panel = open ? <DockedPanel width={THIRD} open ruled={false} top {...props} /> : undefined;
  // It takes the column as it opens; each time it is drawn after, the column shows what it holds
  // now. Taking it every time, two sheets drawn in one go closed each other.
  const standing = useRef(false);
  useEffect(() => {
    if (panel === undefined) {
      if (standing.current) host.hide(id);
      standing.current = false;
    } else if (standing.current) host.update(id, panel);
    else {
      standing.current = true;
      host.show(id, panel, () => close.current());
    }
  });
  useEffect(() => () => host.hide(id), [host, id]);
  return null;
}

/** Whether a column still stands while it slides away; and, once it has gone, the sheet's `onGone`. */
function useGoneOnceAway(open: boolean, onGone: (() => void) | undefined): boolean {
  const drawn = useKept(open ? true : undefined) === true;
  const gone = useRef(onGone);
  gone.current = onGone;
  const was = useRef(drawn);
  useEffect(() => {
    if (was.current && !drawn) gone.current?.();
    was.current = drawn;
  }, [drawn]);
  return drawn;
}

/**
 * What a sheet as a column holds: its X and its pages on the grouped ground, at the column's width.
 * Beside a room it draws its own rule; as a split's third column, the split draws it, and it keeps
 * clear of the status bar itself (`top`).
 */
function DockedPanel({
  width,
  open,
  ruled = true,
  top = false,
  onClose,
  onCloseButton,
  closable = true,
  testID,
  children,
}: Omit<SheetProps, "onGone"> & {
  readonly width: number;
  readonly ruled?: boolean;
  readonly top?: boolean;
}) {
  const palette = usePalette();
  const insets = useWindowInsets();
  const tabTop = useTabTop();
  const motion = useMemo<CloseMotion>(
    () => ({
      progress: new Animated.Value(1),
      drag: new Animated.Value(0),
      armed: new Animated.Value(0),
      line: 1,
      still: true,
    }),
    [],
  );
  return (
    <View
      style={[
        styles.docked,
        ruled ? null : styles.unruledDock,
        {
          width,
          paddingTop: top ? tabTop : 0,
          paddingBottom: insets.bottom,
          backgroundColor: palette.grouped,
          borderColor: palette.line,
        },
      ]}
      pointerEvents={open ? "auto" : "none"}
      testID={testID}
    >
      <SheetDock.Provider value={undefined}>
        <View style={styles.fill} testID={testID === undefined ? undefined : `${testID}-panel`}>
          <OnGround kind="grouped">
            <View style={styles.noHandle} />
            <SheetClose
              motion={motion}
              disabled={!closable}
              onClose={onClose}
              onCloseButton={onCloseButton}
              sheet={testID}
            />
            <ThirdSide>{children}</ThirdSide>
          </OnGround>
        </View>
      </SheetDock.Provider>
    </View>
  );
}

function Rising({
  open,
  onClose,
  onCloseButton,
  closable = true,
  onGone,
  testID,
  sizing = "content",
  cap,
  keyboard = false,
  wide = false,
  children,
}: SheetProps) {
  const palette = usePalette();
  // The window's insets, not the screen's: the sheet covers the window. A tab's own are the tab
  // bar's too, so a sheet opened from You stood 49 points clear of the bottom with nothing under
  // its list (Arjun, 11 October 2026: the Agents sheet stopped at the sixth agent).
  const insets = useWindowInsets();
  // A card wherever the window is wider than a phone: an iPad mini upright too (ADR 0177).
  const { roomy: card } = useLayout();
  const { height: windowHeight, width: windowWidth } = useWindowDimensions();
  const room = Math.max(
    0,
    card
      ? windowHeight - insets.top - insets.bottom - SPACE.xl * 2
      : windowHeight - insets.top - SPACE.md,
  );
  // The cap is of the window, which is what "three quarters of the screen" means to an eye;
  // never more than the room the insets leave.
  const available = cap === undefined ? room : Math.min(room, windowHeight * cap);
  // A card stands in the middle, with nowhere below it to keep the rest.
  const glides = !card;
  const motion = useMotion(open, onGone, glides);
  // On a phone the panel rises with the keys; a card keeps the avoiding view.
  const lift = useLift(keyboard, glides, motion.below);
  const grip = useDrag(motion, open, { onClose, onCloseButton, closable }, testID);
  const { progress, still } = motion;
  const beside = useBesideColumn(card, windowWidth, windowHeight - room + motion.below);
  const width = useCardWidth(card, wide, windowWidth, insets);
  // Where the panel is: the finger's pull, plus what it does not hold standing below the edge,
  // plus the way it has still to come.
  const translateY = useMemo(() => {
    const at = Animated.add(
      Animated.add(motion.drag, motion.rest),
      Animated.multiply(Animated.subtract(1, progress), motion.depth),
    );
    return Animated.add(at, lift);
  }, [motion.drag, motion.rest, motion.depth, progress, lift]);
  return (
    <Modal
      visible={motion.shown}
      transparent
      animationType="none"
      statusBarTranslucent
      supportedOrientations={ORIENTATIONS}
      onRequestClose={onClose}
      testID={testID}
    >
      {/* A modal is a root of its own, which a gesture needs one inside. */}
      <GestureHandlerRootView style={styles.fill}>
        <KeyboardAvoidingView
          style={[styles.root, card ? styles.middle : null]}
          enabled={keyboard && !glides}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <Animated.View style={[StyleSheet.absoluteFill, styles.scrim, { opacity: progress }]}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close"
              style={styles.fill}
              onPress={onClose}
            />
          </Animated.View>
          <GestureDetector gesture={grip.pan}>
            <Animated.View
              accessibilityViewIsModal
              onAccessibilityEscape={onClose}
              onLayout={motion.onPanel}
              testID={testID === undefined ? undefined : `${testID}-panel`}
              style={[
                styles.panel,
                card ? styles.card : styles.edge,
                width,
                glides ? { height: room } : null,
                beside?.padding,
                {
                  // The grouped ground: white cards on it in light, as iOS groups (ADR 0192).
                  backgroundColor: palette.grouped,
                  borderColor: palette.line,
                  transform: [{ translateY }],
                  opacity: still ? progress : 1,
                },
              ]}
            >
              <View
                onLayout={motion.onHeld}
                style={[
                  styles.held,
                  sizing === "content" ? null : { maxHeight: available },
                  sizing === "full" ? { height: available } : null,
                  { paddingBottom: SPACE.lg + (card ? 0 : insets.bottom) },
                ]}
              >
                <OnGround kind="grouped">
                  <View style={styles.handle}>
                    <View style={[styles.grabber, { backgroundColor: palette.line2 }]} />
                  </View>
                  <SheetClose
                    motion={motion}
                    disabled={!closable}
                    onClose={onClose}
                    onCloseButton={onCloseButton}
                    sheet={testID}
                    at={beside?.close}
                  />
                  <SheetGrip.Provider value={grip}>
                    <SheetRest.Provider value={motion.rested}>{children}</SheetRest.Provider>
                  </SheetGrip.Provider>
                </OnGround>
              </View>
            </Animated.View>
          </GestureDetector>
        </KeyboardAvoidingView>
      </GestureHandlerRootView>
    </Modal>
  );
}

/** Where the title's line stands on a sheet's panel: under the handle, which stands at its top. */
const LINE_TOP = SPACE.sm * 2 + GRABBER;

/**
 * A phone's sheet on the iPhone Duo (ADR 0256, the mock's section 11): it rises across the screen
 * and under the column, as UIKit's own sheets do, and what it holds stands beside the column, with
 * its X in the column's lane (`closeInLane`). Folded, its tiles ran on under the column and its X
 * stood under the battery (the simulator, 2 November 2026). `top` is the panel's top at rest.
 */
function useBesideColumn(
  card: boolean,
  windowWidth: number,
  top: number,
): { readonly padding: ViewStyle; readonly close: CloseAt | undefined } | undefined {
  const { side, column, bar } = useDuo();
  if (card || side === undefined || column <= 0) return undefined;
  const inner = SPACE.lg + column;
  const lineRight = windowWidth - (side === "right" ? inner : SPACE.lg);
  return {
    padding: side === "right" ? { paddingRight: inner } : { paddingLeft: inner },
    close: bar === undefined ? undefined : closeInLane(bar, lineRight, top + LINE_TOP),
  };
}

/**
 * How wide a card stands, past `styles.card`'s form width. A wide one takes the window's width,
 * less a margin each side clear of its insets. On the Duo half open a card stands in the middle of
 * the page beside the column, off the fold.
 */
function useCardWidth(
  card: boolean,
  wide: boolean,
  windowWidth: number,
  insets: { readonly left: number; readonly right: number },
): ViewStyle | undefined {
  const page = pageOffFold(useDuo(), windowWidth);
  if (!card) return undefined;
  if (page === undefined) {
    return wide ? { maxWidth: windowWidth - insets.left - insets.right - SPACE.xl * 2 } : undefined;
  }
  const most = page.width - 2 * SPACE.lg;
  const width = wide ? most : Math.min(CARD_WIDTH, most);
  return {
    alignSelf: "flex-start",
    maxWidth: width,
    width,
    marginLeft: page.x + (most - width) / 2 + SPACE.lg,
  };
}

/**
 * The sheet beside what it was opened from, on an iPad: a popover, its arrow on the button. It
 * fades in out of the arrow, and goes the same way. No scrim, and no pull: a tap anywhere off it
 * puts it away, as the X does. A sheet that holds a field rises clear of the keys as they come.
 */
function Beside({
  from,
  open,
  onClose,
  onGone,
  testID,
  cap,
  keyboard = false,
  ...held
}: SheetProps & { readonly from: SheetFrom }) {
  const insets = useWindowInsets();
  const window = useWindowDimensions();
  const spot = useSpot(from, open);
  const placed = spot === undefined ? undefined : placeBeside(spot.at, window, insets);
  const motion = useMotion(open, onGone, false);
  const [tall, setTall] = useState(0);
  const lift = useKeysClear(keyboard, placed, tall, window.height, insets.top);
  return (
    <Modal
      visible={motion.shown && placed !== undefined}
      transparent
      animationType="none"
      statusBarTranslucent
      supportedOrientations={ORIENTATIONS}
      onRequestClose={onClose}
      testID={testID}
    >
      <GestureHandlerRootView style={styles.fill}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close"
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          testID={testID === undefined ? undefined : `${testID}-off`}
        />
        {placed === undefined ? null : (
          <Popover
            {...held}
            onClose={onClose}
            testID={testID}
            placed={placed}
            pointed={spot?.seen === true}
            // As tall as the side it stands on has room for, and no more of the window than a cap.
            room={Math.min(placed.room, cap === undefined ? placed.room : window.height * cap)}
            motion={motion}
            lift={lift}
            onTall={setTall}
          />
        )}
      </GestureHandlerRootView>
    </Modal>
  );
}

/** The popover itself, where it was placed: its panel, and its arrow on the button. */
function Popover({
  placed,
  pointed,
  room,
  motion,
  lift,
  onTall,
  onClose,
  onCloseButton,
  closable = true,
  sizing = "content",
  testID,
  children,
}: Pick<SheetProps, "onClose" | "onCloseButton" | "closable" | "sizing" | "testID" | "children"> & {
  readonly placed: Placed;
  /** It has a button to point at, in sight. */
  readonly pointed: boolean;
  readonly room: number;
  readonly motion: Motion;
  readonly lift: Animated.Value | Animated.AnimatedInterpolation<number>;
  readonly onTall: (height: number) => void;
}) {
  const palette = usePalette();
  const { progress, still, onPanel } = motion;
  const grow = useMemo(
    () => (still ? 1 : progress.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1] })),
    [still, progress],
  );
  const onLaid = useCallback(
    (event: LayoutChangeEvent) => {
      onTall(event.nativeEvent.layout.height);
      onPanel(event);
    },
    [onPanel, onTall],
  );
  return (
    <Animated.View
      accessibilityViewIsModal
      onAccessibilityEscape={onClose}
      onLayout={onLaid}
      testID={testID === undefined ? undefined : `${testID}-panel`}
      style={[
        styles.popover,
        placed.above ? { bottom: placed.edge } : { top: placed.edge },
        {
          left: placed.left,
          width: placed.width,
          opacity: progress,
          // It grows out of its arrow.
          transformOrigin: `${placed.arrow}px ${placed.above ? "100%" : "0%"}`,
          transform: [{ translateY: lift }, { scale: grow }],
        },
      ]}
    >
      <View
        style={[
          styles.popoverPanel,
          { backgroundColor: palette.grouped, borderColor: palette.line, maxHeight: room },
        ]}
      >
        <View
          onLayout={motion.onHeld}
          style={[
            styles.held,
            sizing === "content" ? null : { maxHeight: room },
            sizing === "full" ? { height: room } : null,
            { paddingBottom: SPACE.lg },
          ]}
        >
          <OnGround kind="grouped">
            <View style={styles.noHandle} />
            <SheetClose
              motion={motion}
              disabled={!closable}
              onClose={onClose}
              onCloseButton={onCloseButton}
              sheet={testID}
            />
            <SheetRest.Provider value={motion.rested}>{children}</SheetRest.Provider>
          </OnGround>
        </View>
      </View>
      {pointed ? (
        // The half of a turned square that stands out of the panel, with the panel's hairline
        // round it, and a point of it over the panel's own hairline, which it covers.
        <View
          pointerEvents="none"
          style={[
            styles.arrowBox,
            { left: placed.arrow - ARROW_SIDE },
            placed.above ? { bottom: -ARROW } : { top: -ARROW },
          ]}
        >
          <View
            style={[
              styles.arrow,
              { backgroundColor: palette.grouped, borderColor: palette.line },
              { top: placed.above ? 1 - ARROW_SIDE / 2 : ARROW - ARROW_SIDE / 2 },
            ]}
          />
        </View>
      ) : null}
    </Animated.View>
  );
}

/**
 * Where a popover's button is, measured each time it opens and again as the window turns. A button
 * gone from under it, or out of sight, leaves it in the middle of the window with no arrow.
 */
function useSpot(from: SheetFrom, open: boolean): Seen | undefined {
  const { width, height } = useWindowDimensions();
  const [spot, setSpot] = useState<Seen>();
  // Opened afresh, it waits to be measured rather than standing where it stood last time.
  useEffect(() => {
    if (open) setSpot(undefined);
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const middle = { at: { x: width / 2, y: height / 2, width: 0, height: 0 }, seen: false };
    const view = from.current;
    if (view === null) return setSpot(middle);
    return watch(view, middle, height, setSpot);
  }, [open, from, width, height]);
  return spot;
}

/**
 * How far a popover that holds a field rises as the keys come: as far as keeps its foot clear of
 * them, frame by frame with them, and not at all if they stop short of it. A tall one stops with
 * its top at the top of the window, the keys over its foot, as a phone's sheet does (`useLift`).
 */
function useKeysClear(
  keyboard: boolean,
  placed: Placed | undefined,
  tall: number,
  window: number,
  top: number,
) {
  const keys = useKeyboardContext().animated.height;
  const [still] = useState(() => new Animated.Value(0));
  return useMemo(() => {
    if (!(keyboard && NATIVE) || placed === undefined) return still;
    const head = placed.above ? window - placed.edge - tall : placed.edge;
    const clear = Math.max(0, window - head - tall - SPACE.md);
    const most = Math.max(0, head - top - SPACE.md);
    if (most === 0) return still;
    return keys.interpolate({
      inputRange: [-clear - most, -clear],
      outputRange: [-most, 0],
      extrapolate: "clamp",
    });
  }, [keyboard, placed, tall, window, top, keys, still]);
}

interface Motion {
  /** Whether the modal is up at all: from the first open until the last exit has finished. */
  readonly shown: boolean;
  /** Nought is away and one is in place; the scrim's opacity, and the panel's under Reduce Motion. */
  readonly progress: Animated.Value;
  /**
   * How far away is away, once what the panel holds has been laid out: its height on a phone, and
   * a card's way down out of the window from the middle.
   */
  readonly depth: Animated.Value;
  /** Where a finger has pulled the panel to, in points below its place. */
  readonly drag: Animated.Value;
  /** How much of the panel stands below the edge: its height less what it holds (phone only). */
  readonly rest: Animated.Value;
  /** The height of what the panel holds, which is the height seen. */
  readonly height: { current: number };
  /** How far a pull goes before letting go puts the sheet away: `LETS_GO` of that height. */
  readonly line: number;
  /** One while a pull is past that line, nought short of it: the X fills (`SheetClose`). */
  readonly armed: Animated.Value;
  /**
   * A finger let the panel go to close it: it leaves now, before React has the answer, which
   * `go` then waits on (`leave`). Nothing under Reduce Motion, where the exit is a fade.
   */
  readonly fling: { current: (pulled: Fling) => void };
  /** The sheet stays up after all: a pull's exit under way comes back from where it got to. */
  readonly stay: () => void;
  /** What stands below the edge once it settles: as far as it can rise for the keys. */
  readonly below: number;
  readonly still: boolean;
  /** The panel laid out: as tall as a sheet may be on a phone, as what it holds on a card. */
  readonly onPanel: (event: LayoutChangeEvent) => void;
  /** What it holds laid out: the first time, it arrives; after that, its top glides. */
  readonly onHeld: (event: LayoutChangeEvent) => void;
  /** Once the panel is drawn where it has come to rest: at once, unless it is arriving or gliding. */
  readonly rested: () => Promise<void>;
}

/** The arrival and the exit, the glide between heights, and whether the modal is up. */
function useMotion(open: boolean, onGone: (() => void) | undefined, glides: boolean): Motion {
  const still = useReduceMotion();
  const { height: window } = useWindowDimensions();
  const [progress] = useState(() => new Animated.Value(0));
  const [depth] = useState(() => new Animated.Value(window));
  const [drag] = useState(() => new Animated.Value(0));
  const [rest] = useState(() => new Animated.Value(0));
  const [armed] = useState(() => new Animated.Value(0));
  const [shown, setShown] = useState(open);
  const [below, setBelow] = useState(0);
  const [line, setLine] = useState(0);
  // `shown`, readable from the effect below without the effect running on it.
  const up = useRef(open);
  // The arrival waits for the first layout, which is what sets the depth it arrives from.
  const arriving = useRef(open);
  const height = useRef(0);
  const panel = useRef(0);
  // Where the glide is headed, so a layout that changes nothing starts nothing.
  const headed = useRef(-1);
  // Read when the exit ends, so a new callback does not restart the effect below.
  const gone = useRef(onGone);
  gone.current = onGone;
  const resting = useResting();
  // The exit a pull started (`fling`), until a close takes it up or the sheet stays.
  const leaving = useRef<Leaving | undefined>(undefined);

  const go = useCallback(
    (to: 0 | 1, then?: () => void) => {
      // A pull has it on its way out already: it is gone when that exit ends.
      const pulled = leaving.current;
      leaving.current = undefined;
      if (to === 0 && pulled !== undefined) {
        if (pulled.done) then?.();
        else pulled.after = then;
        return;
      }
      // Up on the spring, the way the system's own sheets settle; down on a short ease, because
      // a sheet leaving is not a thing to watch bounce.
      const motion =
        to === 1 && !still
          ? Animated.spring(progress, { toValue: 1, ...IOS_SPRING, useNativeDriver: NATIVE })
          : Animated.timing(progress, {
              toValue: to,
              duration: still ? STILL_MS : SHEET_OUT_MS,
              easing: Easing.in(Easing.cubic),
              useNativeDriver: NATIVE,
            });
      const move = to === 1 ? resting.begin() : undefined;
      motion.start(({ finished }) => {
        if (move !== undefined) resting.end(move);
        // Not finished: the other direction took over, and it says what happens next.
        if (finished) then?.();
      });
    },
    [progress, still, resting],
  );

  // Read by a gesture made once, so it is the latest through the ref.
  const fling = useRef<(pulled: Fling) => void>(() => undefined);
  fling.current = (pulled: Fling) => {
    if (still) return;
    const exit: Leaving = { done: false, after: undefined };
    leaving.current = exit;
    const away = travelOf(glides, height.current, window);
    leave(progress, drag, away - pulled.from, pulled.speed).start(({ finished }) => {
      if (!finished) return;
      exit.done = true;
      exit.after?.();
    });
  };

  const stay = useCallback(() => {
    if (leaving.current !== undefined) go(1);
  }, [go]);

  useEffect(() => {
    if (open) {
      // Opened again before its exit had finished: it comes back from wherever it got to, a
      // pull's exit too. (Mounted open, it is still arriving, and nothing has pulled it.)
      if (up.current) {
        if (!arriving.current) {
          Animated.spring(drag, { toValue: 0, ...IOS_SPRING, useNativeDriver: NATIVE }).start();
        }
        return go(1);
      }
      up.current = true;
      arriving.current = true;
      // Measured afresh: what it holds now is what it arrives at.
      height.current = 0;
      panel.current = 0;
      progress.setValue(0);
      drag.setValue(0);
      armed.setValue(0);
      setShown(true);
    } else if (up.current) {
      go(0, () => {
        up.current = false;
        setShown(false);
        gone.current?.();
      });
    }
  }, [open, go, progress, drag, armed]);

  // Both heights are measured, never worked out from the insets: a phone can be told its insets
  // late (ADR 0107), and the panel's own layout already has them.
  const settle = useCallback(() => {
    const below = belowOf(glides, panel.current, height.current);
    if (below === undefined) return;
    depth.setValue(still ? 0 : travelOf(glides, height.current, window));
    setBelow(below);
    setLine(height.current * LETS_GO);
    if (arriving.current) {
      arriving.current = false;
      headed.current = below;
      rest.setValue(below);
      return go(1);
    }
    if (below === headed.current) return;
    headed.current = below;
    if (still) return rest.setValue(below);
    const move = resting.begin();
    Animated.spring(rest, {
      toValue: below,
      ...IOS_SPRING,
      ...GLIDE_REST,
      useNativeDriver: NATIVE,
    }).start(() => resting.end(move));
  }, [depth, rest, go, still, glides, resting, window]);

  const onPanel = useCallback(
    (event: LayoutChangeEvent) => {
      panel.current = event.nativeEvent.layout.height;
      settle();
    },
    [settle],
  );
  const onHeld = useCallback(
    (event: LayoutChangeEvent) => {
      height.current = event.nativeEvent.layout.height;
      settle();
    },
    [settle],
  );

  return {
    shown,
    progress,
    depth,
    drag,
    rest,
    height,
    line,
    armed,
    fling,
    stay,
    below,
    still,
    onPanel,
    onHeld,
    rested: resting.rested,
  };
}

/**
 * The exit of a sheet a finger let go, from the moment it lets go: from where the finger left it,
 * `left` points short of out of sight, on at the finger's `speed` and falling away faster (`fall`).
 * The pull winds down as the exit's own travel takes it up, on the one curve, so the panel moves as
 * one thing and the scrim fades with it. It used to stand where the finger let go until React had
 * drawn the caller's answer, 50 to 120 milliseconds on the simulator, and then set off on the eased
 * exit from a standstill, as far again as the panel is tall, whatever the finger had been doing.
 */
function leave(progress: Animated.Value, drag: Animated.Value, left: number, speed: number) {
  const { duration, easing } = fall(left, speed);
  const away = (value: Animated.Value) =>
    Animated.timing(value, { toValue: 0, duration, easing, useNativeDriver: NATIVE });
  return Animated.parallel([away(progress), away(drag)]);
}

/**
 * Going `left` points from `speed` (points a second) and gathering speed at `FALL`: how long it
 * takes, and the curve it takes, as the share of the way gone at each share of the time. The curve
 * starts as steep as the finger was fast, so nothing changes speed at the moment it is let go.
 */
function fall(left: number, speed: number) {
  const from = Math.max(0, speed);
  if (left <= 0) return { duration: 0, easing: (t: number) => t };
  const seconds = (Math.sqrt(from * from + 2 * FALL * left) - from) / FALL;
  const steep = (from * seconds) / left;
  return { duration: seconds * 1000, easing: (t: number) => steep * t + (1 - steep) * t * t };
}

/**
 * The panel's moves — the arrival and each glide — and a promise of the last one drawn at rest.
 * A move's end is the spring's; it is drawn once React has drawn the sheet after it, which is when
 * React Native has handed the layout the panel's place, so the waiters go from an effect of that
 * drawing. A move that another overtakes ends with it.
 */
function useResting() {
  const moves = useRef({ begun: 0, drawn: 0, waiting: [] as (() => void)[] });
  const [ended, setEnded] = useState(0);
  useEffect(() => {
    const now = moves.current;
    now.drawn = ended;
    if (now.drawn !== now.begun) return;
    const waiting = now.waiting;
    now.waiting = [];
    for (const wake of waiting) wake();
  }, [ended]);
  return useMemo(
    () => ({
      begin: () => ++moves.current.begun,
      end: (move: number) => {
        if (move === moves.current.begun) setEnded(move);
      },
      rested: () => {
        const now = moves.current;
        if (now.drawn === now.begun) return Promise.resolve();
        return new Promise<void>((wake) => {
          now.waiting.push(wake);
        });
      },
    }),
    [],
  );
}

/**
 * How far a panel goes to be away: on a phone, the height of what it holds, below the edge; a card
 * in the middle, down out of the window, half of it and half of itself.
 */
function travelOf(glides: boolean, held: number, window: number): number {
  return glides ? held : (window + held) / 2;
}

/**
 * How much of a panel stands below the edge, once both are measured: on a phone, the panel less
 * what it holds and the top hairline, which is seen with it; a card, nothing.
 */
function belowOf(glides: boolean, panel: number, held: number): number | undefined {
  if (held === 0 || (glides && panel === 0)) return undefined;
  return glides ? Math.max(0, panel - held - StyleSheet.hairlineWidth) : 0;
}

/**
 * How far a phone's sheet rises with the keys while it holds a field (`keyboard`): with them, frame
 * by frame, as far as what stands below the edge, which is as far as keeps its top in sight. A
 * page that fits above them rides them whole; a taller one stops with its top at the top, the keys
 * over its foot. The room sheet's first page, whose title is renamed where it stands (ADR 0112),
 * rose whole with the avoiding view and took its title off the screen; made shorter to fit, it
 * sprang on its own clock, and flew past the top before it came down.
 *
 * The keys' own measured frames (the keyboard controller's), added to the panel's move on the
 * native driver: a layout animation of the avoiding view's padding did not run in the modal, and
 * the panel jumped in one frame while the keys took a quarter of a second.
 */
function useLift(keyboard: boolean, glides: boolean, below: number) {
  // The keys' height as they move, frame by frame (0 down to minus their height).
  const keys = useKeyboardContext().animated.height;
  const [still] = useState(() => new Animated.Value(0));
  return useMemo(
    () => (keyboard && glides && NATIVE ? liftFor(keys, below) : undefined) ?? still,
    [keyboard, glides, keys, below, still],
  );
}

function liftFor(keys: Animated.AnimatedMultiplication<number>, below: number) {
  if (below <= 0) return undefined;
  return keys.interpolate({
    inputRange: [-below, 0],
    outputRange: [-below, 0],
    extrapolate: "clamp",
  });
}

/**
 * A finger anywhere on the panel: it follows a downward pull, and leaves or springs back on
 * release. Past the line where letting go closes it, the X fills and the phone ticks, once each
 * way across.
 *
 * A finger is a pull once it has come down `SLOP`, and is let go of once it has gone up or across
 * that far first, so a list scrolls, a row's swipe slides and a list across turns. The gesture
 * decides that itself, on the system's own recognisers, and a list on the sheet waits for it or
 * it for the list, as the list stands (`SheetScroll`): decided from JavaScript, a "no" never let a
 * waiting list go. Until a finger is a pull, a row under it is pressed as ever; once it is, the
 * press is called off. The callbacks run on the JavaScript thread, where the sheet's values are
 * set, as the responder they replace did.
 *
 * Let go past the line, or flicked down, it asks `onClose`, and whether it goes is the caller's: one
 * that closes turns `open` off in that same update. A sheet whose pull closes it (`closes`: not one
 * that may not be put away while it is busy, nor a reader whose pull goes back a page) leaves as the
 * finger lets go, at the finger's speed (`leave`), without waiting for React to draw the answer.
 * One that keeps it up gets the sheet back to rest on the spring, from wherever it had got to, once
 * React has the answer. It used to stay where the finger had left it, its lower rows below the
 * screen (AN-33). Let go short of the line, or flicked back up, it springs back from the finger's
 * speed, so a flick up arrives sooner than a slow let-go.
 */
function useDrag(
  motion: Motion,
  open: boolean,
  {
    onClose,
    onCloseButton,
    closable,
  }: {
    readonly onClose: () => void;
    readonly onCloseButton: (() => void) | undefined;
    readonly closable: boolean;
  },
  testID: string | undefined,
): Grip {
  const { drag, height, armed, fling, stay } = motion;
  // The gesture is made once; the latest `onClose` is read through the ref when it fires. A pull
  // closes the sheet when the X would: not while it is busy, nor when it goes back a page.
  const close = useRef({ onClose, closes: false });
  close.current = {
    onClose,
    closes: closable && (onCloseButton === undefined || onCloseButton === onClose),
  };
  // How many times a pull has asked, and how many of those this sheet has answered.
  const [asked, setAsked] = useState(0);
  const answered = useRef(0);
  const [{ grip, home }] = useState(() => {
    let past = false;
    const arm = (now: boolean) => {
      if (now === past) return;
      past = now;
      if (now) feel.tick();
      Animated.spring(armed, {
        toValue: now ? 1 : 0,
        ...IOS_SPRING,
        useNativeDriver: NATIVE,
      }).start();
    };
    // Reanimated's Babel plugin makes a worklet of every function a gesture is handed, and a
    // worklet keeps its own copy of each variable it reads: what these share is read through
    // functions and objects (`arm`, the refs), never a variable one of them assigns.
    const follow = (event: PanGesture) => {
      drag.setValue(Math.max(0, event.translationY));
      arm(event.translationY > height.current * LETS_GO);
    };
    const home = (velocity = 0) => {
      arm(false);
      Animated.spring(drag, {
        toValue: 0,
        bounciness: 4,
        velocity,
        useNativeDriver: NATIVE,
      }).start();
    };
    const letGo = (event: PanGesture, success: boolean) => {
      const past = event.translationY > height.current * LETS_GO;
      const leaves = event.velocityY > FLICK || (past && event.velocityY > -FLICK);
      if (!(success && leaves)) return home(event.velocityY);
      if (close.current.closes) {
        fling.current({ from: Math.max(0, event.translationY), speed: event.velocityY });
      }
      setAsked((times) => times + 1);
      close.current.onClose();
    };
    const pan = Gesture.Pan()
      .withTestId(`${testID ?? "sheet"}-pull`)
      .runOnJS(true)
      .activeOffsetY(SLOP)
      .failOffsetY(-SLOP)
      .failOffsetX([-SLOP, SLOP])
      .onUpdate(follow)
      .onEnd(letGo);
    return { grip: { pan } satisfies Grip, home };
  });
  useEffect(() => {
    if (asked === answered.current) return;
    answered.current = asked;
    if (!open) return;
    stay();
    home();
  }, [asked, open, home, stay]);
  return grip;
}

/** What a pan says as it moves and as it ends: how far down it has come, and how fast. */
type PanGesture = Pick<PanGestureHandlerEventPayload, "translationY" | "velocityY">;

/** Where a finger let a panel go, in points below its place, and how fast, in points a second. */
interface Fling {
  readonly from: number;
  readonly speed: number;
}

/** A pull's exit: whether it has ended, and what is to happen when it does (`go`). */
interface Leaving {
  done: boolean;
  after: (() => void) | undefined;
}

// An iPad turns with a sheet up; the modal follows it rather than holding portrait.
const ORIENTATIONS: NonNullable<ModalProps["supportedOrientations"]> = ["portrait", "landscape"];

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: "flex-end" },
  middle: { justifyContent: "center" },
  scrim: { backgroundColor: `rgba(0,0,0,${SHEET.scrim})` },
  fill: { flex: 1 },
  panel: {
    paddingHorizontal: SPACE.lg,
    borderWidth: StyleSheet.hairlineWidth,
    shadowColor: "#000",
    shadowOpacity: 0.16,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: -6 },
    elevation: 16,
  },
  // On a phone the panel stands on the bottom edge and only its top corners are corners.
  edge: {
    borderTopLeftRadius: SHEET.radius,
    borderTopRightRadius: SHEET.radius,
    borderBottomWidth: 0,
  },
  // Wider than a phone it is a card in the middle, as wide as a form, its shadow falling below it.
  card: {
    alignSelf: "center",
    width: "100%",
    maxWidth: CARD_WIDTH,
    borderRadius: SHEET.radius,
    shadowOpacity: 0.22,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 10 },
  },
  // A popover: the shadow is the panel's and the arrow's together, since this holds both.
  popover: {
    position: "absolute",
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 8 },
  },
  popoverPanel: {
    paddingHorizontal: SPACE.lg,
    borderRadius: SHEET.radius,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  arrowBox: { position: "absolute", width: ARROW_SIDE * 2, height: ARROW + 1, overflow: "hidden" },
  // A square turned on its corner, its middle on the panel's edge.
  arrow: {
    position: "absolute",
    left: ARROW_SIDE / 2,
    width: ARROW_SIDE,
    height: ARROW_SIDE,
    borderRadius: 2,
    borderWidth: StyleSheet.hairlineWidth,
    transform: [{ rotate: "45deg" }],
  },
  // What the panel holds, and the height it is seen at.
  held: { paddingTop: SPACE.sm },
  // The handle: the grabber and the strip around it, which says the sheet can be pulled.
  handle: { alignItems: "center", paddingVertical: SPACE.sm, marginTop: -SPACE.sm },
  grabber: { width: 36, height: GRABBER, borderRadius: RADIUS.pill },
  docked: { flex: 1, paddingHorizontal: SPACE.lg, borderLeftWidth: StyleSheet.hairlineWidth },
  // Holds the column at its left, so it slides in from the window's edge as the box grows.
  dock: { overflow: "hidden", alignItems: "flex-start" },
  unruledDock: { borderLeftWidth: 0 },
  // Where the handle stands on a sheet that rises, so on one with nothing to pull the X and the
  // title stand where they do there.
  noHandle: { height: SPACE.sm * 2 + GRABBER },
});
