/**
 * The people registry (ADR 0018): who the people are. A registry, not a projection, like the
 * harness registry beside it — a person is identity, and identity is not replayed from the log.
 * Phase 5's invites will add to it; until then a person arrives by the demo bootstrap, or by the
 * dev-mode route that stands in for an invite on a laptop (M3.3).
 */

export interface NewPerson {
  readonly id: string;
  readonly workspaceId: string;
  readonly displayName: string;
  readonly createdAt: string;
}

export interface PeopleRegistry {
  readonly addPerson: (person: NewPerson) => Promise<void>;
  /** What a person goes by, changed (ADR 0082). */
  readonly rename: (input: {
    readonly workspaceId: string;
    readonly participantId: string;
    readonly displayName: string;
  }) => Promise<void>;
  /**
   * Mark a person removed from the workspace (ADR 0160), which the door reads from then on.
   * Answers whether this call marked them: false for somebody removed already.
   */
  readonly markRemoved: (input: {
    readonly workspaceId: string;
    readonly participantId: string;
    readonly at: string;
  }) => Promise<boolean>;
}
