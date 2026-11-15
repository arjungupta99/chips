/**
 * What keeps a harness busy, for the computer that waits for a quiet moment to start its bridge
 * again on a new release (bridges-keep-current.md, A, step 4): a run of it going, an ask or a
 * question one of its runs is waiting on, a Compact now a person asked of one of its agents, or a
 * message in a room it or one of its agents is in, since `sinceIso`. None of them, and it is quiet.
 * What a harness does on its own (its own jobs, ADR 0252) is seen where its copy of them says a
 * run is going (`running_since`); a harness that doesn't say tells Chips only once it is over.
 *
 * A run that isn't over is going while something was heard of it lately. Nothing closes a run
 * whose bridge went away mid-run, or one paused and forgotten, so one that has said nothing for
 * six hours is no longer going on: left to count, it would hold every update back for good, and
 * tell nobody.
 */

import { type Clock, systemClock } from "@chipschat/platform";
import type { Kysely } from "kysely";
import { TERMINAL_RUN_STATES } from "../../domain/index.js";
import type { Database } from "../db/schema.js";

export type Busy = "run" | "ask" | "message";

/** How long after the last thing heard of it a run that isn't over still counts as going on. */
export const RUN_HEARD_MS = 6 * 60 * 60_000;
/**
 * The same for a paused run, where its bridge is the one asked: the bridge holds what a paused run
 * was doing, to pick up at Resume, so it is left alone for a day.
 */
export const PAUSED_HEARD_MS = 24 * 60 * 60_000;
/** How long a Compact now a person asked counts as under way, when nothing says it ended. */
export const COMPACTING_FOR_MS = 60 * 60_000;
/**
 * How long a job a harness said is running counts as running, when its copy never came again
 * without it: a bridge that stopped mid-run can't say the run ended.
 */
export const JOB_RUNNING_MS = RUN_HEARD_MS;

/**
 * Whether a run is going on: one not over that began, or was heard of in the event log, within the
 * time its state is kept for. `of`: a harness's runs only; none, any run on this computer.
 * `pausedMs` none, and a paused run isn't going on at all.
 */
async function runGoing(
  db: Kysely<Database>,
  of: { readonly workspaceId: string; readonly harnessId: string } | undefined,
  now: number,
  pausedMs: number | undefined,
): Promise<boolean> {
  const open = () => {
    const query = db.selectFrom("runs").where("runs.state", "not in", [...TERMINAL_RUN_STATES]);
    return of === undefined
      ? query
      : query
          .where("runs.workspace_id", "=", of.workspaceId)
          .where("runs.harness_id", "=", of.harnessId);
  };
  const kept: (readonly [paused: boolean, forMs: number])[] = [[false, RUN_HEARD_MS]];
  if (pausedMs !== undefined) kept.push([true, pausedMs]);
  for (const [paused, forMs] of kept) {
    const since = new Date(now - forMs).toISOString();
    const these = () => open().where("runs.state", paused ? "=" : "!=", "paused");
    const begun = await these()
      .select("runs.id")
      .where("runs.started_at", ">", since)
      .limit(1)
      .executeTakeFirst();
    if (begun !== undefined) return true;
    const heard = await these()
      .innerJoin("events", (join) =>
        join
          .onRef("events.run_id", "=", "runs.id")
          .onRef("events.workspace_id", "=", "runs.workspace_id"),
      )
      .select("runs.id")
      .where("events.appended_at", ">", since)
      .limit(1)
      .executeTakeFirst();
    if (heard !== undefined) return true;
  }
  return false;
}

/** Whether a Compact now is under way: asked or taken up, within the hour, and not said done. */
function compacting(stored: string | null, now: number): boolean {
  if (stored === null) return false;
  try {
    const { state, askedAt } = JSON.parse(stored) as { state?: unknown; askedAt?: unknown };
    const under = state === "waiting" || state === "taken";
    return under && typeof askedAt === "string" && now - Date.parse(askedAt) < COMPACTING_FOR_MS;
  } catch {
    return false;
  }
}

/** Whether a job's copy says a run of it is going: begun within the time one is believed for. */
function jobRunning(said: string, now: number): boolean {
  try {
    const { running_since: since } = JSON.parse(said) as { running_since?: unknown };
    if (typeof since !== "string") return false;
    const began = Date.parse(since);
    return !Number.isNaN(began) && now - began < JOB_RUNNING_MS;
  } catch {
    return false;
  }
}

/**
 * Whether a job a harness runs on its own is going now, as its copy says (ADR 0252). `of`: one
 * harness's jobs; none, any harness's on this computer.
 */
async function ownJobGoing(
  db: Kysely<Database>,
  of: { readonly workspaceId: string; readonly harnessId: string } | undefined,
  now: number,
): Promise<boolean> {
  const jobs = db.selectFrom("harness_jobs").select("said");
  const copies = await (of === undefined
    ? jobs
    : jobs.where("workspace_id", "=", of.workspaceId).where("harness_id", "=", of.harnessId)
  ).execute();
  return copies.some((each) => jobRunning(each.said, now));
}

export function createHarnessQuiet(
  db: Kysely<Database>,
  clock: Clock = systemClock,
): (workspaceId: string, harnessId: string, sinceIso: string) => Promise<Busy | undefined> {
  return async (workspaceId, harnessId, sinceIso) => {
    const now = clock.nowMs();
    if (await runGoing(db, { workspaceId, harnessId }, now, PAUSED_HEARD_MS)) return "run";
    // A Compact now a person asked of one of its agents leaves no run: its bridge is at work.
    const windows = await db
      .selectFrom("agent_context_windows")
      .select("compaction")
      .where("workspace_id", "=", workspaceId)
      .where("harness_id", "=", harnessId)
      .where("compaction", "is not", null)
      .execute();
    if (windows.some((each) => compacting(each.compaction, now))) return "run";
    // A job it runs on its own, going now: its bridge is what brings what it says to a room.
    if (await ownJobGoing(db, { workspaceId, harnessId }, now)) return "run";

    const asked = (table: "approvals" | "questions") =>
      db
        .selectFrom(table)
        .innerJoin("runs", (join) =>
          join
            .onRef("runs.id", "=", `${table}.run_id`)
            .onRef("runs.workspace_id", "=", `${table}.workspace_id`),
        )
        .select(`${table}.id`)
        .where(`${table}.workspace_id`, "=", workspaceId)
        .where("runs.harness_id", "=", harnessId)
        .where(`${table}.state`, "=", "pending")
        .limit(1)
        .executeTakeFirst();
    if ((await asked("approvals")) !== undefined || (await asked("questions")) !== undefined) {
      return "ask";
    }

    const message = await db
      .selectFrom("messages")
      .innerJoin("memberships", (join) =>
        join
          .onRef("memberships.space_id", "=", "messages.space_id")
          .onRef("memberships.workspace_id", "=", "messages.workspace_id"),
      )
      .innerJoin("participants", (join) =>
        join
          .onRef("participants.id", "=", "memberships.participant_id")
          .onRef("participants.workspace_id", "=", "memberships.workspace_id"),
      )
      .select("messages.id")
      .where("messages.workspace_id", "=", workspaceId)
      .where("messages.created_at", ">", sinceIso)
      .where((where) =>
        where.or([
          where("participants.id", "=", harnessId),
          where("participants.harness_id", "=", harnessId),
        ]),
      )
      .limit(1)
      .executeTakeFirst();
    return message === undefined ? undefined : "message";
  };
}

/**
 * Nothing going on anywhere on this computer, for its own update at night (everything in step,
 * phase 6) and its start again inside Chips for Mac (ADR 0298): no run going, no job a harness
 * said is running, no ask or question waiting, and no message since `sinceIso`, in any workspace. A paused run isn't going on here:
 * the server keeps it paused through its own restart, and its bridge runs on.
 */
export function createComputerQuiet(
  db: Kysely<Database>,
  clock: Clock = systemClock,
): (sinceIso: string) => Promise<Busy | undefined> {
  return async (sinceIso) => {
    if (await runGoing(db, undefined, clock.nowMs(), undefined)) return "run";
    // A harness's own job ends by telling Chips: not into a server that is starting again.
    if (await ownJobGoing(db, undefined, clock.nowMs())) return "run";
    for (const table of ["approvals", "questions"] as const) {
      const asked = await db
        .selectFrom(table)
        .select("id")
        .where("state", "=", "pending")
        .limit(1)
        .executeTakeFirst();
      if (asked !== undefined) return "ask";
    }
    const message = await db
      .selectFrom("messages")
      .select("id")
      .where("created_at", ">", sinceIso)
      .limit(1)
      .executeTakeFirst();
    return message === undefined ? undefined : "message";
  };
}
