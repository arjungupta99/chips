/**
 * Direct asks (ADR 0211, Phase 3): a guest asks the workspace's owners to share the server's
 * machine with them in Tailscale; an owner answers with Tailscale's share link; the guest is
 * direct once their socket arrives other than through the relay. A registry, never the log: the
 * link lets whoever holds it onto the owner's machine.
 */

export type DirectAskState = "asked" | "shared" | "direct";

export interface DirectAsk {
  readonly id: string;
  readonly workspaceId: string;
  readonly participantId: string;
  readonly deviceId: string | null;
  readonly state: DirectAskState;
  readonly tripMs: number | null;
  readonly link: string | null;
  readonly sharedBy: string | null;
  readonly createdAt: string;
  readonly sharedAt: string | null;
  readonly directAt: string | null;
}

export interface DirectAskRegistry {
  readonly create: (ask: DirectAsk) => Promise<void>;
  /** The person's newest ask, whatever its state. */
  readonly latestFor: (
    workspaceId: string,
    participantId: string,
  ) => Promise<DirectAsk | undefined>;
  /** Asks no owner has answered yet, oldest first. */
  readonly waiting: (workspaceId: string) => Promise<readonly DirectAsk[]>;
  readonly get: (workspaceId: string, id: string) => Promise<DirectAsk | undefined>;
  /** Shared, if it was still asked: compare and set, so two owners cannot both answer. */
  readonly share: (
    workspaceId: string,
    id: string,
    change: { readonly link: string; readonly by: string; readonly at: string },
  ) => Promise<DirectAsk | undefined>;
  /** Direct, if it was shared. */
  readonly direct: (workspaceId: string, id: string, at: string) => Promise<DirectAsk | undefined>;
  /** The link an owner chose to give the next guest who asks, if any. */
  readonly keptLink: (workspaceId: string) => Promise<string | undefined>;
  /** Keep a link for the next guest, or forget the one kept. */
  readonly keep: (
    workspaceId: string,
    kept: { readonly link: string; readonly by: string; readonly at: string } | undefined,
  ) => Promise<void>;
}
