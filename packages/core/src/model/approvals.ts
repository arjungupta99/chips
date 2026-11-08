/** What a harness asks permission for, and what it asks outright. */

import { type ActionFlags, actionMatters, type Preview } from "@chipschat/protocol";
import type { ClientEvent } from "../events.js";
import { markStep } from "./runs.js";
import {
  type Building,
  deadline,
  type FoldStep,
  field,
  type MutableRun,
  required,
  runOf,
  spaceOf,
  TERMINAL,
} from "./state.js";
import type { Approval, LetWork, Question } from "./types.js";

export function updateApproval(
  run: MutableRun,
  approvalId: string | undefined,
  change: (approval: Approval) => Approval,
): void {
  const index = run.approvals.findIndex((approval) => approval.approvalId === approvalId);
  const approval = run.approvals[index];
  if (approval !== undefined) run.approvals[index] = change(approval);
}

/**
 * A yes that lets the asker work in the space without asking (ADR 0281), for an hour or until
 * stopped. One that holds longer than the one already there takes its place; a shorter one, given
 * on an ask still open from before, does not cut it short.
 */
function letWork(state: Building, event: ClientEvent, asker: string, by: string): void {
  const minutes = field<number>(event, "for_minutes");
  if (minutes === undefined && field<boolean>(event, "until_stopped") !== true) return;
  const space = spaceOf(state, event);
  if (space === undefined || asker === "") return;
  const given: LetWork = {
    asker,
    by,
    since: event.ts,
    ...(minutes === undefined
      ? {}
      : { until: new Date(Date.parse(event.ts) + minutes * 60_000).toISOString() }),
  };
  space.letWork ??= new Map();
  const held = space.letWork.get(asker);
  if (held === undefined || outlasts(given, held)) space.letWork.set(asker, given);
}

function outlasts(given: LetWork, held: LetWork): boolean {
  if (held.until === undefined) return given.until === undefined;
  return given.until === undefined || given.until > held.until;
}

/** What a hand-on carries of the ask, for a reader who never saw the request (ADR 0042). */
interface HandedAsk {
  readonly harness_id: string;
  readonly action: { kind: string; input?: unknown };
  readonly risk?: string[];
  readonly expires_at?: string;
}

/**
 * The approval a hand-on describes, when the reader has not seen the ask itself: everything an
 * ask's card draws, and nothing more — no preview, no sources, and no room to open,
 * because none of that was ever theirs to see.
 */
function fromHandOn(
  run: MutableRun,
  event: ClientEvent,
  approvers: readonly string[],
  by: string,
): boolean {
  const ask = field<HandedAsk>(event, "ask");
  const approvalId = field<string>(event, "approval_id");
  if (ask === undefined || approvalId === undefined) return false;
  if (run.harnessId === "") run.harnessId = ask.harness_id;
  if (run.harness === "") run.harness = ask.harness_id;
  if (!TERMINAL.includes(run.state)) run.state = "waiting";
  run.approvals.push({
    approvalId,
    runId: run.runId,
    actionKind: ask.action.kind,
    askedAt: event.ts,
    input: ask.action.input,
    to: (ask.action.input as { to?: string } | undefined)?.to,
    risk: ask.risk ?? [],
    matters: actionMatters({ ...(ask.action as ActionFlags), risk: ask.risk ?? [] }),
    sources: [],
    editable: false,
    expiresAt: ask.expires_at,
    fallback: "deny",
    approvers: [...approvers],
    routedBy: by,
    routedAt: field<string>(event, "routed_at") ?? event.ts,
    routedReason: field<string>(event, "reason"),
  });
  return true;
}

export const APPROVAL_FOLDS: Readonly<Record<string, FoldStep>> = {
  "approval.request": (state, event) => {
    const run = runOf(state, event);
    if (run === undefined) return;
    if (!TERMINAL.includes(run.state)) run.state = "waiting";
    const action = required<{ kind: string; input?: unknown } & ActionFlags>(event, "action");
    const preview = field<Preview>(event, "preview");
    const risk = required<string[]>(event, "risk");
    run.approvals.push({
      approvalId: required<string>(event, "approval_id"),
      runId: run.runId,
      actionKind: action.kind,
      askedAt: event.ts,
      stepId: field<string>(event, "step_id"),
      input: action.input,
      to: (action.input as { to?: string } | undefined)?.to,
      question: field<string>(event, "question"),
      effect: field<string>(event, "effect"),
      lasts: field<"once" | "standing">(event, "lasts"),
      preview: preview?.body,
      previewFormat: preview?.format,
      previewTitle: preview?.title,
      risk,
      matters: actionMatters({ ...action, risk }),
      sources: field<{ kind: string; label: string }[]>(event, "sources") ?? [],
      editable: field<boolean>(event, "editable") === true,
      expiresAt: deadline(event, field<number>(event, "expires_in")),
      fallback: field<"deny" | "allow">(event, "fallback") ?? "deny",
      approvers: field<string[]>(event, "approvers") ?? [],
    });
    markStep(run, field<string>(event, "step_id"), "waiting");
  },

  // Handed on (M5.5): who may answer changes, the card says who handed it and to whom, and the
  // audit records it.
  "approval.routed": (state, event) => {
    const run = runOf(state, event);
    if (run === undefined) return;
    const approvers = field<string[]>(event, "approvers") ?? [];
    const by = field<string>(event, "routed_by") ?? event.actor.id;
    let found = false;
    updateApproval(run, field<string>(event, "approval_id"), (approval) => {
      found = true;
      return {
        ...approval,
        approvers,
        routedBy: by,
        routedAt: field<string>(event, "routed_at") ?? event.ts,
        routedReason: field<string>(event, "reason"),
      };
    });
    // Handed to somebody in a room they are not in (ADR 0042): they were never sent the request
    // that raised it, so the hand-on carries what the ask is and the card is drawn from that.
    if (!found && !fromHandOn(run, event, approvers, by)) return;
    state.audit.push({
      seq: event.seq,
      ts: event.ts,
      kind: "approval",
      who: by,
      what: `handed an approval to ${approvers.length === 0 ? "anyone in the space" : approvers.join(", ")}`,
      spaceId: event.space_id,
      runId: event.run_id,
      reason: field<string>(event, "reason"),
    });
  },

  "approval.resolved": (state, event) => {
    const run = runOf(state, event);
    if (run === undefined) return;
    const decision = required<string>(event, "decision");
    const by = required<string>(event, "resolved_by");
    let actionKind = "";
    updateApproval(run, field<string>(event, "approval_id"), (approval) => {
      actionKind = approval.actionKind;
      return {
        ...approval,
        resolved: {
          decision,
          by,
          at: required<string>(event, "resolved_at"),
          scope: field<string>(event, "scope") ?? "once",
          reason: field<string>(event, "reason"),
          updatedInput: field<unknown>(event, "updated_input"),
          elsewhere: field<boolean>(event, "resolved_elsewhere") === true,
        },
      };
    });
    if (!TERMINAL.includes(run.state)) run.state = "running";
    if (decision === "approved" || decision === "edited") letWork(state, event, run.harnessId, by);
    state.audit.push({
      seq: event.seq,
      ts: event.ts,
      kind: "approval",
      who: by,
      what: `${decision} ${actionKind || "an approval"}${field<string>(event, "scope") === "once" || field(event, "scope") === undefined ? "" : `, ${String(field(event, "scope"))}`}`,
      spaceId: event.space_id,
      runId: event.run_id,
      reason: field<string>(event, "reason"),
    });
  },

  // Somebody stopped an agent working without asking here (ADR 0281): its asks come to a person.
  "approval.held_stopped": (state, event) => {
    spaceOf(state, event)?.letWork?.delete(required<string>(event, "asker"));
  },

  "approval.executed": (state, event) => {
    const run = runOf(state, event);
    if (run === undefined) return;
    updateApproval(run, field<string>(event, "approval_id"), (approval) => ({
      ...approval,
      executed: field<string>(event, "outcome"),
    }));
  },

  "question.ask": (state, event) => {
    const run = runOf(state, event);
    const space = spaceOf(state, event);
    const askId = field<string>(event, "ask_id");
    if (run === undefined || space === undefined || askId === undefined) return;
    if (!TERMINAL.includes(run.state)) run.state = "waiting";
    const asked = required<
      {
        question_id: string;
        prompt: string;
        options: { value: string; label: string; description?: string }[];
        multi_select?: boolean;
        allow_free_text?: boolean;
        default_value?: string;
      }[]
    >(event, "questions");
    state.questions.set(askId, { runId: run.runId, index: run.questions.length });
    run.questions.push({
      askId,
      runId: run.runId,
      spaceId: space.id,
      harnessId: event.actor.id,
      askedAt: event.ts,
      timeoutAt: deadline(event, field<number>(event, "timeout_seconds")),
      onNoAnswer: field<Question["onNoAnswer"]>(event, "on_no_answer") ?? "use_default",
      questions: asked.map((each) => ({
        questionId: each.question_id,
        prompt: each.prompt,
        options: each.options.map((option) => ({
          value: option.value,
          label: option.label,
          description: option.description,
        })),
        multiSelect: each.multi_select === true,
        allowFreeText: each.allow_free_text === true,
        defaultValue: each.default_value,
      })),
    });
  },

  "question.answered": (state, event) => {
    const where = state.questions.get(field<string>(event, "ask_id") ?? "");
    const run = where === undefined ? undefined : state.runs.get(where.runId);
    if (where === undefined || run === undefined) return;
    const question = run.questions[where.index];
    if (question === undefined) return;
    const by = required<string>(event, "answered_by");
    const answers = required<{ question_id: string; values: string[]; free_text?: string }[]>(
      event,
      "answers",
    );
    run.questions[where.index] = {
      ...question,
      answered: {
        by,
        at: required<string>(event, "answered_at"),
        timedOut: field<boolean>(event, "timed_out") === true,
        answers: answers.map((each) => ({
          questionId: each.question_id,
          values: each.values,
          freeText: each.free_text,
        })),
      },
    };
    if (!TERMINAL.includes(run.state) && run.approvals.every((a) => a.resolved !== undefined)) {
      run.state = "running";
    }
    state.audit.push({
      seq: event.seq,
      ts: event.ts,
      kind: "question",
      who: by,
      what:
        field<boolean>(event, "timed_out") === true
          ? "let a question time out"
          : "answered a question",
      spaceId: event.space_id,
      runId: event.run_id,
    });
  },
};
