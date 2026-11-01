/**
 * One of a harness's own jobs, on a page of its own over the harness's (ADR 0252, the mock's layout
 * A; the phone's `apps/mobile/src/harnesses/jobs/JobPage.tsx` on the desktop): its mark and name
 * large and what it does; its switch, which saves when flipped, and for a job that offers
 * intervals an Every row with them in the platform's own menu, as the Heartbeat's is; the last
 * fourteen days as a bar a day, rising from the baseline as the page opens, with what they cost in
 * all; and its runs, newest first, twenty at a time.
 *
 * A bar pointed at, or clicked to hold it, says its own day above the bars. A change is laid over
 * the copy while it waits, so the switch's line says "Saving to …" at once, and the harness's
 * answer replaces it; one that fails or isn't answered says so a moment.
 */

import {
  costWords,
  type DaysSummary,
  type Directory,
  daysSummary,
  forWords,
  JOB_DAYS,
  JOB_RUNS_PAGE,
  type JobDay,
  jobDays,
  jobDaysSince,
  jobEveryChoices,
  jobPage,
  jobSaveWords,
  mayChangeJobs,
  nameOf,
  runLine,
  saveJobChange,
  scheduleWords,
  type WorkspaceModel,
} from "@chipschat/core";
import type { HarnessJobsView, HarnessJobView, JobChangeAsk, JobRun } from "@chipschat/protocol";
import { type CSSProperties, useEffect, useMemo, useRef, useState } from "react";
import { recall, remember } from "../context/memory.ts";
import { useNow } from "../useNow.ts";
import { Choice, Switch } from "../you/controls.tsx";
import { JobMark, type JobsReads, jobsKey, useHarnessJobs } from "./JobsGroup.tsx";

/** How long a save's trouble stays under the switch. */
const SAID_MS = 4000;
/** How many runs the fourteen days are read with at most: a heartbeat's two weeks fit. */
const DAYS_READ = 500;

const daysKey = (harnessId: string, jobId: string) => `jobs:${harnessId}:${jobId}:days`;
const listKey = (harnessId: string, jobId: string) => `jobs:${harnessId}:${jobId}:runs`;

export function JobPage({
  reads,
  model,
  directory,
  harnessId,
  jobId,
  selfId,
  backLabel,
  onBack,
}: {
  readonly reads: JobsReads;
  readonly model: WorkspaceModel;
  readonly directory: Directory;
  readonly harnessId: string;
  readonly jobId: string;
  readonly selfId: string | undefined;
  readonly backLabel: string;
  readonly onBack: () => void;
}) {
  const may = selfId !== undefined && mayChangeJobs(model, directory, harnessId, selfId);
  const read = useHarnessJobs(reads, harnessId, may);
  const view = read.view;
  const job = view?.jobs.find((each) => each.job_id === jobId);
  const runs = useJobRuns(reads, harnessId, jobId, may);
  const now = useNow(30_000);

  // A job its harness no longer sends, or one the reader may no longer see: back to the harness.
  const gone = !may || (job === undefined && !read.reading);
  const back = useRef(onBack);
  back.current = onBack;
  useEffect(() => {
    if (gone) back.current();
  }, [gone]);

  const onView = (next: HarnessJobsView) => {
    remember(jobsKey(harnessId), next);
    read.setView(next);
  };

  return (
    <main
      className="conv jobs-page"
      aria-label={job?.name ?? "Its own jobs"}
      data-job-kind={job?.kind}
      data-testid="job-page"
    >
      <header className="conv-h">
        <div className="conv-h-t">
          <button type="button" className="agent-back" onClick={onBack}>
            {`‹ ${backLabel}`}
          </button>
          <h1>{job?.name ?? ""}</h1>
        </div>
      </header>
      <div className="jobs-page-scroll">
        {job !== undefined && view !== undefined && (
          <div className="jobs-page-column">
            <Hero job={job} />
            <Switching
              reads={reads}
              directory={directory}
              harnessId={harnessId}
              view={view}
              job={job}
              now={now}
              onView={onView}
            />
            <Days runs={runs.days} reading={runs.days === undefined} now={now} />
            <Runs job={job} directory={directory} runs={runs} now={now} />
            {job.kind === "heartbeat" && job.for_agents?.length === 1 && (
              <p className="ctx-foot jobs-page-foot" data-testid="job-foot">
                {`The same switch as Heartbeat on ${nameOf(directory, job.for_agents[0] ?? "")}'s page.`}
              </p>
            )}
          </div>
        )}
      </div>
    </main>
  );
}

/** Whether the job runs, as its marks show it: as asked while a change waits. */
const shownOn = (job: HarnessJobView): boolean =>
  job.change?.state === "waiting" ? job.change.on : job.on;

/** The job's mark large, its name, and what it does. */
function Hero({ job }: { readonly job: HarnessJobView }) {
  return (
    <div className="jobs-hero" data-testid="job-hero">
      <JobMark kind={job.kind} on={shownOn(job)} big />
      <h2 className="jobs-hero-name">{job.name}</h2>
      <p className="jobs-hero-about">{job.about}</p>
    </div>
  );
}

/** The switch, the Every row or when it runs, and for whom; and the save. */
function Switching({
  reads,
  directory,
  harnessId,
  view,
  job,
  now,
  onView,
}: {
  readonly reads: JobsReads;
  readonly directory: Directory;
  readonly harnessId: string;
  readonly view: HarnessJobsView;
  readonly job: HarnessJobView;
  readonly now: number;
  readonly onView: (view: HarnessJobsView) => void;
}) {
  const harness = nameOf(directory, harnessId);
  const [said, setSaid] = useState<string | undefined>(undefined);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const page = jobPage(job, harness, view.away, directory, now);
  const busy = page.quiet || page.switch.saving;
  const saving = jobSaveWords("saving", harness);
  const savingEvery = page.switch.saving && page.every?.value === saving;
  const whom = forWords(job, directory);

  const ask = async (change: JobChangeAsk) => {
    setSaid(undefined);
    onView({
      ...view,
      jobs: view.jobs.map((each) =>
        each.job_id !== job.job_id
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
    });
    const outcome = await saveJobChange(reads, harnessId, job.job_id, change, {
      alive: () => alive.current,
    });
    if (!alive.current) return;
    const next = outcome.view ?? (await reads.readHarnessJobs(harnessId).catch(() => undefined));
    if (!alive.current) return;
    if (next !== undefined) onView(next);
    if (outcome.state !== "saved") {
      setSaid(jobSaveWords(outcome.state, harness, outcome.message));
      setTimeout(() => alive.current && setSaid(undefined), SAID_MS);
    }
  };

  const choices = jobEveryChoices(job);
  return (
    <section className="ctx jobs-switching" aria-label={`${job.name} switch`}>
      <ul className="ctx-group">
        <li className="ctx-row" data-testid="job-switch-row" title={page.hint}>
          <JobMark kind={job.kind} on={page.switch.on} />
          <span className="ctx-row-words">
            <span className="ctx-row-title">{job.name}</span>
            <span
              className="ctx-row-line jobs-switch-line"
              data-saving={said === undefined && page.switch.sub === saving}
              data-testid="job-switch-sub"
            >
              {said ?? page.switch.sub}
            </span>
          </span>
          <Switch
            label={job.name}
            checked={page.switch.on}
            disabled={busy}
            onChange={(on) => void ask({ on })}
            testId="job-switch"
          />
        </li>
        {page.every?.shows === true && (
          <li className="ctx-row jobs-indent" data-testid="job-every" title={page.hint}>
            <span className="ctx-row-words">
              <span className="ctx-row-title">Every</span>
              {savingEvery && (
                <span className="ctx-row-line jobs-switch-line" data-saving="true">
                  {page.every.value}
                </span>
              )}
            </span>
            <Choice
              label="Every"
              value={String(page.every.minutes)}
              options={choices.map((choice) => [String(choice.minutes), choice.label] as const)}
              disabled={busy}
              onChange={(minutes) => {
                const every = Number(minutes);
                if (every !== page.every?.minutes) void ask({ on: true, every });
              }}
            />
          </li>
        )}
        {page.every === undefined && (
          <li className="ctx-row jobs-indent" data-testid="job-when">
            <span className="ctx-row-words">
              <span className="ctx-row-title">When</span>
            </span>
            <span className="jobs-value">{scheduleWords(job)}</span>
          </li>
        )}
        {page.every === undefined && whom !== undefined && (
          <li className="ctx-row jobs-indent" data-testid="job-for">
            <span className="ctx-row-words">
              <span className="ctx-row-title">For</span>
            </span>
            <span className="jobs-value">{whom.replace(/^for /, "")}</span>
          </li>
        )}
      </ul>
      {page.hint !== undefined && (
        <p className="ctx-foot" data-testid="job-hint">
          {page.hint}
        </p>
      )}
    </section>
  );
}

/** A job's runs: the fourteen days' for the bars, and the list, a page at a time. */
interface RunsRead {
  /** The last fourteen days' runs, newest first; nothing until the first read. */
  readonly days: readonly JobRun[] | undefined;
  /** The runs listed: the newest, then each page "Show more" read; nothing until the first. */
  readonly listed: readonly JobRun[] | undefined;
  /** Where the runs the last "Show more" brought begin, for them to rise in. */
  readonly freshFrom: number;
  readonly more: boolean;
  readonly loadMore: () => void;
  readonly loadingMore: boolean;
}

interface Listed {
  readonly runs: readonly JobRun[];
  readonly more: boolean;
}

function useJobRuns(reads: JobsReads, harnessId: string, jobId: string, may: boolean): RunsRead {
  const [days, setDays] = useState<readonly JobRun[] | undefined>(() =>
    recall(daysKey(harnessId, jobId)),
  );
  const [listed, setListed] = useState<Listed | undefined>(() => recall(listKey(harnessId, jobId)));
  const [freshFrom, setFreshFrom] = useState(Number.POSITIVE_INFINITY);
  const [loadingMore, setLoadingMore] = useState(false);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    if (!may) return;
    let current = true;
    reads.readJobRuns(harnessId, jobId, { since: jobDaysSince(Date.now()), limit: DAYS_READ }).then(
      (read) => {
        remember(daysKey(harnessId, jobId), read.runs);
        if (current) setDays(read.runs);
      },
      () => current && setDays((was) => was ?? []),
    );
    reads.readJobRuns(harnessId, jobId, { limit: JOB_RUNS_PAGE }).then(
      (read) => {
        const first = { runs: read.runs, more: read.more };
        remember(listKey(harnessId, jobId), first);
        if (current) setListed(first);
      },
      () => current && setListed((was) => was ?? { runs: [], more: false }),
    );
    return () => {
      current = false;
      alive.current = false;
    };
  }, [reads, harnessId, jobId, may]);

  const loadMore = () => {
    const had = listed?.runs ?? [];
    const last = had.at(-1);
    if (last === undefined || loadingMore) return;
    setLoadingMore(true);
    reads
      .readJobRuns(harnessId, jobId, { before: last.started_at, limit: JOB_RUNS_PAGE })
      .then(
        (read) => {
          if (!alive.current) return;
          const known = new Set(had.map((run) => run.run_id));
          setFreshFrom(had.length);
          setListed({
            runs: [...had, ...read.runs.filter((run) => !known.has(run.run_id))],
            more: read.more,
          });
        },
        () => undefined,
      )
      .finally(() => alive.current && setLoadingMore(false));
  };

  return {
    days,
    listed: listed?.runs,
    freshFrom,
    more: listed?.more ?? false,
    loadMore,
    loadingMore,
  };
}

/** The last fourteen days: what they cost in all over a bar a day; a bar pointed at says its day. */
function Days({
  runs,
  reading,
  now,
}: {
  readonly runs: readonly JobRun[] | undefined;
  readonly reading: boolean;
  readonly now: number;
}) {
  const days = useMemo(() => jobDays(runs ?? [], now), [runs, now]);
  const summary = useMemo(() => daysSummary(days, runs ?? []), [days, runs]);
  const [held, setHeld] = useState<number | undefined>(undefined);
  const [pointed, setPointed] = useState<number | undefined>(undefined);
  const shown = pointed ?? held;
  const middle = Math.floor(days.length / 2);
  return (
    <section className="ctx jobs-days-group" aria-label={`Last ${JOB_DAYS} days`}>
      <div className="ctx-h">
        <h3 className="agents-h">{`Last ${JOB_DAYS} days`}</h3>
      </div>
      <div
        className="jobs-days"
        style={{ "--days": days.length } as CSSProperties}
        data-testid="job-days"
      >
        <Summary
          summary={summary}
          day={shown === undefined ? undefined : days[shown]}
          ready={!reading}
        />
        <Bars
          days={days}
          shown={shown}
          held={held}
          ready={!reading}
          onHold={(at) => setHeld((was) => (was === at ? undefined : at))}
          onPoint={setPointed}
        />
        <div className="jobs-axis" aria-hidden="true">
          <span style={{ gridColumn: 1, justifySelf: "start" }}>{days[0]?.label}</span>
          <span style={{ gridColumn: middle + 1, justifySelf: "center" }}>
            {days[middle]?.label}
          </span>
          <span style={{ gridColumn: days.length, justifySelf: "end" }}>{days.at(-1)?.label}</span>
        </div>
      </div>
    </section>
  );
}

/** A day in words: how many runs and, when it is known, what they cost. */
const runsWords = (runs: number) => `${runs} ${runs === 1 ? "run" : "runs"}`;

function Summary({
  summary,
  day,
  ready,
}: {
  readonly summary: DaysSummary;
  readonly day: JobDay | undefined;
  readonly ready: boolean;
}) {
  if (!ready) {
    return (
      <div className="jobs-sum" aria-busy="true">
        <i className="wait-bar jobs-sum-blank" />
      </div>
    );
  }
  const big =
    day === undefined ? summary.total : day.usd === undefined ? `${day.runs}` : costWords(day.usd);
  const small =
    day === undefined
      ? summary.sub
      : `${day.label} · ${runsWords(day.runs)}${day.usd === undefined && day.runs > 0 ? " · cost not known" : ""}`;
  return (
    <div className="jobs-sum" aria-live="polite" data-testid="job-summary">
      <span className="jobs-total" data-testid="job-total">
        {big}
      </span>
      <span className="jobs-total-sub" data-testid="job-total-sub">
        {small}
      </span>
    </div>
  );
}

/**
 * A bar a day, its height what the day cost beside the dearest one, or, for a job whose runs carry
 * no cost, how many runs beside the most; a stub for a day whose runs were free, and a dot for a day
 * with no run. The newest day that ran is lit, or the one pointed at or held.
 */
function Bars({
  days,
  shown,
  held,
  ready,
  onHold,
  onPoint,
}: {
  readonly days: readonly JobDay[];
  readonly shown: number | undefined;
  readonly held: number | undefined;
  readonly ready: boolean;
  readonly onHold: (at: number) => void;
  readonly onPoint: (at: number | undefined) => void;
}) {
  const top = Math.max(...days.map((day) => day.usd ?? 0), 0);
  const most = Math.max(...days.map((day) => day.runs), 1);
  const priced = top > 0;
  const newest = days.reduce((last, day, at) => (day.runs > 0 ? at : last), -1);
  const lit = shown ?? newest;
  return (
    <div className="jobs-bars" data-ready={ready} data-testid="job-bars">
      {days.map((day, at) => {
        if (day.runs === 0) {
          return (
            <span
              key={day.at}
              className="jobs-day"
              data-none="true"
              title={`${day.label} · 0 runs`}
            >
              <i className="jobs-dot" />
            </span>
          );
        }
        const free = day.usd === 0;
        const share = priced ? (day.usd ?? 0) / top : day.runs / most;
        const label = `${day.label}: ${runsWords(day.runs)}${day.usd === undefined ? "" : `, ${costWords(day.usd)}`}`;
        return (
          <button
            key={day.at}
            type="button"
            className="jobs-day"
            data-lit={at === lit}
            data-free={free}
            style={{ "--h": `${Math.max(share, 0.06) * 100}%`, "--i": at } as CSSProperties}
            aria-label={label}
            aria-pressed={held === at}
            title={label}
            onClick={() => onHold(at)}
            onMouseEnter={() => onPoint(at)}
            onMouseLeave={() => onPoint(undefined)}
            onFocus={() => onPoint(at)}
            onBlur={() => onPoint(undefined)}
          >
            <i className="jobs-bar" />
          </button>
        );
      })}
    </div>
  );
}

/** Its runs, newest first: when, how long and how it went, and what each cost. */
function Runs({
  job,
  directory,
  runs,
  now,
}: {
  readonly job: HarnessJobView;
  readonly directory: Directory;
  readonly runs: RunsRead;
  readonly now: number;
}) {
  const listed = runs.listed;
  if (listed === undefined) return null;
  return (
    <section className="ctx jobs-runs-group" aria-label="Runs">
      <div className="ctx-h">
        <h3 className="agents-h">{job.kind === "heartbeat" ? "Checks" : "Runs"}</h3>
        <span className="ctx-from jobs-week" data-testid="job-runs-total">
          {`${job.runs_total} in all`}
        </span>
      </div>
      {listed.length === 0 ? (
        <p className="ctx-foot" data-testid="job-runs-none">{`${job.name} hasn't run yet.`}</p>
      ) : (
        <ul className="ctx-group jobs-runs" data-testid="job-runs">
          {listed.map((run, at) => {
            const line = runLine(run, job, directory, now);
            // `runLine`'s sub opens with how long it took; how it went follows, in its tone.
            const [took, ...rest] = line.sub.split(" · ");
            const went = rest.join(" · ");
            const fresh = at >= runs.freshFrom;
            return (
              <li
                key={run.run_id}
                className="ctx-row jobs-run"
                data-fresh={fresh || undefined}
                style={fresh ? ({ "--k": at - runs.freshFrom } as CSSProperties) : undefined}
                aria-label={`${line.when}, ${line.sub}, ${line.cost === "—" ? "cost not known" : line.cost}`}
                data-testid={`job-run-${run.run_id}`}
              >
                <span className="jobs-run-dot" data-tone={line.tone} aria-hidden="true" />
                <span className="ctx-row-words">
                  <span className="jobs-run-when">{line.when}</span>
                  <span className="ctx-row-line">
                    {took}
                    {went !== "" && (
                      <>
                        {" · "}
                        <span className="jobs-run-went" data-tone={line.tone}>
                          {went}
                        </span>
                      </>
                    )}
                  </span>
                </span>
                <span className="jobs-run-cost">{line.cost}</span>
              </li>
            );
          })}
          {runs.more && (
            <li>
              <button
                type="button"
                className="ctx-row jobs-more"
                onClick={runs.loadMore}
                disabled={runs.loadingMore}
                aria-busy={runs.loadingMore}
                data-testid="job-runs-more"
              >
                {runs.loadingMore ? "Reading…" : "Show more"}
              </button>
            </li>
          )}
        </ul>
      )}
    </section>
  );
}
