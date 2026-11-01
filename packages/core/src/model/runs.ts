/** A run from its first steer to its last word, with its steps, usage and checkpoints. */

import { isNoReply, type StepKind, stepKind } from "@chipschat/protocol";
import { type ClientEvent, harnessOfActor } from "../events.js";
import { addLine, closeOnLastSaid, textLine } from "./lines.js";
import { policyFor } from "./policy.js";
import { settleChanges } from "./project.js";
import {
  type Building,
  type FoldStep,
  field,
  type MutableRun,
  required,
  runOf,
  sessionOf,
  spaceOf,
  TERMINAL,
} from "./state.js";
import type { AuditEntry, Run, SteerMode, Step, StepStatus } from "./types.js";

/**
 * A status that is a single word and its ellipsis, `Writing…`: Jacobian's typing indicator, sent
 * before every tool call and gone in seventeen milliseconds, which the thinking bubble does not
 * read as a thought (ADR 0147).
 */
const PING = /^\p{L}+(?:…|\.{3})$/u;

/** What a run that ended on `NO_REPLY` says it did, where its summary is shown (ADR 0105). */
const NOTHING_TO_ADD = "Had nothing to add.";

export function runAudit(event: ClientEvent, what: string): AuditEntry {
  return {
    seq: event.seq,
    ts: event.ts,
    kind: "run",
    who: field<string>(event, "by") ?? event.actor.id,
    what,
    spaceId: event.space_id,
    runId: event.run_id,
    reason: field<string>(event, "reason"),
  };
}

export function plannedSteps(plan: readonly { step_id: string; title: string }[]): Step[] {
  return plan.map((step) => ({
    stepId: step.step_id,
    title: step.title,
    status: "planned",
    planned: true,
  }));
}

/**
 * A tick on the rail, at the point the run had reached: after the last step that has begun,
 * before the ones still to come. Behaviour changes after a compaction, so the rail says where.
 */
export function tick(run: MutableRun, event: ClientEvent, title: string): void {
  const begun = run.steps.map((step) => step.status !== "planned").lastIndexOf(true);
  const mark: Step = {
    stepId: `tick:${event.seq}`,
    title,
    status: "done",
    kind: "tick",
    startedAt: event.ts,
    endedAt: event.ts,
  };
  run.steps.splice(begun + 1, 0, mark);
}

export function contextPercentOf(run: MutableRun): number | undefined {
  const { contextUsed, contextLimit } = run;
  if (contextUsed === undefined || contextLimit === undefined || contextLimit <= 0)
    return undefined;
  return Math.min(100, Math.round((contextUsed / contextLimit) * 100));
}

/**
 * A run as the screens read it: the one handed out last time while nothing in it has changed, a
 * new one when anything has.
 *
 * A space is frozen again for every event in it, and its runs with it. Made afresh each time,
 * every run in the room was a new object on every event — the server's answer to a send, a
 * harness starting its run — and every line that closed a run was drawn again with it, its words
 * parsed again, sixteen of them for each event in a room of fifteen replies (the simulator, 4
 * October 2026). Kept while it says the same thing, a line is drawn again only for its own run.
 *
 * The fold changes a run's lists in place, an element at a time, so what is handed out holds
 * copies of them, and "the same" is element by element: a list that grew, or had an element
 * replaced, is a new run.
 */
export function freezeRun(state: Building, run: MutableRun): Run {
  const now: Run = {
    questions: run.questions,
    policy: policyFor(state, run.harness, run.spaceId),
    runId: run.runId,
    lastSeq: run.lastSeq,
    spaceId: run.spaceId,
    harnessId: run.harnessId,
    goal: run.goal,
    state: run.state,
    paused: run.paused,
    statusVerb: run.statusVerb,
    thought: run.thought,
    steps: run.steps,
    summary: run.summary,
    error: run.error,
    approvals: run.approvals,
    costUsd: run.costUsd,
    inputTokens: run.inputTokens,
    cacheReadTokens: run.cacheReadTokens,
    cacheWriteTokens: run.cacheWriteTokens,
    outputTokens: run.outputTokens,
    contextUsed: run.contextUsed,
    contextLimit: run.contextLimit,
    model: run.model,
    startedAt: run.startedAt,
    endedAt: run.endedAt,
    sessionRef: run.sessionRef,
    goalFrom: run.goalFrom,
  };
  const was = state.frozenRuns.get(run.runId);
  if (was !== undefined && sameRun(was, now)) return was;
  const frozen: Run = {
    ...now,
    questions: [...run.questions],
    steps: [...run.steps],
    approvals: [...run.approvals],
  };
  state.frozenRuns.set(run.runId, frozen);
  return frozen;
}

/** Whether a run says what it said: each field the same, a list element by element, the policy entry by entry. */
export function sameRun(was: Run, now: Run): boolean {
  const keys = Object.keys(now) as (keyof Run)[];
  if (keys.length !== Object.keys(was).length) return false;
  return keys.every((key) => sameField(was[key], now[key]));
}

function sameField(was: unknown, now: unknown): boolean {
  if (was === now) return true;
  if (Array.isArray(was) && Array.isArray(now)) {
    return was.length === now.length && was.every((item, index) => item === now[index]);
  }
  if (typeof was !== "object" || typeof now !== "object" || was === null || now === null) {
    return false;
  }
  const entries = Object.entries(now);
  return (
    entries.length === Object.keys(was).length &&
    entries.every(([key, value]) => (was as Record<string, unknown>)[key] === value)
  );
}

/**
 * A step's log refines its planned row: a title only when the log carries one, plus how it went.
 * A step with no title is named by its summary, then by the tool it called, and only then by its
 * id, which is a harness's own reference (`tool_search_code:call_…`) and means nothing to a person.
 * A name it was given only for want of one gives way to a summary that comes later.
 */
export function upsertStep(run: MutableRun, event: ClientEvent): void {
  const stepId = required<string>(event, "step_id");
  const status = required<StepStatus>(event, "status");
  const source = (field<{ label: string }[]>(event, "sources") ?? [])[0]?.label;
  const title = field<string>(event, "title");
  const tool = field<string>(event, "tool");

  const index = run.steps.findIndex((step) => step.stepId === stepId);
  const existing = run.steps[index];
  const named =
    existing?.title === stepId || existing?.title === tool ? undefined : existing?.title;
  const ended = status === "done" || status === "failed";
  const step: Step = {
    stepId,
    title: title ?? named ?? field<string>(event, "summary") ?? tool ?? stepId,
    status,
    source: source ?? existing?.source,
    durationMs: field<number>(event, "duration_ms") ?? existing?.durationMs,
    error: field<string>(event, "error"),
    planned: existing?.planned,
    startedAt: existing?.startedAt ?? (status === "planned" ? undefined : event.ts),
    endedAt: ended ? event.ts : existing?.endedAt,
    ...toolAndSummary(event, existing),
  };
  if (existing === undefined) run.steps.push(step);
  else run.steps[index] = step;
}

/** A count after a usage report: the run's own when the report did not say it. */
function counted(had: number | undefined, said: number | undefined, total: boolean) {
  if (said === undefined) return had;
  return total ? said : (had ?? 0) + said;
}

/** What a step called and said of itself, kept from the event that first told them. */
function toolAndSummary(event: ClientEvent, existing: Step | undefined) {
  return {
    tool: field<string>(event, "tool") ?? existing?.tool,
    callKind: callKindOf(field<string>(event, "kind")) ?? existing?.callKind,
    summary: field<string>(event, "summary") ?? existing?.summary,
  };
}

const CALL_KINDS: ReadonlySet<string> = new Set(stepKind.options);

/** A kind this copy draws, or none: a newer server may know kinds that it does not. */
function callKindOf(kind: string | undefined): StepKind | undefined {
  return kind !== undefined && CALL_KINDS.has(kind) ? (kind as StepKind) : undefined;
}

export function markStep(run: MutableRun, stepId: string | undefined, status: StepStatus): void {
  if (stepId === undefined) return;
  const index = run.steps.findIndex((step) => step.stepId === stepId);
  const existing = run.steps[index];
  if (existing !== undefined) run.steps[index] = { ...existing, status };
}

export const RUN_FOLDS: Readonly<Record<string, FoldStep>> = {
  // A steer reads as a message from the person who said it, tagged with how they meant it.
  "run.steer": (state, event) => {
    const space = spaceOf(state, event);
    const from = field<{ participant_id: string }>(event, "from");
    addLine(space, {
      ...textLine(event, required<string>(event, "text")),
      authorId: from?.participant_id ?? event.actor.id,
      authorKind: "person",
      mode: field<SteerMode>(event, "mode"),
    });
    runOf(state, event);
  },

  "run.started": (state, event) => {
    const space = spaceOf(state, event);
    const runId = event.run_id;
    if (runId === undefined) return;
    const run = runOf(state, event) as MutableRun;
    run.goal = required<string>(event, "goal");
    run.harnessId = event.actor.id;
    run.harness = harnessOfActor(event.actor);
    run.spaceId = space?.id ?? run.spaceId;
    run.state = "running";
    run.paused = false;
    run.startedAt = event.ts;
    run.sessionRef = field<string>(event, "session_ref") ?? run.sessionRef;
    run.goalFrom = field<"harness" | "chips">(event, "goal_from") ?? run.goalFrom;
    run.steps = plannedSteps(field<{ step_id: string; title: string }[]>(event, "plan") ?? []);
    const session = sessionOf(space, event, run.sessionRef);
    if (session !== undefined) session.lastRunId = runId;
    // A goal a person asked for at the harness is their message, and the space would otherwise
    // hold only the answer to it. One that came from Chips is already here, said in their own
    // name, and drawing it again would be Chips quoting them back at themselves.
    if (run.goalFrom === "harness") {
      addLine(space, { ...textLine(event, run.goal), via: event.actor.id });
    }
  },

  // The steps still to come are replaced; the settled ones, and the ticks, keep their place.
  "run.plan": (state, event) => {
    const run = runOf(state, event);
    if (run === undefined) return;
    const settled = run.steps.filter(
      (step) => step.kind === "tick" || step.status === "done" || step.status === "failed",
    );
    const kept = new Set(settled.map((step) => step.stepId));
    const plan = field<{ step_id: string; title: string }[]>(event, "plan") ?? [];
    run.steps = [...settled, ...plannedSteps(plan.filter((step) => !kept.has(step.step_id)))];
  },

  "run.status": (state, event) => {
    const run = runOf(state, event);
    if (run !== undefined && !TERMINAL.includes(run.state)) {
      const words = field<string>(event, "verb_phrase");
      run.statusVerb = words;
      // A word and its ellipsis says the harness is still going; the thought before it stands.
      if (words !== undefined && !PING.test(words.trim())) {
        run.thought = { phase: field<string>(event, "phase") ?? "", words, at: event.ts };
      }
    }
  },

  "step.log": (state, event) => {
    const run = runOf(state, event);
    if (run !== undefined) upsertStep(run, event);
  },

  // A run-scoped report is the total so far; a step's or a lane's adds to it (ADR 0021). A
  // harness that cannot say its tokens in, or out (ADR 0162), leaves them out, and the run's
  // count stays as it was.
  usage: (state, event) => {
    const run = runOf(state, event);
    if (run === undefined) return;
    const usd = field<{ usd?: number }>(event, "cost")?.usd;
    const total = field<string>(event, "scope") === "run";
    run.model = field<string>(event, "model") ?? run.model;
    run.inputTokens = counted(run.inputTokens, field<number>(event, "input_tokens"), total);
    run.cacheReadTokens = counted(
      run.cacheReadTokens,
      field<number>(event, "cache_read_tokens"),
      total,
    );
    run.cacheWriteTokens = counted(
      run.cacheWriteTokens,
      field<number>(event, "cache_write_tokens"),
      total,
    );
    run.outputTokens = counted(run.outputTokens, field<number>(event, "output_tokens"), total);
    if (total) run.costUsd = usd;
    else if (usd !== undefined) run.costUsd = (run.costUsd ?? 0) + usd;
  },

  "context.usage": (state, event) => {
    const run = runOf(state, event);
    if (run === undefined) return;
    run.contextUsed = field<number>(event, "used_tokens");
    run.contextLimit = field<number>(event, "limit_tokens");
    run.model = field<string>(event, "model") ?? run.model;
    if (field<boolean>(event, "compacted") === true) tick(run, event, "Context compacted");
  },

  // A milestone reached: a muted line in the space, FYI; a tick on the rail when the
  // harness compacted on the way.
  checkpoint: (state, event) => {
    const run = runOf(state, event);
    const label = required<string>(event, "label");
    const next = field<string>(event, "next");
    if (run !== undefined && field<boolean>(event, "compacted") === true) {
      tick(run, event, `Compacted: ${label}`);
    }
    addLine(spaceOf(state, event), {
      ...textLine(event, next === undefined ? label : `${label} Next: ${next}`),
      kind: "checkpoint",
      runId: event.run_id,
    });
  },

  "run.pause": (state, event) => {
    const run = runOf(state, event);
    if (run === undefined || TERMINAL.includes(run.state)) return;
    run.state = "waiting";
    run.paused = true;
    state.audit.push(runAudit(event, "paused the run"));
  },

  "run.resume": (state, event) => {
    const run = runOf(state, event);
    if (run === undefined || TERMINAL.includes(run.state)) return;
    run.state = "running";
    run.paused = false;
    state.audit.push(runAudit(event, "resumed the run"));
  },

  "run.cancel": (state, event) => {
    const run = runOf(state, event);
    if (run === undefined || TERMINAL.includes(run.state)) return;
    run.state = "cancelled";
    run.paused = false;
    run.statusVerb = undefined;
    run.thought = undefined;
    run.endedAt = event.ts;
    settleChanges(state, run);
    state.audit.push(runAudit(event, "stopped the run"));
  },

  "run.completed": (state, event) => {
    const run = runOf(state, event);
    const space = spaceOf(state, event);
    const said = required<string>(event, "summary");
    // A turn that ended on `NO_REPLY` had nothing to say (ADR 0105): no line in the room.
    const passed = isNoReply(said);
    const summary = passed ? NOTHING_TO_ADD : said;
    if (run !== undefined) {
      run.state = "done";
      run.paused = false;
      run.summary = summary;
      run.statusVerb = undefined;
      run.thought = undefined;
      run.endedAt = event.ts;
      settleChanges(state, run);
      run.costUsd = field<{ usd?: number }>(event, "cost")?.usd ?? run.costUsd;
    }
    if (passed || (run !== undefined && closeOnLastSaid(space, run, event, summary))) return;
    addLine(space, {
      ...textLine(event, summary),
      kind: "summary",
      authorKind: "harness",
      runId: event.run_id,
    });
  },

  "run.failed": (state, event) => {
    const run = runOf(state, event);
    const space = spaceOf(state, event);
    const error = required<string>(event, "error");
    if (run !== undefined) {
      run.state = "failed";
      run.paused = false;
      run.statusVerb = undefined;
      run.thought = undefined;
      run.error = error;
      run.endedAt = event.ts;
      settleChanges(state, run);
    }
    addLine(space, {
      ...textLine(event, error),
      kind: "status",
      authorKind: "harness",
      runId: event.run_id,
    });
  },
};
