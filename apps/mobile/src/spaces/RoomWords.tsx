/**
 * The words of a room's lines going while the lines take a new width, and coming back (ADR 0279):
 * each bubble's name, words and time fade out in `WORDS_OUT` before anything moves, the panes beside
 * the room included, while the bubbles stay; and fade back in `WORDS_IN` once the panes and the rows
 * and bubbles have landed (`heldWidth.ts`). A frost over the room did this before, and Arjun, on his
 * iPad, 6 November 2026: "get rid of the blur. when we tap: hide text (not bubbles), resize, show
 * text".
 *
 * One value for the room, how much of its words are drawn, which each bubble's words take as their
 * opacity (`Ink`), and the words round it too, only where a room's width changes this way: beside an
 * iPad's panes, and moving (`Field.moves`). What is not words beside a bubble, its face and its
 * pictures, glides with it there (`Gliding`). Elsewhere a bubble's words are drawn as they always
 * were, with nothing round them.
 *
 * It keeps the steady clock (`withSteadyTiming`), and waits there before the words go
 * (`WORDS_WAIT`). It says when they have gone and when they are back (`gone`, `back`), so nothing
 * moves before they have gone, and they are never left half there.
 *
 * Kept apart because Reanimated cannot be loaded under Jest here: `jest.setup.js` stands it in with
 * a view that is there while the words are going or coming back, and says they have gone and are
 * back on its timings.
 */

import { createContext, type ReactNode, useContext, useEffect } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import Animated, {
  Easing,
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { withSteadyTiming } from "../ui/steadySpring";
import { type HeldWidth, WORDS_IN, WORDS_OUT, WORDS_WAIT } from "./heldWidth";
import { Moving } from "./RoomMotion";

/** Material's standard curve, as the frost's fade was. */
const SOFT = Easing.bezierFn(0.4, 0, 0.2, 1);

/** How much of the room's words are drawn, where they go as its width changes; none elsewhere. */
const RoomInk = createContext<SharedValue<number> | undefined>(undefined);

/** The room's words, for its lines inside: going, gone and back as `words` says. */
export function RoomWords({
  on,
  words,
  change,
  gone,
  back,
  children,
}: Pick<HeldWidth, "words" | "change" | "gone" | "back"> & {
  /** Whether the room's width changes this way: beside an iPad's panes, and moving. */
  readonly on: boolean;
  readonly children: ReactNode;
}) {
  const ink = useSharedValue(1);
  // Told again for each change: a width that changes once the words have gone finds them "going"
  // still, and with nothing to say they had gone for it the lines waited for ever.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `change` is what says it again.
  useEffect(() => {
    if (words === undefined) {
      ink.value = 1;
      return;
    }
    const going = words === "going";
    const said = going ? gone : back;
    ink.value = withSteadyTiming(
      going ? 0 : 1,
      going ? { ms: WORDS_OUT, ease: SOFT, wait: WORDS_WAIT } : { ms: WORDS_IN, ease: SOFT },
      (finished) => {
        "worklet";
        if (finished === true) scheduleOnRN(said);
      },
    );
  }, [words, change, gone, back, ink]);
  return <RoomInk.Provider value={on ? ink : undefined}>{children}</RoomInk.Provider>;
}

/**
 * A bubble's words — its name, what it says, its time — drawn as much as the room's words are,
 * inside the bubble, which stays. Laid out as the bubble's own column: nothing about where they
 * stand changes. And the words round a bubble, over it and under it, which the new width puts
 * where the bubble is going at once: "1 file changed" stood under where a long reply was going
 * while the reply glided there (Arjun's iPad, 6 November 2026).
 */
export function Ink({ children }: { readonly children: ReactNode }) {
  const ink = useContext(RoomInk);
  return ink === undefined ? children : <Inked ink={ink}>{children}</Inked>;
}

/**
 * Something beside a bubble that is not words — the face at a reply's foot, the pictures hanging
 * under it — which the bubble's change of shape moves: it glides there with the bubble on the
 * room's move (`Moving`), where the room's words go, and is simply drawn elsewhere. Without a move
 * of its own it is drawn where the bubble is going at once, as the words round it were.
 */
export function Gliding({
  style,
  children,
}: {
  /** Where it stands beside the bubble, as its own box: a picture of yours, at the right. */
  readonly style?: StyleProp<ViewStyle>;
  readonly children: ReactNode;
}) {
  const ink = useContext(RoomInk);
  return ink === undefined ? children : <Moving style={style}>{children}</Moving>;
}

function Inked({
  ink,
  children,
}: {
  readonly ink: SharedValue<number>;
  readonly children: ReactNode;
}) {
  const drawn = useAnimatedStyle(() => ({ opacity: ink.value }));
  return <Animated.View style={drawn}>{children}</Animated.View>;
}
