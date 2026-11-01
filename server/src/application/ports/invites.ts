/**
 * The invite registry (ADR 0034): a capability with a role attached, stored as a digest.
 * A registry, not a projection — the token must never be in the log — like the harness tokens
 * beside it. What the audit records is the `person.joined` a redemption appends.
 */

import type { WorkspaceRole } from "../../domain/index.js";

export interface NewInvite {
  readonly id: string;
  readonly workspaceId: string;
  readonly tokenHash: string;
  readonly role: WorkspaceRole;
  readonly singleUse: boolean;
  readonly createdBy: string;
  readonly createdAt: string;
  readonly expiresAt: string;
  /** The space it brings whoever opens it into (ADR 0168); absent for the workspace alone. */
  readonly spaceId?: string | undefined;
  /** Redeeming it waits for its maker's Allow: it went out as the relay's page (ADR 0232). */
  readonly asks: boolean;
}

/** An invite as anyone may see it: never the token, which only the link ever held. */
export interface InviteView {
  readonly id: string;
  readonly workspaceId: string;
  readonly role: WorkspaceRole;
  readonly singleUse: boolean;
  readonly uses: number;
  readonly createdBy: string;
  readonly createdAt: string;
  readonly expiresAt: string;
  readonly revokedAt: string | null;
  /** The space it brings whoever opens it into (ADR 0168), or `null` for the workspace alone. */
  readonly spaceId: string | null;
  /** Redeeming it waits for its maker's Allow (ADR 0232). */
  readonly asks: boolean;
}

export interface InviteRegistry {
  readonly addInvite: (invite: NewInvite) => Promise<void>;
  /** The invite a token names, by its digest, whatever its state. */
  readonly inviteByHash: (tokenHash: string) => Promise<InviteView | undefined>;
  /** One invite by id, in a workspace, whatever its state: what a waiting request spends. */
  readonly invite: (workspaceId: string, inviteId: string) => Promise<InviteView | undefined>;
  /** Every invite a workspace has made, newest first. */
  readonly invitesIn: (workspaceId: string) => Promise<InviteView[]>;
  /** Withdraw one. Answers whether it did anything. */
  readonly revokeInvite: (input: {
    workspaceId: string;
    inviteId: string;
    at: string;
  }) => Promise<boolean>;
  /**
   * Count a redemption. For a single-use invite this is the moment it is spent, and the
   * answer says whether this caller was the one to spend it — two redeemers racing for one
   * invite are told apart here, not by the lookup before.
   */
  readonly noteUse: (input: {
    workspaceId: string;
    inviteId: string;
    singleUse: boolean;
  }) => Promise<boolean>;
}
