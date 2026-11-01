/**
 * One of a harness's own jobs (ADR 0252, the mock's layout A): its mark and name large and what it
 * does; its switch, which saves when flipped, and for a job that offers intervals an Every row that
 * opens them; the last fourteen days as a bar a day with what they cost in all; and its runs,
 * newest first, each with how long it took, how it went and what it cost.
 *
 * A change is laid over the copy while it waits, so the switch's line says "Saving to …" at once,
 * and the harness's answer replaces it; one that fails or isn't answered says so a moment.
 */

import {
  costWords,
  type DaysSummary,
  daysSummary,
  forWords,
  JOB_RUNS_PAGE,
  type JobDay,
  type JobPage as JobPageWords,
  jobDays,
  jobDaysSince,
  jobEveryChoices,
  jobPage,
  jobSaveWords,
  mayChangeJobs,
  nameOf,
  type RunLine,
  runLine,
  type Snapshot,
  type Store,
  saveJobChange,
  scheduleWords,
} from "@chipschat/core";
import type { HarnessJobsView, HarnessJobView, JobChangeAsk, JobRun } from "@chipschat/protocol";
import { useEffect, useMemo, useRef, useState } from "react";
import { ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { NotFound } from "../../agents/Arriving";
import { EverySheet } from "../../agents/heartbeat/EverySheet";
import { remember } from "../../context/memory";
import { Group, GroupFoot, GroupHeading, GroupRow, MARKED_INSET } from "../../ui/Group";
import * as feel from "../../ui/haptics";
import { Icon } from "../../ui/Icon";
import { useColumn } from "../../ui/Screen";
import { usePalette } from "../../ui/theme";
import { SPACE, TEXT } from "../../ui/tokens";
import { DayBars } from "./DayBars";
import { JobMark, jobsKey, markIcon, markTint, useHarnessJobs } from "./JobsGroup";

/** How long a save's trouble stays under the switch. */
const SAID_MS = 4000;
/** How many runs the fourteen days are read with at most: a heartbeat's two weeks fit. */
const DAYS_READ = 500;

export function JobPage({
  store,
  snapshot,
  harnessId,
  jobId,
  selfId,
  focus,
}: {
  readonly store: Store;
  readonly snapshot: Snapshot;
  readonly harnessId: string;
  readonly jobId: string;
  readonly selfId: string | undefined;
  /** How many times the page has come to the front: each time, the job is read again. */
  readonly focus: number;
}) {
  const column = useColumn();
  const may =
    selfId !== undefined && mayChangeJobs(snapshot.model, snapshot.directory, harnessId, selfId);
  const read = useHarnessJobs(store, harnessId, may, focus);
  const [view, setView] = useState<HarnessJobsView | undefined>(read.view);
  useEffect(() => setView(read.view), [read.view]);
  const job = view?.jobs.find((each) => each.job_id === jobId);
  const runs = useJobRuns(store, harnessId, jobId, may, focus);

  if (!may || (job === undefined && !read.reading)) {
    return <NotFound snapshot={snapshot} what="job" />;
  }
  if (job === undefined || view === undefined) return null;
  return (
    <ScrollView contentContainerStyle={[styles.body, column]} testID="job-page">
      <Hero job={job} />
      <Switching
        store={store}
        snapshot={snapshot}
        harnessId={harnessId}
        view={view}
        job={job}
        onView={(next) => {
          remember(jobsKey(harnessId), next);
          setView(next);
        }}
      />
      <Days runs={runs.days} job={job} reading={runs.reading} />
      <Runs job={job} snapshot={snapshot} runs={runs} />
      {job.kind === "heartbeat" && job.for_agents?.length === 1 ? (
        <GroupFoot>
          {`The same switch as Heartbeat on ${nameOf(snapshot.directory, job.for_agents[0] ?? "")}'s page.`}
        </GroupFoot>
      ) : null}
    </ScrollView>
  );
}

/** The job's mark large, its name, and what it does. */
function Hero({ job }: { readonly job: HarnessJobView }) {
  const palette = usePalette();
  const { tint, ink } = markTint(job.kind, palette);
  const on = job.change?.state === "waiting" ? job.change.on : job.on;
  return (
    <View style={styles.hero} accessible accessibilityRole="header" testID="job-hero">
      <View style={[styles.heroMark, { backgroundColor: on ? tint : palette.surface3 }]}>
        <Icon name={markIcon(job.kind)} size={34} color={on ? ink : palette.ink3} />
      </View>
      <Text style={[styles.heroName, { color: palette.ink }]}>{job.name}</Text>
      <Text style={[styles.heroAbout, { color: palette.ink2 }]}>{job.about}</Text>
    </View>
  );
}

/** The switch, the Every row or when it runs, and for whom; and the save. */
function Switching({
  store,
  snapshot,
  harnessId,
  view,
  job,
  onView,
}: {
  readonly store: Store;
  readonly snapshot: Snapshot;
  readonly harnessId: string;
  readonly view: HarnessJobsView;
  readonly job: HarnessJobView;
  readonly onView: (view: HarnessJobsView) => void;
}) {
  const palette = usePalette();
  const harness = nameOf(snapshot.directory, harnessId);
  const [picking, setPicking] = useState(false);
  const { said, ask } = useJobSave(store, harnessId, view, job, harness, onView);
  const page = jobPage(job, harness, view.away, snapshot.directory, Date.now());
  const busy = page.quiet || page.switch.saving;
  const whom = forWords(job, snapshot.directory);

  return (
    <View>
      <Group inset={MARKED_INSET} testID="job-switch-group">
        <GroupRow
          label={job.name}
          sub={said ?? page.switch.sub}
          mark={<JobMark kind={job.kind} on={page.switch.on} />}
          trailing={
            <Switch
              testID="job-switch"
              accessibilityLabel={job.name}
              accessibilityHint={page.hint}
              value={page.switch.on}
              disabled={busy}
              onValueChange={(on) =>
                void ask(page.every === undefined ? { on } : { on, every: page.every.minutes })
              }
            />
          }
          testID="job-switch-row"
        />
        <Timing
          page={page}
          job={job}
          whom={whom}
          onEvery={busy ? undefined : () => setPicking(true)}
        />
      </Group>
      {page.hint === undefined ? null : (
        <GroupFoot tone={palette.ink3} testID="job-hint">
          {page.hint}
        </GroupFoot>
      )}
      <EverySheet
        open={picking}
        agentName={whom === undefined ? harness : whom.replace(/^for /, "")}
        choices={jobEveryChoices(job)}
        {...(job.kind === "heartbeat"
          ? {}
          : { body: `How often ${harness} runs ${job.name}.`, foot: "More often costs more." })}
        onClose={() => setPicking(false)}
        onPick={(minutes) => {
          setPicking(false);
          if (minutes !== page.every?.minutes) void ask({ on: true, every: minutes });
        }}
      />
    </View>
  );
}

/**
 * How often it runs: an Every row that opens the intervals, for a job that offers them while it is
 * on; else when it runs, and for whom.
 */
function Timing({
  page,
  job,
  whom,
  onEvery,
}: {
  readonly page: JobPageWords;
  readonly job: HarnessJobView;
  readonly whom: string | undefined;
  readonly onEvery: (() => void) | undefined;
}) {
  if (page.every !== undefined) {
    return page.every.shows ? (
      <GroupRow
        label="Every"
        value={page.every.value}
        tone={page.quiet ? "quiet" : "plain"}
        onPress={onEvery}
        accessibilityHint="Shows how often it can run"
        testID="job-every"
      />
    ) : null;
  }
  return (
    <>
      <GroupRow label="When" value={scheduleWords(job)} testID="job-when" />
      {whom === undefined ? null : (
        <GroupRow label="For" value={whom.replace(/^for /, "")} testID="job-for" />
      )}
    </>
  );
}

/**
 * Saving a change to the job: laid over the copy at once as waiting, then the harness's answer in
 * its place; a change that fails or isn't answered says so under the switch a moment.
 */
function useJobSave(
  store: Store,
  harnessId: string,
  view: HarnessJobsView,
  job: HarnessJobView,
  harness: string,
  onView: (view: HarnessJobsView) => void,
) {
  const [said, setSaid] = useState<string | undefined>(undefined);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const ask = async (change: JobChangeAsk) => {
    setSaid(undefined);
    onView(asking(view, job.job_id, change));
    const outcome = await saveJobChange(store, harnessId, job.job_id, change, {
      alive: () => alive.current,
    });
    if (!alive.current) return;
    const now = outcome.view ?? (await store.readHarnessJobs(harnessId).catch(() => undefined));
    if (!alive.current) return;
    if (now !== undefined) onView(now);
    if (outcome.state !== "saved") {
      feel.warning();
      setSaid(jobSaveWords(outcome.state, harness, outcome.message));
      setTimeout(() => alive.current && setSaid(undefined), SAID_MS);
    }
  };
  return { said, ask };
}

/** The copy with a change to one job laid over it, waiting for the harness. */
function asking(view: HarnessJobsView, jobId: string, change: JobChangeAsk): HarnessJobsView {
  return {
    ...view,
    jobs: view.jobs.map((each) =>
      each.job_id !== jobId
        ? each
        : {
            ...each,
            change: {
              change_id: "chg_asking",
              state: "waiting",
              on: change.on,
              ...(change.every === undefined ? {} : { every: change.every }),
              asked_at: new Date().toISOString(),
            },
          },
    ),
  };
}

interface RunsRead {
  /** The last fourteen days' runs, newest first. */
  readonly days: readonly JobRun[];
  /** The runs listed: the newest, then each page "Show more" read. */
  readonly listed: readonly JobRun[];
  readonly more: boolean;
  readonly reading: boolean;
  readonly loadMore: () => void;
  readonly loadingMore: boolean;
}

/** A job's runs: the fourteen days' at once, then older ones a page at a time. */
function useJobRuns(
  store: Store,
  harnessId: string,
  jobId: string,
  may: boolean,
  focus: number,
): RunsRead {
  const [days, setDays] = useState<readonly JobRun[]>([]);
  const [older, setOlder] = useState<readonly JobRun[]>([]);
  const [daysMore, setDaysMore] = useState(false);
  const [olderMore, setOlderMore] = useState<boolean | undefined>(undefined);
  const [reading, setReading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: `focus` is when to read it again.
  useEffect(() => {
    if (!may) return;
    let current = true;
    store
      .readJobRuns(harnessId, jobId, { since: jobDaysSince(Date.now()), limit: DAYS_READ })
      .then(
        (read) => {
          if (!current) return;
          setDays(read.runs);
          setDaysMore(read.more);
          setOlder([]);
          setOlderMore(undefined);
        },
        () => undefined,
      )
      .finally(() => current && setReading(false));
    return () => {
      current = false;
    };
  }, [store, harnessId, jobId, may, focus]);

  const shown = useMemo(() => [...days, ...older], [days, older]);
  const [count, setCount] = useState(JOB_RUNS_PAGE);
  const listed = shown.slice(0, count);
  const loadMore = () => {
    if (count < shown.length) {
      setCount(count + JOB_RUNS_PAGE);
      return;
    }
    const last = shown.at(-1);
    if (last === undefined || loadingMore) return;
    setLoadingMore(true);
    store
      .readJobRuns(harnessId, jobId, { before: last.started_at, limit: JOB_RUNS_PAGE })
      .then(
        (read) => {
          setOlder((was) => [...was, ...read.runs]);
          setOlderMore(read.more);
          setCount(count + JOB_RUNS_PAGE);
        },
        () => undefined,
      )
      .finally(() => setLoadingMore(false));
  };
  const more = count < shown.length || (olderMore ?? (daysMore || shown.length > 0));
  return { days, listed, more, reading, loadMore, loadingMore };
}

/** The last fourteen days: what they cost in all over a bar a day; a bar tapped says its day. */
function Days({
  runs,
  job,
  reading,
}: {
  readonly runs: readonly JobRun[];
  readonly job: HarnessJobView;
  readonly reading: boolean;
}) {
  const palette = usePalette();
  const days = useMemo(() => jobDays(runs, Date.now()), [runs]);
  const summary = useMemo(() => daysSummary(days, runs), [days, runs]);
  const [picked, setPicked] = useState<number | undefined>(undefined);
  const day = picked === undefined ? undefined : days[picked];
  const { tint } = markTint(job.kind, palette);
  return (
    <View>
      <GroupHeading>Last 14 days</GroupHeading>
      <View style={[styles.card, { backgroundColor: palette.surface }]} testID="job-days">
        <Summary summary={summary} day={day} />
        <DayBars
          days={days}
          tint={tint}
          ready={!reading}
          picked={picked}
          onPick={(at) => setPicked(at === picked ? undefined : at)}
        />
        <View style={styles.axis}>
          {[0, 7, 13].map((at) => (
            <Text key={at} style={[styles.axisWord, { color: palette.ink4 }]}>
              {days[at]?.label}
            </Text>
          ))}
        </View>
      </View>
    </View>
  );
}

function Summary({
  summary,
  day,
}: {
  readonly summary: DaysSummary;
  readonly day: JobDay | undefined;
}) {
  const palette = usePalette();
  const big =
    day === undefined ? summary.total : day.usd === undefined ? `${day.runs}` : costWords(day.usd);
  const small =
    day === undefined
      ? summary.sub
      : `${day.label} · ${day.runs} ${day.runs === 1 ? "run" : "runs"}${day.usd === undefined && day.runs > 0 ? " · cost not known" : ""}`;
  return (
    <View style={styles.summary} accessible accessibilityLiveRegion="polite" testID="job-summary">
      <Text style={[styles.total, { color: palette.ink }]}>{big}</Text>
      <Text style={[styles.totalSub, { color: palette.ink3 }]}>{small}</Text>
    </View>
  );
}

/** Its runs, newest first, and a row for the next page while there are more. */
function Runs({
  job,
  snapshot,
  runs,
}: {
  readonly job: HarnessJobView;
  readonly snapshot: Snapshot;
  readonly runs: RunsRead;
}) {
  const palette = usePalette();
  const now = Date.now();
  if (runs.reading && runs.listed.length === 0) return null;
  return (
    <View>
      <GroupHeading
        trailing={
          <Text style={[styles.inAll, { color: palette.ink3 }]}>{`${job.runs_total} in all`}</Text>
        }
      >
        {job.kind === "heartbeat" ? "Checks" : "Runs"}
      </GroupHeading>
      {runs.listed.length === 0 ? (
        <GroupFoot>{`${job.name} hasn't run yet.`}</GroupFoot>
      ) : (
        <Group inset={SPACE.lg + 7 + SPACE.md} testID="job-runs">
          {runs.listed.map((run) => (
            <RunRow
              key={run.run_id}
              line={runLine(run, job, snapshot.directory, now)}
              id={run.run_id}
            />
          ))}
          {runs.more ? (
            <GroupRow
              label={runs.loadingMore ? "Reading…" : "Show more"}
              tone="accent"
              onPress={runs.loadingMore ? undefined : runs.loadMore}
              testID="job-runs-more"
            />
          ) : null}
        </Group>
      )}
    </View>
  );
}

/** One run: a dot for how it went, when, what it did and how long it took, and what it cost. */
function RunRow({ line, id }: { readonly line: RunLine; readonly id: string }) {
  const palette = usePalette();
  const dot = { ok: palette.green, warn: palette.amber, bad: palette.red }[line.tone];
  return (
    <View
      style={styles.run}
      accessible
      accessibilityLabel={`${line.when}, ${line.sub}, ${line.cost === "—" ? "cost not known" : line.cost}`}
      testID={`job-run-${id}`}
    >
      <View style={[styles.dot, { backgroundColor: dot }]} />
      <View style={styles.runWords}>
        <Text style={[styles.runWhen, { color: palette.ink }]} numberOfLines={1}>
          {line.when}
        </Text>
        <Text
          style={[styles.runSub, { color: line.tone === "ok" ? palette.ink3 : palette.amberInk }]}
          numberOfLines={2}
        >
          {line.sub}
        </Text>
      </View>
      <Text style={[styles.cost, { color: palette.ink2 }]}>{line.cost}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { paddingBottom: SPACE.xxl * 3 },
  hero: {
    alignItems: "center",
    paddingHorizontal: SPACE.xxl + SPACE.sm,
    paddingTop: SPACE.lg,
    gap: SPACE.sm,
  },
  heroMark: {
    width: 66,
    height: 66,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  heroName: { fontSize: TEXT.xl + 4, fontWeight: "700", letterSpacing: -0.3, marginTop: SPACE.xs },
  heroAbout: {
    fontSize: TEXT.md,
    lineHeight: TEXT.md * 1.42,
    textAlign: "center",
    marginBottom: SPACE.sm,
  },
  card: { marginHorizontal: SPACE.lg, borderRadius: 22, padding: SPACE.lg, gap: SPACE.md },
  summary: { flexDirection: "row", alignItems: "baseline", gap: SPACE.sm, flexWrap: "wrap" },
  total: { fontSize: 30, fontWeight: "700", letterSpacing: -0.6, fontVariant: ["tabular-nums"] },
  totalSub: { fontSize: TEXT.sm, fontWeight: "500" },
  axis: { flexDirection: "row", justifyContent: "space-between", marginTop: -SPACE.xs },
  axisWord: { fontSize: TEXT.xs - 1 },
  inAll: { fontSize: TEXT.sm, fontWeight: "500", fontVariant: ["tabular-nums"] },
  run: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACE.md,
    paddingHorizontal: SPACE.lg,
    paddingVertical: SPACE.sm + 2,
    minHeight: 52,
  },
  dot: { width: 7, height: 7, borderRadius: 4 },
  runWords: { flex: 1, minWidth: 0 },
  runWhen: { fontSize: TEXT.md + 0.5 },
  runSub: { fontSize: TEXT.sm, marginTop: 1 },
  cost: { fontSize: TEXT.md, fontVariant: ["tabular-nums"] },
});
