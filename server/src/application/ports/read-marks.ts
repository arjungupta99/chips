/**
 * How far each person has read each room (ADR 0262), as a port.
 *
 * Theirs alone, as the rooms they pinned are (ADR 0240): read and written through `/v1/me/read`,
 * and by nobody else. A mark moves only forward, so two devices of one person writing at once
 * leave the further of the two.
 */

export interface ReadMarkRegistry {
  /** How far this person has read in this workspace, by room; empty when nowhere yet. */
  readonly forPerson: (
    workspaceId: string,
    participantId: string,
  ) => Promise<Readonly<Record<string, number>>>;
  /**
   * Each room's mark moved forward to the one given, where that is further than the one kept.
   * Answers the ones that moved, and where to.
   */
  readonly advance: (input: {
    readonly workspaceId: string;
    readonly participantId: string;
    readonly marks: Readonly<Record<string, number>>;
    readonly at: string;
  }) => Promise<Readonly<Record<string, number>>>;
}
