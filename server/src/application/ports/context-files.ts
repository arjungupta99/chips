/**
 * The context registry (ADR 0134): a harness's copy of each agent's context files, and of its own
 * set, and the edits people ask of them. A registry, not a projection: what a person wrote about
 * themselves is not replayed to every device, and an edit goes down a harness's socket once.
 */

import type {
  ContextEditState,
  ContextFile,
  NotShownFile,
  SharedContextFile,
} from "@chipschat/protocol";

export type ContextOwnerKind = "agent" | "harness";

/** Whose set: one of a harness's agents, or the harness itself. */
export interface ContextOwner {
  readonly workspaceId: string;
  readonly kind: ContextOwnerKind;
  readonly id: string;
}

export interface ContextSet {
  readonly owner: ContextOwner;
  readonly harnessId: string;
  /** As the harness sent them, in its order: an agent's files, or the harness's shared ones. */
  readonly files: readonly (ContextFile | SharedContextFile)[];
  readonly notShown: readonly NotShownFile[];
  readonly newAgentsNote: string | null;
  /** An agent's: when it reads its files, in its harness's words (ADR 0238). */
  readonly readNote: string | null;
  readonly readAt: string;
}

/** As stored: `missed` is read from `askedAt`, never written. */
export type StoredEditState = Exclude<ContextEditState, "missed">;

export interface ContextEdit {
  readonly id: string;
  readonly owner: ContextOwner;
  readonly harnessId: string;
  readonly name: string;
  readonly baseHash: string | null;
  /** Empty once the harness has answered. */
  readonly text: string;
  readonly askedBy: string;
  readonly askedAt: string;
  readonly state: StoredEditState;
  readonly message: string | null;
  readonly answeredAt: string | null;
}

export interface ContextRegistry {
  /** Replace a set whole, as the harness sent it. */
  readonly put: (set: ContextSet) => Promise<void>;
  readonly get: (owner: ContextOwner) => Promise<ContextSet | undefined>;
  /** Forget an owner's set and its edits: the agent or the harness is gone. */
  readonly remove: (owner: ContextOwner) => Promise<void>;
  /** Forget every set and edit of a harness and its agents: the harness was removed. */
  readonly removeHarness: (workspaceId: string, harnessId: string) => Promise<void>;
  readonly addEdit: (edit: ContextEdit) => Promise<void>;
  readonly edit: (workspaceId: string, id: string) => Promise<ContextEdit | undefined>;
  /**
   * Close an edit the harness answered, only while it waits: answers whether it did. Its text goes,
   * since the file as it is now is in the harness's copy.
   */
  readonly answer: (input: {
    readonly workspaceId: string;
    readonly id: string;
    readonly state: Exclude<StoredEditState, "waiting">;
    readonly message: string | null;
    readonly at: string;
  }) => Promise<boolean>;
}
