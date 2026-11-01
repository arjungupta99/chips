/**
 * When it asks you (ADR 0195, Arjun's pick of the mock "When it asks you, simpler", version 2): the
 * harness page's section for every harness, which says who decides when and who decides the
 * answer, the three things that are always true, what a person allowed always, and what has
 * happened.
 *
 * - **The ask travels** (`AskingMotion.tsx`): the harness's face, a dotted path, the face of
 *   whoever its asks go to; an ask leaves the harness, lands with them in amber, a ring pulses and
 *   a green tick pops, and the answered ask goes back green.
 * - **The opening**, core's: "Kit decides when to ask. You decide the answer." and where its asks
 *   go.
 * - **Three promises** nobody sets, each on a flat tile whose mark moves: the hand waves, the tick
 *   draws itself, the clock's hand turns.
 * - **Allowed always** with a switch on each (`AlwaysList`), and its count: "2 on", "1 of 2 on".
 * - **Asks so far** (ADR 0255): the dots, one per ask the reader can see, green for yes, a ring for
 *   a standing yes, red for no; a key that counts them, and the line under it. A tap anywhere on
 *   them, or on See all, opens every ask.
 *
 * Since ADR 0254 it is a page of its own, opened from its row on the harness's page, whose bar
 * names it. The section's Undo pill and the layer its dust is drawn in stand beside the page's
 * scroll, not in it (`overlays`), as the Model row's sheet does.
 */

import {
  ASKS_SO_FAR,
  type AskingPromise,
  type AskKey,
  alwaysCount,
  alwaysFoot,
  alwaysRules,
  askHistory,
  askingOpening,
  askingPromises,
  asksGoTo,
  harnessAskKey,
  mayTurnDial,
  nameOf,
  REMOVED_WORDS,
  SEE_ALL,
  type Snapshot,
  type Store,
} from "@chipschat/core";
import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { type Asker, useDust } from "../spaces/Dust";
import { ListDust } from "../spaces/SelectMotion";
import { UndoPill } from "../spaces/UndoPill";
import { Card } from "../ui/Card";
import { Icon } from "../ui/Icon";
import { usePalette } from "../ui/theme";
import { RADIUS, SPACE, TEXT } from "../ui/tokens";
import { useReduceMotion } from "../ui/useReduceMotion";
import { AlwaysList } from "./AlwaysList";
import { DotRow, Hero, PromiseMark, useMarks } from "./AskingMotion";
import { type Always, useAlways } from "./useAlways";

/** The section and what stands beside the scroll for it. */
export interface AskingSection {
  readonly group: ReactNode;
  readonly overlays: ReactNode;
}

/** What Undo does, to a screen reader. */
const UNDO_HINT = "Puts the rule back, so it goes ahead without asking again";

export function useAsking({
  store,
  snapshot,
  harnessId,
  selfId,
  onOpenAsks,
}: {
  readonly store: Store;
  readonly snapshot: Snapshot;
  readonly harnessId: string;
  readonly selfId: string | undefined;
  /** Opens every ask so far (ADR 0255). */
  readonly onOpenAsks: () => void;
}): AskingSection {
  const dust = useDust(useReduceMotion());
  const always = useAlways(store, snapshot);
  const insets = useSafeAreaInsets();
  const removed = always.removed;
  const group = (
    <Section
      snapshot={snapshot}
      harnessId={harnessId}
      selfId={selfId}
      always={always}
      dust={dust.asker}
      onOpenAsks={onOpenAsks}
    />
  );
  const overlays = (
    <>
      <ListDust dust={dust} />
      <UndoPill
        undoing={removed === undefined ? undefined : { lineId: removed.key, at: removed.at }}
        bottom={insets.bottom + SPACE.lg}
        words={REMOVED_WORDS}
        hint={UNDO_HINT}
        onUndo={always.undo}
        onGone={always.settled}
      />
    </>
  );
  return { group, overlays };
}

function Section({
  snapshot,
  harnessId,
  selfId,
  always,
  dust,
  onOpenAsks,
}: {
  readonly snapshot: Snapshot;
  readonly harnessId: string;
  readonly selfId: string | undefined;
  readonly always: Always;
  readonly dust: Asker;
  readonly onOpenAsks: () => void;
}) {
  const palette = usePalette();
  const { directory } = snapshot;
  const name = nameOf(directory, harnessId);
  const to = asksGoTo(directory, harnessId, selfId);
  const opening = askingOpening(name, to);
  const may = mayTurnDial(snapshot.model, selfId);
  const rules = alwaysRules(always.model, directory, harnessId, selfId);
  const history = askHistory(snapshot.model, directory, harnessId, selfId);
  const owner = directory[harnessId]?.ownerId;
  return (
    // Its name is its page's, in the bar over it (ADR 0254), so the card says it no more.
    <Card testID="asking">
      <Hero
        harness={name}
        person={to.kind === "you" ? "You" : to.kind === "owner" ? to.name : "A person"}
        personName={owner === undefined ? "?" : nameOf(directory, owner)}
        face={owner === undefined ? undefined : directory[owner]?.face}
      />
      <Text style={[styles.headline, { color: palette.ink }]} testID="asking-headline">
        {opening.headline}
      </Text>
      <Text style={[styles.sub, { color: palette.ink2 }]} testID="asking-sub">
        {opening.sub}
      </Text>
      <Promises promises={askingPromises(name, to)} />
      <Hairline />
      <View style={styles.partHead}>
        <Text style={[styles.heading, { color: palette.ink }]}>Allowed always</Text>
        <Count rules={rules} />
      </View>
      <AlwaysList
        rules={rules}
        always={always}
        dust={dust}
        may={may}
        paint={palette.surface}
        edge
        testID="asking-always"
      />
      {rules.length === 0 ? null : (
        <Text style={[styles.note, { color: palette.ink3 }]} testID="asking-always-foot">
          {alwaysFoot(name, may)}
        </Text>
      )}
      {history === undefined ? null : (
        <>
          <Hairline />
          <AsksSoFar
            dots={<DotRow dots={history.dots} />}
            askKey={harnessAskKey(snapshot.model, directory, harnessId)}
            line={history.line}
            onOpen={onOpenAsks}
          />
        </>
      )}
    </Card>
  );
}

/**
 * Asks so far (ADR 0255): the heading and See all, the dots, the key that counts them and the line
 * under it, one press that opens every ask.
 */
function AsksSoFar({
  dots,
  askKey,
  line,
  onOpen,
}: {
  readonly dots: ReactNode;
  readonly askKey: readonly AskKey[];
  readonly line: string;
  readonly onOpen: () => void;
}) {
  const palette = usePalette();
  const fill = {
    yes: palette.green,
    session: palette.green,
    no: palette.red,
    lapsed: palette.ink4,
    open: "transparent",
  } as const;
  const counted = askKey.map((each) => each.words).join(", ");
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${ASKS_SO_FAR}: ${counted}. ${line}`}
      accessibilityHint="Opens every ask"
      onPress={onOpen}
      testID="asking-history"
    >
      {({ pressed }) => (
        <View
          style={[styles.activity, { backgroundColor: pressed ? palette.surface2 : "transparent" }]}
        >
          <View style={styles.partHead}>
            <Text style={[styles.heading, { color: palette.ink }]}>{ASKS_SO_FAR}</Text>
            <View style={styles.seeAll}>
              <Text style={[styles.seeAllWords, { color: palette.accent }]}>{SEE_ALL}</Text>
              <Icon name="next" size={14} color={palette.accent} weight={2.4} />
            </View>
          </View>
          {dots}
          <View style={styles.key} testID="asking-key">
            {askKey.map((each) => (
              <View key={each.dot} style={styles.keyEntry}>
                <View
                  style={[
                    styles.keyDot,
                    { backgroundColor: fill[each.dot] },
                    each.dot === "open" ? { borderWidth: 2, borderColor: palette.amber } : null,
                  ]}
                />
                <Text style={[styles.keyWords, { color: palette.ink2 }]}>{each.words}</Text>
              </View>
            ))}
          </View>
          <Text style={[styles.note, { color: palette.ink3 }]}>{line}</Text>
        </View>
      )}
    </Pressable>
  );
}

function Hairline() {
  const palette = usePalette();
  return <View style={[styles.hairline, { backgroundColor: palette.line }]} />;
}

/** `2 on` in green while every rule is on, `1 of 2 on` in grey while one is off. */
function Count({ rules }: { readonly rules: readonly { readonly on: boolean }[] }) {
  const palette = usePalette();
  const words = alwaysCount(rules);
  if (words === undefined) return null;
  const all = rules.every((rule) => rule.on);
  return (
    <View style={[styles.count, { backgroundColor: all ? palette.greenSoft : palette.surface2 }]}>
      <Text
        style={[styles.countWords, { color: all ? palette.greenInk : palette.ink2 }]}
        testID="asking-count"
      >
        {words}
      </Text>
    </View>
  );
}

/** The three promises, each on a flat tile in its own colour, its mark moving on one clock. */
function Promises({ promises }: { readonly promises: readonly AskingPromise[] }) {
  const palette = usePalette();
  const t = useMarks();
  const tiles = {
    big: { ground: palette.amberSoft, ink: palette.amberInk },
    window: { ground: palette.greenSoft, ink: palette.greenInk },
    silence: { ground: palette.blueSoft, ink: palette.blueInk },
  } as const;
  return (
    <View style={styles.promises}>
      {promises.map((promise) => (
        <View key={promise.id} style={styles.promise} testID={`asking-promise-${promise.id}`}>
          <View style={[styles.tile, { backgroundColor: tiles[promise.id].ground }]}>
            <PromiseMark id={promise.id} ink={tiles[promise.id].ink} t={t} />
          </View>
          <View style={styles.promiseWords}>
            <Text style={[styles.promiseTitle, { color: palette.ink }]}>{promise.title}</Text>
            <Text style={[styles.note, { color: palette.ink3 }]}>{promise.line}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  heading: { fontSize: TEXT.md, fontWeight: "700" },
  headline: { fontSize: TEXT.xl, lineHeight: 25, fontWeight: "600", paddingTop: SPACE.xs },
  sub: { fontSize: TEXT.md, lineHeight: TEXT.md * 1.4 },
  promises: { gap: SPACE.md, paddingTop: SPACE.sm },
  promise: { flexDirection: "row", gap: SPACE.md, alignItems: "flex-start" },
  tile: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.md,
    alignItems: "center",
    justifyContent: "center",
  },
  promiseWords: { flex: 1, gap: 2 },
  promiseTitle: { fontSize: TEXT.md, fontWeight: "600" },
  note: { fontSize: TEXT.sm, lineHeight: TEXT.sm * 1.45 },
  hairline: { height: StyleSheet.hairlineWidth, marginVertical: SPACE.xs },
  partHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  count: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 2 },
  countWords: { fontSize: TEXT.xs, fontWeight: "600" },
  // Drawn out past the card's padding, so a thumb's grey has room round the words.
  activity: {
    gap: SPACE.sm,
    marginHorizontal: -SPACE.sm,
    marginVertical: -SPACE.xs,
    paddingHorizontal: SPACE.sm,
    paddingVertical: SPACE.xs,
    borderRadius: RADIUS.lg,
  },
  seeAll: { flexDirection: "row", alignItems: "center", gap: 2 },
  seeAllWords: { fontSize: TEXT.md, fontWeight: "500" },
  key: { flexDirection: "row", flexWrap: "wrap", columnGap: SPACE.md, rowGap: SPACE.xs },
  keyEntry: { flexDirection: "row", alignItems: "center", gap: 6 },
  keyDot: { width: 8, height: 8, borderRadius: 4 },
  keyWords: { fontSize: TEXT.sm, fontWeight: "500" },
});
