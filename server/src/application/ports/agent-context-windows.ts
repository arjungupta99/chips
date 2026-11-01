/**
 * The context window registry (ADR 0146): a harness's copy of each agent's context window, the
 * last limit a person asked of it, and the last Compact now. A registry, not a projection, as the
 * model's and the heartbeat's are (ADRs 0140, 0143): an ask goes down a harness's socket once, and
 * nobody needs its history. What a compaction leaves in a room is the log's, as `context.compacted`.
 */

import type {
  AgentContextWindowCopy,
  CompactionState,
  WindowChangeState,
} from "@chipschat/protocol";

/** As stored: `missed` is read from `askedAt`, never written. */
export type StoredWindowChangeState = Exclude<WindowChangeState, "missed">;
export type StoredCompactionState = Exclude<CompactionState, "missed">;

/** A person's change of the limit an agent compacts itself at, and what became of it. */
export interface WindowChange {
  readonly id: string;
  /** A percent of the window, or `null` for only when asked. */
  readonly at: number | null;
  readonly askedBy: string;
  readonly askedAt: string;
  readonly state: StoredWindowChangeState;
  readonly message: string | null;
  readonly answeredAt: string | null;
}

/** A person's Compact now, and what became of it. */
export interface Compaction {
  readonly id: string;
  readonly askedBy: string;
  readonly askedAt: string;
  readonly state: StoredCompactionState;
  readonly message: string | null;
  readonly answeredAt: string | null;
  readonly doneAt: string | null;
}

export interface AgentContextWindow {
  readonly workspaceId: string;
  readonly agentId: string;
  readonly harnessId: string;
  /** As the harness sent it. */
  readonly said: AgentContextWindowCopy;
  readonly readAt: string;
  /** The last limit asked, or `null` before any. */
  readonly change: WindowChange | null;
  /** The last Compact now asked, or `null` before any. */
  readonly compaction: Compaction | null;
}

export interface AgentContextWindowRegistry {
  /** Replace an agent's copy whole, as its harness sent it, keeping its asks beside it. */
  readonly put: (copy: Omit<AgentContextWindow, "change" | "compaction">) => Promise<void>;
  readonly get: (workspaceId: string, agentId: string) => Promise<AgentContextWindow | undefined>;
  /** Keep a limit change as the agent's last, in place of the one before. */
  readonly ask: (workspaceId: string, agentId: string, change: WindowChange) => Promise<void>;
  /**
   * Close the agent's limit change the harness answered, only while it is the one named and
   * waits: answers whether it did.
   */
  readonly answer: (input: {
    readonly workspaceId: string;
    readonly agentId: string;
    readonly changeId: string;
    readonly state: Exclude<StoredWindowChangeState, "waiting">;
    readonly message: string | null;
    readonly at: string;
  }) => Promise<boolean>;
  /** Keep a Compact now as the agent's last, as asked or as it has moved on. */
  readonly compaction: (
    workspaceId: string,
    agentId: string,
    compaction: Compaction,
  ) => Promise<void>;
  /** Forget an agent's copy and its asks: the agent is gone. */
  readonly remove: (workspaceId: string, agentId: string) => Promise<void>;
  /** Forget every copy of a harness's agents: the harness was removed. */
  readonly removeHarness: (workspaceId: string, harnessId: string) => Promise<void>;
}
