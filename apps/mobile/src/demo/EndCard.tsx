/**
 * Where a film ends (ADR 0213, point 7; ADR 0217's addendum of 26 October): the film's end words,
 * then every way in on its own face. **Scan a QR code**, gold, opens the camera, which reads a
 * computer's pairing code, an invite's, or a new phone's. **Have an invite link?** pastes it, with
 * iOS's own Paste where there is one, which asks no "Allow Paste?". **Have a pairing code?** opens
 * the page to type it. **More walkthroughs** offers the films that start where this one stops, a
 * row each behind a round play button, only for those there are. **Look around** keeps the made-up
 * workspace, with the film off; **Watch again** plays it from the start.
 *
 * It stands in two places (`place`): over the film's last frame full screen, with the Chips mark
 * and its own ground; and on the first screen in the film's frame's place, under the mark the
 * screen already has at its top. It scrolls when the screen is too short for it.
 *
 * On an iPad the first screen has the ways in beside the film from the start (ADR 0256), so they
 * and the end's words stand apart there (`WaysIn`, `EndWords`).
 */

import type { FilmEnd } from "@chipschat/core";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Big } from "../pairing/JoinCard";
import { PasteAction } from "../pairing/PasteAction";
import type { PasteInvite } from "../pairing/usePasteInvite";
import { Button } from "../ui/Button";
import { ChipPulse } from "../ui/ChipPulse";
import { Icon } from "../ui/Icon";
import { usePalette } from "../ui/theme";
import { RADIUS, SPACE, TEXT } from "../ui/tokens";

export interface EndWays {
  readonly onScan: () => void;
  readonly onType: () => void;
  readonly onFilm: (film: string) => void;
  readonly onLookAround: () => void;
  readonly onWatchAgain: () => void;
}

/** A film offered under More walkthroughs: its key, its title, and its length, "0:47". */
export interface OfferedFilm {
  readonly key: string;
  readonly title: string;
  readonly length: string;
}

export function EndCard({
  words,
  ways,
  more,
  invites,
  place = "over",
}: {
  /** What it says: the film's (`FilmEnd`), "That's Chips". */
  readonly words: FilmEnd;
  readonly ways: EndWays;
  /** The films under More walkthroughs: every other there is a video of (ADR 0217). */
  readonly more: readonly OfferedFilm[];
  /** What Have an invite link? pastes through, and what it says when the paste was no invite. */
  readonly invites: Pick<PasteInvite, "paste" | "pasted" | "problem">;
  /** Over the film full screen, or in its frame's place on the first screen. */
  readonly place?: "over" | "page";
}) {
  const palette = usePalette();
  const insets = useSafeAreaInsets();
  const over = place === "over";
  return (
    <View style={[styles.card, over ? { backgroundColor: palette.bg } : null]} testID="demo-end">
      <ScrollView
        contentContainerStyle={[
          styles.body,
          over ? { paddingTop: insets.top + 44, paddingBottom: insets.bottom + SPACE.lg } : null,
        ]}
        showsVerticalScrollIndicator={false}
      >
        {over ? (
          <Big scale={2.6}>
            <ChipPulse gold={palette.gold} ink={palette.ink3} lit={palette.ink} working={false} />
          </Big>
        ) : null}
        <EndWords words={words} />
        <WaysIn ways={ways} more={more} invites={invites} />
      </ScrollView>
    </View>
  );
}

/** What the end says: the film's line, "That's Chips", and its sentence. */
export function EndWords({ words }: { readonly words: FilmEnd }) {
  const palette = usePalette();
  return (
    <>
      <Text
        accessibilityRole="header"
        lineBreakStrategyIOS="push-out"
        textBreakStrategy="balanced"
        style={[styles.title, { color: palette.ink }]}
      >
        {words.line}
      </Text>
      <Text style={[styles.sentence, { color: palette.ink2 }]}>{words.sentence}</Text>
    </>
  );
}

/**
 * Every way in: Scan a QR code, Have an invite link?, Have a pairing code?, More walkthroughs, Look
 * around and Watch again. In one column, or in two (`split`) under an upright iPad's film, the
 * ways on the left and the films and the links on the right.
 */
export function WaysIn({
  ways,
  more,
  invites,
  split = false,
}: {
  readonly ways: EndWays;
  readonly more: readonly OfferedFilm[];
  readonly invites: Pick<PasteInvite, "paste" | "pasted" | "problem">;
  readonly split?: boolean;
}) {
  const palette = usePalette();
  const doors = (
    <View style={[styles.ways, split ? styles.half : null]}>
      <Button
        label="Scan a QR code"
        icon="qr"
        variant="gold"
        onPress={ways.onScan}
        style={styles.big}
        testID="demo-scan"
      />
      <PasteAction invites={invites} raised />
      {invites.problem === undefined ? null : (
        <Text style={[styles.problem, { color: palette.red }]} testID="paste-problem">
          {invites.problem}
        </Text>
      )}
      <TypeAction onPress={ways.onType} />
    </View>
  );
  const films =
    more.length === 0 ? null : (
      <View style={[styles.more, split ? styles.moreBeside : null]} testID="demo-more">
        <Text style={[styles.heading, { color: palette.ink3 }]}>More walkthroughs</Text>
        {more.map((each) => (
          <Pressable
            key={each.key}
            accessibilityRole="button"
            accessibilityLabel={`${each.title}, ${each.length}`}
            onPress={() => ways.onFilm(each.key)}
            style={({ pressed }) => [
              styles.film,
              {
                backgroundColor: pressed ? palette.raisedPress : palette.raised,
                borderColor: palette.line,
              },
            ]}
            testID={`demo-film-${each.key}`}
          >
            <View style={[styles.play, { backgroundColor: palette.goldSoft }]}>
              <Icon name="playFill" size={16} color={palette.goldDeep} />
            </View>
            <Text style={[styles.filmTitle, { color: palette.ink }]}>{each.title}</Text>
            <Text style={[styles.filmLength, { color: palette.ink3 }]}>{each.length}</Text>
          </Pressable>
        ))}
      </View>
    );
  const links = (
    <View style={styles.links}>
      <Pressable accessibilityRole="button" onPress={ways.onLookAround} hitSlop={SPACE.sm}>
        <Text style={[styles.link, styles.strong, { color: palette.accent }]}>Look around</Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Watch again"
        onPress={ways.onWatchAgain}
        hitSlop={SPACE.sm}
        style={styles.again}
      >
        <Icon name="again" size={16} color={palette.ink3} />
        <Text style={[styles.link, { color: palette.ink3 }]}>Watch again</Text>
      </Pressable>
    </View>
  );
  if (!split) {
    return (
      <>
        {doors}
        {films}
        {links}
      </>
    );
  }
  return (
    <View style={styles.split} testID="ways-split">
      {doors}
      <View style={styles.half}>
        {films}
        {links}
      </View>
    </View>
  );
}

/**
 * Have a pairing code?: a row like Have an invite link?'s, with Type at its end in the same soft
 * gold as iOS's Paste beside it. The whole row takes the tap.
 */
function TypeAction({ onPress }: { readonly onPress: () => void }) {
  const palette = usePalette();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Type a pairing code"
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        {
          backgroundColor: pressed ? palette.raisedPress : palette.raised,
          borderColor: palette.line,
        },
      ]}
      testID="demo-type"
    >
      <Text style={[styles.rowWord, { color: palette.ink }]}>Have a pairing code?</Text>
      <View style={[styles.type, { backgroundColor: palette.goldSoft }]}>
        <Icon name="keys" size={16} color={palette.goldDeep} />
        <Text style={[styles.typeWord, { color: palette.goldDeep }]}>Type</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
  body: {
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: SPACE.md,
    paddingHorizontal: SPACE.xxl + SPACE.sm,
    paddingVertical: SPACE.md,
  },
  // Centred like the words under it: a short film's line runs to two lines, and the platform's own
  // breaking (`push-out`, `balanced`) keeps a word from standing alone on the second (WC-11).
  title: {
    fontSize: 32,
    lineHeight: 36,
    fontWeight: "700",
    letterSpacing: -0.5,
    marginTop: 10,
    textAlign: "center",
  },
  sentence: {
    fontSize: TEXT.body,
    lineHeight: Math.round(TEXT.body * 1.35),
    textAlign: "center",
    marginBottom: SPACE.sm,
  },
  ways: { alignSelf: "stretch", gap: SPACE.sm },
  big: { minHeight: 52, borderRadius: RADIUS.xxl },
  problem: { fontSize: TEXT.md, textAlign: "center" },
  row: {
    minHeight: 52,
    borderRadius: RADIUS.xxl,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: SPACE.sm,
    paddingLeft: SPACE.md,
    paddingRight: SPACE.md,
    paddingVertical: SPACE.xs,
  },
  rowWord: { flex: 1, fontSize: TEXT.body, fontWeight: "600" },
  // As big as iOS's Paste at the end of the row above (`PasteAction`'s pasteSmall).
  type: {
    height: 36,
    width: 104,
    borderRadius: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  typeWord: { fontSize: TEXT.md, fontWeight: "600" },
  more: { alignSelf: "stretch", gap: SPACE.sm, marginTop: SPACE.sm },
  // Beside the ways, its heading on their first row's line rather than a gap above it.
  moreBeside: { marginTop: 0 },
  split: { flexDirection: "row", alignSelf: "stretch", gap: SPACE.xl },
  half: { flex: 1, gap: SPACE.sm },
  heading: {
    fontSize: TEXT.xs,
    fontWeight: "700",
    letterSpacing: 0.7,
    textTransform: "uppercase",
    textAlign: "center",
  },
  film: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACE.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: RADIUS.xxl,
    minHeight: 56,
    paddingLeft: SPACE.sm,
    paddingRight: SPACE.lg,
    paddingVertical: SPACE.sm,
  },
  play: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    paddingLeft: 2,
  },
  filmTitle: { flex: 1, fontSize: TEXT.body - 1, fontWeight: "600" },
  filmLength: { fontSize: TEXT.md, fontWeight: "600", fontVariant: ["tabular-nums"] },
  links: { flexDirection: "row", alignSelf: "center", gap: SPACE.xxl, marginTop: SPACE.sm },
  link: { fontSize: TEXT.md, padding: 6, fontWeight: "500" },
  strong: { fontWeight: "600" },
  again: { flexDirection: "row", alignItems: "center", gap: 2 },
});
