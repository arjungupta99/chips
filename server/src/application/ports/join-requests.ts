/**
 * The join-request registry (ADR 0122): something asking to join, stored as a digest of its
 * secret, with what a person made of it. A registry, not a projection, like invites beside it:
 * the secret must never be in the log. What the audit records is `join.allowed` or `join.denied`.
 */

import type { JoinKind, JoinStartedBy, JoinState } from "@chipschat/protocol";
import type { WorkspaceRole } from "../../domain/index.js";

export interface JoinRequest {
  readonly id: string;
  readonly workspaceId: string;
  readonly kind: JoinKind;
  readonly code: string | null;
  readonly name: string | null;
  readonly software: string | null;
  readonly machine: string | null;
  readonly fromAddr: string | null;
  /** What a harness asked to do. */
  readonly wants: readonly string[];
  /** A device's public key; null for a harness. */
  readonly publicKey: string | null;
  /** As stored: a request past its expiry reads `waiting` or `allowed` until the sweep. */
  readonly state: JoinState;
  /** What a person allowed. */
  readonly capabilities: readonly string[];
  readonly startedBy: JoinStartedBy;
  readonly url: string;
  readonly decidedBy: string | null;
  readonly decidedAt: string | null;
  readonly createdAt: string;
  readonly expiresAt: string;
  readonly harnessId: string | null;
  readonly spaceId: string | null;
  readonly deviceId: string | null;
  /**
   * Whom a device is paired as, when the owner who allowed it chose somebody already here whose
   * phone is new (ADR 0206); null for the person who allowed it.
   */
  readonly pairAs: string | null;
  /**
   * The one person who decides a link's request, an invite's or a pairing code's (ADR 0232): who
   * handed the link out. `null` for a harness's or a device's, which any owner or admin decides.
   */
  readonly askedOf: string | null;
  /** The invite an `invite` request spends when it is collected; `null` otherwise. */
  readonly inviteId: string | null;
  /** The role that invite gives; `null` otherwise. */
  readonly role: WorkspaceRole | null;
  /** The device a pairing code was made to replace, signed out once this one pairs (ADR 0236). */
  readonly replaces: string | null;
}

/** A request as it is first kept: what a redeem makes is not known yet. */
export interface NewJoinRequest extends Omit<JoinRequest, "harnessId" | "deviceId"> {
  readonly secretHash: string;
}

/** What a decision, or a link being taken up, changes. */
export interface JoinChange {
  readonly state?: JoinState;
  readonly capabilities?: readonly string[];
  readonly decidedBy?: string;
  readonly decidedAt?: string;
  readonly name?: string | null;
  readonly software?: string | null;
  readonly machine?: string | null;
  readonly fromAddr?: string | null;
  readonly harnessId?: string;
  readonly spaceId?: string | null;
  readonly deviceId?: string;
  readonly pairAs?: string | null;
}

export interface JoinRegistry {
  readonly add: (request: NewJoinRequest) => Promise<void>;
  /** One request by id, whatever its state. */
  readonly byId: (id: string) => Promise<JoinRequest | undefined>;
  /** The request a secret names, by its digest, whatever its state. */
  readonly bySecretHash: (secretHash: string) => Promise<JoinRequest | undefined>;
  /** Whether this digest is the request's: compared in constant time by the adapter's caller. */
  readonly secretHashOf: (id: string) => Promise<string | undefined>;
  /** A workspace's requests in these states, newest first. */
  readonly inStates: (workspaceId: string, states: readonly JoinState[]) => Promise<JoinRequest[]>;
  /** Requests still waiting for a person, not yet past their expiry. */
  readonly waitingCount: (workspaceId: string, now: string) => Promise<number>;
  /**
   * Change a request, only while it is in the state given and not past its expiry. Answers
   * whether it did, so two people deciding at once, or a decision and a redeem, are told apart
   * inside the database.
   */
  readonly change: (input: {
    readonly id: string;
    readonly from: JoinState;
    readonly now: string;
    readonly change: JoinChange;
  }) => Promise<boolean>;
  /** Record what a redeem made: the harness and its room, or the device. Already `redeemed`. */
  readonly made: (id: string, change: JoinChange) => Promise<void>;
  /** Mark every request past its expiry and never redeemed as expired; answers them, changed. */
  readonly expire: (now: string) => Promise<JoinRequest[]>;
}
