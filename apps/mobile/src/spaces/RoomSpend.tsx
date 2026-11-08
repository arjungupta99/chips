/**
 * What a room allows a job, a page in the room's sheet (ADR 0117, Arjun's C from the mock "Spend
 * per Job", 4 October 2026): five amounts and Other, the default among them, with what the job has
 * spent so far against the one picked, and Save. Other opens a field for an exact amount, with the
 * number pad. Anybody in the room but a guest sets it (core's `maySetSpend`); a guest's row opens
 * nothing.
 *
 * What the job has spent is the server's to work out (`GET /v1/spaces/:id/spend`): it is read as
 * the sheet opens, and again when the room's last line or its ceiling changes.
 *
 * Under it, the room's spending job by job (ADR 0282, Arjun's C of the mock "Spend in Chips
 * explain"): what began this job, the jobs before it that spent, newest first, each going to its
 * reply, and what every job here has spent together. Opened from the banner's Raise the limit, it
 * starts on the next amount up and its Save lets the agents carry on too.
 */

import {
  ALL_JOBS,
  allJobsWords,
  ceilingOfChoice,
  type Directory,
  HELD_WORD,
  jobStartWords,
  raisedChoice,
  SPEND_HELP,
  SPEND_PRESETS,
  SPEND_RANGE_WORDS,
  type Space,
  type SpendChoice,
  type SpentJobRow,
  type Store,
  saveAndCarryOnWords,
  spendCeilingOf,
  spendChoiceOf,
  spentJobRows,
} from "@chipschat/core";
import { DEFAULT_SPEND_CEILING_USD, dollars, type RoomSpend } from "@chipschat/protocol";
import { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useGround } from "../ui/ground";
import { PageBack } from "../ui/PageBack";
import { SheetScroll } from "../ui/Sheet";
import { usePalette } from "../ui/theme";
import { RADIUS, SPACE, TEXT } from "../ui/tokens";

/** What the room's job has spent, read while the sheet is open; nothing until the server says. */
export function useRoomSpend(store: Store, space: Space, open: boolean): RoomSpend | undefined {
  const [spend, setSpend] = useState<RoomSpend | undefined>(undefined);
  const last = space.lines.at(-1)?.id;
  // biome-ignore lint/correctness/useExhaustiveDependencies: read again as the room moves on, or its ceiling changes.
  useEffect(() => {
    if (!open) return;
    let live = true;
    store.roomSpend(space.id).then(
      (read) => {
        if (live) setSpend(read);
      },
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [store, space.id, open, last, space.spendCeiling]);
  return spend;
}

export function SpendPage({
  space,
  spend,
  busy,
  carryOn = false,
  directory,
  selfId,
  onBack,
  onSave,
  onGoTo,
}: {
  readonly space: Space;
  readonly spend: RoomSpend | undefined;
  readonly busy: boolean;
  /** Opened from Raise the limit: Save lets the agents carry on too, the amount kept or not. */
  readonly carryOn?: boolean | undefined;
  readonly directory: Directory;
  readonly selfId: string;
  readonly onBack: () => void;
  /** An amount, or `null` to follow the default again. */
  readonly onSave: (usd: number | null) => void;
  /** A job's row: the room, at the reply that closed its run. */
  readonly onGoTo?: ((lineId: string) => void) | undefined;
}) {
  const palette = usePalette();
  const [choice, setChoice] = useState<SpendChoice>(() =>
    carryOn ? raisedChoice(space) : spendChoiceOf(space),
  );
  const [typed, setTyped] = useState(() =>
    choice === "other" ? spendCeilingOf(space).toFixed(2) : "",
  );
  const field = useRef<TextInput>(null);
  const target = ceilingOfChoice(choice, typed);
  // Carrying on, the room's own amount saves nothing new and still lets them go on.
  const ready =
    target !== undefined && (carryOn || target !== (space.spendCeiling ?? null)) && !busy;
  const saveWords = carryOn ? saveAndCarryOnWords(space, target) : "Save";
  const save = () => {
    if (ready) onSave(target);
  };
  const pick = (value: SpendChoice) => {
    setChoice(value);
    if (value === "other") setTimeout(() => field.current?.focus(), 0);
  };
  const on = (value: SpendChoice) =>
    choice === value || (value === "default" && choice === DEFAULT_SPEND_CEILING_USD);
  return (
    <View style={styles.page}>
      <PageBack title="Spend per job" onBack={onBack} />
      <Text style={[styles.hint, { color: palette.ink3 }]}>{SPEND_HELP}</Text>
      <SheetScroll style={styles.scroll} testID="room-sheet-spend-page">
        <View style={styles.chips} accessibilityRole="radiogroup">
          {SPEND_PRESETS.map((usd) =>
            usd === DEFAULT_SPEND_CEILING_USD ? (
              <SpendChip
                key="default"
                value="default"
                label="$3"
                under="Default"
                on={on("default")}
                onPick={pick}
              />
            ) : (
              <SpendChip key={usd} value={usd} label={`$${usd}`} on={on(usd)} onPick={pick} />
            ),
          )}
          <SpendChip
            value="other"
            label={choice === "other" && typeof target === "number" ? dollars(target) : "Other"}
            under="An amount"
            on={on("other")}
            onPick={pick}
          />
        </View>
        {choice === "other" ? (
          <>
            <View style={[styles.field, { backgroundColor: palette.surface2 }]}>
              <Text style={[styles.fieldWords, styles.cur, { color: palette.ink3 }]}>$</Text>
              <TextInput
                ref={field}
                accessibilityLabel="Amount in dollars"
                testID="room-sheet-spend-amount"
                value={typed}
                onChangeText={setTyped}
                onSubmitEditing={save}
                keyboardType="decimal-pad"
                returnKeyType="done"
                maxLength={7}
                placeholder="7.50"
                placeholderTextColor={palette.ink3}
                style={[styles.fieldWords, styles.amount, { color: palette.ink }]}
              />
            </View>
            <Text style={[styles.fieldHint, { color: palette.ink3 }]}>{SPEND_RANGE_WORDS}</Text>
          </>
        ) : null}
        <SoFar
          spend={spend}
          // Against what is picked, or what the room has while Other's amount is unfinished.
          against={
            target === undefined ? spendCeilingOf(space) : (target ?? DEFAULT_SPEND_CEILING_USD)
          }
          since={jobStartWords(spend, directory, selfId)}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={saveWords}
          accessibilityState={{ busy, disabled: !ready }}
          disabled={!ready}
          onPress={save}
          testID="room-sheet-spend-save"
          style={({ pressed }) => [
            styles.go,
            {
              backgroundColor: ready ? palette.gold : palette.surface2,
              opacity: pressed ? 0.85 : 1,
            },
          ]}
        >
          <Text style={[styles.goWords, ready ? null : { color: palette.ink4 }]}>{saveWords}</Text>
        </Pressable>
        <Jobs
          rows={spentJobRows(spend, space, directory)}
          total={allJobsWords(spend)}
          onGoTo={onGoTo}
        />
      </SheetScroll>
    </View>
  );
}

/**
 * The jobs before this one that spent, newest first, each with whose runs, when, its steps and
 * what it came to, and Held where Chips held the agents at the ceiling; a tap goes to its reply.
 * Then what every job here has spent. Nothing for a room whose only job is this one.
 */
function Jobs({
  rows,
  total,
  onGoTo,
}: {
  readonly rows: readonly SpentJobRow[];
  readonly total: string | undefined;
  readonly onGoTo: ((lineId: string) => void) | undefined;
}) {
  const palette = usePalette();
  const on = useGround();
  if (rows.length === 0) return null;
  return (
    <View style={styles.jobs} testID="room-sheet-spend-jobs">
      <Text style={[styles.jobsHead, { color: palette.ink3 }]}>Jobs before this one</Text>
      <View style={[styles.card, { backgroundColor: on.fill }]}>
        {rows.map((row, at) => {
          const lineId = row.lineId;
          const go =
            lineId === undefined || onGoTo === undefined ? undefined : () => onGoTo(lineId);
          return (
            <Pressable
              key={row.key}
              accessibilityRole={go === undefined ? undefined : "button"}
              accessibilityLabel={row.label}
              disabled={go === undefined}
              onPress={go}
              testID={`room-sheet-spend-job-${row.key}`}
              style={({ pressed }) => [
                styles.job,
                at === 0 ? null : { borderTopWidth: StyleSheet.hairlineWidth },
                { borderTopColor: palette.line, opacity: pressed ? 0.7 : 1 },
              ]}
            >
              <View style={styles.jobWords}>
                <View style={styles.jobTitleLine}>
                  <Text numberOfLines={1} style={[styles.jobTitle, { color: palette.ink }]}>
                    {row.title}
                  </Text>
                  {row.held ? (
                    <Text
                      style={[
                        styles.held,
                        { color: palette.redInk, backgroundColor: palette.redSoft },
                      ]}
                    >
                      {HELD_WORD}
                    </Text>
                  ) : null}
                </View>
                <Text style={[styles.jobWhen, { color: palette.ink3 }]}>{row.when}</Text>
              </View>
              <Text style={[styles.jobAmount, { color: palette.ink }]}>{row.amount}</Text>
            </Pressable>
          );
        })}
      </View>
      {total === undefined ? null : (
        <View style={styles.total} testID="room-sheet-spend-total">
          <Text style={[styles.totalWords, { color: palette.ink2 }]}>{ALL_JOBS}</Text>
          <Text style={[styles.jobAmount, { color: palette.ink }]}>{total}</Text>
        </View>
      )}
    </View>
  );
}

/** One of the amounts, Default under the default's; the one picked is ink. */
function SpendChip({
  value,
  label,
  under,
  on,
  onPick,
}: {
  readonly value: SpendChoice;
  readonly label: string;
  readonly under?: string;
  readonly on: boolean;
  readonly onPick: (value: SpendChoice) => void;
}) {
  const palette = usePalette();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected: on }}
      accessibilityLabel={under === undefined ? label : `${label}, ${under}`}
      onPress={() => onPick(value)}
      testID={`room-sheet-spend-${value}`}
      style={({ pressed }) => [
        styles.chip,
        { backgroundColor: on ? palette.ink : palette.surface2, opacity: pressed ? 0.85 : 1 },
      ]}
    >
      <Text style={[styles.chipWords, { color: on ? palette.bg : palette.ink }]}>{label}</Text>
      {under === undefined ? null : (
        <Text style={[styles.chipUnder, { color: on ? palette.bg : palette.ink3 }]}>{under}</Text>
      )}
    </Pressable>
  );
}

/**
 * What the job has spent so far against an amount, as words and a bar, with what began it (ADR
 * 0282); runs that said no cost.
 */
function SoFar({
  spend,
  against,
  since,
}: {
  readonly spend: RoomSpend | undefined;
  readonly against: number;
  readonly since?: string | undefined;
}) {
  const palette = usePalette();
  const spent = spend?.spent_usd;
  const share = spent === undefined ? 0 : Math.min(100, (100 * spent) / against);
  const uncounted = spend?.uncounted_runs ?? 0;
  return (
    <View style={styles.sofar} testID="room-sheet-spend-sofar">
      <View style={styles.sofarLine}>
        <Text style={[styles.sofarLabel, { color: palette.ink3 }]}>This job so far</Text>
        <Text style={[styles.sofarValue, { color: palette.ink }]}>
          {spent === undefined ? "…" : `${dollars(spent)} of ${dollars(against)}`}
        </Text>
      </View>
      <View style={[styles.meter, { backgroundColor: palette.surface3 }]}>
        <View style={[styles.meterFill, { backgroundColor: palette.ink3, width: `${share}%` }]} />
      </View>
      {since === undefined ? null : (
        <Text style={[styles.fieldHint, { color: palette.ink3 }]} testID="room-sheet-spend-since">
          {since}
        </Text>
      )}
      {uncounted === 0 ? null : (
        <Text style={[styles.fieldHint, { color: palette.ink3 }]}>
          {uncounted === 1
            ? "1 run reported no cost and isn't counted."
            : `${uncounted} runs reported no cost and aren't counted.`}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flexShrink: 1, minHeight: 0 },
  // Short of the sheet's X, at the right of this line (ADR 0169).
  hint: { fontSize: TEXT.sm, lineHeight: TEXT.sm * 1.4, marginTop: 2, marginBottom: SPACE.md },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: SPACE.sm },
  chip: {
    flexBasis: "31%",
    flexGrow: 1,
    minHeight: 56,
    borderRadius: RADIUS.xl,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: SPACE.xs,
  },
  chipWords: { fontSize: TEXT.body + 2, fontWeight: "600", fontVariant: ["tabular-nums"] },
  chipUnder: { fontSize: TEXT.xs, marginTop: 1 },
  field: {
    borderRadius: RADIUS.xl,
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    marginTop: SPACE.md,
  },
  fieldWords: { fontSize: TEXT.body, paddingVertical: SPACE.sm },
  cur: { paddingLeft: SPACE.md },
  amount: { flex: 1, paddingLeft: 2, paddingRight: SPACE.md, fontVariant: ["tabular-nums"] },
  fieldHint: {
    fontSize: TEXT.sm,
    lineHeight: TEXT.sm * 1.4,
    marginTop: SPACE.xs,
    marginHorizontal: SPACE.xs,
  },
  sofar: { marginTop: SPACE.lg, gap: SPACE.xs, marginHorizontal: SPACE.xs },
  sofarLine: { flexDirection: "row", justifyContent: "space-between", gap: SPACE.sm },
  sofarLabel: { fontSize: TEXT.sm },
  sofarValue: { fontSize: TEXT.sm, fontWeight: "600", fontVariant: ["tabular-nums"] },
  meter: { height: 6, borderRadius: 3, overflow: "hidden" },
  meterFill: { height: 6, borderRadius: 3 },
  go: {
    minHeight: 52,
    borderRadius: RADIUS.xl,
    alignItems: "center",
    justifyContent: "center",
    marginTop: SPACE.xl,
  },
  // Gold is the same in both themes, so the ink on it is too: the unread count's.
  goWords: { fontSize: TEXT.body, fontWeight: "600", color: "#14161b" },
  scroll: { flexGrow: 0, flexShrink: 1, minHeight: 0 },
  jobs: { marginTop: SPACE.xl, gap: SPACE.sm },
  jobsHead: {
    fontSize: TEXT.xs,
    fontWeight: "600",
    letterSpacing: 0.4,
    textTransform: "uppercase",
    marginHorizontal: SPACE.xs,
  },
  card: { borderRadius: RADIUS.xl, overflow: "hidden" },
  job: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACE.md,
    paddingHorizontal: SPACE.md,
    paddingVertical: SPACE.sm + 2,
  },
  jobWords: { flex: 1, minWidth: 0, gap: 2 },
  jobTitleLine: { flexDirection: "row", alignItems: "center", gap: SPACE.xs },
  jobTitle: { fontSize: TEXT.body, flexShrink: 1 },
  held: {
    fontSize: TEXT.xs,
    fontWeight: "700",
    paddingHorizontal: 7,
    paddingVertical: 1,
    borderRadius: RADIUS.pill,
    overflow: "hidden",
  },
  jobWhen: { fontSize: TEXT.sm },
  jobAmount: { fontSize: TEXT.body, fontWeight: "600", fontVariant: ["tabular-nums"] },
  total: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: SPACE.md,
    paddingTop: SPACE.xs,
    paddingBottom: SPACE.lg,
  },
  totalWords: { fontSize: TEXT.body, fontWeight: "600" },
});
