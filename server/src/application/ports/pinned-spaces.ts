/**
 * The rooms a person pinned to the top of their own list (ADR 0240), as a port.
 *
 * Theirs alone, as the rooms they hid are (ADR 0205): read and written through
 * `/v1/me/pinned-spaces`, and by nobody else, an owner or an admin included. Nothing else asks who
 * pinned a room, because a pin changes where a room stands on one person's list and nothing more.
 *
 * An archived room is pinned by nobody (Arjun, 4 November 2026: "Archived spaces should
 * automatically be unpinned"): archiving it lets go of every pin on it (`forgetSpace`), and a read
 * leaves out one archived some other way.
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
  /** Archived: pinned by nobody now, unarchived or not later. */
  readonly forgetSpace: (workspaceId: string, spaceId: string) => Promise<void>;
}
