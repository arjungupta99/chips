/**
 * The tab bar on an iPhone, drawn by this app on the phone's own glass (ADR 0233).
 *
 * UIKit's bar stood here until 25 October 2026, and it did one thing as a list went up: it folded
 * down to the tab in front. Arjun asked for something UIKit has no setting for, a bar that gets a
 * little smaller while a list is read and hides its names, with the + going with it ("animated,
 * smooth and look very polished"). So the bar is drawn here, where UIKit's stood and the size it
 * was, out of the same parts: the system's glass, the tabs' SF Symbols, the chosen tab in the
 * accent on a pill. UIKit's bar stays under it, hidden, and still does the switching.
 *
 * It shrinks on one spring, shared with the + (`Plus.tsx`): every tab where it was, the bar 14
 * points shorter, the names fading first and the marks settling into the middle, and back, names
 * last (`barPose`). What says when is the list itself, on the native side (`phoneBarNative.tsx`). Each
 * part moves by transform and opacity; only the glass's height is set, on the UI thread.
 *
 * A finger on a tab brings the pill under it, a little swollen, as UIKit's lens did; lifted there,
 * the tab is chosen, and lifted elsewhere the pill goes back. The tab in front pressed again takes
 * its list to the top, as UIKit's bar did.
 */

import { Image } from "expo-image";
import { memo, useCallback, useEffect, useRef } from "react";
import { Pressable, StyleSheet, Text, useWindowDimensions } from "react-native";
import Animated, {
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  BAR_HEIGHT,
  barFoot,
  barFrame,
  barLift,
  barPose,
  MARK_Y,
  NAME_Y,
  PILL_SPILL,
  tabMiddle,
} from "./barShape";
import { alpha, useLiquid } from "./Glass";
import { GrowingGlass } from "./growing";
import { TABS, type TabName } from "./tabs";
import { usePalette, useScheme } from "./theme";
import { useReduceMotion } from "./useReduceMotion";

/** How the bar shrinks and comes back: a little over half a second to rest, the faintest overshoot. */
export const SHRINK_SPRING = { stiffness: 300, damping: 28, mass: 1 } as const;
/** With Reduce Motion: no spring, a quick fade of the names and a quick change of size. */
export const SHRINK_STILL = { duration: 160 } as const;
/** The pill going to a tab: quick, as UIKit's lens is. */
const PILL_SPRING = { stiffness: 420, damping: 32, mass: 1 } as const;
/** Stepping aside for a screen's own bar (ADR 0181): quick, and no bounce on the way out. */
const AWAY_SPRING = { stiffness: 420, damping: 34, mass: 1 } as const;
/** The pill under a pressing finger. */
const SWELLED = 1.06;
/** The marks, as UIKit's bar drew them, and the names under them. */
const MARK_BOX = 30;
const MARK_POINTS = 22;
const NAME_LINE = 14;

/** Moves the shrink to `to`: on its spring, or at once and quickly with Reduce Motion. */
export function shrinkTo(shrink: SharedValue<number>, to: 0 | 1, still: boolean): void {
  shrink.value = still ? withTiming(to, SHRINK_STILL) : withSpring(to, SHRINK_SPRING);
}

export const PhoneBar = memo(function PhoneBar({
  tabs,
  chosen,
  plus,
  shrink,
  aside,
  onChoose,
}: {
  /** The tabs in the bar, in order. */
  readonly tabs: readonly TabName[];
  /** The tab in front. */
  readonly chosen: TabName;
  /** Whether the + stands at the bar's end, so the bar leaves room for it. */
  readonly plus: boolean;
  /** 0 at rest, 1 shrunk: the spring the + shares. */
  readonly shrink: SharedValue<number>;
  /** Stepped aside for a screen's own bar (ADR 0181): slid down out of sight, untouchable. */
  readonly aside: boolean;
  readonly onChoose: (tab: TabName) => void;
}) {
  const palette = usePalette();
  const scheme = useScheme();
  const liquid = useLiquid();
  const still = useReduceMotion();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const landscape = width > height;
  const frame = barFrame(width, height, plus, tabs.length, insets);
  const at = Math.max(0, tabs.indexOf(chosen));
  const tab = frame.tab;
  // Which tab the pill is under (it slides between them), and how swollen it is under a finger.
  const pill = useSharedValue(at);
  const swell = useSharedValue(1);
  const away = useSharedValue(aside ? 1 : 0);
  // Far enough down that nothing of the bar or its shadow shows.
  const gone = insets.bottom + barLift(landscape) + BAR_HEIGHT;

  // biome-ignore lint/correctness/useExhaustiveDependencies: shared values are stable
  useEffect(() => {
    pill.value = still ? at : withSpring(at, PILL_SPRING);
  }, [at, still]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: shared values are stable
  useEffect(() => {
    away.value = still ? (aside ? 1 : 0) : withSpring(aside ? 1 : 0, AWAY_SPRING);
  }, [aside, still]);

  const whole = useAnimatedStyle(() => ({
    transform: [{ translateY: barPose(shrink.value).lift + away.value * gone }],
  }));
  const glass = useAnimatedStyle(() => ({ height: barPose(shrink.value).glass }));
  const pillStyle = useAnimatedStyle(() => {
    const pose = barPose(shrink.value);
    return {
      transform: [
        { translateX: pill.value * tab },
        { translateY: pose.pillY },
        { scale: pose.pill * swell.value },
      ],
    };
  });
  const marks = useAnimatedStyle(() => {
    const pose = barPose(shrink.value);
    return { transform: [{ translateY: pose.markY }, { scale: pose.mark }] };
  });
  const names = useAnimatedStyle(() => {
    const pose = barPose(shrink.value);
    return {
      opacity: pose.names,
      transform: [{ translateY: pose.nameY }, { scale: pose.name }],
    };
  });

  // The tab under a finger, until it is chosen or the finger lets go elsewhere. A release comes
  // before the press it ends in (React Native's order), so whether the pill goes back is decided a
  // frame later, by which time a press has said it chose.
  const pressing = useRef<number | null>(null);
  const front = useRef({ at, still, onChoose });
  front.current = { at, still, onChoose };
  // biome-ignore lint/correctness/useExhaustiveDependencies: shared values are stable
  const press = useCallback((index: number) => {
    pressing.current = index;
    if (front.current.still) return;
    pill.value = withSpring(index, PILL_SPRING);
    swell.value = withSpring(SWELLED, PILL_SPRING);
  }, []);
  // biome-ignore lint/correctness/useExhaustiveDependencies: shared values are stable
  const release = useCallback((index: number) => {
    swell.value = front.current.still ? 1 : withSpring(1, PILL_SPRING);
    requestAnimationFrame(() => {
      if (pressing.current !== index) return;
      pressing.current = null;
      const { at: back, still: now } = front.current;
      pill.value = now ? back : withSpring(back, PILL_SPRING);
    });
  }, []);
  const choose = useCallback((name: TabName) => {
    pressing.current = null;
    front.current.onChoose(name);
  }, []);

  const pillWidth = tab + PILL_SPILL * 2;
  return (
    <Animated.View
      accessibilityRole="tablist"
      pointerEvents={aside ? "none" : "box-none"}
      style={[
        styles.bar,
        { left: frame.left, width: frame.width, bottom: barFoot(insets.bottom, landscape) },
        whole,
      ]}
      testID="phone-bar"
    >
      {liquid ? (
        <GrowingGlass
          glassEffectStyle="regular"
          colorScheme={scheme}
          style={[styles.glass, glass]}
        />
      ) : (
        <Animated.View
          style={[
            styles.glass,
            styles.painted,
            { backgroundColor: palette.surface, borderColor: palette.line },
            glass,
          ]}
        />
      )}
      <Animated.View
        pointerEvents="none"
        style={[
          styles.pill,
          {
            left: tabMiddle(0, tab) - pillWidth / 2,
            width: pillWidth,
            backgroundColor: alpha(palette.ink, scheme === "dark" ? 0.13 : 0.07),
          },
          pillStyle,
        ]}
      />
      {tabs.map((name, index) => (
        <Tab
          key={name}
          name={name}
          index={index}
          left={tabMiddle(index, tab) - tab / 2}
          width={tab}
          chosen={index === at}
          color={index === at ? palette.accent : palette.ink}
          marks={marks}
          names={names}
          onPressIn={press}
          onRelease={release}
          onChoose={choose}
        />
      ))}
    </Animated.View>
  );
});

/** One tab: its mark, and its name under it, which goes as the bar shrinks. */
const Tab = memo(function Tab({
  name,
  index,
  left,
  width,
  chosen,
  color,
  marks,
  names,
  onPressIn,
  onRelease,
  onChoose,
}: {
  readonly name: TabName;
  readonly index: number;
  readonly left: number;
  readonly width: number;
  readonly chosen: boolean;
  readonly color: string;
  readonly marks: ReturnType<typeof useAnimatedStyle>;
  readonly names: ReturnType<typeof useAnimatedStyle>;
  readonly onPressIn: (index: number) => void;
  readonly onRelease: (index: number) => void;
  readonly onChoose: (tab: TabName) => void;
}) {
  const { title, symbol } = TABS[name];
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityLabel={title}
      accessibilityState={{ selected: chosen }}
      onPressIn={() => onPressIn(index)}
      onPress={() => onChoose(name)}
      onPressOut={() => onRelease(index)}
      style={[styles.tab, { left, width }]}
      testID={`tab-${name}`}
    >
      <Animated.View style={[styles.mark, marks]}>
        <Image
          source={`sf:${symbol.sf}`}
          tintColor={color}
          contentFit="scale-down"
          style={styles.markImage}
          accessible={false}
        />
      </Animated.View>
      <Animated.View style={[styles.name, names]}>
        <Text numberOfLines={1} maxFontSizeMultiplier={1} style={[styles.nameText, { color }]}>
          {title}
        </Text>
      </Animated.View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  bar: { position: "absolute", height: BAR_HEIGHT },
  glass: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    height: BAR_HEIGHT,
    borderRadius: BAR_HEIGHT / 2,
  },
  painted: {
    borderWidth: StyleSheet.hairlineWidth,
    // Soft and low, as a thing resting on the page casts: no rim, no highlight, no gradient.
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  pill: {
    position: "absolute",
    top: 4,
    height: BAR_HEIGHT - 8,
    borderRadius: (BAR_HEIGHT - 8) / 2,
  },
  tab: { position: "absolute", top: 0, height: BAR_HEIGHT },
  mark: {
    position: "absolute",
    left: 0,
    right: 0,
    top: MARK_Y - MARK_BOX / 2,
    height: MARK_BOX,
    alignItems: "center",
    justifyContent: "center",
  },
  // An SF Symbol's point size and weight are read from the style's font (expo-image).
  markImage: { width: MARK_BOX + 6, height: MARK_BOX, fontSize: MARK_POINTS, fontWeight: "500" },
  name: { position: "absolute", left: 0, right: 0, top: NAME_Y - NAME_LINE / 2, height: NAME_LINE },
  nameText: { fontSize: 10, lineHeight: NAME_LINE, fontWeight: "600", textAlign: "center" },
});
