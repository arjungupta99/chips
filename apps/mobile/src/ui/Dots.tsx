/**
 * Three dots breathing in turn: the sign every messenger uses for somebody at the other end,
 * working. It is the one thing in a room that moves on its own.
 *
 * Drawn with `Animated` on the native driver, which is what the sheet uses and for the same
 * reason (Reanimated cannot be loaded under Jest here), and stopped the moment it goes. With
 * Reduce Motion on they are still: the same three dots, unmoving, saying the same thing. The three
 * take their turns on one clock looped natively (`useTurns`), not a loop of timings restarted from
 * JS, which hung the dots whenever the room's JS thread was busy (24 September 2026).
 *
 * The chain row that handed a lane on wants it (`spaces/LaneChain.tsx`), where it took the place
 * of the word *Working* on 12 September 2026 (Arjun), a row whose dots are breathing having no
 * need to be told what it is doing. The thinking bubble wore them until 20 September 2026, then
 * the mark working (`ui/ChipPulse.tsx`), and wears them again since 6 October 2026, `lit` (ADR
 * 0126): the light runs across them as it runs round a chip's pins, each lit quickly and let go
 * slowly, a little larger while it is lit, in the colour of the face beside it. The mark with its
 * pins running beside a face whose pins ran too was two signs for one agent at work (Arjun).
 *
 * As tall as a line of body text, so it sits on the line beside words rather than above them.
 *
 * At rest, they stand unlit and unmoving: the far side has not been heard from for now, so what
 * stands beside them is what was known, and nothing says it is still happening (a thinking bubble
 * over a phone back from the background, 14 October 2026).
 */

import { Animated, Easing, StyleSheet, View } from "react-native";
import { LEADING_PHONE, TEXT } from "./tokens";
import type { Turns } from "./turns";
import { useReduceMotion } from "./useReduceMotion";
import { useTurns } from "./useTurns";

/** One breath of a dot, in or out; the next dot starts half a breath behind. */
const BREATH_MS = 320;
const REST = 0.3;
const DOTS = ["first", "second", "third"] as const;
const BREATHS: Turns = {
  count: DOTS.length,
  stepMs: BREATH_MS / 2,
  riseMs: BREATH_MS,
  fallMs: BREATH_MS,
  low: REST,
  high: 1,
  rise: Easing.inOut(Easing.quad),
  fall: Easing.inOut(Easing.quad),
};
/** What a lit dot is worth when the light is elsewhere, and how much larger it is when lit. */
const LIT_REST = 0.28;
const LIT_GROW = 1.3;
/** The light running across, as it runs round a chip's pins (`ChipPulse`): lit fast, let go slow. */
const LIGHT: Turns = {
  count: DOTS.length,
  stepMs: 160,
  riseMs: 130,
  fallMs: 260,
  low: LIT_REST,
  high: 1,
  rise: Easing.out(Easing.quad),
  fall: Easing.in(Easing.quad),
};

export function Dots({
  colour,
  lit = false,
  line = Math.round(TEXT.body * LEADING_PHONE),
  resting = false,
  testID,
}: {
  readonly colour: string;
  /** The light running across them, a dot growing as it lights, rather than a breath. */
  readonly lit?: boolean;
  /** The height of the line of words they stand on, so they sit in its middle. */
  readonly line?: number;
  /** Unlit and still, until the far side is heard from again. */
  readonly resting?: boolean;
  readonly testID?: string;
}) {
  const reduced = useReduceMotion();
  const still = reduced || resting;
  const beats = useTurns(lit ? LIGHT : BREATHS, !still);
  const rest = lit ? LIT_REST : REST;
  return (
    <View
      style={[styles.dots, { height: line }]}
      testID={testID}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {DOTS.map((dot, index) => {
        const beat = beats[index];
        const grow =
          lit && !still && beat !== undefined
            ? [
                {
                  scale: beat.interpolate({
                    inputRange: [LIT_REST, 1],
                    outputRange: [1, LIT_GROW],
                  }),
                },
              ]
            : undefined;
        return (
          <Animated.View
            key={dot}
            style={[
              styles.dot,
              {
                backgroundColor: colour,
                opacity: resting ? rest : reduced ? 1 : beat,
                transform: grow,
              },
            ]}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  dots: { flexDirection: "row", alignItems: "center", gap: 4 },
  dot: { width: 6, height: 6, borderRadius: 3 },
});
