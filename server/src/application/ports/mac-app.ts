/**
 * Chips for Mac on the machine this server runs on (ADR 0227's second addendum). When the owner's
 * phone asks to open a room's folder or page, or run its program, and no Chips for Mac of theirs is
 * open, the server opens this one at the room and hands the ask over once it connects.
 */
export interface MacApp {
  /** Opens Chips for Mac here at the room. Whether there was one to open. */
  readonly open: (spaceId: string) => Promise<boolean>;
}
