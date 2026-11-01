/**
 * The lock screen the film draws in its Lock screen chapter (ADR 0213, point 5): a picture, inside
 * the stage, of a phone's lock screen with an agent's question on it as a notification, and the
 * notification's own Approve, which answers the ask through the store as the push's button would.
 * The demo never posts a notification: this is drawn, and nothing leaves the phone.
 */

import type { DemoLockScreen } from "@chipschat/core";
import { useId } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Defs, LinearGradient, Rect, Stop, Svg } from "react-native-svg";
import { Big } from "../pairing/JoinCard";
import { ChipPulse } from "../ui/ChipPulse";
import { Icon } from "../ui/Icon";
import { usePalette } from "../ui/theme";
import { RADIUS, SPACE, TEXT } from "../ui/tokens";

/** A lock screen's wallpaper, night blue into plum, in either appearance: a picture's own. */
const WALL = { from: "#1d2a4a", to: "#6b3f5f", ink: "#ffffff" } as const;

/** The time the picture shows: now, as this phone writes it. */
function timeNow(): string {
  return new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export function LockPicture({
  lock,
  top,
  onApprove,
}: {
  readonly lock: DemoLockScreen;
  /** Where the screen's own top ends: the status bar's height. */
  readonly top: number;
  readonly onApprove: () => void;
}) {
  const palette = usePalette();
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  return (
    <View style={StyleSheet.absoluteFill} testID="demo-lock">
      {/*
        A unit box stretched over the screen, so the wallpaper never goes stale on a resize. Sized
        too, not only placed: an <svg> keeps its viewBox's shape against a top and a bottom, and
        a square wall left the room showing under the picture.
      */}
      <Svg
        style={StyleSheet.absoluteFill}
        width="100%"
        height="100%"
        viewBox="0 0 1 1"
        preserveAspectRatio="none"
      >
        <Defs>
          <LinearGradient id={`wall${id}`} x1="0" y1="0" x2="0.35" y2="1">
            <Stop offset="0" stopColor={WALL.from} />
            <Stop offset="1" stopColor={WALL.to} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="1" height="1" fill={`url(#wall${id})`} />
      </Svg>
      <Text style={[styles.time, { top: top + SPACE.xxl * 2 }]}>{timeNow()}</Text>
      <View
        style={[styles.note, { backgroundColor: palette.surface, top: top + 230 }]}
        testID="demo-lock-note"
      >
        <View style={styles.head}>
          <Big scale={1.1}>
            <ChipPulse gold={palette.gold} ink={palette.ink3} lit={palette.ink} working={false} />
          </Big>
          <Text style={[styles.app, { color: palette.ink3 }]}>Chips</Text>
          <Text style={[styles.when, { color: palette.ink3 }]}>now</Text>
        </View>
        <Text style={[styles.who, { color: palette.ink }]}>{`${lock.who} · ${lock.room}`}</Text>
        <Text style={[styles.question, { color: palette.ink }]}>{lock.question}</Text>
        {lock.answered ? (
          <View style={styles.answered} testID="demo-lock-answered">
            <Icon name="check" size={16} color={palette.green} />
            <Text style={[styles.answeredWords, { color: palette.greenInk }]}>Approved</Text>
          </View>
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Approve"
            onPress={onApprove}
            style={({ pressed }) => [
              styles.approve,
              { backgroundColor: pressed ? palette.surface3 : palette.surface2 },
            ]}
            testID="demo-lock-approve"
          >
            <Text style={[styles.approveWord, { color: palette.ink }]}>Approve</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  time: {
    position: "absolute",
    left: 0,
    right: 0,
    textAlign: "center",
    color: WALL.ink,
    fontSize: 88,
    fontWeight: "700",
    letterSpacing: -2,
  },
  note: {
    position: "absolute",
    left: SPACE.md,
    right: SPACE.md,
    borderRadius: 24,
    padding: SPACE.md,
    gap: 4,
  },
  head: { flexDirection: "row", alignItems: "center", gap: SPACE.sm },
  app: { flex: 1, fontSize: TEXT.sm, fontWeight: "600", textTransform: "uppercase" },
  when: { fontSize: TEXT.sm },
  who: { fontSize: TEXT.md, fontWeight: "700" },
  question: { fontSize: TEXT.md, lineHeight: Math.round(TEXT.md * 1.3) },
  approve: {
    marginTop: SPACE.sm,
    borderRadius: RADIUS.xxl,
    paddingVertical: SPACE.md,
    alignItems: "center",
  },
  approveWord: { fontSize: TEXT.body, fontWeight: "600" },
  answered: { marginTop: SPACE.sm, flexDirection: "row", alignItems: "center", gap: 6 },
  answeredWords: { fontSize: TEXT.md, fontWeight: "600" },
});
