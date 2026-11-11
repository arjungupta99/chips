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
 *
 * No cap, across the foot of the amounts, is for a room that lasts (ADR 0292): Chips holds no job
 * there for what it spends. Other's field says when its amount is not one it takes, and past the
 * most that No cap is the way to more.
 */

import {
  ALL_JOBS,
  allJobsWords,
  ceilingOfChoice,
  ceilingWords,
  type Directory,
  HELD_WORD,
  JOBS_BEFORE,
  JOBS_SHOWN,
  jobRowsOf,
  jobStartWords,
  NO_CAP,
  NO_CAP_UNDER,
  raisedChoice,
  SEE_ALL,
  SPEND_HELP,
  SPEND_PRESETS,
  type Space,
  type SpendChoice,
  type SpentJobRow,
  type Store,
  spendCeilingOf,
  spendChoiceOf,
  spendSave,
  spentJobRows,
  typedHint,
} from "@chipschat/core";
import {
  DEFAULT_SPEND_CEILING_USD,
  dollars,
  NO_SPEND_CEILING,
  type RoomSpend,
  type SpendCeilingSetting,
  type SpentJob,
} from "@chipschat/protocol";
import { type RefObject, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Keyboard,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { isPad } from "../device/word";
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
  noCap = true,
  directory,
  selfId,
  onBack,
  onSave,
  onGoTo,
  onSeeAll,
}: {
  readonly space: Space;
  readonly spend: RoomSpend | undefined;
  readonly busy: boolean;
  /** Opened from Raise the limit: Save lets the agents carry on too, the amount kept or not. */
  readonly carryOn?: boolean | undefined;
  /**
   * Whether the server takes No cap and amounts past $100 (ADR 0292); an older one is offered
   * neither.
   */
  readonly noCap?: boolean | undefined;
  readonly directory: Directory;
  readonly selfId: string;
  readonly onBack: () => void;
  /**
   * An amount, `null` to follow the default again, or `"none"` for No cap. Resolves true once the
   * server has it; the page stays, its Save saying Saved.
   */
  readonly onSave: (usd: SpendCeilingSetting) => Promise<boolean>;
  /** A job's row: the room, at the reply that closed its run. */
  readonly onGoTo?: ((lineId: string) => void) | undefined;
  /** See all: every job before this one, on a page of its own; nothing to offer, none. */
  readonly onSeeAll?: (() => void) | undefined;
}) {
  const palette = usePalette();
  const [choice, setChoice] = useState<SpendChoice>(() =>
    carryOn ? raisedChoice(space) : spendChoiceOf(space),
  );
  const [typed, setTyped] = useState(() => firstTyped(space, choice));
  const field = useRef<TextInput>(null);
  const target = ceilingOfChoice(choice, typed, noCap);
  const [saved, setSaved] = useState<{ readonly usd: SpendCeilingSetting } | undefined>();
  const { ready, words: saveWords } = spendSave({ space, target, carryOn, busy, saved });
  const save = () => {
    if (!ready || target === undefined) return;
    const usd = target;
    void onSave(usd).then((done) => {
      if (!done) return;
      setSaved({ usd });
      Keyboard.dismiss();
    });
  };
  const pick = (value: SpendChoice) => {
    setChoice(value);
    if (value === "other") setTimeout(() => field.current?.focus(), 0);
  };
  return (
    <View style={styles.page}>
      <PageBack title="Spend per job" onBack={onBack} />
      <Text style={[styles.hint, { color: palette.ink3 }]}>{SPEND_HELP}</Text>
      <SheetScroll style={styles.scroll} testID="room-sheet-spend-page">
        <Amounts choice={choice} target={target} noCap={noCap} onPick={pick} />
        {choice === "other" ? (
          <OtherField field={field} typed={typed} noCap={noCap} onType={setTyped} onSubmit={save} />
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
          onSeeAll={onSeeAll}
        />
      </SheetScroll>
    </View>
  );
}

/**
 * The jobs before this one that spent, newest first, the first `JOBS_SHOWN` of them, each with
 * whose runs, when, its steps and what it came to, and Held where Chips held the agents at the
 * ceiling; a tap goes to its reply. See all, by the heading, opens the rest (ADR 0292 addendum).
 * Then what every job here has spent. Nothing for a room whose only job is this one.
 */
function Jobs({
  rows,
  total,
  onGoTo,
  onSeeAll,
}: {
  readonly rows: readonly SpentJobRow[];
  readonly total: string | undefined;
  readonly onGoTo: ((lineId: string) => void) | undefined;
  readonly onSeeAll: (() => void) | undefined;
}) {
  const palette = usePalette();
  const on = useGround();
  if (rows.length === 0) return null;
  return (
    <View style={styles.jobs} testID="room-sheet-spend-jobs">
      <View style={styles.jobsHeadLine}>
        <Text style={[styles.jobsHead, { color: palette.ink3 }]}>{JOBS_BEFORE}</Text>
        {onSeeAll === undefined ? null : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${SEE_ALL}, ${JOBS_BEFORE}`}
            onPress={onSeeAll}
            hitSlop={8}
            testID="room-sheet-spend-see-all"
            style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
          >
            <Text style={[styles.seeAll, { color: palette.accent }]}>{SEE_ALL}</Text>
          </Pressable>
        )}
      </View>
      <View style={[styles.card, { backgroundColor: on.fill }]}>
        {rows.slice(0, JOBS_SHOWN).map((row, at) => (
          <JobRow key={row.key} row={row} first={at === 0} onGoTo={onGoTo} />
        ))}
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

/** One job before this one, as the list and See all's page draw it. */
function JobRow({
  row,
  first,
  onGoTo,
}: {
  readonly row: SpentJobRow;
  readonly first: boolean;
  readonly onGoTo: ((lineId: string) => void) | undefined;
}) {
  const palette = usePalette();
  const lineId = row.lineId;
  const go = lineId === undefined || onGoTo === undefined ? undefined : () => onGoTo(lineId);
  return (
    <Pressable
      accessibilityRole={go === undefined ? undefined : "button"}
      accessibilityLabel={row.label}
      disabled={go === undefined}
      onPress={go}
      testID={`room-sheet-spend-job-${row.key}`}
      style={({ pressed }) => [
        styles.job,
        first ? null : { borderTopWidth: StyleSheet.hairlineWidth },
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
              style={[styles.held, { color: palette.redInk, backgroundColor: palette.redSoft }]}
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
}

/**
 * Every job before this one, newest first, from See all (ADR 0292 addendum; Arjun: "paginated so
 * that app does not run out of memory"). The server is read a page at a time as the list nears its
 * end, and the list draws only the rows near the screen, so a room that has run for months costs
 * the phone what one screen of it does. A read that fails says so, with Try again.
 */
export function AllJobsPage({
  store,
  space,
  directory,
  onBack,
  onGoTo,
}: {
  readonly store: Pick<Store, "roomJobs">;
  readonly space: Space;
  readonly directory: Directory;
  readonly onBack: () => void;
  readonly onGoTo?: ((lineId: string) => void) | undefined;
}) {
  const palette = usePalette();
  const on = useGround();
  const [jobs, setJobs] = useState<readonly SpentJob[]>([]);
  // The `before` of the page still to read; `null` once the last has come.
  const [next, setNext] = useState<number | null | undefined>(undefined);
  const [failed, setFailed] = useState<string | undefined>(undefined);
  const reading = useRef(false);
  const read = useCallback(
    async (before: number | undefined) => {
      if (reading.current) return;
      reading.current = true;
      setFailed(undefined);
      try {
        const page = await store.roomJobs(space.id, before);
        setJobs((now) => (before === undefined ? page.jobs : [...now, ...page.jobs]));
        setNext(page.next ?? null);
      } catch (error) {
        setFailed(error instanceof Error ? error.message : "The server would not say.");
      } finally {
        reading.current = false;
      }
    },
    [store, space.id],
  );
  useEffect(() => {
    void read(undefined);
  }, [read]);
  const rows = useMemo(() => jobRowsOf(jobs, space, directory), [jobs, space, directory]);
  const more = () => {
    if (typeof next === "number") void read(next);
  };
  return (
    <View style={styles.page}>
      <PageBack title={JOBS_BEFORE} onBack={onBack} />
      <FlatList
        testID="room-sheet-jobs-page"
        data={rows}
        keyExtractor={(row) => row.key}
        renderItem={({ item, index }) => <JobRow row={item} first={index === 0} onGoTo={onGoTo} />}
        renderScrollComponent={(props) => <SheetScroll {...props} />}
        onEndReached={more}
        onEndReachedThreshold={0.6}
        initialNumToRender={16}
        maxToRenderPerBatch={16}
        windowSize={7}
        removeClippedSubviews
        style={styles.scroll}
        contentContainerStyle={
          rows.length === 0 ? null : [styles.card, { backgroundColor: on.fill }]
        }
        ListFooterComponent={
          failed !== undefined ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => void read(typeof next === "number" ? next : undefined)}
              style={styles.jobsFoot}
              testID="room-sheet-jobs-failed"
            >
              <Text style={[styles.jobWhen, { color: palette.redInk }]}>{failed} Try again</Text>
            </Pressable>
          ) : next !== null ? (
            <View style={styles.jobsFoot} testID="room-sheet-jobs-reading">
              <ActivityIndicator color={palette.ink3} />
            </View>
          ) : rows.length === 0 ? (
            <Text style={[styles.jobWhen, styles.jobsFoot, { color: palette.ink3 }]}>
              No jobs before this one.
            </Text>
          ) : null
        }
      />
    </View>
  );
}

/** Other's amount to begin with: the room's own, when it is Other's. */
function firstTyped(space: Space, choice: SpendChoice): string {
  const now = spendCeilingOf(space);
  return choice === "other" && typeof now === "number" ? now.toFixed(2) : "";
}

/**
 * The five amounts and Other, the default among them, and No cap across their foot (ADR 0292),
 * where the server takes it.
 */
function Amounts({
  choice,
  target,
  noCap,
  onPick,
}: {
  readonly choice: SpendChoice;
  readonly target: SpendCeilingSetting | undefined;
  readonly noCap: boolean;
  readonly onPick: (value: SpendChoice) => void;
}) {
  const on = (value: SpendChoice) =>
    choice === value || (value === "default" && choice === DEFAULT_SPEND_CEILING_USD);
  return (
    <View style={styles.chips} accessibilityRole="radiogroup">
      {SPEND_PRESETS.map((usd) =>
        usd === DEFAULT_SPEND_CEILING_USD ? (
          <SpendChip
            key="default"
            value="default"
            label="$3"
            under="Default"
            on={on("default")}
            onPick={onPick}
          />
        ) : (
          <SpendChip key={usd} value={usd} label={`$${usd}`} on={on(usd)} onPick={onPick} />
        ),
      )}
      <SpendChip
        value="other"
        label={choice === "other" && typeof target === "number" ? dollars(target) : "Other"}
        under="An amount"
        on={on("other")}
        onPick={onPick}
      />
      {noCap ? (
        <SpendChip
          value={NO_SPEND_CEILING}
          label={NO_CAP}
          under={NO_CAP_UNDER}
          on={on(NO_SPEND_CEILING)}
          onPick={onPick}
          wide
        />
      ) : null}
    </View>
  );
}

/**
 * Other's field, with the number pad, and under it what it takes, in red once the amount typed is
 * not one: past the most, that No cap is the way to more (ADR 0292).
 */
function OtherField({
  field,
  typed,
  noCap,
  onType,
  onSubmit,
}: {
  readonly field: RefObject<TextInput | null>;
  readonly typed: string;
  readonly noCap: boolean;
  readonly onType: (typed: string) => void;
  readonly onSubmit: () => void;
}) {
  const palette = usePalette();
  const hint = typedHint(typed, noCap);
  return (
    <>
      <View style={[styles.field, { backgroundColor: palette.surface2 }]}>
        <Text style={[styles.fieldWords, styles.cur, { color: palette.ink3 }]}>$</Text>
        <TextInput
          ref={field}
          accessibilityLabel="Amount in dollars"
          testID="room-sheet-spend-amount"
          value={typed}
          onChangeText={onType}
          onSubmitEditing={onSubmit}
          // The iPad draws the decimal pad as a small keypad floating by the field; the keyboard's
          // own numbers there (11 November 2026, his word). The phone's decimal pad is its keyboard.
          keyboardType={isPad() ? "numbers-and-punctuation" : "decimal-pad"}
          returnKeyType="done"
          maxLength={8}
          placeholder="7.50"
          placeholderTextColor={palette.ink3}
          style={[styles.fieldWords, styles.amount, { color: palette.ink }]}
        />
      </View>
      <Text
        testID="room-sheet-spend-amount-hint"
        accessibilityLiveRegion={hint.wrong ? "polite" : "none"}
        style={[styles.fieldHint, { color: hint.wrong ? palette.redInk : palette.ink3 }]}
      >
        {hint.words}
      </Text>
    </>
  );
}

/** One of the amounts, Default under the default's; the one picked is ink. No cap is wide. */
function SpendChip({
  value,
  label,
  under,
  on,
  onPick,
  wide = false,
}: {
  readonly value: SpendChoice;
  readonly label: string;
  readonly under?: string;
  readonly on: boolean;
  readonly onPick: (value: SpendChoice) => void;
  /** Across the row, its name and what it means on one line. */
  readonly wide?: boolean;
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
        wide ? styles.chipWide : null,
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
  /** The amount picked, or No cap, against which nothing is measured (ADR 0292). */
  readonly against: number | typeof NO_SPEND_CEILING;
  readonly since?: string | undefined;
}) {
  const palette = usePalette();
  const spent = spend?.spent_usd;
  const capped = against !== NO_SPEND_CEILING;
  const share = spent === undefined || !capped ? 0 : Math.min(100, (100 * spent) / against);
  const uncounted = spend?.uncounted_runs ?? 0;
  return (
    <View style={styles.sofar} testID="room-sheet-spend-sofar">
      <View style={styles.sofarLine}>
        <Text style={[styles.sofarLabel, { color: palette.ink3 }]}>This job so far</Text>
        <Text style={[styles.sofarValue, { color: palette.ink }]}>
          {spent === undefined
            ? "…"
            : capped
              ? `${dollars(spent)} of ${ceilingWords(against)}`
              : dollars(spent)}
        </Text>
      </View>
      {capped ? (
        <View style={[styles.meter, { backgroundColor: palette.surface3 }]}>
          <View style={[styles.meterFill, { backgroundColor: palette.ink3, width: `${share}%` }]} />
        </View>
      ) : null}
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
  // No cap: the whole row, lower, its words side by side.
  chipWide: { flexBasis: "100%", minHeight: 48, flexDirection: "row", gap: SPACE.sm },
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
  jobsHeadLine: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    marginRight: SPACE.xs,
  },
  seeAll: { fontSize: TEXT.sm, fontWeight: "600" },
  jobsFoot: { alignItems: "center", paddingVertical: SPACE.md, textAlign: "center" },
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
