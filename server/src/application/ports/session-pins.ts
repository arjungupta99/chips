/**
 * Which visit a person's messages in a space go to (ADR 0040), as a port.
 *
 * The pin is the person's own: read and written by them through `/v1/me/pins`, and by nobody
 * else — an owner and an admin included, for the reason ADR 0037 gives about anything private
 * on a shared server. It lives here rather than on the device because a session lives where its
 * harness is and not where the typing happens, so a pin set at the desk still holds on a phone.
 *
 * No pin is the ordinary case, and the ordinary case is what happens without one: the harness
 * chooses, as it always did.
 */

export interface SessionPin {
  readonly spaceId: string;
  readonly sessionRef: string;
}

export interface SessionPinRegistry {
  /** Every pin this person holds, so one read fills a client that has just connected. */
  readonly pins: (workspaceId: string, participantId: string) => Promise<SessionPin[]>;
  /** Pin a visit, replacing whatever was pinned for that space. */
  readonly pin: (input: {
    readonly workspaceId: string;
    readonly participantId: string;
    readonly spaceId: string;
    readonly sessionRef: string;
    readonly at: string;
  }) => Promise<void>;
  /** Let a space go back to whichever visit the harness would choose. */
  readonly unpin: (input: {
    readonly workspaceId: string;
    readonly participantId: string;
    readonly spaceId: string;
  }) => Promise<void>;
}
