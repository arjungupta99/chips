/**
 * The rooms a person pinned to the top of their own list (ADR 0240), as a port.
 *
 * Theirs alone, as the rooms they hid are (ADR 0205): read and written through
 * `/v1/me/pinned-spaces`, and by nobody else, an owner or an admin included. Nothing else asks who
 * pinned a room, because a pin changes where a room stands on one person's list and nothing more.
 */

export interface PinnedSpaceRegistry {
  /** The rooms this person pinned in this workspace, the newest pin first; empty when none. */
  readonly forPerson: (workspaceId: string, participantId: string) => Promise<readonly string[]>;
  /** Pinned. Pinning one already pinned keeps when it was first pinned, and so its place. */
  readonly pin: (input: {
    readonly workspaceId: string;
    readonly participantId: string;
    readonly spaceId: string;
    readonly at: string;
  }) => Promise<void>;
  /** Back among the rest. Unpinning one that was never pinned is not an error. */
  readonly unpin: (input: {
    readonly workspaceId: string;
    readonly participantId: string;
    readonly spaceId: string;
  }) => Promise<void>;
}
