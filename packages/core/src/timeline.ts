/**
 * The run panel's timeline: milestones and stretches, not a row per tool call (Arjun, 5
 * September 2026, looking at a forty-step run). The receipt under a message keeps the whole
 * list; the panel answers a supervisor's question — what is it doing, what did it need me for,
 * how far along — in a handful of rows however long the run gets.
 *
 * The rows: a plan's steps, when the harness sent one, as the blueprint drew them; a
 * checkpoint; an approval or a question that was not a plan step, with who answered; a step
 * that failed; the step underway now; and, when the run failed, why.
 * Everything else — the ordinary tool calls a run is mostly made of — folds into a stretch
 * between the rows around it: how many, how long, and which tool mostly.
 *
 * Pure, and in core rather than in a component, so the phone draws the same rail.
 */

import type { Answer, FleetHarness, Resolution, Run, Space, Step, Thought } from "./model.js";

export type TimelineEntry =
  | {
      readonly kind: "step";
      readonly id: string;
      readonly title: string;
      readonly status: "planned" | "now" | "done" | "failed";
      /** A plan step waiting on an approval, or one that failed, says so. */
      readonly note?: string | undefined;
      readonly at?: string | undefined;
      /** Underway since when, for a live "for 40s". */
      readonly since?: string | undefined;
    }
  | {
      readonly kind: "stretch";
      readonly id: string;
      readonly count: number;
      readonly startedAt?: string | undefined;
      readonly endedAt?: string | undefined;
      /** The tool most of the stretch called, when one accounts for at least half of it. */
      readonly tool?: string | undefined;
      readonly at?: string | undefined;
    }
  | {
      readonly kind: "checkpoint";
      readonly id: string;
      readonly title: string;
      readonly at?: string | undefined;
    }
  | {
      readonly kind: "approval";
      readonly id: string;
      readonly actionKind: string;
      readonly at: string;
      readonly resolved?: Resolution | undefined;
    }
  | {
      readonly kind: "question";
      readonly id: string;
      readonly prompt: string;
      readonly at: string;
      readonly answered?: Answer | undefined;
    }
  | {
      /** A run that failed says why. One a person stopped needs no row: they know. */
      readonly kind: "ended";
      readonly id: string;
      readonly error: string;
      readonly at?: string | undefined;
    };

/** Something on the rail, before the ordinary calls between milestones are folded. */
type Atom =
  | { readonly at: string | undefined; readonly order: number; readonly entry: TimelineEntry }
  | { readonly at: string | undefined; readonly order: number; readonly call: Step };

/** A plan step, however far it has got. */
function planStep(step: Step): TimelineEntry {
  const status =
    step.status === "done"
      ? "done"
      : step.status === "failed"
        ? "failed"
        : step.status === "planned"
          ? "planned"
          : "now";
  return {
    kind: "step",
    id: step.stepId,
    title: step.title,
    status,
    ...(step.status === "waiting" ? { note: "needs your approval" } : {}),
    ...(step.status === "failed" && step.error !== undefined ? { note: step.error } : {}),
    at: step.startedAt,
    ...(status === "now" ? { since: step.startedAt } : {}),
  };
}

/** Whether a logged step is one of the ordinary calls that fold into a stretch. */
function ordinary(step: Step, current: Step | undefined): boolean {
  if (step.kind === "tick" || step.planned === true) return false;
  return step.status !== "failed" && step !== current;
}

/** The step underway: the last logged one that has begun and not ended. */
function underway(steps: readonly Step[]): Step | undefined {
  return [...steps]
    .reverse()
    .find(
      (step) =>
        step.kind !== "tick" &&
        step.planned !== true &&
        (step.status === "started" || step.status === "waiting"),
    );
}

function stepAtom(step: Step, order: number, current: Step | undefined): Atom {
  const at = step.startedAt ?? step.endedAt;
  if (ordinary(step, current)) return { at, order, call: step };
  if (step.kind === "tick") {
    return { at, order, entry: { kind: "checkpoint", id: step.stepId, title: step.title, at } };
  }
  if (step.planned === true) return { at, order, entry: planStep(step) };
  if (step === current) {
    return {
      at,
      order,
      entry: { kind: "step", id: step.stepId, title: step.title, status: "now", at, since: at },
    };
  }
  return {
    at,
    order,
    entry: {
      kind: "step",
      id: step.stepId,
      title: step.title,
      status: "failed",
      ...(step.error === undefined ? {} : { note: step.error }),
      at,
    },
  };
}

/** `Bash · pnpm check` is a call to `Bash`. */
function toolOf(step: Step): string {
  return step.title.split(" · ")[0]?.trim() || step.title;
}

/** The tool most of a stretch called, when it is at least half of it. */
function mostly(calls: readonly Step[]): string | undefined {
  const counts = new Map<string, number>();
  for (const call of calls) counts.set(toolOf(call), (counts.get(toolOf(call)) ?? 0) + 1);
  const [tool, count] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0] ?? ["", 0];
  return count * 2 >= calls.length && tool !== "" ? tool : undefined;
}

function stretch(calls: readonly Step[]): TimelineEntry {
  const first = calls[0];
  const last = calls[calls.length - 1];
  const tool = mostly(calls);
  return {
    kind: "stretch",
    id: `stretch:${first?.stepId ?? "none"}`,
    count: calls.length,
    startedAt: first?.startedAt ?? first?.endedAt,
    endedAt: last?.endedAt ?? last?.startedAt,
    ...(tool === undefined ? {} : { tool }),
    at: first?.startedAt ?? first?.endedAt,
  };
}

/** Undated atoms — a plan's steps still to come — go last, in the order they were given. */
function byTime(a: Atom, b: Atom): number {
  if (a.at === undefined || b.at === undefined) {
    if (a.at === b.at) return a.order - b.order;
    return a.at === undefined ? 1 : -1;
  }
  return a.at < b.at ? -1 : a.at > b.at ? 1 : a.order - b.order;
}

export function runTimeline(run: Run): TimelineEntry[] {
  const current = underway(run.steps);
  const atoms: Atom[] = run.steps.map((step, index) => stepAtom(step, index, current));
  let order = atoms.length;
  for (const approval of run.approvals) {
    // One tied to a plan step is that step's own row; the rest are rows of their own.
    if (approval.stepId !== undefined) continue;
    atoms.push({
      at: approval.askedAt,
      order: order++,
      entry: {
        kind: "approval",
        id: approval.approvalId,
        actionKind: approval.actionKind,
        at: approval.askedAt,
        resolved: approval.resolved,
      },
    });
  }
  for (const question of run.questions) {
    atoms.push({
      at: question.askedAt,
      order: order++,
      entry: {
        kind: "question",
        id: question.askId,
        prompt: question.questions[0]?.prompt ?? "",
        at: question.askedAt,
        answered: question.answered,
      },
    });
  }
  if (run.state === "failed") {
    atoms.push({
      at: run.endedAt,
      order: order++,
      entry: {
        kind: "ended",
        id: `ended:${run.runId}`,
        error: run.error ?? "The run failed.",
        at: run.endedAt,
      },
    });
  }

  const entries: TimelineEntry[] = [];
  let calls: Step[] = [];
  const flush = () => {
    if (calls.length > 0) entries.push(stretch(calls));
    calls = [];
  };
  for (const atom of atoms.sort(byTime)) {
    if ("call" in atom) {
      calls.push(atom.call);
      continue;
    }
    flush();
    entries.push(atom.entry);
  }
  flush();
  return entries;
}

/**
 * What a run is doing right now, for the strip that shows while a harness works and goes when it
 * answers (Arjun, 9 September 2026, watching Jacobian).
 *
 * A harness like Jacobian makes ten tool calls to answer one question, and the tool calls are not
 * the answer. Telegram's thinking bubble is the right shape: it says what is happening while it
 * happens and is gone by the time the reply lands. Here that is this strip, live only, and the
 * receipt under the reply — collapsed — is where the same calls go afterwards, for anyone who
 * asks.
 */
export interface Doing {
  readonly harnessId: string;
  /** The run it is: a bubble that stands through the next message says the next run's doing. */
  readonly runId: string;
  /** The latest line of reasoning, when the harness sends `run.status`. */
  readonly verb?: string | undefined;
  /** The call underway, by its title: `memory_recall · Santa Barbara cafes`. */
  readonly step?: string | undefined;
  /** Calls begun so far, so a long stretch of them reads as progress rather than a hang. */
  readonly calls: number;
  /**
   * When the run began, moved on by the time it stood paused: the bubble's clock counts from it
   * (ADR 0147), so it counts working time (ADR 0293).
   */
  readonly startedAt?: string | undefined;
  /** A person paused it, or Chips did: the bubble says Paused and offers Resume (ADR 0293). */
  readonly paused?: true | undefined;
  /** While paused, when: the clock holds there. */
  readonly heldAt?: string | undefined;
  /** Its harness said a Pause holds it, so Pause is offered (ADR 0293). */
  readonly pausable: boolean;
  /** What it last said it was at, never a bare `Writing…`: the bubble reads it (`bubbleSays`). */
  readonly thought?: Thought | undefined;
  /** The calls begun, in the order they began: what the bubble says, and its strip of glyphs. */
  readonly made: readonly Step[];
}

/**
 * Whether the rail is worth a section: a milestone on it — a plan's step, a checkpoint, an
 * approval, a question, a failed step, why the run failed — and not only the stretches the
 * ordinary calls fold into. A run that is nothing but calls has a receipt under its summary
 * and no timeline; the call underway is the strip's business while it runs, unless it is a
 * step of a plan (ADR 0046).
 */
export function hasTimeline(run: Run): boolean {
  const planned = run.steps.some((step) => step.planned === true);
  return runTimeline(run).some((entry) => {
    if (entry.kind === "stretch") return false;
    if (entry.kind === "step" && entry.status === "now") return planned;
    return true;
  });
}

/**
 * A run that is going, and what it is going at. Nothing for a run that has ended, one a person
 * paused, or one waiting on somebody: what to look at then is the card, not a spinner. A room's
 * bubble keeps a paused run, which `spaceDoing` gives (ADR 0293); a fleet's row does not.
 */
export function runDoing(run: Run | undefined, asking = false): Doing | undefined {
  if (run === undefined || run.paused) return undefined;
  const going = run.state === "queued" || run.state === "running";
  if (!going && !(asking && run.state === "waiting")) return undefined;
  return doingOf(run);
}

/** The bubble's view of a run, paused or not. */
function doingOf(run: Run): Doing {
  const current = underway(run.steps);
  const made = run.steps.filter(
    (step) => step.kind !== "tick" && step.planned !== true && step.status !== "planned",
  );
  return {
    harnessId: run.harnessId,
    runId: run.runId,
    verb: run.statusVerb,
    step: current?.title,
    calls: made.length,
    startedAt: workedFrom(run),
    thought: run.thought,
    made,
    pausable: run.pausable === true,
    ...(run.paused ? { paused: true as const, heldAt: run.pausedAt } : {}),
  };
}

/** The run's start, moved on by the time it stood paused, so a clock from it counts work. */
function workedFrom(run: Run): string | undefined {
  const stood = run.pausedMs ?? 0;
  if (run.startedAt === undefined || stood <= 0) return run.startedAt;
  const at = Date.parse(run.startedAt);
  return Number.isNaN(at) ? run.startedAt : new Date(at + stood).toISOString();
}

/**
 * What each harness in a space is doing, one entry for every harness still at work: a thinking
 * bubble apiece. The room's newest run alone was the bubble until 27 September 2026, and two
 * harnesses in one room showed only the newer one working: OpenClaw started 1.7 s after Jacobian
 * and finished four seconds later, the bubble went with it, and Jacobian worked on for 28
 * seconds with nothing on screen (the OpenClaw test, finding 22).
 *
 * A harness's bubble says what its newest run is doing, and nothing when that run is not going,
 * even if an older one of its runs still says it is. A run the harness never ended — three in one
 * of Arjun's rooms have said `running` since 18 September — would otherwise pin a bubble in the
 * room for good. It is the rule a room with one harness has always kept.
 *
 * Oldest first, in the order the harnesses first worked in the room: the harness added to a room
 * later stands nearer the composer, and a bubble keeps its place while it stands. Ordered by the
 * start of each newest run instead, a harness that starts another turn while it works — Jacobian
 * starts one for every message — would jump past the other's bubble.
 *
 * `asking` names the harnesses whose run waits on an ask that nobody can see yet (a room's card
 * waits a beat before it is drawn): their bubble stands until the card takes its place.
 */
export function spaceDoing(
  space: Space,
  asking: ReadonlySet<string> = new Set(),
): readonly Doing[] {
  // A key set again keeps the place it was first given: the harness's first run here.
  const newest = new Map<string, Run>();
  for (const run of space.runs) newest.set(run.harnessId, run);
  return [...newest.values()].flatMap((run) => {
    // A paused run keeps its bubble, which says so and offers Resume (ADR 0293).
    const doing = run.paused ? doingOf(run) : runDoing(run, asking.has(run.harnessId));
    return doing === undefined ? [] : [doing];
  });
}

/**
 * How long a harness's line said in a run still at work waits for that run to close before a
 * room draws it as it is (ADR 0147, point 12).
 */
export const CLOSE_WAIT_MS = 1500;

/**
 * The lines a harness said in a run still at work, which a room holds back up to
 * `CLOSE_WAIT_MS` from when it first sees each. Jacobian posts its reply and closes its run 30 ms
 * to 1.1 s later, and the close makes the line the answer, brings its receipt and takes the
 * thinking bubble away: a room that drew the line as it came moved twice, once for the reply
 * over the bubble and again as the bubble went (Arjun, 10 October 2026: "yes hold the reply").
 * Held, the four are one change. A line still waiting when the time is up was a word said
 * mid-run — *checking the layouts now* — and is drawn as it is, the bubble working on under it.
 */
export function saidMidRun(space: Space): readonly string[] {
  // Each run still at work, and who is doing it: a line is held only if that one said it.
  const going = new Map(
    space.runs
      .filter((run) => runDoing(run) !== undefined)
      .map((run) => [run.runId, run.harnessId]),
  );
  if (going.size === 0) return [];
  return space.lines
    .filter(
      (line) =>
        line.kind === "text" &&
        line.sourceRunId !== undefined &&
        going.get(line.sourceRunId) === line.authorId,
    )
    .map((line) => line.id);
}

/**
 * What a harness is doing by its latest run, for a row that names it away from the room: the
 * fleet's list, a harness's card. Its words are the bubble's top line, held as the bubble holds
 * them (ADR 0147), and never the harness's `run.status` prose, which for Jacobian is a line of
 * reasoning two hundred characters long, `Writing…`, or the reply's own first words.
 */
export function fleetDoing(
  spaces: readonly Space[],
  harness: FleetHarness | undefined,
): Doing | undefined {
  if (harness?.spaceId === undefined || harness.runId === undefined) return undefined;
  const space = spaces.find((each) => each.id === harness.spaceId);
  return runDoing(space?.runs.find((run) => run.runId === harness.runId));
}
