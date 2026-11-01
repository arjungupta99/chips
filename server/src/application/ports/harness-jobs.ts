/**
 * The jobs registry (ADR 0252): a harness's copy of the jobs it runs on its own, the last change a
 * person asked of each, and each job's runs. A registry, not a projection, as heartbeats are (ADR
 * 0143): a change goes down a harness's socket once, and a run is the harness's to say.
 */

import type { HarnessJob, JobChangeState, JobRun } from "@chipschat/protocol";

/** As stored: `missed` is read from `askedAt`, never written. */
export type StoredJobChangeState = Exclude<JobChangeState, "missed">;

/** A person's change of one job, and what became of it. */
export interface JobChange {
  readonly id: string;
  readonly on: boolean;
  /** In minutes, for a job with choices: the copy's own when the person named none. */
  readonly every: number | null;
  readonly askedBy: string;
  readonly askedAt: string;
  readonly state: StoredJobChangeState;
  readonly message: string | null;
  readonly answeredAt: string | null;
}

export interface KeptJob {
  readonly workspaceId: string;
  readonly harnessId: string;
  /** As the harness sent it. */
  readonly said: HarnessJob;
  readonly readAt: string;
  /** The last change asked, or `null` before any. */
  readonly change: JobChange | null;
}

/** What Chips counted of a job's runs. */
export interface JobRunCounts {
  /** What the runs since `since` cost: `null` when none of them had a cost. */
  readonly sinceUsd: number | null;
  readonly sinceRuns: number;
  /** Every run held. */
  readonly total: number;
  readonly last: JobRun | undefined;
}

export interface HarnessJobRegistry {
  /**
   * Replace a harness's copy whole, as it sent it: a job kept keeps its change, and a job left
   * out is forgotten with its runs.
   */
  readonly put: (input: {
    readonly workspaceId: string;
    readonly harnessId: string;
    readonly jobs: readonly HarnessJob[];
    readonly readAt: string;
  }) => Promise<void>;
  /** The harness's jobs in the order its copy lists them: none before it sends one. */
  readonly list: (workspaceId: string, harnessId: string) => Promise<readonly KeptJob[]>;
  /** Keep a change as the job's last, in place of the one before. */
  readonly ask: (
    workspaceId: string,
    harnessId: string,
    jobId: string,
    change: JobChange,
  ) => Promise<void>;
  /**
   * Close the change the harness answered, on whichever of its jobs it waits: answers whether one
   * did.
   */
  readonly answer: (input: {
    readonly workspaceId: string;
    readonly harnessId: string;
    readonly changeId: string;
    readonly state: Exclude<StoredJobChangeState, "waiting">;
    readonly message: string | null;
    readonly at: string;
  }) => Promise<boolean>;
  /** Keep runs as the harness posted them, a run posted again in place of the one before. */
  readonly addRuns: (
    workspaceId: string,
    harnessId: string,
    runs: readonly JobRun[],
  ) => Promise<void>;
  /** A job's runs, newest first: started at or after `since` and before `before`. */
  readonly runs: (
    workspaceId: string,
    harnessId: string,
    jobId: string,
    window: { readonly since?: string; readonly before?: string; readonly limit: number },
  ) => Promise<{ readonly runs: readonly JobRun[]; readonly more: boolean }>;
  /** Each job's counts, by job id, with what its runs since `since` cost. */
  readonly counts: (
    workspaceId: string,
    harnessId: string,
    since: string,
  ) => Promise<ReadonlyMap<string, JobRunCounts>>;
  /** Forget a harness's runs that started before `before`. */
  readonly prune: (workspaceId: string, harnessId: string, before: string) => Promise<void>;
  /** Forget a harness's jobs and their runs: the harness was removed. */
  readonly removeHarness: (workspaceId: string, harnessId: string) => Promise<void>;
}
