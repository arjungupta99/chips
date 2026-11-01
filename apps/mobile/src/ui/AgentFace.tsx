/**
 * An agent's face (ADR 0089): the Chips mark itself, a rounded square with a bite out of its top
 * right corner and its ten pins (ADR 0096, ADR 0102), wearing the mark a person chose for it on
 * its lit ground, or its initials.
 *
 * The bite and the pins are what say *agent*, where a circle says a person, a squircle a harness
 * and a plain rounded square a space. The bite also holds the agent's state, so nothing has to be
 * drawn over the face: an amber dot in the bite when it can't answer (ADR 0083).
 *
 * The pins are always out (1 October 2026: the body alone read as a space's face), and rest dim
 * (ADR 0103): in dark, the face's colour at a fraction; in light, on metal, a neutral grey with
 * none of the colour, because the same fraction over paper read as a faded pastel print of the
 * face (ADR 0192). While it works a light runs round them, the same circuit the working mark runs
 * (`ChipPulse`) — except beside its own thinking bubble or queued turn, whose dots are the one
 * sign of the work there (ADR 0126). A face under thirty-two points has no room for pins inside its box,
 * and says it is working with a green dot in the bite, unless it wears them round its body, as the
 * face beside a line in a room does (`pinsOut`), or is told to keep them, as Search's backdrop does
 * (`pinsAlways`, ADR 0138).
 *
 * `side` is the whole face, pins and all: where it wears them the body stands back from the edges
 * by as far as they stand out, so an agent down the Agents tab is the size a room is on Spaces.
 * Worn round the body, the pins stand out past `side` instead, into the room the line leaves.
 *
 * The pins are plain views rather than SVG, for the reason `ChipPulse`'s are: their light is an
 * opacity, which the native driver carries, on one native clock (`useTurns`). Nothing here asks
 * the JavaScript thread for a frame.
 */

import { lettersScale } from "@chipschat/protocol";
import { useEffect, useRef } from "react";
import { Animated, Easing, Platform, StyleSheet, Text, View } from "react-native";
import { useFacePaint } from "./faceTheme";
import { litGround, mixHex } from "./lit";
import { MarkFace } from "./MarkFace";
import type { MarkName } from "./marks";
import {
  AGENT_MARK,
  BITE_DOT,
  BODY_WITH_PINS,
  PIN_REST,
  PIN_STEP_MS,
  PINS,
  PINS_FROM,
  pinsOf,
} from "./outline";
import { usePalette } from "./theme";
import type { Turns } from "./turns";
import { useReduceMotion } from "./useReduceMotion";
import { useTurns } from "./useTurns";

const NATIVE = Platform.OS !== "web";

/** One turn of the circuit, as the working mark runs it: lit quickly, let go slowly, back to dim. */
const ROUND: Turns = {
  count: PINS.at.length,
  stepMs: PIN_STEP_MS,
  riseMs: 130,
  fallMs: 260,
  low: PIN_REST.inside,
  high: 1,
  rise: Easing.out(Easing.quad),
  fall: Easing.in(Easing.quad),
};

/** The same circuit over metal pins, where the colour is only where the light is (ADR 0192). */
const ROUND_ON_METAL: Turns = { ...ROUND, low: 0 };

/** The pins, behind the body, dim and still, with a light running round them while it works. */
function Pins({
  side,
  ground,
  running,
  rest,
}: {
  readonly side: number;
  readonly ground: string;
  /** Whether the light runs round them, or they stand dim and still. */
  readonly running: boolean;
  /** How lit a pin is when the light is not on it (`PIN_REST`). */
  readonly rest: number;
}) {
  const less = useReduceMotion();
  // Light stands the pins on metal and keeps the colour for the light; dark has no metal.
  const metal = usePalette().pinMetal;
  const onMetal = metal !== "transparent";
  const lights = useTurns(onMetal ? ROUND_ON_METAL : ROUND, running && !less);
  const resting = onMetal ? 0 : rest;
  // In the face theme, as the body they stand behind is.
  const lit = litGround(useFacePaint().ground(ground));
  return (
    <View pointerEvents="none" testID="agent-pins" style={StyleSheet.absoluteFill}>
      {pinsOf(side).map((pin, index) => {
        // Each pin takes the ground's light where it stands: the top of the gradient or its foot.
        const down = Math.min(1, Math.max(0, (pin.y + pin.h / 2) / side));
        const round = Math.min(pin.w, pin.h) / 2;
        return (
          <View
            key={pin.key}
            style={{
              position: "absolute",
              left: pin.x,
              top: pin.y,
              width: pin.w,
              height: pin.h,
              borderRadius: round,
              ...(onMetal ? { backgroundColor: metal } : null),
            }}
          >
            <Animated.View
              style={[
                StyleSheet.absoluteFill,
                {
                  borderRadius: round,
                  backgroundColor: mixHex(lit.top, lit.foot, down),
                  opacity: running && !less ? (lights[index] ?? resting) : resting,
                },
              ]}
            />
          </View>
        );
      })}
    </View>
  );
}

/** The dot in the bite. Green breathes while the agent works; amber is still. */
function BiteDot({
  side,
  colour,
  breathing,
  testID,
}: {
  readonly side: number;
  readonly colour: string;
  readonly breathing: boolean;
  readonly testID: string;
}) {
  const less = useReduceMotion();
  const breath = useRef(new Animated.Value(1)).current;
  const live = breathing && !less;
  useEffect(() => {
    breath.setValue(1);
    if (!live) return;
    // One timing there and back, so the loop is the native driver's and not a restart from JS.
    const loop = Animated.loop(
      Animated.timing(breath, {
        toValue: 0,
        duration: 1500,
        easing: Easing.linear,
        useNativeDriver: NATIVE,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [breath, live]);
  const r = BITE_DOT.r * side;
  return (
    <Animated.View
      testID={testID}
      style={{
        position: "absolute",
        left: BITE_DOT.cx * side - r,
        top: BITE_DOT.cy * side - r,
        width: r * 2,
        height: r * 2,
        borderRadius: r,
        backgroundColor: colour,
        opacity: live
          ? breath.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 0.5, 1] })
          : 1,
      }}
    />
  );
}

/** How lit its pins rest: round its body, as the mark's where it keeps them, else dim. */
function pinRest(out: boolean, always: boolean): number {
  if (out) return PIN_REST.outside;
  return always ? PIN_REST.mark : PIN_REST.inside;
}

export function AgentFace({
  mark,
  ground,
  letters,
  side,
  working = false,
  cantAnswer = false,
  pinsOut = false,
  pinsAlways = false,
  amber,
  green,
}: {
  /** The mark it wears; absent, its initials on the ground. */
  readonly mark?: MarkName | undefined;
  readonly ground: string;
  /** Its initials, or the letters chosen for it in place of a mark (ADR 0139). */
  readonly letters: string;
  readonly side: number;
  /** At work: the light runs round its pins, or where it has none, a green dot is in the bite. */
  readonly working?: boolean | undefined;
  readonly cantAnswer?: boolean | undefined;
  /**
   * Its pins stand out round a body the size of the whole face, at any size, rather than inside
   * the box from thirty-two points up: the face beside a line in a room (ADR 0103), which has no
   * room for them inside and is not to be shrunk to make some.
   */
  readonly pinsOut?: boolean | undefined;
  /**
   * Its pins inside its box at any size, resting as lit as the mark's: Search's backdrop (ADR
   * 0138), whose far faces are under thirty-two points and drawn faint, and which shows agents
   * with their pins (Arjun, 7 October 2026).
   */
  readonly pinsAlways?: boolean | undefined;
  /** The palette's amber and green, for the dot in the bite. */
  readonly amber: string;
  readonly green: string;
}) {
  const pins = pinsOut || pinsAlways || side >= PINS_FROM;
  // Where it wears its pins inside its box, the body stands back from the box's edges by as far as
  // they stand out; worn round it, they stand out past the box.
  const body = pins && !pinsOut ? side * BODY_WITH_PINS : side;
  const inset = (side - body) / 2;
  const faces = useFacePaint();
  return (
    <View style={{ width: side, height: side }}>
      <View
        testID="agent-body"
        style={{ position: "absolute", left: inset, top: inset, width: body, height: body }}
      >
        {pins ? (
          <Pins side={body} ground={ground} running={working} rest={pinRest(pinsOut, pinsAlways)} />
        ) : null}
        <View style={StyleSheet.absoluteFill}>
          <MarkFace name={mark} size={body} on={{ kind: "ground", ground }} outline="bite" />
        </View>
        {mark === undefined ? (
          <View
            style={[
              StyleSheet.absoluteFill,
              styles.letters,
              // With the mark, a little away from the bite.
              {
                transform: [
                  { translateX: AGENT_MARK.dx * body * 0.8 },
                  { translateY: AGENT_MARK.dy * body * 0.8 },
                ],
              },
            ]}
          >
            <Text
              style={[
                styles.initials,
                { color: faces.ink, fontSize: body * 0.4 * lettersScale(letters) },
              ]}
              allowFontScaling={false}
            >
              {letters}
            </Text>
          </View>
        ) : null}
        {cantAnswer ? (
          <BiteDot side={body} colour={amber} breathing={false} testID="cant-answer-mark" />
        ) : working && !pins ? (
          <BiteDot side={body} colour={green} breathing testID="working-dot" />
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  letters: { alignItems: "center", justifyContent: "center" },
  initials: { fontWeight: "700" },
});
