/**
 * The model registry (ADR 0140): a harness's copy of each agent's model and effort, and the last
 * change a person asked of it. A registry, not a projection: a change goes down a harness's
 * socket once, and nobody needs its history.
 */

import type { AgentModelCopy, ModelChangeState } from "@chipschat/protocol";

/** As stored: `missed` is read from `askedAt`, never written. */
export type StoredChangeState = Exclude<ModelChangeState, "missed">;

/** A person's change of an agent's model and effort, and what became of it. */
export interface ModelChange {
  readonly id: string;
  /** Both `null`: the agent runs on its harness's default. */
  readonly model: string | null;
  readonly effort: string | null;
  readonly askedBy: string;
  readonly askedAt: string;
  readonly state: StoredChangeState;
  readonly message: string | null;
  readonly answeredAt: string | null;
}

export interface AgentModel {
  readonly workspaceId: string;
  readonly agentId: string;
  readonly harnessId: string;
  /** As the harness sent it. */
  readonly said: AgentModelCopy;
  readonly readAt: string;
  /** The last change asked, or `null` before any. */
  readonly change: ModelChange | null;
}

export interface AgentModelRegistry {
  /** Replace an agent's copy whole, as its harness sent it, keeping the change beside it. */
  readonly put: (copy: Omit<AgentModel, "change">) => Promise<void>;
  readonly get: (workspaceId: string, agentId: string) => Promise<AgentModel | undefined>;
  /** Keep a change as the agent's last, in place of the one before. */
  readonly ask: (workspaceId: string, agentId: string, change: ModelChange) => Promise<void>;
  /**
   * Close the agent's change the harness answered, only while it is the one named and waits:
   * answers whether it did.
   */
  readonly answer: (input: {
    readonly workspaceId: string;
    readonly agentId: string;
    readonly changeId: string;
    readonly state: Exclude<StoredChangeState, "waiting">;
    readonly message: string | null;
    readonly at: string;
  }) => Promise<boolean>;
  /** Forget an agent's copy and its change: the agent is gone. */
  readonly remove: (workspaceId: string, agentId: string) => Promise<void>;
  /** Forget every copy of a harness's agents: the harness was removed. */
  readonly removeHarness: (workspaceId: string, harnessId: string) => Promise<void>;
}
