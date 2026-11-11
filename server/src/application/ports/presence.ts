/**
 * Whether each harness can answer (ADR 0083): a socket of it open or not, any trouble it
 * reported, and whether a person asked it to restart (ADR 0094). State, not history: kept in
 * memory, written nowhere, forgotten at a restart.
 *
 * The WebSocket hub says when a harness's sockets open and close; the harness's own door says
 * what is wrong on its side; the participants read and the `presence` frame say it to people.
 */

import type { AgentState } from "@chipschat/protocol";

/** A harness's state changed. */
export type PresenceListener = (workspaceId: string, harnessId: string, state: AgentState) => void;

export interface Presence {
  /** What Chips knows now of a harness. */
  readonly stateOf: (workspaceId: string, harnessId: string) => AgentState;
  /**
   * A harness was just made: not connected, since now. Without it, one that took its key and has
   * not connected yet reads as offline since the server started, and its join card says at once
   * that it never connected (the onboarding audit, Part 2, item 9).
   */
  readonly added: (workspaceId: string, harnessId: string) => void;
  /** A socket of the harness opened, through the port or the relay. */
  readonly opened: (workspaceId: string, harnessId: string) => void;
  /** A socket of the harness closed. Offline only once none has opened again for a while. */
  readonly closed: (workspaceId: string, harnessId: string) => void;
  /** The harness says what is wrong on its side, or, with nothing, that nothing is. */
  readonly report: (
    workspaceId: string,
    harnessId: string,
    trouble: string | undefined,
  ) => AgentState;
  /**
   * A person asked the harness to restart (ADR 0094): restarting from now, until its next word —
   * a socket that opens, a status it reports — or the wait runs out. Asked again while it stands,
   * nothing changes. Returns the state after.
   */
  readonly restarting: (workspaceId: string, harnessId: string, by: string) => AgentState;
  /** Hear every change. Returns the function that stops it. */
  readonly watch: (listener: PresenceListener) => () => void;
  /** Stop every timer, for a clean shutdown. */
  readonly close: () => void;
}
