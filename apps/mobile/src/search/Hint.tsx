/**
 * Search's hint (ADR 0137), with nothing typed and nothing searched for yet: "Find" and a word
 * that rolls over from spaces to agents to anything said, with a little spring each time, and the
 * sentence small under it. The words and their pace are core's (`SEARCH_HINT`); how the column
 * moves is `roll.ts`; this draws it.
 *
 * - **Read as the sentence.** VoiceOver skips the rolling line and reads the sentence under it.
 * - **Rolling only while it can be seen.** One clock, looped on the native side as the backdrop's
 *   is, so nothing crosses to JavaScript while it runs. It stops while the tab is behind a room or
 *   another tab and while the app is in the background, and starts again from spaces. With Reduce
 *   Motion it never starts: Find spaces, still.
 * - **Bigger text, a bigger window.** The line grows with the reader's text size up to half as
 *   big again, and the window it rolls behind with it.
 */

import { HINT_ROUND_MS, SEARCH_HINT } from "@chipschat/core";
import { useIsFocused } from "expo-router";
import { useEffect, useMemo, useRef } from "react";
import {
  Animated,
  Easing,
  Platform,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { usePalette } from "../ui/theme";
import { SPACE, TEXT } from "../ui/tokens";
import { useActive } from "../ui/useActive";
import { useReduceMotion } from "../ui/useReduceMotion";
import { roll } from "./roll";

const NATIVE = Platform.OS !== "web";

/** The bigger line, as the mock he picked set it: 24 on 30. */
const SIZE = 24;
const LINE = 30;
/** How far it grows with the reader's text size. */
const MAX_SCALE = 1.5;

const SPRING = Easing.bezier(...SEARCH_HINT.spring);

/** The column: every word, then the first again, which the round ends on. */
const COLUMN = [...SEARCH_HINT.words, SEARCH_HINT.words[0]];

export function Hint() {
  const palette = usePalette();
  const focused = useIsFocused();
  const active = useActive();
  const less = useReduceMotion();
  const { fontScale } = useWindowDimensions();
  const line = Math.round(LINE * Math.min(fontScale, MAX_SCALE));
  const clock = useRound(focused && active && !less);
  const y = useMemo(() => clock.interpolate(roll(line, SPRING)), [clock, line]);
  return (
    <View style={styles.hint}>
      <View
        style={styles.line}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <Text style={[styles.big, { color: palette.ink3 }]} maxFontSizeMultiplier={MAX_SCALE}>
          {SEARCH_HINT.lead}
        </Text>
        <View style={[styles.window, { height: line }]}>
          <Animated.View style={{ transform: [{ translateY: y }] }}>
            {COLUMN.map((word, at) => (
              <Text
                key={at === SEARCH_HINT.words.length ? "again" : word}
                style={[styles.big, { color: palette.ink }]}
                maxFontSizeMultiplier={MAX_SCALE}
                numberOfLines={1}
              >
                {word}
              </Text>
            ))}
          </Animated.View>
        </View>
      </View>
      <Text style={[styles.sentence, { color: palette.ink3 }]}>{SEARCH_HINT.sentence}</Text>
    </View>
  );
}

/**
 * The round's clock, from nought to one and round again on the native side, only while
 * `running`. Stopped, it goes back to the start, so the hint is on its first word when next seen.
 */
function useRound(running: boolean): Animated.Value {
  const clock = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    clock.setValue(0);
    if (!running) return;
    // A single timing, so `loop` hands the whole thing to the native driver.
    const round = Animated.loop(
      Animated.timing(clock, {
        toValue: 1,
        duration: HINT_ROUND_MS,
        easing: Easing.linear,
        useNativeDriver: NATIVE,
      }),
    );
    round.start();
    return () => round.stop();
  }, [clock, running]);
  return clock;
}

const styles = StyleSheet.create({
  hint: { paddingHorizontal: SPACE.lg, paddingVertical: SPACE.lg, gap: SPACE.xs },
  line: { flexDirection: "row", gap: 7 },
  big: { fontSize: SIZE, lineHeight: LINE, fontWeight: "700", letterSpacing: -0.3 },
  window: { overflow: "hidden" },
  sentence: { fontSize: TEXT.md },
});
