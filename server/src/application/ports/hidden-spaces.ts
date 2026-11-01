/**
 * The rooms a person hid from their own list (ADR 0205), as a port.
 *
 * Theirs alone: read and written through `/v1/me/hidden-spaces`, and by nobody else, an owner or
 * an admin included, as their faces for rooms are. The message notifier asks who hid a room, so
 * that a room somebody hid pushes them no message.
 */

export interface HiddenSpaceRegistry {
  /** The rooms this person hid in this workspace; empty when they hid none. */
  readonly forPerson: (workspaceId: string, participantId: string) => Promise<readonly string[]>;
  /** Who, of everybody, hid this room. */
  readonly hidersOf: (workspaceId: string, spaceId: string) => Promise<readonly string[]>;
  /** Hidden. Hiding one already hidden keeps when it was first hidden. */
  readonly hide: (input: {
    readonly workspaceId: string;
    readonly participantId: string;
    readonly spaceId: string;
    readonly at: string;
  }) => Promise<void>;
  /** Back on the list. Unhiding one that was never hidden is not an error. */
  readonly unhide: (input: {
    readonly workspaceId: string;
    readonly participantId: string;
    readonly spaceId: string;
  }) => Promise<void>;
}
