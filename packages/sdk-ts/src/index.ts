/**
 * `@chipschat/harness` — Agent Connect for a harness you control (blueprint, Connect; ADR 0009's
 * sibling on the harness side). Import the client, emit events from inside your loop, and hear
 * messages, decisions and steering on a callback. Typed from `@chipschat/protocol` and dependent
 * on nothing else: Node 22's own `WebSocket` carries it. `join()` (ADR 0122) asks to come in, with
 * a link or a code a person allows, and keeps the key it is handed: `connect(await join(…))`.
 * Beyond the events: `promptFor` words a turn, and `rulesFor` with `SessionRules` lets a session
 * hear a room's rules once (ADR 0250); `upload` and `download` carry files, `settings`
 * keeps an agent's files, model, heartbeat and context window in step with its page, and a `store`
 * keeps what must survive a restart.
 */

/**
 * What a harness is handed with a question (ADR 0088): `message.new`'s `context`, and the plain
 * form the adapters write ahead of a turn's words.
 */
/**
 * Who is in the room and what an @ does (ADR 0092): `message.new`'s `room`. Put
 * `room.notes[<the agent taking the turn>]` at the top of its turn; `renderRoomNote` words it again
 * from `room.members` for an agent the note was not written for.
 */
export type {
  ContextBudget,
  ContextLine,
  RoomContext,
  RoomFile,
  RoomMember,
  RoomNote,
} from "@chipschat/protocol";
export {
  noteWithoutRules,
  renderContext,
  renderLine,
  renderReplyingTo,
  renderRoomNote,
} from "@chipschat/protocol";
export type { ClaimedSpace, SpaceAsked } from "./asks.js";
export { firstTurnOf } from "./asks.js";
export type {
  Agent,
  ConnectOptions,
  PostInput,
  RestartAsk,
  SocketLike,
  Speaker,
  StartRunInput,
} from "./connect.js";
export { Chips, ConnectError, connect } from "./connect.js";
export type { ChipsEvents, ConnectionState, Handler, Receipt } from "./events.js";
export type { Uploaded, UploadInput } from "./files.js";
export { PIECE_BYTES } from "./files.js";
export type { WorkingTurn } from "./heard.js";
export { overheardLine, workingTurnsOf } from "./heard.js";
export type { Joined, JoinOptions } from "./join.js";
export { filledIn, forgetJoin, helloOnce, JoinError, join, keptJoin } from "./join.js";
export type { KeyStore } from "./keep.js";
export { openKeyStore } from "./keep.js";
export type { LaneEvents, LaneOutcome, LaneState } from "./lane.js";
export { Lane } from "./lane.js";
export type { Ack } from "./outbox.js";
export { RefusedError } from "./outbox.js";
export type { FolderChange, FolderLook, ProjectOptions, Pushed } from "./project.js";
export { checkGit, heldNote, Project, pushedInWords, subjectOf } from "./project.js";
export type { PromptOptions } from "./prompt.js";
export { BEFORE_HEADING, heldWords, promptFor, rulesFor } from "./prompt.js";
export { SessionRules } from "./rules.js";
export type {
  Answer,
  ApprovalInput,
  AskInput,
  CompleteInput,
  ContextInput,
  Decision,
  FailInput,
  PlannedStep,
  QuestionInput,
  QuestionOption,
  RunEvents,
  StatusInput,
  StepInput,
  TaskInput,
  UsageInput,
} from "./run.js";
export { Run } from "./run.js";
export type { NamedFiles, Sendable, SendOptions, SentAnswer } from "./sending.js";
export {
  filesNamedIn,
  MOST_FILE_BYTES,
  MOST_FILES,
  readSendable,
  SENDING_FILES,
  sendAnswer,
  sendingFiles,
} from "./sending.js";
export type { Command, KeepSpec, Kept, ServiceFile, ServiceKind } from "./service.js";
export {
  appHolding,
  keepEnvironment,
  keepRunning,
  keptNode,
  nodeOnPath,
  runsKept,
  serviceFile,
  stopKeeping,
} from "./service.js";
export type {
  AgentContextCopy,
  AgentContextWindowCopy,
  AgentHeartbeatCopy,
  AgentModelCopy,
  HarnessContextCopy,
  HarnessJobsCopy,
  SettingsHandlers,
} from "./settings.js";
export { Refuse, Settings } from "./settings.js";
export type { StepName, StopWords } from "./steps.js";
export { reportStep, STEP_MARK } from "./steps.js";
export type { HarnessState, HarnessStore, OpenRun } from "./store.js";
export { fileStore, memoryStore } from "./store.js";
