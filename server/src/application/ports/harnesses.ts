/**
 * The harness registry (ADR 0018): who the harnesses are and the tokens that speak for them. A
 * registry, not a projection — a token's digest must never be in the log — so adding a harness
 * is a write here, and what the harness may do is an event (`policy.updated`) like any other.
 */

export interface NewHarness {
  readonly id: string;
  readonly workspaceId: string;
  readonly displayName: string;
  /** The person accountable for it. */
  readonly ownerId: string;
  readonly capabilities?: readonly string[] | undefined;
  readonly createdAt: string;
  /** The lead, for a child minted to serve one lane. Absent for a harness a person added. */
  readonly parentId?: string | undefined;
  /** True for a transient child scoped to one lane, which inherits its lead's settings. */
  readonly ephemeral?: boolean | undefined;
}

export interface NewToken {
  readonly id: string;
  readonly workspaceId: string;
  readonly harnessId: string;
  readonly tokenHash: string;
  readonly name: string;
  readonly createdAt: string;
}

/**
 * A token as anyone but its holder can see it: never the token, which Chips does not have —
 * only its digest (ADR 0006) — and never the digest either.
 */
export interface TokenView {
  readonly id: string;
  readonly name: string;
  readonly createdAt: string;
  readonly lastUsedAt: string | null;
  readonly revokedAt: string | null;
}

export interface HarnessRegistry {
  readonly addHarness: (harness: NewHarness) => Promise<void>;
  /** Hand a harness to another person (M5.2). Answers whether there was such a harness. */
  readonly setOwner: (input: {
    workspaceId: string;
    harnessId: string;
    ownerId: string;
  }) => Promise<boolean>;
  /**
   * Say again what a harness takes (ADR 0046): the list replaces the one it had. Answers whether
   * there was such a harness.
   */
  readonly setCapabilities: (input: {
    workspaceId: string;
    harnessId: string;
    capabilities: readonly string[];
  }) => Promise<boolean>;
  /**
   * Take a harness out of the workspace (ADR 0078): the row stays, marked with when. Answers
   * whether it did anything: a harness removed already keeps the first time, and says so.
   */
  readonly markRemoved: (input: {
    workspaceId: string;
    harnessId: string;
    at: string;
  }) => Promise<boolean>;
  readonly addToken: (token: NewToken) => Promise<void>;
  /** Every token a harness has ever had, newest first. */
  readonly tokens: (workspaceId: string, harnessId: string) => Promise<TokenView[]>;
  /**
   * Withdraw one token. Answers whether it did anything: revoking a token that is already
   * revoked, or was never this harness's, changes nothing and says so.
   */
  readonly revokeToken: (input: {
    workspaceId: string;
    harnessId: string;
    tokenId: string;
    at: string;
  }) => Promise<boolean>;
}
