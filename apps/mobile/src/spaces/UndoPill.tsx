/**
 * Undo, for a message just deleted for oneself (ADR 0165): a capsule over the room, just above the
 * composer, saying what happened, with a ring counting the seconds left and Undo beside it.
 *
 * It is the room's glass, as the composer is (`ui/Glass.tsx`), so it comes and goes on a spring of
 * its scale and its height and never on its opacity: UIKit does not draw glass under a view that
 * fades (28 September 2026). A second deletion while it is up starts it again for that one; the
 * first is deleted already, and its own Undo is over.
 */

import { DELETED_FOR_YOU, UNDO_MS } from "@chipschat/core";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { Circle, Svg } from "react-native-svg";
import { scheduleOnRN } from "react-native-worklets";
import { Capsule } from "../ui/Glass";
import { IOS_SPRING } from "../ui/motion";
import { usePalette } from "../ui/theme";
import { SPACE, TEXT } from "../ui/tokens";

const RING = 22;
const STROKE = 2.2;
const ROUND = 2 * Math.PI * ((RING - STROKE) / 2);
/** Where it comes from and goes to: a little low and a little small. */
const AWAY = { y: 18, scale: 0.86 } as const;

const Ring = Animated.createAnimatedComponent(Circle);

/** The deletion Undo is for, and when it was made, so a second one starts the count again. */
export interface Undoing {
  readonly lineId: string;
  readonly at: number;
}

export function UndoPill({
  undoing,
  bottom,
  onUndo,
  onGone,
  words = DELETED_FOR_YOU,
  hint = "Puts the message back on your screens",
}: {
  readonly undoing: Undoing | undefined;
  /** What happened, beside the ring: `Deleted for you`, or a rule's `Removed` (ADR 0195). */
  readonly words?: string;
  /** What Undo does, to a screen reader. */
  readonly hint?: string;
  /** How far over the screen's foot it stands: the composer's height and a little. */
  readonly bottom: number;
  readonly onUndo: (lineId: string) => void;
  /** It has gone, by Undo or by the count running out. */
  readonly onGone: () => void;
}) {
  const palette = usePalette();
  // What it says stays while it leaves, after the deletion it was for is over.
  const [shown, setShown] = useState<Undoing | undefined>(undoing);
  const [seconds, setSeconds] = useState(UNDO_MS / 1000);
  const away = useSharedValue(1);
  const left = useSharedValue(0);
  useEffect(() => {
    if (undoing === undefined) {
      away.value = withTiming(1, { duration: 180, easing: Easing.in(Easing.quad) }, (finished) => {
        if (finished) scheduleOnRN(setShown, undefined);
      });
      return;
    }
    setShown(undoing);
    setSeconds(UNDO_MS / 1000);
    away.value = withSpring(0, IOS_SPRING);
    left.value = 0;
    left.value = withTiming(1, { duration: UNDO_MS, easing: Easing.linear });
    const ticks = Array.from({ length: UNDO_MS / 1000 - 1 }, (_, at) =>
      setTimeout(() => setSeconds(UNDO_MS / 1000 - at - 1), (at + 1) * 1000),
    );
    const over = setTimeout(onGone, UNDO_MS);
    return () => {
      for (const tick of ticks) clearTimeout(tick);
      clearTimeout(over);
    };
  }, [undoing, onGone, away, left]);
  const moved = useAnimatedStyle(() => ({
    transform: [{ translateY: away.value * AWAY.y }, { scale: 1 - away.value * (1 - AWAY.scale) }],
  }));
  const ring = useAnimatedProps(() => ({ strokeDashoffset: left.value * ROUND }));
  if (shown === undefined) return null;
  return (
    <Animated.View pointerEvents="box-none" style={[styles.place, { bottom }, moved]}>
      <Capsule style={styles.capsule} testID="undo-pill">
        <View style={styles.row}>
          <View style={styles.ring} accessibilityElementsHidden>
            <Svg width={RING} height={RING}>
              <Circle
                cx={RING / 2}
                cy={RING / 2}
                r={(RING - STROKE) / 2}
                stroke={palette.line2}
                strokeWidth={STROKE}
                fill="none"
              />
              <Ring
                cx={RING / 2}
                cy={RING / 2}
                r={(RING - STROKE) / 2}
                stroke={palette.goldDeep}
                strokeWidth={STROKE}
                strokeLinecap="round"
                strokeDasharray={ROUND}
                fill="none"
                rotation={-90}
                origin={`${RING / 2}, ${RING / 2}`}
                animatedProps={ring}
              />
            </Svg>
            <Text style={[styles.count, { color: palette.ink }]}>{seconds}</Text>
          </View>
          <Text style={[styles.words, { color: palette.ink }]}>{words}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Undo"
            accessibilityHint={hint}
            hitSlop={8}
            testID="undo-pill-undo"
            onPress={() => onUndo(shown.lineId)}
            style={({ pressed }) => [
              styles.undo,
              pressed ? { backgroundColor: palette.surface3 } : null,
            ]}
          >
            <Text style={[styles.undoWords, { color: palette.goldDeep }]}>Undo</Text>
          </Pressable>
        </View>
      </Capsule>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  place: { position: "absolute", left: 0, right: 0, alignItems: "center" },
  capsule: { borderRadius: 999, paddingLeft: SPACE.sm, paddingRight: SPACE.xs },
  row: { flexDirection: "row", alignItems: "center", gap: SPACE.sm, minHeight: 40 },
  ring: { width: RING, height: RING, alignItems: "center", justifyContent: "center" },
  count: {
    position: "absolute",
    fontSize: 11,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
  words: { fontSize: TEXT.md, fontWeight: "600" },
  undo: { paddingHorizontal: SPACE.md, paddingVertical: SPACE.sm, borderRadius: 999 },
  undoWords: { fontSize: TEXT.md, fontWeight: "700" },
});
