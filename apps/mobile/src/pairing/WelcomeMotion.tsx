/**
 * What moves on the first screen besides the film (ADR 0217's addendum of 26 October): Chips on
 * this Wi-Fi sliding up from the foot when it is found (ADR 0172).
 *
 * It imports Reanimated, which throws under Jest while it is still being imported; `jest.setup.js`
 * draws it as what it holds.
 */

import type { ReactNode } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";

/** Up from the foot as it comes: Chips found on this Wi-Fi. */
export function SlideUp({
  still,
  style,
  children,
}: {
  readonly still: boolean;
  readonly style?: StyleProp<ViewStyle>;
  readonly children: ReactNode;
}) {
  return (
    <Animated.View {...(still ? {} : { entering: FadeInDown.duration(420) })} style={style}>
      {children}
    </Animated.View>
  );
}
