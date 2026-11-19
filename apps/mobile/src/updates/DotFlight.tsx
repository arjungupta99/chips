/**
 * The update dot on its way into About's first update button (ADR 0296, addendum of 17 November
 * 2026). Tapped, the dot leaves the tabs, which About then covers, so its flight is drawn on a
 * layer laid on the window itself (`FullWindowOverlay`, as a lifted message's menu is), from where
 * it stood to the button: x and y on different curves so the path bends, swelling to meet the
 * button, which grows out of it as it lands (`UpdateButton`). A flight no button answers goes out
 * where it stands. iOS only; elsewhere, and with Reduce Motion, the dot never takes off.
 */

import { type DotPoint, UPDATE_MOTION } from "@chipschat/core";
import { useEffect, useRef, useState } from "react";
import { Animated, Easing, StyleSheet, View } from "react-native";
import { FullWindowOverlay } from "react-native-screens";
import { usePalette } from "../ui/theme";
import { FLIES, flights, useDotFlight } from "./flight";
import { DOT_SIZE } from "./UpdateDot";

const bezier = (curve: readonly [number, number, number, number]) => Easing.bezier(...curve);
const GONE_MS = 200;

export function DotFlight() {
  const flight = useDotFlight();
  // The flight drawn: from when the dot's place is known until it has landed or gone out.
  const [shown, setShown] = useState<{ readonly id: number; readonly from: DotPoint }>();
  useEffect(() => {
    if (flight.stage === "up" && flight.from !== undefined && shown?.id !== flight.id) {
      setShown({ id: flight.id, from: flight.from });
    }
  }, [flight, shown?.id]);
  if (!FLIES || shown === undefined) return null;
  const mine = flight.id === shown.id;
  return (
    <FullWindowOverlay>
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <Flying
          key={shown.id}
          id={shown.id}
          from={shown.from}
          to={mine && flight.stage === "up" ? flight.to : undefined}
          missed={!mine || flight.stage === "missed" || flight.stage === "rest"}
          onDone={() => setShown((was) => (was?.id === shown.id ? undefined : was))}
        />
      </View>
    </FullWindowOverlay>
  );
}

function Flying(props: {
  readonly id: number;
  readonly from: DotPoint;
  readonly to: DotPoint | undefined;
  readonly missed: boolean;
  readonly onDone: () => void;
}) {
  const { id, from, to, missed } = props;
  const palette = usePalette();
  const x = useRef(new Animated.Value(from.x)).current;
  const y = useRef(new Animated.Value(from.y)).current;
  const scale = useRef(new Animated.Value(1)).current;
  const shown = useRef(new Animated.Value(1)).current;
  const done = useRef(props.onDone);
  done.current = props.onDone;
  const flying = useRef(false);
  const toX = to?.x;
  const toY = to?.y;
  useEffect(() => {
    if (toX === undefined || toY === undefined || flying.current) return;
    flying.current = true;
    const run = Animated.parallel([
      Animated.timing(x, {
        toValue: toX,
        duration: UPDATE_MOTION.flyMs,
        easing: bezier(UPDATE_MOTION.flyX),
        useNativeDriver: true,
      }),
      Animated.timing(y, {
        toValue: toY,
        duration: UPDATE_MOTION.flyMs,
        easing: bezier(UPDATE_MOTION.flyY),
        useNativeDriver: true,
      }),
      Animated.timing(scale, {
        toValue: UPDATE_MOTION.flyScale,
        duration: UPDATE_MOTION.flyMs,
        easing: bezier(UPDATE_MOTION.ease),
        useNativeDriver: true,
      }),
    ]);
    flights.depart(id);
    run.start(({ finished }) => {
      if (!finished) return;
      // The button grows out of it from here: the dot is gone in the same frame.
      flights.land(id);
      done.current();
    });
  }, [toX, toY, id, x, y, scale]);
  useEffect(() => {
    if (!missed || flying.current) return;
    Animated.parallel([
      Animated.timing(shown, { toValue: 0, duration: GONE_MS, useNativeDriver: true }),
      Animated.timing(scale, { toValue: 0.3, duration: GONE_MS, useNativeDriver: true }),
    ]).start(() => done.current());
  }, [missed, shown, scale]);
  return (
    <Animated.View
      style={[
        styles.dot,
        { backgroundColor: palette.gold, opacity: shown },
        { transform: [{ translateX: x }, { translateY: y }, { scale }] },
      ]}
      testID="update-dot-flying"
    />
  );
}

const styles = StyleSheet.create({
  dot: {
    position: "absolute",
    left: -DOT_SIZE / 2,
    top: -DOT_SIZE / 2,
    width: DOT_SIZE,
    height: DOT_SIZE,
    borderRadius: DOT_SIZE / 2,
    shadowColor: "#f7c431",
    shadowOpacity: 0.85,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 },
  },
});
