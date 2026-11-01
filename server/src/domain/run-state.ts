/**
 * A run's life, from the blueprint:
 *
 *   Queued -> Running -> Waiting on you (approval or question) -> Running -> Done | Failed | Cancelled
 *
 * The domain layer is pure (technical-plan 6.1): this file knows the shape of a run's life and
 * nothing about how a run is stored or transported.
 */

/** Appendix C fixes these six states. */
export type RunState = "queued" | "running" | "waiting" | "done" | "failed" | "cancelled";

export const RUN_STATES: readonly RunState[] = [
  "queued",
  "running",
  "waiting",
  "done",
  "failed",
  "cancelled",
];

/** A run in a terminal state never moves again. That is what makes the run panel final. */
export const TERMINAL_RUN_STATES: readonly RunState[] = ["done", "failed", "cancelled"];

export function isTerminal(state: RunState): boolean {
  return TERMINAL_RUN_STATES.includes(state);
}

/** What can happen to a run. Named for the event that causes it, not for the state it lands in. */
export type RunTransition =
  | "start"
  | "await_person"
  | "person_answered"
  | "pause"
  | "resume"
  | "complete"
  | "fail"
  | "cancel";

const TRANSITIONS: Readonly<Record<RunState, Partial<Record<RunTransition, RunState>>>> = {
  queued: {
    start: "running",
    cancel: "cancelled",
    fail: "failed",
  },
  running: {
    start: "running",
    await_person: "waiting",
    pause: "waiting",
    complete: "done",
    fail: "failed",
    cancel: "cancelled",
  },
  waiting: {
    person_answered: "running",
    resume: "running",
    await_person: "waiting",
    complete: "done",
    fail: "failed",
    cancel: "cancelled",
  },
  done: {},
  failed: {},
  cancelled: {},
};

/**
 * Where a run goes next, or `undefined` when the transition does not apply.
 *
 * Refusing a transition is not an error: an `approval.resolved` can arrive for a run that was
 * already cancelled, and replaying the log must reach the same answer as live traffic did.
 */
export function nextRunState(state: RunState, transition: RunTransition): RunState | undefined {
  return TRANSITIONS[state][transition];
}

/** Apply a transition, staying put when it does not apply. */
export function applyRunTransition(state: RunState, transition: RunTransition): RunState {
  return nextRunState(state, transition) ?? state;
}

/** The transition an event asks of its run, for the events that ask one. */
const TRANSITION_OF: Readonly<Record<string, RunTransition>> = {
  "run.started": "start",
  "approval.request": "await_person",
  "question.ask": "await_person",
  "approval.resolved": "person_answered",
  "question.answered": "person_answered",
  "run.pause": "pause",
  "run.resume": "resume",
  "run.completed": "complete",
  "run.failed": "fail",
  "run.cancel": "cancel",
};

export function transitionFor(type: string): RunTransition | undefined {
  return TRANSITION_OF[type];
}

export type RunAcceptance = { readonly ok: true } | { readonly ok: false; readonly reason: string };

/**
 * Whether a run in this state takes this event at the door (technical-plan M1.3: transitions
 * enforced server-side).
 *
 * Three things are refused: anything into a run that has ended — bar the decision on an
 * approval it asked for, that decision's outcome, and what the run cost — a pause of a run that is not
 * running, and a resume of a run that is not waiting. Everything else is accepted — including a
 * decision that arrives while the run is already running again, because two approvals can be
 * open at once and answering the second is not a mistake. For those the projector's stay-put
 * rule is the right one; for these three it would hide an error.
 */
/**
 * What a run that has ended still takes: the decision on an approval it asked for, what became
 * of it, and the answer to a question it asked. A gate that handed its question back to the
 * harness may have let the turn end before anybody answered the card; the answer still has a
 * card to settle, and the harness still has an outcome to report on it (M3.5, the deferred
 * approval). A question is the same card: Jacobian asks in a turn and ends the turn, and the
 * answer comes when the person has read what was asked — refused, it was a card nobody could
 * answer (the Chess Game space, 15 September 2026). Whether the ask itself is still open is its
 * own rule (first answer wins).
 */
const ABOUT_AN_ASK: readonly string[] = [
  "approval.resolved",
  "approval.executed",
  "question.answered",
];

/**
 * And what it cost (ADR 0155). What was spent is true after the run has ended: a run a person
 * stopped while its harness was frozen or down is ended here, and the harness, once back, still
 * has the bill to report (Jacobian CL-4, 12 October 2026).
 */
const AFTER_THE_END: readonly string[] = [...ABOUT_AN_ASK, "usage"];

export function runAccepts(state: RunState, type: string): RunAcceptance {
  if (isTerminal(state) && !AFTER_THE_END.includes(type)) {
    return { ok: false, reason: `the run has ended as ${state}` };
  }
  const transition = transitionFor(type);
  if (transition === "pause" && nextRunState(state, transition) === undefined) {
    return { ok: false, reason: `a run that is ${state} cannot be paused` };
  }
  if (transition === "resume" && nextRunState(state, transition) === undefined) {
    return { ok: false, reason: `a run that is ${state} is not paused` };
  }
  return { ok: true };
}
