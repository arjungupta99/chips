import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  applyRunTransition,
  isTerminal,
  nextRunState,
  RUN_STATES,
  type RunState,
  type RunTransition,
  runAccepts,
  TERMINAL_RUN_STATES,
  transitionFor,
} from "./run-state.js";

const TRANSITIONS: readonly RunTransition[] = [
  "start",
  "await_person",
  "person_answered",
  "pause",
  "resume",
  "complete",
  "fail",
  "cancel",
];

describe("a run's life", () => {
  it("has the six states Appendix C names, and paused (ADR 0293)", () => {
    expect([...RUN_STATES]).toEqual([
      "queued",
      "running",
      "waiting",
      "paused",
      "done",
      "failed",
      "cancelled",
    ]);
  });

  it("follows the blueprint's path", () => {
    let state: RunState = "queued";
    state = applyRunTransition(state, "start");
    expect(state).toBe("running");
    state = applyRunTransition(state, "await_person");
    expect(state).toBe("waiting");
    state = applyRunTransition(state, "person_answered");
    expect(state).toBe("running");
    state = applyRunTransition(state, "complete");
    expect(state).toBe("done");
  });

  it("lets a paused run resume", () => {
    expect(applyRunTransition("running", "pause")).toBe("paused");
    expect(applyRunTransition(applyRunTransition("running", "pause"), "resume")).toBe("running");
  });

  it("stays paused through an ask and its answer, so only Resume sets it going (ADR 0293)", () => {
    let state: RunState = applyRunTransition("running", "pause");
    state = applyRunTransition(state, "await_person");
    expect(state).toBe("paused");
    state = applyRunTransition(state, "person_answered");
    expect(state).toBe("paused");
    expect(runAccepts(state, "run.resume").ok).toBe(true);
    expect(applyRunTransition(state, "resume")).toBe("running");
  });

  it("still resumes a run paused before ADR 0293, which was kept waiting", () => {
    expect(applyRunTransition("waiting", "resume")).toBe("running");
  });

  it("can fail or be cancelled from anywhere it is still alive", () => {
    for (const state of ["queued", "running", "waiting", "paused"] as const) {
      expect(applyRunTransition(state, "fail")).toBe("failed");
      expect(applyRunTransition(state, "cancel")).toBe("cancelled");
    }
  });
});

describe("terminal states", () => {
  it("names the three ways a run ends", () => {
    expect([...TERMINAL_RUN_STATES]).toEqual(["done", "failed", "cancelled"]);
  });

  it("recognises them", () => {
    for (const state of RUN_STATES) {
      expect(isTerminal(state)).toBe(TERMINAL_RUN_STATES.includes(state));
    }
  });

  it("never moves again, whatever arrives", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...TERMINAL_RUN_STATES),
        fc.array(fc.constantFrom(...TRANSITIONS), { maxLength: 20 }),
        (start, transitions) => {
          const end = transitions.reduce<RunState>(applyRunTransition, start);
          expect(end).toBe(start);
        },
      ),
    );
  });
});

describe("transitions, as properties", () => {
  it("always lands on a declared state", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...RUN_STATES),
        fc.array(fc.constantFrom(...TRANSITIONS), { maxLength: 30 }),
        (start, transitions) => {
          const end = transitions.reduce<RunState>(applyRunTransition, start);
          expect(RUN_STATES).toContain(end);
        },
      ),
    );
  });

  it("stays put rather than failing when a transition does not apply", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...RUN_STATES),
        fc.constantFrom(...TRANSITIONS),
        (state, transition) => {
          const next = nextRunState(state, transition);
          expect(applyRunTransition(state, transition)).toBe(next ?? state);
        },
      ),
    );
  });

  it("is deterministic: the same path always reaches the same state", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...RUN_STATES),
        fc.array(fc.constantFrom(...TRANSITIONS), { maxLength: 20 }),
        (start, transitions) => {
          const once = transitions.reduce<RunState>(applyRunTransition, start);
          const twice = transitions.reduce<RunState>(applyRunTransition, start);
          expect(once).toBe(twice);
        },
      ),
    );
  });

  it("can only reach a terminal state through a transition that ends a run", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(
          "queued" as const,
          "running" as const,
          "waiting" as const,
          "paused" as const,
        ),
        fc.constantFrom(...TRANSITIONS),
        (state, transition) => {
          const next = applyRunTransition(state, transition);
          if (isTerminal(next)) {
            expect(["complete", "fail", "cancel"]).toContain(transition);
          }
        },
      ),
    );
  });
});

describe("what a run takes at the door", () => {
  const RUN_EVENTS = [
    "run.started",
    "run.status",
    "run.plan",
    "step.log",
    "approval.request",
    "approval.resolved",
    "approval.executed",
    "question.ask",
    "question.answered",
    "usage",
    "context.usage",
    "checkpoint",
    "run.steer",
    "run.pause",
    "run.resume",
    "run.completed",
    "run.failed",
    "run.cancel",
  ];

  it("names the transition an event asks for, and none for the ones that only report", () => {
    expect(transitionFor("run.started")).toBe("start");
    expect(transitionFor("approval.request")).toBe("await_person");
    expect(transitionFor("question.answered")).toBe("person_answered");
    expect(transitionFor("run.cancel")).toBe("cancel");
    expect(transitionFor("step.log")).toBeUndefined();
    expect(transitionFor("usage")).toBeUndefined();
  });

  it("takes nothing into a run that has ended, bar what is about an ask it made and what it cost", () => {
    const afterTheEnd = new Set([
      "approval.resolved",
      "approval.executed",
      "question.answered",
      "usage",
    ]);
    fc.assert(
      fc.property(
        fc.constantFrom(...TERMINAL_RUN_STATES),
        fc.constantFrom(...RUN_EVENTS.filter((type) => !afterTheEnd.has(type))),
        (state, type) => {
          const answer = runAccepts(state, type);
          expect(answer.ok).toBe(false);
          if (!answer.ok) expect(answer.reason).toContain(state);
        },
      ),
    );
  });

  it("still takes an approval's decision, and its outcome, after the run has ended (M3.5)", () => {
    // A gate that handed its question back to a terminal may see the turn end before the card
    // is answered; the answer still settles the card, and the harness still reports on it.
    for (const state of TERMINAL_RUN_STATES) {
      expect(runAccepts(state, "approval.resolved").ok).toBe(true);
      expect(runAccepts(state, "approval.executed").ok).toBe(true);
    }
  });

  it("still takes a question's answer after the run has ended", () => {
    // Jacobian asks in a turn and ends the turn; the answer comes when the person has read it
    // (the Chess Game space, 15 September 2026: refused, the card could not be answered at all).
    for (const state of TERMINAL_RUN_STATES) {
      expect(runAccepts(state, "question.answered").ok).toBe(true);
      expect(runAccepts(state, "question.ask")).toMatchObject({ ok: false });
    }
  });

  it("still takes what the run cost after it has ended (ADR 0155)", () => {
    // A person stopped a run while Jacobian was frozen; back, it still has the bill to report.
    for (const state of TERMINAL_RUN_STATES) {
      expect(runAccepts(state, "usage").ok).toBe(true);
      expect(runAccepts(state, "message.post")).toMatchObject({ ok: false });
    }
  });

  it("pauses only a running run, and resumes only a paused one", () => {
    expect(runAccepts("running", "run.pause").ok).toBe(true);
    expect(runAccepts("waiting", "run.pause")).toMatchObject({ ok: false });
    expect(runAccepts("queued", "run.pause")).toMatchObject({ ok: false });
    expect(runAccepts("paused", "run.pause")).toMatchObject({ ok: false });
    expect(runAccepts("paused", "run.resume").ok).toBe(true);
    expect(runAccepts("waiting", "run.resume").ok).toBe(true);
    expect(runAccepts("running", "run.resume")).toMatchObject({
      ok: false,
      reason: "a run that is running is not paused",
    });
  });

  it("takes a decision while the run is already running again, since two asks can be open", () => {
    expect(runAccepts("running", "approval.resolved").ok).toBe(true);
    expect(runAccepts("running", "question.answered").ok).toBe(true);
  });

  it("takes everything else into a run that is still alive", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(
          "queued" as const,
          "running" as const,
          "waiting" as const,
          "paused" as const,
        ),
        fc.constantFrom(...RUN_EVENTS.filter((t) => t !== "run.pause" && t !== "run.resume")),
        (state, type) => {
          expect(runAccepts(state, type).ok).toBe(true);
        },
      ),
    );
  });
});
