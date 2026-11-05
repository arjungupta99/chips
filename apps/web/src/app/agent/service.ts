/**
 * What an agent's pages ask the store for, and do through it: the Agents page, an agent's card,
 * its history and its room picker. A file of its own so those take it without importing the page.
 */

import type { AgentStay } from "@chipschat/core";
import type { SpaceIcon } from "@chipschat/protocol";

/** What the page asks the store for, and does through it. */
export interface AgentsService {
  readonly stays: (agentId: string) => Promise<readonly AgentStay[]>;
  /** Move an agent in a room to another; rejects with the server's reason. */
  readonly move: (agentId: string, spaceId: string) => Promise<void>;
  /** Ask its harness for a copy of it in a room (ADR 0087, Fork); rejects with the reason. */
  readonly fork: (agentId: string, spaceId: string) => Promise<void>;
  /** A new room, named as the copy will be, with a fork asked for in it; its id once asked. */
  readonly forkRoom: (agentId: string, title: string) => Promise<string>;
  /** Put a free agent in a room: any member's (rule 4). */
  readonly put: (agentId: string, spaceId: string) => void;
  /** A new room with a free agent in it, named after it; its id. */
  readonly newRoom: (agentId: string, title: string) => string;
  readonly refresh: () => Promise<void>;
  /** Rename an agent, for everybody (ADR 0091); rejects with the server's reason. */
  readonly rename: (agentId: string, name: string) => Promise<void>;
  /** Archive an agent, or bring it back (ADR 0095); rejects with the server's reason. */
  readonly archive: (agentId: string, archived: boolean) => Promise<void>;
  /** Delete an agent, and its room with it when asked (ADR 0095); rejects with the reason. */
  readonly remove: (agentId: string, options: { readonly deleteRoom: boolean }) => Promise<void>;
  /**
   * Lock an agent's changes, or let them go (ADR 0199): while they are locked, nobody renames,
   * archives or deletes it. Rejects with the server's reason.
   */
  readonly lock: (agentId: string, locked: boolean) => Promise<void>;
  /** Change an agent's face, for everybody (ADR 0089, 0272); rejects with the server's reason. */
  readonly face: (agentId: string, face: SpaceIcon | undefined) => Promise<void>;
}
