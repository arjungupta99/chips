/**
 * One viewport-anchored gradient, sampled by each outgoing bubble on the UI thread. Native
 * measurement includes the inverted list, keyboard and recycled rows; no accumulated row-height
 * guesses and no React state updates on scroll. There is no timer or animation loop.
 *
 * Three rules, learned on the phone, keep it smooth and steady:
 *
 * The field is moved by a transform and nothing else (`scrollField.ts`). Its first version set
 * the field's `height` from the worklet as well, and on the new architecture a height is a
 * layout: Reanimated commits a shadow tree for it, synchronously, on every scroll frame — which
 * is where the frames went while the room scrolled, and where the flicker came from when such a
 * commit met a render of the row.
 *
 * And a bubble whose measurement fails keeps the place it last had. A view can be unmeasurable
 * for a frame — the row mounting, the list re-laying itself out under a keyboard, the screen on
 * its way out — and the first version hid the field for that frame, so the bubble flashed the
 * static teal beneath and then coloured again: the flicker on opening and closing a room. Now
 * the field is hidden only until its first good measurement, and never after.
 *
 * And the picture runs past the glass at both ends, because a measurement taken during a scroll
 * is a little behind it (`scrollField.ts`). While it ended at the glass's edge, that showed as a
 * band of the bubble's flat teal along the top of the bubble the glass cuts — the one place an
 * edge of the field can be seen, and there until the next scroll (20 September 2026).
 *
 * The measuring is split from the styling on purpose. The reaction measures and writes the
 * placement; the style reads the placement. One worklet that measured, wrote and read the same
 * value would mark itself dirty every time it ran.
 */
import { ROOM_FADE_IN_MS } from "@chipschat/core";
import {
  createContext,
  forwardRef,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
} from "react";
import {
  FlatList,
  type FlatListProps,
  type LayoutChangeEvent,
  Platform,
  type StyleProp,
  StyleSheet,
  type View,
  type ViewStyle,
} from "react-native";
import Animated, {
  measure,
  useAnimatedReaction,
  useAnimatedRef,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { Defs, LinearGradient, Rect, Stop, Svg } from "react-native-svg";
import { useReduceMotion } from "../ui/useReduceMotion";
import type { Field, Own } from "./field";
import {
  type Arrival,
  BACK,
  MovingCell,
  NEAR,
  RoomTransition,
  useRoomTransition,
} from "./RoomMotion";
import {
  FIELD_HEIGHT,
  FIELD_STOPS,
  FIELD_STRETCH,
  FIELD_WIDTH,
  type FieldPlacement,
  nearGlass,
  placeField,
} from "./scrollField";
import { isFoot, type Row } from "./spaces";

export type { Field };

const FieldContext = createContext<Field | undefined>(undefined);
/**
 * The list, animated, drawing its own cells (`MovingCell`): each row moves from where it was to
 * where it is, and a row that has just landed comes in under the row above it (`RoomMotion.tsx`).
 * Reanimated's own list gives a cell a move and nothing else, and a landing row whose rise was a
 * view inside its cell kept rising on its own after the next line landed, while the cells round it
 * were sent on (25 September 2026).
 */
const List = Animated.createAnimatedComponent(FlatList) as unknown as typeof FlatList<Row>;

/**
 * FlatList's `strictMode`: a row is drawn again when it, or the function that draws it, changes,
 * and not on every render of the list, which is what FlatList does without it — it hands each row
 * a new function every time (`useRoomView`, in `SpaceView.tsx`). React Native's types do not name
 * the prop yet; its list does.
 */
const STRICT_MODE: object = { strictMode: true };

/** The style a row's cell stands in: over or under its neighbours. */
type CellStyle = (row: { readonly item: Row; readonly index: number }) => StyleProp<ViewStyle>;

/** What the list hands the cell it draws a row in. */
interface CellProps {
  readonly item: Row;
  readonly index: number;
  readonly onLayout?: ((event: LayoutChangeEvent) => void) | undefined;
  readonly style?: StyleProp<ViewStyle> | undefined;
  readonly children?: ReactNode;
}

/**
 * The room's field, made by the room rather than by its list: the list's bubbles sample it, and so
 * do the words of a message on their way to their bubble from the field, which fly over the list
 * and not in it (`SendFlight.tsx`).
 */
export function useColourField(): Field {
  const scroll = useSharedValue(0);
  const layout = useSharedValue(0);
  const viewportTop = useSharedValue(0);
  const viewportHeight = useSharedValue(0);
  const top = useSharedValue(0);
  const far = useSharedValue(0);
  const lifting = useSharedValue(0);
  const goal = useSharedValue(0);
  const home = useSharedValue(0);
  const glide = useSharedValue(0);
  const shift = useSharedValue(0);
  const own = useSharedValue<Own>({ until: 0, at: 0 });
  const still = useReduceMotion();
  const list = useAnimatedRef<FlatList<Row>>();
  return useMemo(
    () => ({
      scroll,
      layout,
      viewportTop,
      viewportHeight,
      top,
      still,
      list,
      moves: !still && Platform.OS !== "web",
      far,
      lifting,
      goal,
      home,
      glide,
      shift,
      own,
    }),
    [
      scroll,
      layout,
      viewportTop,
      viewportHeight,
      top,
      still,
      list,
      far,
      lifting,
      goal,
      home,
      glide,
      shift,
      own,
    ],
  );
}

/**
 * The room's list: its rows sample the field, and move with the room (`RoomMotion.tsx`).
 *
 * Whether the reader is up the history is the scroll's to say, past `NEAR` points from the foot
 * and back inside `BACK`. Up there the room keeps their place itself, and nothing in the room
 * moves (`RoomMotion.tsx`, `keep`); at the foot what lands moves the rows above it rather than the
 * list's offset. A place kept at the foot is a line held still while a line is put in under it —
 * the room then has to be taken back down to the new one, and that is the settle this replaced.
 * The room says how the list keeps its place instead (`maintainVisibleContentPosition`) where it
 * does not move: with Reduce Motion, and on the web.
 */
export const ColourList = forwardRef<
  FlatList<Row>,
  // The list draws its own cells, to move them (`RoomMotion.tsx`).
  Omit<FlatListProps<Row>, "CellRendererComponent"> & {
    readonly field: Field;
    /** A style for the cell a row stands in, over or under its neighbours. */
    readonly CellRendererComponentStyle?: CellStyle;
    /**
     * Whether a row has just landed, and so comes in under the row above it rather than being
     * drawn where it stands, and how (`Arrival`): asked as its cell is first drawn, and played
     * there once (`useCell`).
     */
    readonly arrives?: (row: Row) => Arrival | undefined;
    /**
     * Whether the room has been built. A room still being drawn for the first time — its foot
     * measuring itself, its bar reporting how much of the top it covers — moves nothing on the
     * room's spring: nothing in it has been seen yet for a spring to come from, and what its
     * build corrects belongs where it is drawn (`SpaceView`).
     */
    readonly built?: boolean;
    /**
     * Whether the list is to be seen. A room opened on a line holds it unseen while it places the
     * line, and then it fades up as a line landing does, with the line where it belongs
     * (`useLanding`, in `SpaceView`, ADR 0133).
     */
    readonly shown?: boolean;
  }
>(function ColourList(
  { field, CellRendererComponentStyle, arrives, built = true, shown = true, ...props },
  ref,
) {
  const viewport = useAnimatedRef<View>();
  const seen = useShown(shown);
  const { scroll, layout, viewportTop, viewportHeight, far, moves } = field;
  // Where the reader stands: up the history past `NEAR`, and back inside `BACK`.
  const stand = useCallback(
    (offset: number) => {
      "worklet";
      const up = far.value === 1 ? offset > BACK : offset > NEAR;
      if (up !== (far.value === 1)) far.value = up ? 1 : 0;
    },
    [far],
  );
  const { transition, lift } = useRoomTransition(field, moves && built, stand);
  const { lifting, held } = lift;
  // While the room lifts the list to a line, where it is is the room's doing, not the reader's
  // (`Lift`); a finger stops it, and the lift says where the list is when it stops.
  const onScroll = useAnimatedScrollHandler(
    {
      onScroll: (event) => {
        const offset = event.contentOffset.y;
        scroll.value = offset;
        if (!moves || lifting.value === 1) return;
        stand(offset);
      },
      onBeginDrag: () => {
        held.value = 1;
        lift.stop();
      },
      onEndDrag: () => {
        held.value = 0;
      },
      onMomentumBegin: () => {
        held.value = 1;
      },
      onMomentumEnd: () => {
        held.value = 0;
      },
    },
    [scroll, moves, lifting, held, lift, stand],
  );
  const cell = useCell(CellRendererComponentStyle, arrives, props.keyExtractor);
  // The viewport is measured once per frame it could have moved in, not once per bubble —
  // and not before its first layout, when there is nothing to measure yet and asking is a
  // warning in development.
  useAnimatedReaction(
    () => [scroll.value, layout.value],
    () => {
      if (layout.value === 0) return;
      const window = measure(viewport);
      if (window === null) return;
      viewportTop.value = window.pageY;
      viewportHeight.value = window.height;
    },
  );
  return (
    <FieldContext.Provider value={field}>
      <RoomTransition.Provider value={transition}>
        <Animated.View
          ref={viewport}
          collapsable={false}
          style={[styles.viewport, seen]}
          onLayout={() => {
            layout.value += 1;
          }}
        >
          <List
            {...props}
            ref={ref}
            {...STRICT_MODE}
            CellRendererComponent={cell}
            onScroll={onScroll}
            scrollEventThrottle={16}
            onContentSizeChange={(width, height) => {
              layout.value += 1;
              props.onContentSizeChange?.(width, height);
            }}
          />
        </Animated.View>
      </RoomTransition.Provider>
    </FieldContext.Provider>
  );
});

/** The list's opacity: unseen while it is told so, and up over a landing's fade once it is not. */
function useShown(shown: boolean) {
  const seen = useSharedValue(shown ? 1 : 0);
  useEffect(() => {
    seen.value = shown ? withTiming(1, { duration: ROOM_FADE_IN_MS }) : 0;
  }, [seen, shown]);
  return useAnimatedStyle(() => ({ opacity: seen.value }));
}

/**
 * The cell the list draws each row in, made once for the list's life: a new component would be a
 * new cell for every row, drawn again from nothing. What it asks of the room it reads as it draws.
 *
 * A row arrives once, in the cell first drawn for it. The list lets go of the cells of rows far
 * outside the glass (`windowSize`) and draws them again as the reader comes near, and a cell drawn
 * again for a row that arrived while the room was open asked again and arrived again: an answer
 * read from its start lifted the list back up to it, from wherever the room had got to, and every
 * cell that lift brought near did the same, a reply at a time up the history (the simulator,
 * 20 October 2026, PH-22). So the rows whose cells have come in are kept, by the list's own key,
 * and a cell drawn again for one of them is drawn where it stands.
 */
function useCell(
  style: CellStyle | undefined,
  arrives: ((row: Row) => Arrival | undefined) | undefined,
  keyOf: ((row: Row, index: number) => string) | undefined,
) {
  const styleRef = useRef(style);
  styleRef.current = style;
  const arrivesRef = useRef(arrives);
  arrivesRef.current = arrives;
  const keyRef = useRef(keyOf);
  keyRef.current = keyOf;
  const came = useRef(new Set<string>()).current;
  return useMemo(
    () =>
      function RoomCell({ item, index, onLayout, style: placed, children }: CellProps) {
        const foot = isFoot(item);
        const key = keyRef.current?.(item, index) ?? String(index);
        return (
          <MovingCell
            foot={foot}
            arrives={foot || came.has(key) ? undefined : arrivesRef.current?.(item)}
            onArrived={() => came.add(key)}
            style={[placed, styleRef.current?.({ item, index })]}
            {...(onLayout === undefined ? {} : { onLayout })}
          >
            {children}
          </MovingCell>
        );
      },
    [came],
  );
}

/** Decorative only. The enclosing bubble clips the field to its own grouped corners. */
export function OutgoingColour() {
  const field = useContext(FieldContext);
  return field === undefined || field.still ? null : <Sample field={field} />;
}

/**
 * The field as it stood under a bubble whose top was at `pageY`, for that bubble's copy held up
 * over the room (ADR 0200): the copy keeps the colours the bubble had where it was, however far it
 * rises, since it is the same bubble picked up. Decorative only, like the sample it stands for.
 */
export function FrozenColour({ pageY }: { readonly pageY: number }) {
  const field = useContext(FieldContext);
  return field === undefined || field.still ? null : <Frozen field={field} pageY={pageY} />;
}

function Frozen({ field, pageY }: { readonly field: Field; readonly pageY: number }) {
  const { viewportTop, viewportHeight } = field;
  const placed = useAnimatedStyle(() => {
    const at = placeField(viewportTop.value, viewportHeight.value, pageY);
    return {
      transform: [{ translateY: at.translateY }, { scaleX: FIELD_STRETCH }, { scaleY: at.scaleY }],
    };
  });
  return (
    <Animated.View
      pointerEvents="none"
      style={styles.sample}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Animated.View style={[styles.field, placed]}>
        <FieldPicture />
      </Animated.View>
    </Animated.View>
  );
}

const UNPLACED: FieldPlacement = { translateY: 0, scaleY: 1 };

function Sample({ field }: { readonly field: Field }) {
  const ref = useAnimatedRef<View>();
  const laidOut = useSharedValue(0);
  const placement = useSharedValue<FieldPlacement>(UNPLACED);
  /** Nought until the first good measurement; one from then on, whatever a later frame says. */
  const shown = useSharedValue(0);
  const { scroll, layout, viewportTop, viewportHeight } = field;
  useAnimatedReaction(
    () => [scroll.value, layout.value, laidOut.value, viewportTop.value, viewportHeight.value],
    () => {
      // Nothing to measure before the sample's own first layout, or the viewport's.
      if (laidOut.value === 0 || viewportHeight.value <= 0) return;
      const bubble = measure(ref);
      if (bubble === null) return;
      if (!nearGlass(viewportTop.value, viewportHeight.value, bubble.pageY, bubble.height)) return;
      placement.value = placeField(viewportTop.value, viewportHeight.value, bubble.pageY);
      shown.value = 1;
    },
  );
  const gradient = useAnimatedStyle(() => ({
    opacity: shown.value,
    transform: [
      { translateY: placement.value.translateY },
      { scaleX: FIELD_STRETCH },
      { scaleY: placement.value.scaleY },
    ],
  }));
  return (
    <Animated.View
      ref={ref}
      collapsable={false}
      pointerEvents="none"
      style={styles.sample}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      onLayout={() => {
        laidOut.value += 1;
      }}
    >
      <Animated.View style={[styles.field, gradient]}>
        <FieldPicture />
      </Animated.View>
    </Animated.View>
  );
}

/**
 * The field's picture, `FIELD_HEIGHT` points tall and as wide as whatever holds it: a bubble's
 * sample, or a send's flight (`SendFlight.tsx`). Each holds it `FIELD_WIDTH`, one point, and
 * stretches it across itself by `FIELD_STRETCH` (`scrollField.ts`).
 *
 * It is drawn in a box one unit square, which the picture stretches to its own size each time it
 * draws. Sized in percent instead, react-native-svg works the rectangle out at its first draw and
 * keeps it: a bubble widened by turning the phone on its side was redrawn at the width it had
 * upright, and the rest of it showed its flat teal (18 October 2026).
 */
export function FieldPicture() {
  const id = `field-${useId().replace(/:/g, "")}`;
  return (
    <Svg width="100%" height={FIELD_HEIGHT} viewBox="0 0 1 1" preserveAspectRatio="none">
      <Defs>
        <LinearGradient id={id} x1="0" x2="0" y1="0" y2="1">
          {FIELD_STOPS.map(([offset, colour]) => (
            <Stop key={`${offset}-${colour}`} offset={offset} stopColor={colour} />
          ))}
        </LinearGradient>
      </Defs>
      <Rect width={1} height={1} fill={`url(#${id})`} />
    </Svg>
  );
}

/**
 * How far past the bubble's right and foot the sample runs. A bubble that gives its time up is
 * laid out at its new size at once and closes to it on the room's transition, and its children
 * are laid out at the new size with it: cut to that, the field left the closing part of the
 * bubble its flat ground. The bubble clips the rest.
 */
const OVER = 64;

const styles = StyleSheet.create({
  viewport: { flex: 1, minHeight: 0 },
  sample: { position: "absolute", top: 0, left: 0, right: -OVER, bottom: -OVER },
  // The picture's size is fixed here, in layout, once; the transform does the rest.
  field: { position: "absolute", top: 0, left: 0, width: FIELD_WIDTH, height: FIELD_HEIGHT },
});
