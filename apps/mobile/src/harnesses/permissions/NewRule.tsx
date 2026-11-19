/**
 * New rule (ADR 0299): a rule a person writes ahead of time, for one harness or for every harness,
 * on a page of its own over the one that opened it, never a sheet. The web's
 * (`apps/web/src/app/permissions/NewRule.tsx`) in the phone's terms.
 *
 * What it does: run commands, or a kind its asks have been; the kinds it runs on its own, from its
 * settings, are shown dimmed and can't be picked, since no rule would ever see them. For commands,
 * the starts its asks began with, as chips, most asked first, and the listed commands after them,
 * locked while the answer is Allow. The answer, Allow, Ask me or Never; where, every space or one.
 * Under it all, the preview: how many of its real asks this rule would have answered, refused or
 * brought back, as dots, which light as the chips are picked.
 *
 * Save sends the scope's rules with these added; Chips stamps who made them and when, so they show
 * as one row on the page, and an Allow never covers what matters. Saved ticks, and the page goes
 * back.
 */

import {
  ANSWER_HEADING,
  COMMANDS_KIND,
  draftProblem,
  EVERY_HARNESS,
  EVERY_SPACE_WORDS,
  type NewRuleOptions,
  NOT_SAID,
  neverStart,
  newRuleOptions,
  type OwnRulesView,
  PREVIEW_KEY,
  type PreviewDot,
  RULE_ANSWERS,
  RUN_COMMANDS_WORDS,
  type RuleAnswer,
  type RuleDraft,
  type RulePreview,
  rulePreview,
  rulesOf,
  SAVE_RULE_WORDS,
  SAVED_WORDS,
  type Snapshot,
  STARTS_HEADING,
  type Store,
  startsNote,
  WHAT_HEADING,
  WHERE_HEADING,
  withDraft,
} from "@chipschat/core";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Button } from "../../ui/Button";
import { Card } from "../../ui/Card";
import { Choices } from "../../ui/Choices";
import { GroupFoot, GroupHeading } from "../../ui/Group";
import * as feel from "../../ui/haptics";
import { Icon } from "../../ui/Icon";
import type { IconName } from "../../ui/icons";
import { Segmented } from "../../ui/Segmented";
import { usePalette } from "../../ui/theme";
import { type Palette, RADIUS, SPACE, TEXT } from "../../ui/tokens";
import { useOwnRules } from "./ownRules";

/** How long Saved shows its tick before the page goes back. */
const SAVED_MS = 900;

export function NewRule({
  store,
  snapshot,
  harnessId,
  onDone,
}: {
  readonly store: Store;
  readonly snapshot: Snapshot;
  /** The harness, or `EVERY_HARNESS`. */
  readonly harnessId: string;
  /** Saved: back to the page that opened it. */
  readonly onDone: () => void;
}) {
  // Every harness has no one harness's settings to dim kinds by.
  if (harnessId === EVERY_HARNESS) {
    return (
      <Draft
        store={store}
        snapshot={snapshot}
        harnessId={harnessId}
        own={NOT_SAID}
        onDone={onDone}
      />
    );
  }
  return <OneHarness store={store} snapshot={snapshot} harnessId={harnessId} onDone={onDone} />;
}

/** One harness's: what it runs on its own dims those kinds. */
function OneHarness({
  store,
  snapshot,
  harnessId,
  onDone,
}: {
  readonly store: Store;
  readonly snapshot: Snapshot;
  readonly harnessId: string;
  readonly onDone: () => void;
}) {
  const own = useOwnRules(store, snapshot, harnessId);
  return (
    <Draft
      store={store}
      snapshot={snapshot}
      harnessId={harnessId}
      own={own ?? NOT_SAID}
      onDone={onDone}
    />
  );
}

function Draft({
  store,
  snapshot,
  harnessId,
  own,
  onDone,
}: {
  readonly store: Store;
  readonly snapshot: Snapshot;
  readonly harnessId: string;
  readonly own: OwnRulesView;
  readonly onDone: () => void;
}) {
  const palette = usePalette();
  const { model, directory } = snapshot;
  const every = harnessId === EVERY_HARNESS;
  const options = newRuleOptions(model, directory, harnessId, own);
  const [draft, setDraft] = useState<RuleDraft>({
    what: COMMANDS_KIND,
    starts: [],
    answer: "allow",
  });
  const [saved, setSaved] = useState(false);
  const preview = rulePreview(model, directory, harnessId, draft);
  const problem = draftProblem(draft);
  const set = (change: Partial<RuleDraft>) => setDraft((was) => ({ ...was, ...change }));
  const toggle = (start: string) => {
    feel.tick();
    set({
      starts: draft.starts.includes(start)
        ? draft.starts.filter((each) => each !== start)
        : [...draft.starts, start],
    });
  };
  useEffect(() => {
    if (!saved) return;
    const back = setTimeout(onDone, SAVED_MS);
    return () => clearTimeout(back);
  }, [saved, onDone]);
  const save = () => {
    if (problem !== undefined || saved) return;
    if (every) {
      store.setWorkspaceRules({ rules: withDraft(model.workspaceRules?.rules ?? [], draft) });
    } else {
      store.setRules({
        harnessId,
        spaceId: draft.spaceId,
        rules: withDraft(rulesOf(model, harnessId, draft.spaceId), draft),
      });
    }
    feel.success();
    setSaved(true);
  };
  return (
    <View style={styles.page} testID="new-rule">
      <Kinds kinds={options.kinds} what={draft.what} onPick={(what) => set({ what })} />
      {draft.what === COMMANDS_KIND ? (
        <Starts options={options} draft={draft} every={every} onToggle={toggle} />
      ) : null}
      <View>
        <GroupHeading>{ANSWER_HEADING}</GroupHeading>
        <View style={styles.inset}>
          <Segmented
            label={ANSWER_HEADING}
            options={RULE_ANSWERS.map((each) => ({ value: each.answer, label: each.words }))}
            chosen={draft.answer}
            onChoose={(answer) => set({ answer: answer as RuleAnswer })}
            testID="rule-answer"
          />
        </View>
      </View>
      {!every && options.spaces.length > 0 ? (
        <View>
          <GroupHeading>{WHERE_HEADING}</GroupHeading>
          <Card style={styles.inset}>
            <Choices
              label={WHERE_HEADING}
              options={[
                { value: "", label: EVERY_SPACE_WORDS },
                ...options.spaces.map((space) => ({ value: space.id, label: space.name })),
              ]}
              chosen={[draft.spaceId ?? ""]}
              onChoose={(spaceId) => set({ spaceId: spaceId === "" ? undefined : spaceId })}
            />
          </Card>
        </View>
      ) : null}
      <Preview preview={preview} answer={draft.answer} />
      {problem === undefined ? null : (
        <Text style={[styles.problem, { color: palette.ink3 }]} testID="rule-problem">
          {problem}
        </Text>
      )}
      <Button
        label={saved ? SAVED_WORDS : SAVE_RULE_WORDS}
        icon={saved ? "check" : undefined}
        variant="primary"
        disabled={problem !== undefined}
        onPress={save}
        style={styles.inset}
        testID="rule-save"
      />
    </View>
  );
}

/** What it does, a radio each; what it runs on its own is shown dimmed and can't be picked. */
function Kinds({
  kinds,
  what,
  onPick,
}: {
  readonly kinds: NewRuleOptions["kinds"];
  readonly what: string;
  readonly onPick: (what: string) => void;
}) {
  const palette = usePalette();
  return (
    <View>
      <GroupHeading>{WHAT_HEADING}</GroupHeading>
      <View
        style={[styles.kinds, { backgroundColor: palette.surface }]}
        accessibilityRole="radiogroup"
        accessibilityLabel={WHAT_HEADING}
      >
        {kinds.map((kind, at) => (
          <KindRow
            key={kind.id}
            kind={kind}
            first={at === 0}
            on={what === kind.id}
            onPick={() => {
              feel.tick();
              onPick(kind.id);
            }}
          />
        ))}
      </View>
    </View>
  );
}

/** One thing it may do, as a radio row. */
function KindRow({
  kind,
  first,
  on,
  onPick,
}: {
  readonly kind: NewRuleOptions["kinds"][number];
  readonly first: boolean;
  readonly on: boolean;
  readonly onPick: () => void;
}) {
  const palette = usePalette();
  const commands = kind.id === COMMANDS_KIND;
  const icon: IconName = commands ? "terminal" : kind.own ? "lock" : "info";
  const title = commands ? RUN_COMMANDS_WORDS : kind.title;
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: on, disabled: kind.own }}
      accessibilityLabel={kind.sub === undefined ? title : `${title}, ${kind.sub}`}
      disabled={kind.own}
      onPress={onPick}
      style={({ pressed }) => [
        styles.kind,
        first ? null : { borderTopColor: palette.line, borderTopWidth: StyleSheet.hairlineWidth },
        {
          backgroundColor: pressed ? palette.surface2 : "transparent",
          opacity: kind.own ? 0.5 : 1,
        },
      ]}
      testID={`rule-kind-${kind.id}`}
    >
      <View style={[styles.kindMark, { backgroundColor: on ? palette.accent : palette.surface2 }]}>
        <Icon name={icon} size={15} color={on ? "#ffffff" : palette.ink2} />
      </View>
      <View style={styles.kindWords}>
        <Text style={[styles.kindTitle, { color: palette.ink }]}>{title}</Text>
        {kind.sub === undefined ? null : (
          <Text
            style={[kind.own ? styles.kindSub : styles.kindCode, { color: palette.ink3 }]}
            numberOfLines={1}
          >
            {kind.sub}
          </Text>
        )}
      </View>
      {on ? <Icon name="check" size={17} color={palette.accent} weight={2.6} /> : null}
    </Pressable>
  );
}

/** How the commands start: its starts as chips, then the listed ones, locked under Allow. */
function Starts({
  options,
  draft,
  every,
  onToggle,
}: {
  readonly options: NewRuleOptions;
  readonly draft: RuleDraft;
  readonly every: boolean;
  readonly onToggle: (start: string) => void;
}) {
  const palette = usePalette();
  const locked = draft.answer === "allow";
  const picked = draft.starts.filter((start) => !locked || !neverStart(start));
  return (
    <View>
      <GroupHeading
        trailing={
          <Text style={[styles.right, { color: palette.ink3 }]} testID="rule-picked">
            {picked.length} picked
          </Text>
        }
      >
        {STARTS_HEADING}
      </GroupHeading>
      <View style={styles.chips} testID="rule-chips">
        {options.starts.map((start) => (
          <StartChip
            key={start}
            start={start}
            answer={draft.answer}
            on={draft.starts.includes(start)}
            onToggle={() => onToggle(start)}
          />
        ))}
        {options.never.map((start) => (
          <StartChip
            key={start}
            start={start}
            answer={draft.answer}
            never
            locked={locked}
            on={!locked && draft.starts.includes(start)}
            onToggle={() => onToggle(start)}
          />
        ))}
      </View>
      <GroupFoot>
        {options.starts.length === 0
          ? `${every ? "No harness has asked to run a command yet." : "It hasn't asked to run a command yet."} ${startsNote(draft.answer)}`
          : startsNote(draft.answer)}
      </GroupFoot>
    </View>
  );
}

/** The ground and ink a picked chip wears for the answer. */
function pickedLook(palette: Palette, answer: RuleAnswer) {
  if (answer === "deny") return { ground: palette.red, ink: "#ffffff" };
  if (answer === "ask") return { ground: palette.amber, ink: "#ffffff" };
  return { ground: palette.green, ink: "#ffffff" };
}

function StartChip({
  start,
  answer,
  on,
  never = false,
  locked = false,
  onToggle,
}: {
  readonly start: string;
  readonly answer: RuleAnswer;
  readonly on: boolean;
  readonly never?: boolean;
  readonly locked?: boolean;
  readonly onToggle: () => void;
}) {
  const palette = usePalette();
  const lit = pickedLook(palette, answer);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: on, disabled: locked }}
      accessibilityLabel={locked ? `${start}, never gets a standing yes` : start}
      disabled={locked}
      onPress={onToggle}
      style={({ pressed }) => [
        styles.chip,
        on
          ? { backgroundColor: lit.ground, borderColor: lit.ground }
          : {
              backgroundColor: pressed ? palette.surface2 : palette.surface,
              borderColor: never ? palette.redSoft : palette.line2,
            },
        locked ? { opacity: 0.55 } : null,
      ]}
      testID={`rule-chip-${start}`}
    >
      {locked ? <Icon name="lock" size={11} color={palette.ink3} /> : null}
      <Text style={[styles.chipWords, { color: on ? lit.ink : palette.ink }]}>{start}</Text>
    </Pressable>
  );
}

/** A preview dot's look: the answer's colour for this rule, rings for the rest. */
function dotLook(palette: Palette, dot: PreviewDot, answer: RuleAnswer) {
  switch (dot) {
    case "lit":
      return { backgroundColor: pickedLook(palette, answer).ground };
    case "still":
      return { borderWidth: 1.5, borderColor: palette.ink4 };
    case "never":
      return { borderWidth: 1.5, borderColor: palette.red };
    case "unread":
      return { backgroundColor: palette.line2 };
  }
}

/** What it would have done: the count, in words, the dots and their key. */
function Preview({
  preview,
  answer,
}: {
  readonly preview: RulePreview;
  readonly answer: RuleAnswer;
}) {
  const palette = usePalette();
  const tone = {
    allow: { edge: palette.green, ink: palette.greenInk },
    ask: { edge: palette.amber, ink: palette.amberInk },
    deny: { edge: palette.red, ink: palette.redInk },
  }[answer];
  return (
    <View
      style={[styles.preview, { backgroundColor: palette.surface, borderColor: tone.edge }]}
      accessible
      accessibilityLabel={`${preview.count} ${preview.words}`}
      testID="rule-preview"
    >
      <View style={styles.previewHead}>
        <Text style={[styles.count, { color: tone.ink }]} testID="rule-count">
          {preview.count}
        </Text>
        <Text style={[styles.previewWords, { color: palette.ink2 }]}>{preview.words}</Text>
      </View>
      {preview.dots.length === 0 ? null : (
        <View style={styles.dots}>
          {preview.dots.map((dot, at) => (
            <View
              // biome-ignore lint/suspicious/noArrayIndexKey: a dot's place is the ask's order.
              key={at}
              style={[styles.dot, dotLook(palette, dot, answer)]}
            />
          ))}
        </View>
      )}
      <View style={styles.key}>
        {PREVIEW_KEY.map((each) => (
          <View key={each.dot} style={styles.keyEntry}>
            <View style={[styles.dot, dotLook(palette, each.dot, answer)]} />
            <Text style={[styles.keyWords, { color: palette.ink3 }]}>{each.words}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { gap: SPACE.lg },
  // Groups keep their own margin from the edge; everything else here keeps the same.
  inset: { marginHorizontal: SPACE.lg },
  right: { fontSize: TEXT.sm },
  problem: { fontSize: TEXT.sm, textAlign: "center" },
  kinds: { marginHorizontal: SPACE.lg, borderRadius: 22, overflow: "hidden" },
  kind: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACE.md,
    minHeight: 52,
    paddingHorizontal: SPACE.lg,
    paddingVertical: SPACE.sm,
  },
  kindMark: {
    width: 28,
    height: 28,
    borderRadius: RADIUS.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  kindWords: { flex: 1, gap: 1 },
  kindTitle: { fontSize: TEXT.md, fontWeight: "500" },
  kindSub: { fontSize: TEXT.sm },
  kindCode: { fontFamily: "Menlo", fontSize: TEXT.xs },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: SPACE.xs, paddingHorizontal: SPACE.lg },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    minHeight: 34,
    paddingHorizontal: SPACE.md,
    borderRadius: 999,
    borderWidth: 1,
  },
  chipWords: { fontFamily: "Menlo", fontSize: TEXT.sm, fontWeight: "600" },
  preview: {
    marginHorizontal: SPACE.lg,
    borderRadius: RADIUS.xxl,
    borderWidth: 1.5,
    padding: SPACE.lg,
    gap: SPACE.md,
  },
  previewHead: { flexDirection: "row", alignItems: "baseline", gap: SPACE.sm },
  count: { fontSize: 30, fontWeight: "700", fontVariant: ["tabular-nums"] },
  previewWords: { flex: 1, fontSize: TEXT.md, lineHeight: TEXT.md * 1.35 },
  dots: { flexDirection: "row", flexWrap: "wrap", gap: 4 },
  dot: { width: 9, height: 9, borderRadius: 4.5 },
  key: { flexDirection: "row", flexWrap: "wrap", columnGap: SPACE.md, rowGap: SPACE.xs },
  keyEntry: { flexDirection: "row", alignItems: "center", gap: 6 },
  keyWords: { fontSize: TEXT.xs, fontWeight: "500" },
});
