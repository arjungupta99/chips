/**
 * "Back to your reply" (ADR 0219): after a reply's card took the room up to the message it quotes,
 * a capsule just above the composer takes it back down to the reply — "the reply" when it is
 * someone else's. It goes once pressed, once the reply is in view again, or on a send
 * (`useBackToReply`, in `SpaceView.tsx`).
 *
 * It is the room's glass, as the composer and Undo are (`ui/Glass.tsx`), so it comes and goes on a
 * spring of its scale and its height and never on its opacity: UIKit does not draw glass under a
 * view that fades (28 September 2026).
 */

import { backToReplyWords } from "@chipschat/core";
import { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { Capsule } from "../ui/Glass";
import { Icon } from "../ui/Icon";
import { IOS_SPRING } from "../ui/motion";
import { usePalette } from "../ui/theme";
import { SPACE, TEXT } from "../ui/tokens";

/** Where it comes from and goes to: a little low and a little small. */
const AWAY = { y: 14, scale: 0.9 } as const;

export function BackPill({
  back,
  bottom,
  onPress,
}: {
  /** The reply it goes back to, while there is one. */
  readonly back: { readonly mine: boolean } | undefined;
  /** How far over the screen's foot it stands: the composer's height and a little. */
  readonly bottom: number;
  readonly onPress: () => void;
}) {
  const palette = usePalette();
  const shown = back !== undefined;
  // What it said, kept while it leaves.
  const kept = useRef(back);
  if (back !== undefined) kept.current = back;
  const words = backToReplyWords(kept.current?.mine ?? true);
  // Drawn while it leaves, after it was let go.
  const [drawn, setDrawn] = useState(shown);
  const away = useSharedValue(1);
  useEffect(() => {
    if (shown) {
      setDrawn(true);
      away.value = withSpring(0, IOS_SPRING);
      return;
    }
    away.value = withTiming(1, { duration: 180, easing: Easing.in(Easing.quad) }, (finished) => {
      if (finished) scheduleOnRN(setDrawn, false);
    });
  }, [shown, away]);
  const moved = useAnimatedStyle(() => ({
    transform: [{ translateY: away.value * AWAY.y }, { scale: 1 - away.value * (1 - AWAY.scale) }],
  }));
  if (!drawn) return null;
  return (
    <Animated.View pointerEvents="box-none" style={[styles.place, { bottom }, moved]}>
      <Capsule style={styles.capsule} testID="back-pill">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={words}
          hitSlop={6}
          onPress={onPress}
          disabled={!shown}
          testID="back-pill-press"
          style={styles.row}
        >
          <View style={styles.arrow}>
            <Icon name="up" size={16} color={palette.blue} weight={2.2} />
          </View>
          <Text style={[styles.words, { color: palette.ink }]}>{words}</Text>
        </Pressable>
      </Capsule>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  place: { position: "absolute", left: 0, right: 0, alignItems: "center" },
  capsule: { borderRadius: 999 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    minHeight: 40,
    paddingLeft: SPACE.md,
    paddingRight: SPACE.lg,
  },
  // Down, to the reply: the arrow up, turned.
  arrow: { transform: [{ rotate: "180deg" }] },
  words: { fontSize: TEXT.md, fontWeight: "600" },
});
