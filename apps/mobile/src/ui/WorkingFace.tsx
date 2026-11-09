/**
 * A room's face while there is work going in it (ADR 0285, replacing the light that ran round the
 * face in ADR 0090): it wears the pins an agent wears, and the light runs round them as it does
 * round an agent's. When work starts the face draws in a little and the pins come out from behind
 * it one after another, and when work ends they go back in the same way, so a row is never one
 * thing and then another. A row that is drawn already working is simply drawn with its pins out.
 *
 * The pins are plain views for the reason `AgentFace`'s are: a pin's light is an opacity and its
 * journey a translation, both of which the native driver carries on clocks of its own (`useTurns`,
 * `pinTravel.ts`). Nothing here asks the JavaScript thread for a frame, under a list that may be
 * scrolling. With Reduce Motion on the pins are out, dim and still.
 */

import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { Animated, Easing, Platform, StyleSheet, View } from "react-native";
import { AGENT_ROUND } from "./AgentFace";
import { useFacePaint } from "./faceTheme";
import { litGround, mixHex } from "./lit";
import { WORKING_PIN_STEP_MS, WORKING_PINS, workingPinsOf } from "./outline";
import { drawOf, PINS_IN_MS, PINS_OUT_MS, travelOf } from "./pinTravel";
import { usePalette } from "./theme";
import type { Turns } from "./turns";
import { useReduceMotion } from "./useReduceMotion";
import { useTurns } from "./useTurns";

const NATIVE = Platform.OS !== "web";

/** An agent's circuit, round twelve pins in the same time. */
export const WORKING_ROUND: Turns = {
  ...AGENT_ROUND,
  count: WORKING_PINS.count,
  stepMs: WORKING_PIN_STEP_MS,
};

/** The same circuit over metal pins, where the colour is only where the light is (ADR 0192). */
const ROUND_ON_METAL: Turns = { ...WORKING_ROUND, low: 0 };

function Pins({
  side,
  round,
  ground,
  clock,
  working,
}: {
  readonly side: number;
  readonly round: boolean;
  readonly ground: string;
  /** Where the pins are on their way out: nought under the face, one out. */
  readonly clock: Animated.Value;
  readonly working: boolean;
}) {
  const less = useReduceMotion();
  // Light stands the pins on metal and keeps the colour for the light; dark has no metal.
  const metal = usePalette().pinMetal;
  const onMetal = metal !== "transparent";
  // Always the light's node, stopped or running: a pin handed a plain number in its place keeps
  // the last value the native driver gave it (`ChipPulse`).
  const lights = useTurns(onMetal ? ROUND_ON_METAL : WORKING_ROUND, working && !less);
  const lit = litGround(useFacePaint().ground(ground));
  const pins = useMemo(() => workingPinsOf(side, round), [side, round]);
  const travels = useMemo(
    () => pins.map((pin, index) => clock.interpolate(travelOf(index, pins.length, pin.h))),
    [clock, pins],
  );
  return (
    <View pointerEvents="none" testID="working-pins" style={StyleSheet.absoluteFill}>
      {pins.map((pin, index) => {
        // Each pin takes the ground's light where it stands: the top of the gradient or its foot.
        const down = Math.min(1, Math.max(0, pin.cy / side));
        const corner = pin.w / 2;
        return (
          <Animated.View
            key={pin.key}
            style={{
              position: "absolute",
              left: pin.cx - pin.w / 2,
              top: pin.cy - pin.h / 2,
              width: pin.w,
              height: pin.h,
              borderRadius: corner,
              ...(onMetal ? { backgroundColor: metal } : null),
              transform: [{ rotate: `${pin.turn}deg` }, { translateY: travels[index] ?? 0 }],
            }}
          >
            <Animated.View
              style={[
                StyleSheet.absoluteFill,
                {
                  borderRadius: corner,
                  backgroundColor: mixHex(lit.top, lit.foot, down),
                  opacity: lights[index] ?? 0,
                },
              ]}
            />
          </Animated.View>
        );
      })}
    </View>
  );
}

export function WorkingFace({
  side,
  round,
  ground,
  working,
  children,
}: {
  /** The side of the face it stands round. */
  readonly side: number;
  /** A circle, whose pins stand all the way round it; otherwise three to a side. */
  readonly round: boolean;
  /** The colour the face stands on, which its pins take as an agent's do. */
  readonly ground: string;
  /** There is work going in the room this face stands for. */
  readonly working: boolean;
  /** The face itself, which must be opaque: the pins are drawn behind it and slide out from it. */
  readonly children: ReactNode;
}) {
  const less = useReduceMotion();
  const clock = useRef(new Animated.Value(working ? 1 : 0)).current;
  // Worn from the moment work starts until the pins are back in, which is after it has ended.
  const [worn, setWorn] = useState(working);
  if (working && !worn) setWorn(true);
  const was = useRef(working);
  useEffect(() => {
    if (was.current === working) return;
    was.current = working;
    const toValue = working ? 1 : 0;
    if (less) {
      clock.setValue(toValue);
      if (!working) setWorn(false);
      return;
    }
    // A new timing stops the one it replaces, whose callback then says it did not finish.
    Animated.timing(clock, {
      toValue,
      duration: working ? PINS_OUT_MS : PINS_IN_MS,
      easing: Easing.linear,
      useNativeDriver: NATIVE,
    }).start(({ finished }) => {
      if (finished && !working) setWorn(false);
    });
  }, [clock, less, working]);
  useEffect(() => () => clock.stopAnimation(), [clock]);
  const scale = useMemo(() => clock.interpolate(drawOf(WORKING_PINS.drawn)), [clock]);
  return (
    <Animated.View style={{ width: side, height: side, transform: [{ scale }] }}>
      {worn ? (
        <Pins side={side} round={round} ground={ground} clock={clock} working={working} />
      ) : null}
      {children}
    </Animated.View>
  );
}
