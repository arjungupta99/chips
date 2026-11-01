/**
 * A person's notification settings and the claim ledger (M5.6), as a port.
 *
 * Settings are the person's own: read and written by them, through `/v1/me/notifications`,
 * and by nobody else, an owner or admin included — a shared server holds them and does not
 * show them around. The ledger is what makes one notification per event per person true when
 * a person has two devices, or one device twice: each asks to claim a key before it raises a
 * banner, the first to ask is granted it, and every later ask — another device's, or the same
 * one's after a reload — is told it was taken.
 */

import type { NotificationSettings } from "@chipschat/protocol";

export interface ClaimRequest {
  readonly workspaceId: string;
  readonly participantId: string;
  readonly deviceId: string;
  /** What is about to be notified: `approval:<id>`, `digest:review:<hour>`, and the like. */
  readonly keys: readonly string[];
  readonly at: string;
}

export interface NotificationRegistry {
  /** The person's settings, or nothing when they never saved any. */
  readonly settings: (
    workspaceId: string,
    participantId: string,
  ) => Promise<NotificationSettings | undefined>;
  readonly saveSettings: (input: {
    readonly workspaceId: string;
    readonly participantId: string;
    readonly settings: NotificationSettings;
    readonly at: string;
  }) => Promise<void>;
  /**
   * Claim keys for a device. The answer is the keys granted by this call and no other: not one
   * another device holds, and not one this device was granted before (Gate 5).
   */
  readonly claim: (request: ClaimRequest) => Promise<string[]>;
  /** Forget claims older than a moment: a banner from last week is nobody's to raise again. */
  readonly prune: (before: string) => Promise<number>;
}
