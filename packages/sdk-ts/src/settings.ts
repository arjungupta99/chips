/**
 * What a person changes about an agent from its page, kept by the harness (ADRs 0134, 0140, 0143,
 * 0146): its context files, its model and effort, its heartbeat, its context window; and the jobs
 * the harness runs on its own, from the harness's page (ADR 0252). One pattern five times. The harness sends its copy (`put…`) when it connects and whenever it changes on its
 * own side; a person's change arrives as a frame, now or never; the harness makes it in its own way
 * and answers with the copy as it is now. Here a handler does the making and returns the copy, and
 * the answer — `answers`, or `refuses` when the handler throws — is sent for it.
 */

import {
  type AgentContextPut,
  type AgentContextWindowPut,
  type AgentHeartbeatPut,
  type AgentModelPut,
  type ContextEditFrame,
  contextEditFrame,
  type HarnessContextPut,
  type HarnessJobsPut,
  type HeartbeatChangeFrame,
  heartbeatChangeFrame,
  JOB_RUNS_POST_MAX,
  type JobChangeFrame,
  type JobRun,
  jobChangeFrame,
  type ModelChangeFrame,
  modelChangeFrame,
  type WindowChangeFrame,
  type WindowCompactFrame,
  windowChangeFrame,
  windowCompactFrame,
} from "@chipschat/protocol";

type Answered = "answers" | "refuses";

/** An agent's files, as `PUT /v1/agents/:id/context` takes them, without the answer. */
export type AgentContextCopy = Omit<AgentContextPut, Answered>;
/** The harness's own shared set, as `PUT /v1/harnesses/:id/context` takes it. */
export type HarnessContextCopy = Omit<HarnessContextPut, Answered>;
export type AgentModelCopy = Omit<AgentModelPut, Answered>;
export type AgentHeartbeatCopy = Omit<AgentHeartbeatPut, Answered>;
export type AgentContextWindowCopy = Omit<AgentContextWindowPut, Answered>;
/** The jobs the harness runs on its own, as `PUT /v1/harnesses/:id/jobs` takes them. */
export type HarnessJobsCopy = Omit<HarnessJobsPut, Answered>;

/**
 * A change the harness won't or can't make. Throw it from a handler with the copy as it is now:
 * the person is told `message`, and sees the copy. Anything else thrown refuses the same way, with
 * the copy last sent for that agent, and its message.
 */
export class Refuse extends Error {
  override readonly name = "Refuse";
  constructor(
    message: string,
    /** The copy as it is now. Absent: the one last sent for that agent. */
    readonly copy?: unknown,
    /** For a context file only: `changed` when the file moved on since the person's version. */
    readonly reason?: "changed" | "failed",
  ) {
    super(message);
  }
}

/**
 * The handlers a harness gives `connect({ settings })`, each for a capability it declares. Giving
 * one says the matching word in the socket's `hello` (`context`, `models`, `heartbeats`,
 * `context_windows`), so Chips sends that frame here; leaving it out, Chips never does.
 */
export interface SettingsHandlers {
  /**
   * A person changed a context file (ADR 0134): an agent's, or the harness's own set when
   * `agent_id` is absent. Save it, then return the copy it is in now: the agent's files, or the
   * shared set. `base_hash: null` asks to give the agent its own copy of a shared file. When the
   * file changed since `base_hash`, throw `new Refuse(words, copy, "changed")`.
   */
  readonly context?:
    | ((edit: ContextEditFrame) => Promise<AgentContextCopy | HarnessContextCopy>)
    | undefined;
  /** A person changed an agent's model or effort (ADR 0140); `model: null` is the default. */
  readonly models?: ((change: ModelChangeFrame) => Promise<AgentModelCopy>) | undefined;
  /** A person switched an agent's heartbeat or changed how often it beats (ADR 0143). */
  readonly heartbeats?: ((change: HeartbeatChangeFrame) => Promise<AgentHeartbeatCopy>) | undefined;
  /**
   * A person asked an agent to compact now, or changed the limit it compacts itself at (ADR
   * 0146). For a compaction, return the copy at once with `compacting` set, and `put` it again
   * when it is done.
   */
  readonly contextWindows?:
    | {
        readonly compact: (ask: WindowCompactFrame) => Promise<AgentContextWindowCopy>;
        readonly change: (ask: WindowChangeFrame) => Promise<AgentContextWindowCopy>;
      }
    | undefined;
  /**
   * A person switched one of the jobs the harness runs on its own, or changed how often it runs
   * (ADR 0252). Make it, then return the copy of all its jobs as they are now.
   */
  readonly jobs?: ((change: JobChangeFrame) => Promise<HarnessJobsCopy>) | undefined;
}

/** What `hello.accepts` says for these handlers, beside `restart` for a restart handler. */
export function acceptsFor(handlers: SettingsHandlers | undefined): string[] {
  if (handlers === undefined) return [];
  return [
    ...(handlers.context === undefined ? [] : ["context"]),
    ...(handlers.models === undefined ? [] : ["models"]),
    ...(handlers.heartbeats === undefined ? [] : ["heartbeats"]),
    ...(handlers.contextWindows === undefined ? [] : ["context_windows"]),
    ...(handlers.jobs === undefined ? [] : ["jobs"]),
  ];
}

/** A `PUT` to chipsd with the harness's token, as the connection makes it. */
export type Put = (path: string, body: Readonly<Record<string, unknown>>) => Promise<unknown>;

type Kind = "context" | "harness-context" | "model" | "heartbeat" | "context-window" | "jobs";

const PATHS: Readonly<Record<Kind, (id: string) => string>> = {
  context: (id) => `/v1/agents/${encodeURIComponent(id)}/context`,
  "harness-context": (id) => `/v1/harnesses/${encodeURIComponent(id)}/context`,
  model: (id) => `/v1/agents/${encodeURIComponent(id)}/model`,
  heartbeat: (id) => `/v1/agents/${encodeURIComponent(id)}/heartbeat`,
  "context-window": (id) => `/v1/agents/${encodeURIComponent(id)}/context-window`,
  jobs: (id) => `/v1/harnesses/${encodeURIComponent(id)}/jobs`,
};

/** The frames heard here, each by the schema it is read by (SEC-14). */
const FRAMES = {
  "context.edit": contextEditFrame,
  "model.change": modelChangeFrame,
  "heartbeat.change": heartbeatChangeFrame,
  "context_window.compact": windowCompactFrame,
  "context_window.change": windowChangeFrame,
  "job.change": jobChangeFrame,
} as const;

type Heard =
  | ContextEditFrame
  | ModelChangeFrame
  | HeartbeatChangeFrame
  | WindowCompactFrame
  | WindowChangeFrame
  | JobChangeFrame;

/**
 * The harness's copies, sent and remembered: `chips.settings`. Each `put` sends the whole copy;
 * the last one sent for each agent is what a refusal carries when a handler gives none. A copy
 * the same as the last one Chips took for that agent is not sent again, unless it answers a
 * person, so a harness may send its copies as often as it reads them; and one agent's copies of
 * a kind go one after another, so a later one never lands before an earlier one.
 */
export class Settings {
  /** The copy last given for each `kind:id`, for a refusal to carry. */
  private readonly sent = new Map<string, unknown>();
  /** The copy Chips last took for each `kind:id`, as JSON. */
  private readonly landed = new Map<string, string>();
  private readonly chains = new Map<string, Promise<unknown>>();

  constructor(
    private readonly put: Put,
    private readonly harnessId: () => string,
    private readonly handlers: SettingsHandlers | undefined,
    /** A `POST` to chipsd with the harness's token, for its jobs' runs. */
    private readonly post?: Put,
  ) {}

  /** An agent's context files (`context_files`). */
  context(agentId: string, copy: AgentContextCopy): Promise<unknown> {
    return this.send("context", agentId, copy, {});
  }

  /** The harness's own shared set, which its agents read or start from (`context_files`). */
  harnessContext(copy: HarnessContextCopy): Promise<unknown> {
    return this.send("harness-context", this.harnessId(), copy, {});
  }

  /** An agent's model and effort, what it may run on instead, and the words for each (`models`). */
  model(agentId: string, copy: AgentModelCopy): Promise<unknown> {
    return this.send("model", agentId, copy, {});
  }

  /** An agent's heartbeat (`heartbeats`). */
  heartbeat(agentId: string, copy: AgentHeartbeatCopy): Promise<unknown> {
    return this.send("heartbeat", agentId, copy, {});
  }

  /** An agent's context window: how full, its limit, its last compaction (`context_windows`). */
  contextWindow(agentId: string, copy: AgentContextWindowCopy): Promise<unknown> {
    return this.send("context-window", agentId, copy, {});
  }

  /** The jobs the harness runs on its own, all of them (`jobs`). */
  jobs(copy: HarnessJobsCopy): Promise<unknown> {
    return this.send("jobs", this.harnessId(), copy, {});
  }

  /**
   * Runs of its jobs the harness finished (`jobs`), two hundred to a post. A run sent again says
   * what it says over the one before, and what it leaves out stays, so send it once more when its
   * cost is known, and again without one does no harm. Send the copy first:
   * Chips refuses runs of a job its copy doesn't list.
   */
  async jobRuns(runs: readonly JobRun[]): Promise<void> {
    if (this.post === undefined) throw new Error("This connection can't post a job's runs.");
    const path = `${PATHS.jobs(this.harnessId())}/runs`;
    for (let at = 0; at < runs.length; at += JOB_RUNS_POST_MAX) {
      await this.post(path, { runs: runs.slice(at, at + JOB_RUNS_POST_MAX) });
    }
  }

  /** An agent deleted: nothing is remembered of it, so a copy for an agent made again is sent. */
  forget(agentId: string): void {
    for (const kind of Object.keys(PATHS)) {
      const key = `${kind}:${agentId}`;
      this.sent.delete(key);
      this.landed.delete(key);
      this.chains.delete(key);
    }
  }

  /**
   * A compaction taken (its handler returned) that then failed: the ask refused after all, with
   * the harness's words, beside the copy as it is now, or the one last sent.
   */
  contextWindowFailed(
    agentId: string,
    changeId: string,
    message: string,
    copy?: AgentContextWindowCopy,
  ): Promise<unknown> {
    const now = copy ?? this.sent.get(`context-window:${agentId}`);
    if (now === undefined) return Promise.resolve(undefined);
    const words = message.slice(0, 300);
    return this.send("context-window", agentId, now, {
      refuses: { change_id: changeId, ...(words === "" ? {} : { message: words }) },
    });
  }

  /**
   * A frame from Chips, if it is one of these: read by its schema (SEC-14), handed to its handler
   * and answered. The answer's promise, which never rejects; nothing for any other frame, and
   * nothing for a frame that is not what it says it is.
   */
  hear(frame: Readonly<Record<string, unknown>>): Promise<void> | undefined {
    const name = frame["frame"];
    const schema: (typeof FRAMES)[keyof typeof FRAMES] | undefined =
      typeof name === "string" && name in FRAMES ? FRAMES[name as keyof typeof FRAMES] : undefined;
    if (schema === undefined) return undefined;
    // Read by its schema, not cast (SEC-14): what is acted on here is written to disk by the
    // harness — a context file under the agent's folder, by the name the frame gives — so a frame
    // that is not what it says it is, a name that climbs out of the folder among them, reaches no
    // handler. Chips never sends one; the person is told the edit was missed after a minute.
    const parsed = schema.safeParse(frame);
    return parsed.success ? this.heard(parsed.data) : undefined;
  }

  /** One of the frames read, handed to its handler and answered. */
  private heard(frame: Heard): Promise<void> {
    const handlers = this.handlers;
    switch (frame.frame) {
      case "context.edit": {
        const kind: Kind = frame.agent_id === undefined ? "harness-context" : "context";
        return this.answer(kind, frame.agent_id ?? this.harnessId(), frame.edit_id, "edit_id", () =>
          handlers?.context?.(frame),
        );
      }
      case "model.change":
        return this.answer("model", frame.agent_id, frame.change_id, "change_id", () =>
          handlers?.models?.(frame),
        );
      case "heartbeat.change":
        return this.answer("heartbeat", frame.agent_id, frame.change_id, "change_id", () =>
          handlers?.heartbeats?.(frame),
        );
      case "job.change":
        return this.answer("jobs", this.harnessId(), frame.change_id, "change_id", () =>
          handlers?.jobs?.(frame),
        );
      case "context_window.compact":
        return this.answer("context-window", frame.agent_id, frame.change_id, "change_id", () =>
          handlers?.contextWindows?.compact(frame),
        );
      default:
        return this.answer("context-window", frame.agent_id, frame.change_id, "change_id", () =>
          handlers?.contextWindows?.change(frame),
        );
    }
  }

  private send(
    kind: Kind,
    id: string,
    copy: unknown,
    answer: Readonly<Record<string, unknown>>,
  ): Promise<unknown> {
    const key = `${kind}:${id}`;
    this.sent.set(key, copy);
    const print = JSON.stringify(copy);
    const answering = Object.keys(answer).length > 0;
    const next = (this.chains.get(key) ?? Promise.resolve())
      .catch(() => undefined)
      .then(async () => {
        if (!answering && this.landed.get(key) === print) return undefined;
        const taken = await this.put(PATHS[kind](id), { ...(copy as object), ...answer });
        this.landed.set(key, print);
        return taken;
      });
    this.chains.set(key, next);
    return next;
  }

  /**
   * Make the change with its handler and answer with the copy: `answers` when it returns,
   * `refuses` when it throws. With no handler and no copy ever sent there is nothing to answer
   * with, and the person is told it was missed after a minute.
   */
  private async answer(
    kind: Kind,
    id: string,
    askId: string,
    idField: "edit_id" | "change_id",
    make: () => Promise<unknown> | undefined,
  ): Promise<void> {
    try {
      const made = make();
      if (made === undefined) throw new Refuse("This harness doesn't take that change.");
      await this.send(kind, id, await made, { answers: askId });
    } catch (error) {
      const copy =
        (error instanceof Refuse ? error.copy : undefined) ?? this.sent.get(`${kind}:${id}`);
      if (copy === undefined) return;
      const refuses = { [idField]: askId, ...refusalOf(kind, error) };
      await this.send(kind, id, copy, { refuses }).catch(() => undefined);
    }
  }
}

/** What a refusal says beside its id: the harness's words, and for a file whether it moved on. */
function refusalOf(kind: Kind, error: unknown): Record<string, unknown> {
  const message = (error instanceof Error ? error.message : String(error)).slice(0, 300);
  const file = kind === "context" || kind === "harness-context";
  const reason = error instanceof Refuse ? error.reason : undefined;
  return {
    ...(file ? { reason: reason ?? "failed" } : {}),
    ...(message === "" ? {} : { message }),
  };
}
