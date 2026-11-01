/**
 * The heartbeat registry (ADR 0143): a harness's copy of each agent's heartbeat, and the last
 * change a person asked of it. A registry, not a projection, as the model's is (ADR 0140): a change
 * goes down a harness's socket once, and nobody needs its history.
 */

import type { AgentHeartbeatCopy, HeartbeatChangeState } from "@chipschat/protocol";

/** As stored: `missed` is read from `askedAt`, never written. */
export type StoredHeartbeatChangeState = Exclude<HeartbeatChangeState, "missed">;

/** A person's change of an agent's heartbeat, and what became of it. */
export interface HeartbeatChange {
  readonly id: string;
  readonly on: boolean;
  /** In minutes: the copy's own when the person named none. */
  readonly every: number;
  readonly askedBy: string;
  readonly askedAt: string;
  readonly state: StoredHeartbeatChangeState;
  readonly message: string | null;
  readonly answeredAt: string | null;
}

export interface AgentHeartbeat {
  readonly workspaceId: string;
  readonly agentId: string;
  readonly harnessId: string;
  /** As the harness sent it. */
  readonly said: AgentHeartbeatCopy;
  readonly readAt: string;
  /** The last change asked, or `null` before any. */
  readonly change: HeartbeatChange | null;
}

export interface AgentHeartbeatRegistry {
  /** Replace an agent's copy whole, as its harness sent it, keeping the change beside it. */
  readonly put: (copy: Omit<AgentHeartbeat, "change">) => Promise<void>;
  readonly get: (workspaceId: string, agentId: string) => Promise<AgentHeartbeat | undefined>;
  /** Keep a change as the agent's last, in place of the one before. */
  readonly ask: (workspaceId: string, agentId: string, change: HeartbeatChange) => Promise<void>;
  /**
   * Close the agent's change the harness answered, only while it is the one named and waits:
   * answers whether it did.
   */
  readonly answer: (input: {
    readonly workspaceId: string;
    readonly agentId: string;
    readonly changeId: string;
    readonly state: Exclude<StoredHeartbeatChangeState, "waiting">;
    readonly message: string | null;
    readonly at: string;
  }) => Promise<boolean>;
  /** Forget an agent's copy and its change: the agent is gone. */
  readonly remove: (workspaceId: string, agentId: string) => Promise<void>;
  /** Forget every copy of a harness's agents: the harness was removed. */
  readonly removeHarness: (workspaceId: string, harnessId: string) => Promise<void>;
}
