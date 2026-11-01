/**
 * Words that change in place by crossfading, not by being swapped in a frame: a screen's name as
 * the list starts picking and stops ("Spaces", "Select spaces", "2 selected"), and Select and Done
 * on the button beside it (ADR 0181; Arjun, 16 October 2026: "make everything highly polished").
 *
 * The words going stay where they stood and fade out over those coming, which fade in where the
 * layout puts them. What it is first drawn with is simply there, and nothing fades as the screen
 * goes. A change that keeps the same `swapKey` is not faded: the count in "2 selected" changes as
 * each row is picked, as a count does in Photos, and only the words around it crossfade.
 *
 * It imports Reanimated, which throws under Jest while it is still being imported; `jest.setup.js`
 * draws the words as they are.
 */

import type { ReactNode } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import Animated, {
  FadeIn,
  FadeInUp,
  FadeOut,
  FadeOutUp,
  LayoutAnimationConfig,
} from "react-native-reanimated";

const IN = FadeIn.duration(220);
const OUT = FadeOut.duration(140);
/** Rolled: the words coming rise into place, those going rise away (a workspace's name). */
const ROLL_IN = FadeInUp.duration(260).withInitialValues({
  opacity: 0,
  transform: [{ translateY: 14 }],
});
const ROLL_OUT = FadeOutUp.duration(160).withTargetValues({
  opacity: 0,
  transform: [{ translateY: -14 }],
});

export function Swap({
  swapKey,
  roll,
  style,
  children,
}: {
  /** What is faded across when it changes. */
  readonly swapKey: string;
  /**
   * The words roll rather than crossfade: Spaces' name as another workspace comes to the front
   * (ADR 0197's addendum), so the name reads as a new place rather than new words.
   */
  readonly roll?: boolean | undefined;
  readonly style?: StyleProp<ViewStyle>;
  readonly children: ReactNode;
}) {
  return (
    <LayoutAnimationConfig skipEntering skipExiting>
      <Animated.View
        key={swapKey}
        entering={roll ? ROLL_IN : IN}
        exiting={roll ? ROLL_OUT : OUT}
        style={style}
      >
        {children}
      </Animated.View>
    </LayoutAnimationConfig>
  );
}
