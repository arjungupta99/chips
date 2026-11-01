/**
 * The route the Connection page draws (ADR 0211): this phone, the relay when the socket goes
 * through it, the server, and traffic running along the line between. The one file of the page's
 * that imports Reanimated, so the page's words are tested under Jest without it
 * (`jest.setup.js`).
 *
 * Drawn in its own box, so nothing is sized in percent: react-native-svg keeps a percent shape's
 * first size. The relay's line and the straight one are both drawn; going direct fades the one
 * into the other and the relay's stop off the line. With Reduce Motion on, nothing runs and the
 * line changes at once.
 */

import { useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import Svg, { Circle, G, Path, Rect } from "react-native-svg";
import { usePalette } from "../ui/theme";
import { useReduceMotion } from "../ui/useReduceMotion";

const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedG = Animated.createAnimatedComponent(G);

/** The dashes' step along the line, and how long one step takes. */
const DASH = 14;
const FLOW_MS = 1100;

/** How long the line takes to straighten when the phone goes direct. */
const STRAIGHTEN_MS = 700;

export function Route({
  direct,
  moving,
  relayHost,
  machine,
  over,
}: {
  readonly direct: boolean;
  readonly moving: boolean;
  readonly relayHost: string;
  readonly machine: string;
  readonly over: string;
}) {
  const palette = usePalette();
  const still = useReduceMotion();
  const flow = useSharedValue(0);
  const straight = useSharedValue(direct ? 1 : 0);
  useEffect(() => {
    if (still || !moving) {
      flow.value = 0;
      return;
    }
    flow.value = 0;
    flow.value = withRepeat(withTiming(1, { duration: FLOW_MS, easing: Easing.linear }), -1, false);
  }, [still, moving, flow]);
  useEffect(() => {
    straight.value = still
      ? direct
        ? 1
        : 0
      : withTiming(direct ? 1 : 0, { duration: STRAIGHTEN_MS });
  }, [direct, still, straight]);
  const dashes = useAnimatedProps(() => ({ strokeDashoffset: -flow.value * DASH * 2 }));
  const relayShown = useAnimatedProps(() => ({ opacity: 1 - straight.value }));
  const directShown = useAnimatedProps(() => ({ opacity: straight.value }));
  // The names under the middle share a place: one is gone before the other comes.
  const relayWord = useAnimatedStyle(() => ({ opacity: Math.max(0, 1 - straight.value * 2) }));
  const directWord = useAnimatedStyle(() => ({ opacity: Math.max(0, straight.value * 2 - 1) }));
  const ink = moving ? palette.green : palette.ink4;
  const relayInk = moving ? palette.gold : palette.ink4;
  return (
    <View
      style={styles.route}
      accessibilityLabel={
        direct
          ? `This phone straight to ${machine}`
          : `This phone through ${relayHost} to ${machine}`
      }
      testID="connection-route"
    >
      <Svg viewBox="0 8 340 64" style={styles.routeSvg}>
        <AnimatedG animatedProps={relayShown}>
          <Path d={ARC} stroke={palette.line} strokeWidth={3} fill="none" />
          <AnimatedPath
            d={ARC}
            stroke={relayInk}
            strokeWidth={3}
            strokeLinecap="round"
            strokeDasharray={`2 ${DASH - 2}`}
            fill="none"
            animatedProps={dashes}
          />
        </AnimatedG>
        <AnimatedG animatedProps={directShown}>
          <Path d={LINE} stroke={palette.line} strokeWidth={3} fill="none" />
          <AnimatedPath
            d={LINE}
            stroke={ink}
            strokeWidth={3}
            strokeLinecap="round"
            strokeDasharray={`2 ${DASH - 2}`}
            fill="none"
            animatedProps={dashes}
          />
        </AnimatedG>
        <AnimatedG animatedProps={relayShown}>
          <Circle
            cx={170}
            cy={26}
            r={12}
            fill={palette.surface}
            stroke={relayInk}
            strokeWidth={2.5}
          />
          <Path
            d="M164 26h12M172 21l5 5-5 5"
            stroke={relayInk}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        </AnimatedG>
        <Circle
          cx={44}
          cy={50}
          r={18}
          fill={palette.surface}
          stroke={palette.ink4}
          strokeWidth={2}
        />
        <Rect
          x={37.5}
          y={40}
          width={13}
          height={20}
          rx={3.5}
          fill="none"
          stroke={palette.ink2}
          strokeWidth={2}
        />
        <Circle cx={296} cy={50} r={18} fill={palette.ink} />
        <Rect x={288} y={42} width={16} height={16} rx={4} fill={palette.gold} />
      </Svg>
      {/* The names in the app's own type, in thirds: the phone's from the left edge, the
          server's to the right, and the relay's, or how the line goes, centred under the stop. */}
      <View style={styles.names}>
        <Text style={[styles.name, styles.phone, { color: palette.ink2 }]} numberOfLines={1}>
          This phone
        </Text>
        <Animated.Text
          style={[styles.name, styles.between, { color: palette.ink2 }, relayWord]}
          numberOfLines={1}
        >
          {relayHost}
        </Animated.Text>
        <Animated.Text
          style={[styles.name, styles.between, styles.over, { color: palette.ink3 }, directWord]}
          numberOfLines={1}
        >
          {over}
        </Animated.Text>
        <Text style={[styles.name, styles.server, { color: palette.ink2 }]} numberOfLines={1}>
          {machine}
        </Text>
      </View>
    </View>
  );
}

/** The relay's way, up through its stop and down, and the straight one. */
const ARC = "M44 50 Q107 16 170 26 Q233 16 296 50";
const LINE = "M44 50 L296 50";

const styles = StyleSheet.create({
  route: { width: "100%" },
  routeSvg: { width: "100%", aspectRatio: 340 / 64 },
  names: { height: 18, marginTop: 6 },
  name: { position: "absolute", width: "33%", fontSize: 12, lineHeight: 18, fontWeight: "600" },
  phone: { left: 0 },
  between: { left: "33.5%", textAlign: "center" },
  over: { fontWeight: "400" },
  server: { right: 0, textAlign: "right" },
});
