/**
 * The faces a person chose for their spaces, as a port.
 *
 * Theirs alone: read and written through `/v1/me/space-icons`, and by nobody else — an owner or
 * an admin included, for the same reason a person's notification settings are private (Gate 5).
 * A shared server holds them and does not show them around.
 */

import type { SpaceIcon, SpaceIcons } from "@chipschat/protocol";

export interface SpaceIconRegistry {
  /** Every face this person chose in this workspace, by space id; empty when they chose none. */
  readonly forPerson: (workspaceId: string, participantId: string) => Promise<SpaceIcons>;
  readonly set: (input: {
    readonly workspaceId: string;
    readonly participantId: string;
    readonly spaceId: string;
    readonly icon: SpaceIcon;
    readonly at: string;
  }) => Promise<void>;
  /** Back to the default face. Clearing one that was never set is not an error. */
  readonly clear: (input: {
    readonly workspaceId: string;
    readonly participantId: string;
    readonly spaceId: string;
  }) => Promise<void>;
}
