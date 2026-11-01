/**
 * What a person may do to a space, as the store does it: what the room sheet (ADR 0151) asks of
 * the store, and the header and Shell hand it.
 */

import type { IssuedInvite, RoomFileOf, WorkspaceRole } from "@chipschat/core";
import type { JobSpend } from "@chipschat/protocol";
import type { ProjectActions } from "./Project.tsx";

export interface SpaceActions {
  readonly add: (participantId: string, kind: "person" | "harness" | "agent") => void;
  readonly remove: (participantId: string) => void;
  /** Leave the room yourself: `membership.removed` naming you, as `/leave` sends it. */
  readonly leave: () => void;
  readonly rename: (title: string) => void;
  /** Archive: `closed` on the wire (ADR 0066). */
  readonly close: () => void;
  readonly reopen: () => void;
  /**
   * Erase it from the server (ADR 0067); rejects with the server's reason. With `deleteAgent`,
   * its one agent goes in its harness too (ADR 0087, rule 5).
   */
  readonly erase: (options?: { readonly deleteAgent?: boolean }) => Promise<void>;
  /**
   * Choose who leads the room, or that nobody does (ADR 0104): the agent that hands out the work,
   * and that Chips hands what was nobody's turn once the room goes still.
   */
  readonly lead: (agentId: string | null) => Promise<void>;
  /**
   * Set what the room allows a job (ADR 0117), or `null` to follow the default again; rejects
   * with the server's reason.
   */
  readonly spend: (usd: number | null) => Promise<void>;
  /**
   * Lock the room's changes, or let them go (ADR 0156): while they are locked, nobody renames,
   * archives or deletes it. Rejects with the server's reason.
   */
  readonly lock: (locked: boolean) => Promise<void>;
  /** What the room's job has spent so far against what the room allows a job (ADR 0117). */
  readonly roomSpend: () => Promise<JobSpend>;
  /** Move an agent into this room from the one it is in (ADR 0087); rejects with the reason. */
  readonly move: (agentId: string) => Promise<void>;
  /**
   * Ask an agent's harness for a copy of it in this room (ADR 0087, Fork); rejects with the
   * reason. The room's line waits for the copy.
   */
  readonly fork: (agentId: string) => Promise<void>;
  /**
   * Ask a harness for a new agent in this room (ADR 0108), called `name`, or its harness's next
   * free name when that is empty; rejects with the reason. The room's line waits for the agent.
   */
  readonly ask: (harnessId: string, name: string) => Promise<void>;
  /**
   * The @ of a new agent that joined this room for an ask made here (ADR 0108), once: the field
   * holds it, ready for the agent's first job.
   */
  readonly takeArrival: () => string | undefined;
  /** Read where every agent is again, before Add offers them. */
  readonly refresh: () => Promise<void>;
  /**
   * Whether this person may archive it, and delete it, as core decides for both clients: neither,
   * while its changes are locked, but an archived room may still be unarchived (ADR 0156).
   */
  readonly mayArchive: boolean;
  readonly mayErase: boolean;
  /** The reader hid the room from their own list (ADR 0205). */
  readonly hidden: boolean;
  /** Whether the sheet offers Hide, or Unhide on a hidden room: core's `mayHideRoom`. */
  readonly mayHide: boolean;
  /** Hide the room from the reader's list, or put it back; rejects with the server's reason. */
  readonly hide: (hidden: boolean) => Promise<void>;
  /** The reader pinned the room to the top of their own list (ADR 0240). */
  readonly pinned: boolean;
  /** Whether the sheet offers Pin, or Unpin on a pinned room: core's `pinAct`. */
  readonly mayPin: boolean;
  /** Pin the room to the top, or let it go back to its place; rejects with the server's reason. */
  readonly pin: (pinned: boolean) => Promise<void>;
  /** The room's files at their current version, and one name's versions (ADR 0100). */
  readonly roomFiles: () => Promise<readonly RoomFileOf[]>;
  readonly fileVersions: (name: string) => Promise<readonly RoomFileOf[]>;
  /** The room's project (ADR 0222): what the Project page reads, and Undo. */
  readonly project?: ProjectActions | undefined;
  /**
   * A link into this room for somebody new (ADR 0168), made as You's Invite someone makes one:
   * whoever joins by it is put here. An owner's alone; rejects with the server's reason.
   */
  readonly invite?:
    | ((input: {
        readonly role: WorkspaceRole;
        readonly singleUse: boolean;
      }) => Promise<IssuedInvite>)
    | undefined;
  /** Withdraw a link just made here, as You's Invite someone does; rejects with the reason. */
  readonly withdrawInvite: (inviteId: string) => Promise<void>;
  /** The workspace as a sentence names it, for what a link into this room says. */
  readonly workspace?: string | undefined;
}
