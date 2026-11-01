/**
 * A harness's own jobs on its card (ADR 0252, the mock's layout A; the phone's
 * `apps/mobile/src/harnesses/jobs/JobsGroup.tsx` on the desktop): the "Its own jobs" group under
 * what its agents share, a row for each job with how often it runs, for whom, and what it cost this
 * week, and a chevron to the job's own page (`JobPage`). What they cost this week in all stands at
 * the heading's right. Only the people who run the harness see it, and only for a harness that
 * sends its jobs.
 *
 * The last copy read is kept while the app runs, so the card drawn again shows it at once; before
 * the first, the group stands blank in its place and grows into its copy (ADR 0238). A harness that
 * has sent no jobs, or none any more (a 404), leaves no group.
 */

import {
  type Directory,
  type JobReads,
  type JobRow,
  jobRows,
  jobsFoot,
  jobsWeekWords,
  mayChangeJobs,
  nameOf,
  ServerRefused,
  type Store,
  type WorkspaceModel,
} from "@chipschat/core";
import type { HarnessJobsView, JobKind } from "@chipschat/protocol";
import { Icon, type IconName } from "@chipschat/ui";
import { type Ref, useEffect, useState } from "react";
import { recall, remember } from "../context/memory.ts";
import { useLands } from "../Waiting.tsx";

/** The store's reads and writes the group and the job's page use. */
export type JobsReads = JobReads & Pick<Store, "readJobRuns">;

/** Where the last copy read is kept, so the card or the job's page drawn again shows it at once. */
export const jobsKey = (harnessId: string) => `jobs:${harnessId}`;

/** A job's mark: what it does, on its own tile, as the phone's Settings draw theirs. */
const MARKS: Readonly<Record<JobKind, IconName>> = {
  heartbeat: "pulse",
  memory: "moon",
  skills: "sparkle",
  other: "again",
};

/**
 * A job's mark, lit in its kind's colour while it runs, the quiet grey while it is off. The colour
 * is the stylesheet's, by `data-job-kind`, which the page's bars take theirs from too.
 */
export function JobMark({
  kind,
  on,
  big = false,
}: {
  readonly kind: JobKind;
  readonly on: boolean;
  readonly big?: boolean;
}) {
  return (
    <span
      className={big ? "ctx-tile job-mark job-mark-big" : "ctx-tile job-mark"}
      data-job-kind={kind}
      data-on={on}
      aria-hidden="true"
    >
      <Icon name={MARKS[kind]} size={big ? 34 : 19} />
    </span>
  );
}

/**
 * The harness's jobs: kept from before at once, then read; whether the first read is still on its
 * way. A 404 is a harness with no jobs: nothing is kept, and nothing drawn. Anything else leaves
 * the last copy standing.
 */
export function useHarnessJobs(reads: JobsReads | undefined, harnessId: string, may: boolean) {
  const [view, setView] = useState<HarnessJobsView | undefined>(() =>
    may ? recall<HarnessJobsView>(jobsKey(harnessId)) : undefined,
  );
  const [reading, setReading] = useState(true);
  useEffect(() => {
    if (!may || reads === undefined) {
      setView(undefined);
      setReading(false);
      return;
    }
    let current = true;
    reads
      .readHarnessJobs(harnessId)
      .then(
        (read) => {
          remember(jobsKey(harnessId), read);
          if (current) setView(read);
        },
        (failure: unknown) => {
          if (!(failure instanceof ServerRefused) || failure.status !== 404) return;
          remember(jobsKey(harnessId), undefined);
          if (current) setView(undefined);
        },
      )
      .finally(() => current && setReading(false));
    return () => {
      current = false;
    };
  }, [reads, harnessId, may]);
  return { view, setView, reading };
}

export function JobsGroup({
  reads,
  model,
  directory,
  harnessId,
  selfId,
  onOpenJob,
}: {
  readonly reads: JobsReads | undefined;
  readonly model: WorkspaceModel;
  readonly directory: Directory;
  readonly harnessId: string;
  readonly selfId: string | undefined;
  readonly onOpenJob: (jobId: string) => void;
}) {
  const may =
    reads !== undefined &&
    selfId !== undefined &&
    mayChangeJobs(model, directory, harnessId, selfId);
  const { view, reading } = useHarnessJobs(reads, harnessId, may);
  const land = useLands(may && view === undefined && reading);
  if (!may) return null;
  const harness = nameOf(directory, harnessId);
  if (view === undefined) {
    return reading ? <JobsWaiting harness={harness} place={land.blank} /> : null;
  }
  if (view.jobs.length === 0) return null;
  return (
    <Jobs
      rows={jobRows(view, directory)}
      week={jobsWeekWords(view)}
      harness={harness}
      onOpen={onOpenJob}
      place={land.copy}
      lands={land.lands}
    />
  );
}

function Jobs({
  rows,
  week,
  harness,
  onOpen,
  place,
  lands,
}: {
  readonly rows: readonly JobRow[];
  readonly week: string | undefined;
  readonly harness: string;
  readonly onOpen: (jobId: string) => void;
  /** Where it lands, and whether a blank stood for it (`useLands`). */
  readonly place: Ref<HTMLElement>;
  readonly lands: boolean;
}) {
  return (
    <section
      ref={place}
      className={lands ? "ctx jobs lands" : "ctx jobs"}
      aria-label="Its own jobs"
      data-testid="jobs-group"
    >
      <div className="ctx-h">
        <h3 className="agents-h">Its own jobs</h3>
        {week !== undefined && (
          <span className="ctx-from jobs-week" data-testid="jobs-week">
            {week}
          </span>
        )}
      </div>
      <ul className="ctx-group">
        {rows.map((row) => (
          <li key={row.id}>
            <button
              type="button"
              className="ctx-row jobs-row"
              onClick={() => onOpen(row.id)}
              aria-label={[row.name, row.sub, row.value].filter((words) => words !== "").join(", ")}
              data-testid={`job-row-${row.id}`}
            >
              <JobMark kind={row.kind} on={row.on} />
              <span className="ctx-row-words">
                <span className="ctx-row-title">{row.name}</span>
                <span className="ctx-row-line" data-testid="job-row-sub">
                  {row.sub}
                </span>
              </span>
              {row.value !== "" && (
                <span
                  className="jobs-value"
                  data-saving={row.value === "Saving"}
                  data-testid="job-row-value"
                >
                  {row.value}
                </span>
              )}
              <span className="ctx-row-chev" aria-hidden="true">
                ›
              </span>
            </button>
          </li>
        ))}
      </ul>
      <p className="ctx-foot" data-testid="jobs-foot">
        {jobsFoot(harness)}
      </p>
    </section>
  );
}

/** Three blank rows in the rows' shape, and the foot's lines, while the first copy is read. */
const BLANK_ROWS = [
  [38, 52],
  [32, 46],
  [40, 58],
] as const;

function JobsWaiting({
  harness,
  place,
}: {
  readonly harness: string;
  readonly place: Ref<HTMLElement>;
}) {
  return (
    <section
      ref={place}
      className="ctx wait"
      aria-busy="true"
      aria-label={`Asking ${harness} what it runs on its own`}
      data-testid="jobs-waiting"
    >
      <div className="ctx-h">
        <h3 className="agents-h">Its own jobs</h3>
      </div>
      <ul className="ctx-group">
        {BLANK_ROWS.map(([label, sub]) => (
          <li key={`${label}-${sub}`} className="ctx-row wait-row">
            <span className="wait-mark" />
            <span className="ctx-row-words">
              <i className="wait-bar wait-label" style={{ width: `${label}%` }} />
              <i className="wait-bar wait-sub" style={{ width: `${sub}%` }} />
            </span>
            <i className="wait-bar wait-value" />
          </li>
        ))}
      </ul>
      <p className="ctx-foot wait-foot">
        <i className="wait-bar wait-line" style={{ width: "94%" }} />
        <i className="wait-bar wait-line" style={{ width: "62%" }} />
      </p>
    </section>
  );
}
