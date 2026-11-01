/**
 * Something new waits in a workspace behind the one in front (ADR 0197): a capsule of glass drops
 * from the top of the screen naming the workspace and what waits, for a few seconds. A tap brings
 * that workspace forward and opens the room it is in. What was already waiting is not news
 * (`news.ts`).
 */

import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Animated, Easing, Pressable, StyleSheet, Text, View } from "react-native";
import { useChips } from "../store/provider";
import { Capsule } from "../ui/Glass";
import { usePalette } from "../ui/theme";
import { SPACE, TEXT } from "../ui/tokens";
import { useReduceMotion } from "../ui/useReduceMotion";
import { useWindowInsets } from "../ui/windowInsets";
import { useBringForward } from "./forward";
import { type News, type Readings, whatIsNew } from "./news";

/** How long it stays, unless tapped. */
const SHOWN_MS = 6000;
const MOVE_MS = 260;
/** How far above its place it starts, and goes back to. */
const LIFT = 24;

export function BehindBanner() {
  const palette = usePalette();
  const insets = useWindowInsets();
  const still = useReduceMotion();
  const router = useRouter();
  const forward = useBringForward();
  const { devices, others } = useChips();
  const [said, setSaid] = useState<News | undefined>(undefined);
  const readings = useRef<Readings>({});
  const at = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const fresh = whatIsNew(others, devices, readings.current, Date.now());
    if (fresh !== undefined) setSaid(fresh);
  }, [others, devices]);

  // The words stay while it rises away.
  const [kept, setKept] = useState<News | undefined>(undefined);
  const shown = said !== undefined;
  useEffect(() => {
    if (said !== undefined) setKept(said);
  }, [said]);
  useEffect(() => {
    const motion = Animated.timing(at, {
      toValue: shown ? 1 : 0,
      duration: still ? 0 : MOVE_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    motion.start(({ finished }) => {
      if (finished && !shown) setKept(undefined);
    });
    if (!shown) return () => motion.stop();
    const away = setTimeout(() => setSaid(undefined), SHOWN_MS);
    return () => {
      motion.stop();
      clearTimeout(away);
    };
  }, [shown, still, at]);

  if (kept === undefined) return null;
  const open = () => {
    setSaid(undefined);
    forward(kept.deviceId, () => router.push(`/spaces/${kept.spaceId}`));
  };
  return (
    <View
      pointerEvents={shown ? "box-none" : "none"}
      style={[styles.place, { top: insets.top + SPACE.sm }]}
    >
      <Animated.View
        style={{
          opacity: at,
          transform: [
            { translateY: at.interpolate({ inputRange: [0, 1], outputRange: [-LIFT, 0] }) },
          ],
        }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${kept.workspace}: ${kept.words}`}
          accessibilityHint="Switches to that workspace and opens it"
          onPress={open}
          testID="behind-banner"
        >
          <Capsule interactive style={styles.capsule}>
            <View style={[styles.dot, { backgroundColor: palette.red }]} />
            <View style={styles.words}>
              <Text style={[styles.workspace, { color: palette.ink3 }]} numberOfLines={1}>
                {kept.workspace}
              </Text>
              <Text style={[styles.what, { color: palette.ink }]} numberOfLines={2}>
                {kept.words}
              </Text>
            </View>
          </Capsule>
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  place: { position: "absolute", left: SPACE.md, right: SPACE.md, alignItems: "center" },
  capsule: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACE.sm,
    paddingVertical: SPACE.sm,
    paddingHorizontal: SPACE.lg,
    borderRadius: 24,
    maxWidth: 440,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  words: { flexShrink: 1, gap: 1 },
  workspace: { fontSize: TEXT.sm, fontWeight: "600" },
  what: { fontSize: TEXT.md },
});
