/**
 * The mark, working: the chip with its pins lighting one after another round the circuit. It is
 * the sign that something is going on at the other end, in the one shape this app already owns —
 * "rounded square, pins on the sides, one bite out of the corner ... the bite is the joke; the pins
 * are the point" (blueprint, Brand), and the same mark the web wears
 * (`packages/ui/src/components/mark/mark.tsx`) and the home screen wears (`assets/icon.svg`).
 *
 * Drawn from the outline itself (`outline.ts`, ADR 0096): the bitten body is one still path, and
 * the ten pins are plain views behind it. The body is lit from above as an agent's face is, a
 * little lighter at the top and deeper at the foot, at the mark's strength (`MARK_LIGHT`). Each pin is drawn twice — ink underneath, gold on top
 * with an animated opacity — so the light that runs round the circuit is an opacity and nothing
 * else, which is what the native driver can carry. A colour cannot be interpolated off the main
 * thread, and this thing is breathing under a scrolling list. The pins take their turns on one
 * clock looped natively (`useTurns`): a loop of timings is restarted from JS after every pin, and
 * stuttered whenever the room's JS thread was busy (24 September 2026).
 *
 * As tall as a line of body text, so it sits beside words rather than above them, and it keeps
 * to the first line of a paragraph rather than the middle of three. Larger where it is looked at
 * rather than read beside (`size`): drawn at that size, not scaled up from twenty points, because
 * iOS stretches the picture the body was drawn into and a stretched picture goes soft and stepped
 * at the edges (the connection's sheet, 30 October 2026: "the chips icon over there also looks
 * pixelated").
 *
 * With Reduce Motion on, every pin rests as the mark's do, a little dim (`PIN_REST.mark`): the
 * same mark, unmoving, saying the same thing (`Dots` does likewise, and the chain row still wears those). `working={false}` is the
 * other stillness and the opposite one — the work is over, so no pin is lit at all — which is
 * what a finished turn's receipt wears, in grey rather than gold (`TaskBubble.tsx`).
 */

import { useId, useLayoutEffect, useMemo, useRef } from "react";
import { Animated, Easing, StyleSheet, View } from "react-native";
import { Defs, LinearGradient, Path, Stop, Svg } from "react-native-svg";
import { litGround, MARK_LIGHT } from "./lit";
import { BODY_WITH_PINS, bittenPath, PIN_REST, PIN_STEP_MS, pinsOf } from "./outline";
import { LEADING_PHONE, TEXT } from "./tokens";
import type { Turns } from "./turns";
import { useReduceMotion } from "./useReduceMotion";
import { useTurns } from "./useTurns";

/** How long one pin takes to light, and to go out again. */
const LIT_MS = 130;
const DIM_MS = 260;
/** What a pin is worth when it is not the one lit. */
const REST = 0.5;

/**
 * The square the mark stands in: the blueprint's twenty-four scaled to sit beside seventeen-point
 * words. The pins stand inside it, as an agent's do, so the body is a little smaller than the box.
 */
const BOX = 20;

/** The mark drawn in a square of `box`: where its body starts, the body, and the pins. */
function drawingOf(box: number) {
  const side = box * BODY_WITH_PINS;
  const at = (box - side) / 2;
  return {
    box,
    side,
    at,
    body: bittenPath(at, at, side),
    /** The pins, in the order the light goes round: clockwise from the top. */
    pins: pinsOf(side).map((pin) => ({ ...pin, x: pin.x + at, y: pin.y + at })),
  };
}

const BESIDE_WORDS = drawingOf(BOX);

/**
 * One turn of the circuit: each pin lit quickly and let go slowly, a step behind the last. The
 * connection's board times its sparks by it (`Circuit.tsx`), so they leave as the pins light.
 */
export const ROUND: Turns = {
  count: BESIDE_WORDS.pins.length,
  stepMs: PIN_STEP_MS,
  riseMs: LIT_MS,
  fallMs: DIM_MS,
  low: 0,
  high: 1,
  rise: Easing.out(Easing.quad),
  fall: Easing.in(Easing.quad),
  ring: true,
};

export function ChipPulse({
  gold,
  ink,
  lit,
  working = true,
  allLit = false,
  size = BOX,
  testID,
}: {
  /** The body, lit from above. */
  readonly gold: string;
  /** A pin at rest. */
  readonly ink: string;
  /**
   * A pin with the light on it — paper, not gold. A gold pin against a gold body is the blob
   * the app icon already learned about: the pins are the point, and they have to be seen.
   */
  readonly lit: string;
  /** Whether there is still work going on. A mark that is not working is at rest, and unlit. */
  readonly working?: boolean;
  /**
   * Every pin lit at once and held: the connection come back after it had failed, for the beat
   * before the mark goes (`Connection.tsx`). Over `working`.
   */
  readonly allLit?: boolean;
  /** The square it is drawn in. Twenty points, beside a line of words, unless it is larger. */
  readonly size?: number;
  readonly testID?: string;
}) {
  const drawing = useMemo(() => (size === BOX ? BESIDE_WORDS : drawingOf(size)), [size]);
  const less = useReduceMotion();
  const running = working && !less && !allLit;
  const lights = useTurns(ROUND, running);
  // One id per drawing: the web target renders real SVG, where ids are the document's.
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const body = litGround(gold, MARK_LIGHT);
  // Still, every pin rests as the mark's do for Reduce Motion, and none is lit for work that is over.
  const still = working ? PIN_REST.mark : 0;
  // Each pin's light is always the same sum: the circuit's light while it runs, or where it rests.
  // A pin handed a plain number in place of the light the native driver was moving kept the last
  // value it had been given on iOS, so a mark turned green with every pin lit showed only the one
  // the circuit had stopped on (31 October 2026). Set, these are never handed over.
  const on = useHeld(running ? 1 : 0);
  const rest = useHeld(running ? 0 : allLit ? 1 : still);
  const shown = useMemo(
    () => lights.map((light) => Animated.add(Animated.multiply(light, on), rest)),
    [lights, on, rest],
  );
  return (
    <View
      style={size === BOX ? styles.mark : { width: size, height: size }}
      testID={testID}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <View style={{ width: size, height: size }}>
        {drawing.pins.map((pin, index) => {
          const light = shown[index];
          const place = { left: pin.x, top: pin.y, width: pin.w, height: pin.h };
          const rod = { borderRadius: Math.min(pin.w, pin.h) / 2 };
          return (
            <View key={pin.key} style={[styles.pin, place]}>
              <View style={[StyleSheet.absoluteFill, rod, styles.rest, { backgroundColor: ink }]} />
              <Animated.View
                style={[
                  StyleSheet.absoluteFill,
                  rod,
                  { backgroundColor: lit, opacity: light ?? 0 },
                ]}
              />
            </View>
          );
        })}
        {/* The body over the pins' ends, so each one tucks under it with no seam. */}
        <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
          <Defs>
            <LinearGradient
              id={`${id}lit`}
              x1={0}
              y1={drawing.at}
              x2={0}
              y2={drawing.at + drawing.side}
              gradientUnits="userSpaceOnUse"
            >
              <Stop offset={0} stopColor={body.top} />
              <Stop offset={1} stopColor={body.foot} />
            </LinearGradient>
          </Defs>
          <Path d={drawing.body} fill={`url(#${id}lit)`} />
        </Svg>
      </View>
    </View>
  );
}

/** A value the native driver holds and is told, rather than moves: a pin's light at rest. */
function useHeld(value: number): Animated.Value {
  const held = useRef(new Animated.Value(value)).current;
  useLayoutEffect(() => {
    held.setValue(value);
  }, [held, value]);
  return held;
}

const styles = StyleSheet.create({
  // A box as tall as the line it sits on, with the mark's square centred in it.
  mark: {
    width: BOX,
    height: Math.round(TEXT.body * LEADING_PHONE),
    alignItems: "center",
    justifyContent: "center",
  },
  pin: { position: "absolute" },
  // What a pin is worth unlit; the gold above it carries the light the whole way to full.
  rest: { opacity: REST },
});
