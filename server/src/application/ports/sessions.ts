/**
 * The live sockets, from the application's side.
 *
 * A credential that has been withdrawn should stop working now rather than at the next
 * heartbeat (ADR 0023), and the only thing that can end a socket is whatever is holding it. The
 * application says what it wants; the WebSocket adapter is what can do it. Before the gateway
 * listens there are no sockets, and the answer is nought.
 */

import type {
  ContextEditFrame,
  FolderOpenFrame,
  FolderRunFrame,
  FolderRunStateFrame,
  HeartbeatChangeFrame,
  JobChangeFrame,
  JoinRequestView,
  ModelChangeFrame,
  ReadFrame,
  WindowChangeFrame,
  WindowCompactFrame,
} from "@chipschat/protocol";

export interface Sessions {
  /** End every socket opened with this token. Returns how many there were. */
  readonly closeToken: (tokenId: string) => number;
  /** End every socket a device holds, because the device was withdrawn (ADR 0034). */
  readonly closeDevice: (deviceId: string) => number;
  /**
   * End every socket a person holds, because they were removed from the workspace (ADR 0160),
   * with a close of its own, so their screen says so rather than asking them to pair again.
   */
  readonly closePerson: (workspaceId: string, participantId: string) => number;
  /**
   * Ask a harness to restart (ADR 0094): the `restart` frame to every socket of it that said it
   * hears one in its `hello`. Returns how many were sent it; nought means nobody heard.
   */
  readonly restart: (
    workspaceId: string,
    harnessId: string,
    ask: { readonly by: string; readonly at: string },
  ) => number;
  /**
   * Tell the people who may decide of a join request (ADR 0122): the `join` frame to every socket
   * of an owner or admin in the workspace that said `join` in its `hello`. Returns how many.
   */
  readonly join: (workspaceId: string, request: JoinRequestView, to?: string) => number;
  /**
   * Ask a person's own Mac to open a room's folder (ADR 0225), or run or stop its project
   * (ADR 0226): the frame to every socket of that person that said `folders` in its `hello`.
   * Returns how many; nought means no Chips for Mac of theirs is open.
   */
  readonly askMacs: (
    workspaceId: string,
    participantId: string,
    frame: FolderOpenFrame | FolderRunFrame,
  ) => number;
  /** How many of a person's sockets said `folders`: their Chips for Mac, open now. */
  readonly macs: (workspaceId: string, participantId: string) => number;
  /**
   * How many Macs of a person's are open, once one is (ADR 0227's second addendum): at once if
   * one is, else as soon as a socket of theirs says `folders`, else nought after `withinMs`.
   */
  readonly whenMac: (
    workspaceId: string,
    participantId: string,
    withinMs: number,
  ) => Promise<number>;
  /**
   * How a person's run stands, as their Mac said it (ADR 0226): `folder.run_state` to every socket
   * of theirs that said `folder_runs`, and nobody else's. Returns how many.
   */
  readonly runState: (
    workspaceId: string,
    participantId: string,
    frame: FolderRunStateFrame,
  ) => number;
  /**
   * How far a person read, on one of their devices (ADR 0262): `read` to every socket of theirs
   * that said `reads`, and nobody else's. Returns how many.
   */
  readonly reads: (workspaceId: string, participantId: string, frame: ReadFrame) => number;
  /**
   * Send a person's edit of a context file to its harness (ADR 0134): the `context.edit` frame to
   * every socket of it that said `context` in its `hello`. Returns how many; nought means nobody
   * heard, and the edit is refused.
   */
  readonly contextEdit: (workspaceId: string, harnessId: string, frame: ContextEditFrame) => number;
  /** How many sockets of a harness said `context` in their `hello`: nought, and it is away. */
  readonly hearingContext: (workspaceId: string, harnessId: string) => number;
  /**
   * Send a person's change of an agent's model to its harness (ADR 0140): the `model.change` frame
   * to every socket of it that said `models` in its `hello`. Returns how many; nought means nobody
   * heard, and the change is refused.
   */
  readonly modelChange: (workspaceId: string, harnessId: string, frame: ModelChangeFrame) => number;
  /** How many sockets of a harness said `models` in their `hello`: nought, and it is away. */
  readonly hearingModels: (workspaceId: string, harnessId: string) => number;
  /**
   * Send a person's change of an agent's heartbeat to its harness (ADR 0143): the
   * `heartbeat.change` frame to every socket of it that said `heartbeats` in its `hello`. Returns
   * how many; nought means nobody heard, and the change is refused.
   */
  readonly heartbeatChange: (
    workspaceId: string,
    harnessId: string,
    frame: HeartbeatChangeFrame,
  ) => number;
  /** How many sockets of a harness said `heartbeats` in their `hello`: nought, and it is away. */
  readonly hearingHeartbeats: (workspaceId: string, harnessId: string) => number;
  /**
   * Send a person's Compact now to an agent's harness (ADR 0146): the `context_window.compact`
   * frame to every socket of it that said `context_windows` in its `hello`. Returns how many;
   * nought means nobody heard, and the ask is refused.
   */
  readonly windowCompact: (
    workspaceId: string,
    harnessId: string,
    frame: WindowCompactFrame,
  ) => number;
  /** A person's new limit for an agent, the same way, as `context_window.change` (ADR 0146). */
  readonly windowChange: (
    workspaceId: string,
    harnessId: string,
    frame: WindowChangeFrame,
  ) => number;
  /** How many sockets of a harness said `context_windows` in their `hello`: nought, and it is away. */
  readonly hearingWindows: (workspaceId: string, harnessId: string) => number;
  /**
   * Send a person's switch of one of a harness's own jobs to it (ADR 0252): the `job.change` frame
   * to every socket of it that said `jobs` in its `hello`. Returns how many; nought means nobody
   * heard, and the change is refused.
   */
  readonly jobChange: (workspaceId: string, harnessId: string, frame: JobChangeFrame) => number;
  /** How many sockets of a harness said `jobs` in their `hello`: nought, and it is away. */
  readonly hearingJobs: (workspaceId: string, harnessId: string) => number;
}
