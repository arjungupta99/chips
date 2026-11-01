/**
 * A lane, from the lead's side: what `run.task()` hands back. The task is acknowledged with
 * where the lane lives and which run it is; from then on the lead hears the lane's news as
 * `lane.updated` — waiting, completed with the specialist's summary and what it cost, failed,
 * cancelled — and `result` resolves with the last of those. A task Chips flattened into a step
 * has no lane, and `result` says so at once.
 *
 * A lane between two spaces of one harness — a Space handed down to, a subagent — is routed to
 * the harness itself, and the lead works it: `work()` is the run to post into (M3.5, ADR 0032).
 */

import type { LaneUpdated } from "@chipschat/protocol";
import { Emitter, type Handler } from "./events.js";

export type LaneState = LaneUpdated["state"];

/** How a lane ended, as `result` resolves: the last `lane.updated`, or the fact it never opened. */
export type LaneOutcome =
  | {
      readonly state: "completed" | "failed" | "cancelled";
      readonly summary?: string | undefined;
      readonly costUsd?: number | undefined;
      readonly event: LaneUpdated;
    }
  | { readonly state: "flattened" };

export interface LaneEvents {
  /** Every `lane.updated` for this lane, in order. */
  readonly updated: LaneUpdated;
}

/**
 * What the connection gives a lane: its news, and a run for the lead to work it with. Generic
 * over the run, so this module owes the run's nothing: `run.task()` hands back a `Lane<Run>`.
 */
export interface LaneWire<R> {
  readonly hear: (laneId: string, handler: (event: LaneUpdated) => void) => () => void;
  readonly accept: (runId: string, spaceId: string, laneId: string) => R;
}

const OVER: ReadonlySet<string> = new Set(["completed", "failed", "cancelled"]);

export class Lane<R = unknown> {
  private readonly events = new Emitter<LaneEvents>();
  private settle: ((outcome: LaneOutcome) => void) | undefined;
  private stop: (() => void) | undefined;
  private laneState: LaneState | "flattened" | "opening" = "opening";
  private laneRunId: string | undefined;
  private laneSpaceId: string | undefined;
  private lastSummary: string | undefined;
  private lastCost: number | undefined;
  /** Resolves when the lane ends, or at once when the task was flattened. Never rejects. */
  readonly result: Promise<LaneOutcome>;

  constructor(
    readonly id: string,
    private readonly wire: LaneWire<R>,
  ) {
    this.result = new Promise<LaneOutcome>((resolve) => {
      this.settle = resolve;
    });
    // Listening before the task is sent: the specialist may answer before the ack arrives.
    this.stop = wire.hear(id, (event) => this.onUpdated(event));
  }

  /** The specialist's run, which the lane is. Known once the task is acknowledged. */
  get runId(): string | undefined {
    return this.laneRunId;
  }

  /** Where the lane lives. Known once the task is acknowledged. */
  get spaceId(): string | undefined {
    return this.laneSpaceId;
  }

  /** Where the lane got to: `opening` until acknowledged, then the specialist's state. */
  get state(): LaneState | "flattened" | "opening" {
    return this.laneState;
  }

  get summary(): string | undefined {
    return this.lastSummary;
  }

  get costUsd(): number | undefined {
    return this.lastCost;
  }

  /** True once the lane will not change again. */
  get over(): boolean {
    return this.laneState === "flattened" || OVER.has(this.laneState);
  }

  on<K extends keyof LaneEvents>(name: K, handler: Handler<LaneEvents[K]>): () => void {
    return this.events.on(name, handler);
  }

  /**
   * The lane's run, for a lead that works the lane itself — a lane between two of its own
   * spaces. Everything sent on it lands in the lane's home, as the lane's own steps and messages.
   */
  work(): R {
    if (this.laneRunId === undefined || this.laneSpaceId === undefined) {
      throw new Error(
        this.laneState === "flattened"
          ? "this task was flattened into a step; there is no lane to work"
          : "the lane has not been acknowledged yet",
      );
    }
    return this.wire.accept(this.laneRunId, this.laneSpaceId, this.id);
  }

  /** The task's acknowledgement: where the lane is, or that there is none. */
  opened(lane: { runId: string; spaceId: string } | undefined): void {
    if (lane === undefined) {
      this.laneState = "flattened";
      this.finish({ state: "flattened" });
      return;
    }
    this.laneRunId = lane.runId;
    this.laneSpaceId = lane.spaceId;
    if (this.laneState === "opening") this.laneState = "running";
  }

  private onUpdated(event: LaneUpdated): void {
    this.laneState = event.state;
    this.lastSummary = event.summary ?? this.lastSummary;
    this.lastCost = event.cost_usd ?? this.lastCost;
    this.events.emit("updated", event);
    if (event.state === "completed" || event.state === "failed" || event.state === "cancelled") {
      this.finish({
        state: event.state,
        summary: this.lastSummary,
        costUsd: this.lastCost,
        event,
      });
    }
  }

  private finish(outcome: LaneOutcome): void {
    this.stop?.();
    this.stop = undefined;
    this.settle?.(outcome);
    this.settle = undefined;
  }
}
