/**
 * One run, from the harness's side. `runs.start` returns one; everything it sends carries the
 * run id, so the person sees a timeline, a receipt, and cards that belong to it. An approval
 * or a question is a promise: send the ask, and the decision comes back when a person — or
 * the policy engine, at once — has answered, however many reconnects happen in between.
 */

import type {
  Action,
  ApprovalResolved,
  MessageNew,
  Preview,
  QuestionAnswered,
  RiskClass,
  RunCancel,
  RunPause,
  RunResume,
  RunSteer,
  Source,
  StepKind,
} from "@chipschat/protocol";
import { Emitter, type Handler } from "./events.js";
import { Lane, type LaneWire } from "./lane.js";
import type { Ack } from "./outbox.js";

export interface PlannedStep {
  readonly stepId: string;
  readonly title: string;
}

export interface StepInput {
  /** Stable across the started and done events for one step. Minted when absent. */
  readonly stepId?: string | undefined;
  /** Where the step got to. `done` when absent: most steps are logged once, after the fact. */
  readonly status?: "started" | "done" | "failed" | undefined;
  /** What the step is, when it was not in the plan. */
  readonly title?: string | undefined;
  readonly tool?: string | undefined;
  /** What kind of call the tool is, so a tool Chips does not know by name draws as it should. */
  readonly kind?: StepKind | undefined;
  readonly summary?: string | undefined;
  readonly sources?: readonly Source[] | undefined;
  readonly durationMs?: number | undefined;
  readonly error?: string | undefined;
}

export interface StatusInput {
  readonly phase?: string | undefined;
  readonly verbPhrase: string;
  readonly progress?: number | undefined;
  readonly estimateSeconds?: number | undefined;
}

export interface ApprovalInput {
  readonly action: Action;
  /**
   * The question the person answers yes or no, in plain words: `Send this email to Dana?`. The
   * card leads with it (ADR 0142). Without it the card is headed by the preview's title, else the
   * action's kind.
   */
  readonly question?: string | undefined;
  /** What a yes does, in a sentence or two. */
  readonly effect?: string | undefined;
  /** `once` for this action alone, `standing` for a grant that holds until it is taken back. */
  readonly lasts?: "once" | "standing" | undefined;
  readonly risk: readonly RiskClass[];
  readonly preview?: Preview | undefined;
  readonly stepId?: string | undefined;
  readonly sources?: readonly Source[] | undefined;
  /** Seconds until the ask expires and the fallback applies. An hour when absent. */
  readonly expiresIn?: number | undefined;
  readonly fallback?: "deny" | "allow" | undefined;
  readonly approvers?: readonly string[] | undefined;
  readonly editable?: boolean | undefined;
  /** Minted when absent. Give one to make a retry after a restart the same ask. */
  readonly approvalId?: string | undefined;
}

/** An ask's optional fields as the wire spells them, leaving out each one that was not given. */
function givenFields(input: ApprovalInput): Record<string, unknown> {
  const fields: Record<string, unknown> = {
    question: input.question,
    effect: input.effect,
    lasts: input.lasts,
    preview: input.preview,
    step_id: input.stepId,
    sources: input.sources,
    fallback: input.fallback,
    approvers: input.approvers,
    editable: input.editable,
  };
  return Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined));
}

/** A decision, as the harness should read it. */
export interface Decision {
  readonly approvalId: string;
  readonly decision: "approved" | "edited" | "denied" | "expired";
  /** Approved or edited: the action may go ahead. */
  readonly allowed: boolean;
  readonly scope: "once" | "session" | "always";
  /** The edited input, when the decision is `edited`; otherwise the input as asked. */
  readonly input: unknown;
  readonly reason?: string | undefined;
  readonly by: string;
  readonly at: string;
  readonly event: ApprovalResolved;
}

export interface QuestionOption {
  readonly value: string;
  readonly label: string;
  readonly description?: string | undefined;
}

export interface QuestionInput {
  readonly questionId?: string | undefined;
  readonly prompt: string;
  readonly options: readonly QuestionOption[];
  readonly multiSelect?: boolean | undefined;
  readonly allowFreeText?: boolean | undefined;
  readonly defaultValue?: string | undefined;
}

export interface AskInput {
  readonly questions: readonly QuestionInput[];
  readonly timeoutSeconds?: number | undefined;
  readonly onNoAnswer?: "use_default" | "cancel" | "continue" | undefined;
  readonly askId?: string | undefined;
}

export interface Answer {
  readonly askId: string;
  /** By question id: the chosen values, and free text when the person typed instead. */
  readonly answers: Readonly<
    Record<string, { values: readonly string[]; freeText?: string | undefined }>
  >;
  readonly timedOut: boolean;
  readonly by: string;
  readonly event: QuestionAnswered;
}

export interface ContextInput {
  readonly usedTokens: number;
  readonly limitTokens: number;
  readonly model: string;
  readonly compacted?: boolean | undefined;
}

export interface UsageInput {
  readonly scope?: "step" | "run" | "lane" | undefined;
  readonly model: string;
  /**
   * Every token the model read: fresh, from its prompt cache and written to it. Leave it out
   * when the harness cannot say; the tokens out are still counted.
   */
  readonly inputTokens?: number | undefined;
  /** Of `inputTokens`, how many came from the model's prompt cache, when it keeps one. */
  readonly cacheReadTokens?: number | undefined;
  /** Of `inputTokens`, how many the model wrote to its prompt cache. */
  readonly cacheWriteTokens?: number | undefined;
  /** Leave it out too when the harness knows only what the work cost, and give `costUsd`. */
  readonly outputTokens?: number | undefined;
  readonly costUsd?: number | undefined;
}

export interface CompleteInput {
  readonly summary: string;
  readonly changed?: readonly string[] | undefined;
  readonly followUps?: readonly string[] | undefined;
  readonly costUsd?: number | undefined;
}

export interface FailInput {
  readonly error: string;
  readonly leftUndone?: readonly string[] | undefined;
  readonly retryable?: boolean | undefined;
  readonly costUsd?: number | undefined;
}

/** Work routed to another harness — or to one of this harness's own spaces — from this run. */
export interface TaskInput {
  /**
   * The specialist's harness id; or this harness's own id, for a lane between two of its spaces,
   * which `home` then names. Absent when `child` names an ephemeral one.
   */
  readonly to?: string | undefined;
  /** A transient child Chips mints for this one lane, inheriting the lead's owner and settings. */
  readonly child?: { readonly label: string } | undefined;
  readonly goal: string;
  /** The person the work is ultimately for: usually `message.from.participant_id`. */
  readonly onBehalfOf: string;
  readonly constraints?: readonly string[] | undefined;
  /** An ISO instant. */
  readonly deadline?: string | undefined;
  /** The level for the lane. Never above the lead's own. */
  readonly autonomy?: 0 | 1 | 2 | 3 | undefined;
  /** The message that caused the routing, quoted on the specialist's task card. */
  readonly origin?: string | undefined;
  /** Where the route card appears. This run's space when absent. */
  readonly linkTo?: string | undefined;
  /** Where the lane lives, for a lane between two spaces of one harness: a room this harness is in. */
  readonly home?: string | undefined;
  /** What to call the work: a Space's name, a subagent's type. */
  readonly label?: string | undefined;
  /** Minted when absent. Give one to make a retry after a restart the same lane. */
  readonly taskId?: string | undefined;
}

/** What a person does to a run, and says in its room, while it goes. */
export interface RunEvents {
  readonly steer: RunSteer;
  readonly pause: RunPause;
  readonly resume: RunResume;
  readonly cancel: RunCancel;
  readonly message: MessageNew;
}

/** The wire, from the run's point of view: send an event into this run, mint an id. */
export interface RunWire {
  readonly send: (
    type: string,
    payload: Readonly<Record<string, unknown>>,
    key?: string,
  ) => Promise<Ack>;
  readonly newId: (kind: "approval" | "question" | "event" | "lane") => string;
  readonly waitFor: <T>(match: (event: Record<string, unknown>) => T | undefined) => Promise<T>;
  /** The lane side of the connection: news by lane id, and a run to work a lane with. */
  readonly lanes: LaneWire<Run>;
}

const cost = (usd: number | undefined) =>
  usd === undefined ? {} : { cost: { usd, estimated: true as const } };

export class Run {
  readonly events = new Emitter<RunEvents>();
  private held = false;
  private ended = false;

  constructor(
    readonly id: string,
    readonly spaceId: string,
    private readonly wire: RunWire,
    /** The lane this run is, when a lead routed it here (`chips.runs.accept`). */
    readonly laneId?: string | undefined,
  ) {}

  /** A person paused the run and has not resumed it. */
  get paused(): boolean {
    return this.held;
  }

  /** A person stopped the run, or it completed or failed. Nothing more should be sent. */
  get over(): boolean {
    return this.ended;
  }

  on<K extends keyof RunEvents>(name: K, handler: Handler<RunEvents[K]>): () => void {
    return this.events.on(name, handler);
  }

  /** What a person did to this run, from the connection. */
  hear(event: Record<string, unknown>): void {
    switch (event["type"]) {
      case "run.steer":
        this.events.emit("steer", event as unknown as RunSteer);
        return;
      case "run.pause":
        this.held = true;
        this.events.emit("pause", event as unknown as RunPause);
        return;
      case "run.resume":
        this.held = false;
        this.events.emit("resume", event as unknown as RunResume);
        return;
      case "run.cancel":
        this.ended = true;
        this.held = false;
        this.events.emit("cancel", event as unknown as RunCancel);
        return;
      case "message.new":
        this.events.emit("message", event as unknown as MessageNew);
        return;
      default:
        return;
    }
  }

  /** Resolve once the run is not paused. A stopped run resolves too: check `over` after. */
  async whenRunning(): Promise<void> {
    while (this.held && !this.ended) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }

  status(input: string | StatusInput): Promise<Ack> {
    const status = typeof input === "string" ? { verbPhrase: input } : input;
    return this.wire.send("run.status", {
      phase: status.phase ?? phaseOf(status.verbPhrase),
      verb_phrase: status.verbPhrase,
      ...(status.progress === undefined ? {} : { progress: status.progress }),
      ...(status.estimateSeconds === undefined ? {} : { estimate_seconds: status.estimateSeconds }),
    });
  }

  /** The steps still to come, replacing the ones not yet done. */
  plan(steps: readonly PlannedStep[], reason?: string): Promise<Ack> {
    return this.wire.send("run.plan", {
      plan: steps.map((step) => ({ step_id: step.stepId, title: step.title })),
      ...(reason === undefined ? {} : { reason }),
    });
  }

  step(input: StepInput): Promise<Ack> {
    return this.wire.send("step.log", {
      step_id: input.stepId ?? this.newStepId(),
      status: input.status ?? "done",
      ...(input.title === undefined ? {} : { title: input.title }),
      ...(input.tool === undefined ? {} : { tool: input.tool }),
      ...(input.kind === undefined ? {} : { kind: input.kind }),
      ...(input.summary === undefined ? {} : { summary: input.summary }),
      ...(input.sources === undefined ? {} : { sources: input.sources }),
      ...(input.durationMs === undefined ? {} : { duration_ms: input.durationMs }),
      ...(input.error === undefined ? {} : { error: input.error }),
    });
  }

  /**
   * A step around a piece of work: `started` now, `done` with how long it took when the work
   * resolves, `failed` with why when it throws, and the error thrown on. Give `tool` (or a title
   * like `web_search · LEGO trucks`) and the thinking bubble says what is going on while it works.
   */
  async track<T>(
    step: Omit<StepInput, "status" | "durationMs" | "error">,
    work: () => Promise<T>,
  ): Promise<T> {
    const stepId = step.stepId ?? this.newStepId();
    const begun = Date.now();
    await this.step({ ...step, stepId, status: "started" });
    try {
      const value = await work();
      await this.step({ ...step, stepId, status: "done", durationMs: Date.now() - begun });
      return value;
    } catch (error) {
      const why = error instanceof Error ? error.message : String(error);
      await this.step({
        ...step,
        stepId,
        status: "failed",
        durationMs: Date.now() - begun,
        error: (why === "" ? "It failed." : why).slice(0, 2000),
      }).catch(() => undefined);
      throw error;
    }
  }

  private newStepId(): string {
    return `step-${this.wire.newId("event").slice(-8).toLowerCase()}`;
  }

  /**
   * Ask, and wait for the answer. Resolves when a person decides — or at once, when the
   * policy engine decides for them — and survives a reconnect, since the decision is an
   * event the resumed subscription replays.
   */
  async approval(input: ApprovalInput): Promise<Decision> {
    const approvalId = input.approvalId ?? this.wire.newId("approval");
    const decided = this.wire.waitFor<ApprovalResolved>((event) =>
      event["type"] === "approval.resolved" && event["approval_id"] === approvalId
        ? (event as unknown as ApprovalResolved)
        : undefined,
    );
    await this.wire.send("approval.request", {
      approval_id: approvalId,
      action: input.action,
      risk: input.risk,
      expires_in: input.expiresIn ?? 3600,
      ...givenFields(input),
    });
    const event = await decided;
    return {
      approvalId,
      decision: event.decision,
      allowed: event.decision === "approved" || event.decision === "edited",
      scope: event.scope ?? "once",
      input: event.decision === "edited" ? event.updated_input : input.action.input,
      reason: event.reason,
      by: event.resolved_by,
      at: event.resolved_at,
      event,
    };
  }

  /**
   * Route work to another harness, or to one of this harness's own spaces, as a lane of this
   * run (M3.5). Resolves once Chips has acknowledged the task with where the lane is; the lane's
   * `result` resolves when the specialist is done. A task Chips flattens — an unknown harness, a
   * chain too deep, a loop — comes back as a lane whose `result` is `flattened`, so the lead
   * can carry on without it.
   */
  async task(input: TaskInput): Promise<Lane<Run>> {
    const taskId = input.taskId ?? this.wire.newId("lane");
    const lane = new Lane<Run>(taskId, this.wire.lanes);
    const ack = await this.wire.send("task", {
      task_id: taskId,
      ...(input.to === undefined ? {} : { to: input.to }),
      ...(input.child === undefined ? {} : { to: input.child.label, child: input.child }),
      goal: input.goal,
      on_behalf_of: input.onBehalfOf,
      ...(input.constraints === undefined ? {} : { constraints: input.constraints }),
      ...(input.deadline === undefined ? {} : { deadline: input.deadline }),
      ...(input.autonomy === undefined ? {} : { autonomy: input.autonomy }),
      ...(input.origin === undefined ? {} : { origin: input.origin }),
      link_to: input.linkTo ?? this.spaceId,
      ...(input.home === undefined ? {} : { home: input.home }),
      ...(input.label === undefined ? {} : { label: input.label }),
    });
    lane.opened(ack.lane);
    return lane;
  }

  /** What happened after a yes: the card changes from approved to sent, or to failed. */
  executed(
    approvalId: string,
    outcome: "executed" | "failed" | "skipped",
    detail?: string,
  ): Promise<Ack> {
    return this.wire.send("approval.executed", {
      approval_id: approvalId,
      outcome,
      ...(detail === undefined ? {} : { detail }),
    });
  }

  /** One to four questions with options; resolves with the answers, or the default on a timeout. */
  async question(input: AskInput): Promise<Answer> {
    const askId = input.askId ?? this.wire.newId("question");
    const answered = this.wire.waitFor<QuestionAnswered>((event) =>
      event["type"] === "question.answered" && event["ask_id"] === askId
        ? (event as unknown as QuestionAnswered)
        : undefined,
    );
    await this.wire.send("question.ask", {
      ask_id: askId,
      questions: input.questions.map((question, index) => ({
        question_id: question.questionId ?? `q${index + 1}`,
        prompt: question.prompt,
        options: question.options,
        ...(question.multiSelect === undefined ? {} : { multi_select: question.multiSelect }),
        ...(question.allowFreeText === undefined
          ? {}
          : { allow_free_text: question.allowFreeText }),
        ...(question.defaultValue === undefined ? {} : { default_value: question.defaultValue }),
      })),
      ...(input.timeoutSeconds === undefined ? {} : { timeout_seconds: input.timeoutSeconds }),
      ...(input.onNoAnswer === undefined ? {} : { on_no_answer: input.onNoAnswer }),
    });
    const event = await answered;
    const answers: Record<string, { values: readonly string[]; freeText?: string | undefined }> =
      {};
    for (const answer of event.answers) {
      answers[answer.question_id] = { values: answer.values, freeText: answer.free_text };
    }
    return { askId, answers, timedOut: event.timed_out === true, by: event.answered_by, event };
  }

  context(input: ContextInput): Promise<Ack> {
    return this.wire.send("context.usage", {
      used_tokens: input.usedTokens,
      limit_tokens: input.limitTokens,
      model: input.model,
      ...(input.compacted === undefined ? {} : { compacted: input.compacted }),
    });
  }

  usage(input: UsageInput): Promise<Ack> {
    return this.wire.send("usage", {
      scope: input.scope ?? "run",
      model: input.model,
      ...(input.inputTokens === undefined ? {} : { input_tokens: input.inputTokens }),
      ...(input.cacheReadTokens === undefined ? {} : { cache_read_tokens: input.cacheReadTokens }),
      ...(input.cacheWriteTokens === undefined
        ? {}
        : { cache_write_tokens: input.cacheWriteTokens }),
      ...(input.outputTokens === undefined ? {} : { output_tokens: input.outputTokens }),
      ...cost(input.costUsd),
    });
  }

  /**
   * That this turn heard a message said in the room while it worked (ADR 0106): one that
   * `message.overheard` named this run for in `working_turns`, handed to the turn at a step. The
   * room shows its agent heard it while working. Say it once the turn has the words, never before.
   */
  heard(messageId: string): Promise<Ack> {
    return this.wire.send("message.heard", { message_id: messageId });
  }

  checkpoint(label: string, next?: string, compacted?: boolean): Promise<Ack> {
    return this.wire.send("checkpoint", {
      label,
      ...(next === undefined ? {} : { next }),
      ...(compacted === undefined ? {} : { compacted }),
    });
  }

  complete(input: CompleteInput): Promise<Ack> {
    this.ended = true;
    return this.wire.send("run.completed", {
      summary: input.summary,
      ...(input.changed === undefined ? {} : { changed: input.changed }),
      ...(input.followUps === undefined ? {} : { follow_ups: input.followUps }),
      ...cost(input.costUsd),
    });
  }

  fail(input: FailInput): Promise<Ack> {
    this.ended = true;
    return this.wire.send("run.failed", {
      error: input.error,
      ...(input.leftUndone === undefined ? {} : { left_undone: input.leftUndone }),
      ...(input.retryable === undefined ? {} : { retryable: input.retryable }),
      ...cost(input.costUsd),
    });
  }
}

/** `Reading PO #4471…` → `reading`: a machine-ish label from the first word. */
function phaseOf(verbPhrase: string): string {
  const word = verbPhrase.trim().split(/\s+/)[0] ?? "working";
  return word.replace(/[^a-z0-9]/gi, "").toLowerCase() || "working";
}
