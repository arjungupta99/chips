/**
 * An ask's bar (ADR 0280): the agent that asked, by its face and name with the space under it, in
 * place of "Ike needs a decision"; and at the trailing end the time left, as a ring that drains
 * toward the moment the ask lapses, with the minutes in it. A screen reader hears the sentence
 * the line used to say: "Denied in 59 min if you don't answer".
 */

import type { Approval, Directory } from "@chipschat/core";
import { nameOf } from "@chipschat/core";
import { StyleSheet, Text, View } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { Face } from "../people/Faces";
import { usePalette } from "../ui/theme";
import { TEXT } from "../ui/tokens";
import { timeLeft } from "../ui/when";
import { lapseWords } from "../words";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** The ring's size, and its circle's in the 40-unit box it is drawn in. */
const RING = 36;
const RADIUS = 18;
const ROUND = 2 * Math.PI * RADIUS;

/** Who asked, and where. */
export function AskWho({
  directory,
  id,
  spaceName,
}: {
  readonly directory: Directory;
  readonly id: string;
  readonly spaceName: string | undefined;
}) {
  const palette = usePalette();
  const name = nameOf(directory, id);
  // An agent's own space is named for it: "Ike" under "Ike" says nothing.
  const where = spaceName === name ? undefined : spaceName;
  return (
    <View style={styles.who} testID="ask-who">
      <Face directory={directory} id={id} size="sm" />
      <View style={styles.words}>
        <Text style={[styles.name, { color: palette.ink }]} numberOfLines={1}>
          {name}
        </Text>
        {where === undefined ? null : (
          <Text style={[styles.space, { color: palette.ink3 }]} numberOfLines={1}>
            {where}
          </Text>
        )}
      </View>
    </View>
  );
}

/** The time left, short enough for the ring: `59m`, `2h`, `3d`. */
export function ringWords(expiresAt: string, now: number): string {
  const left = Date.parse(expiresAt) - now;
  if (left <= 0) return "0m";
  if (left < MINUTE) return "<1m";
  if (left < HOUR) return `${Math.round(left / MINUTE)}m`;
  if (left < DAY) return `${Math.round(left / HOUR)}h`;
  return `${Math.round(left / DAY)}d`;
}

/** How long is left of the ask's time, drained from full as it was asked to empty as it lapses. */
export function LapseRing({
  approval,
  now,
}: {
  readonly approval: Approval;
  readonly now: number;
}) {
  const palette = usePalette();
  const left = timeLeft(approval.expiresAt, now);
  if (left === undefined || approval.expiresAt === undefined) return null;
  const end = Date.parse(approval.expiresAt);
  const whole = end - Date.parse(approval.askedAt);
  const share = whole > 0 ? Math.min(1, Math.max(0, (end - now) / whole)) : 0;
  const lapsed = left === "expired";
  return (
    <View
      style={styles.ring}
      accessible
      accessibilityLabel={lapseWords(left, approval.fallback)}
      testID="lapse-ring"
    >
      <Svg width={RING} height={RING} viewBox="0 0 40 40" style={styles.turned}>
        <Circle cx={20} cy={20} r={RADIUS} fill="none" stroke={palette.surface3} strokeWidth={3} />
        <Circle
          cx={20}
          cy={20}
          r={RADIUS}
          fill="none"
          stroke={lapsed ? palette.red : palette.amber}
          strokeWidth={3}
          strokeLinecap="round"
          strokeDasharray={ROUND}
          strokeDashoffset={ROUND * (1 - share)}
        />
      </Svg>
      <Text style={[styles.left, { color: lapsed ? palette.redInk : palette.ink2 }]}>
        {ringWords(approval.expiresAt, now)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  who: { flexDirection: "row", alignItems: "center", gap: 8, maxWidth: 240 },
  words: { flexShrink: 1 },
  name: { fontSize: TEXT.md + 1, fontWeight: "700", lineHeight: 19 },
  space: { fontSize: TEXT.xs, lineHeight: 15 },
  ring: { width: RING, height: RING, alignItems: "center", justifyContent: "center" },
  turned: { position: "absolute", transform: [{ rotate: "-90deg" }] },
  left: { fontSize: 10.5, fontWeight: "700", fontVariant: ["tabular-nums"] },
});
