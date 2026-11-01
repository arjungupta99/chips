/**
 * `chipsd`. The layers are described in `docs/architecture.md`; the direction is inward only
 * and `dependency-cruiser` enforces it.
 */

export type {
  AppendResult,
  ApprovalView,
  AuthAttempt,
  Authenticator,
  AuthFailure,
  Clock,
  EventPage,
  EventStore,
  FanOut,
  IdGenerator,
  IncomingEvent,
  Listener,
  Principal,
  ReadModels,
  RunView,
  SocketTicket,
  SocketTickets,
  StoredEvent,
  SubmitEvent,
  SubmitFailure,
  SubmitResult,
  Subscription,
  Viewer,
  WaitForApproval,
  WaitOutcome,
} from "./application/index.js";
export {
  canSee,
  createSocketTickets,
  createSubmitEvent,
  createWaitForApproval,
  namesViewer,
  opensFor,
  SOCKET_TICKET_TTL_SECONDS,
} from "./application/index.js";
export type { Change, ProjectionTable, RunState, RunTransition } from "./domain/index.js";
export {
  applyRunTransition,
  isTerminal,
  nextRunState,
  PROJECTED_EVENT_TYPES,
  PROJECTION_TABLES,
  project,
  RUN_STATES,
  TERMINAL_RUN_STATES,
} from "./domain/index.js";
export type { BuildGatewayOptions, Gateway } from "./gateway.js";
export { buildGateway } from "./gateway.js";
export {
  OPERATOR_HEADER,
  operatorTokenFile,
  operatorTokenPath,
  readOperatorToken,
} from "./infrastructure/auth/operator.js";
export type { Connection, Database, Migration, MigrationResult } from "./infrastructure/index.js";
export {
  countEvents,
  createAuthenticator,
  createInProcessFanOut,
  createReadModels,
  createSqliteEventStore,
  DatabaseUrlError,
  HARNESS_TOKEN_PREFIX,
  hashHarnessToken,
  MIGRATIONS,
  migrateDown,
  migrateToLatest,
  mintHarnessToken,
  openDatabase,
  signingPayload,
  sqlitePathFrom,
  verifyDeviceSignature,
} from "./infrastructure/index.js";
export { createMacApp, macAppHere } from "./infrastructure/mac-app.js";
export { type MediaFound, mediaFound } from "./infrastructure/media/found.js";
export { createApp } from "./interfaces/http/app.js";
export type { GatewayDeps, GatewayEnv } from "./interfaces/http/context.js";
export type { ErrorEnvelope } from "./interfaces/http/errors.js";
export { HttpError } from "./interfaces/http/errors.js";
export type { WebSocketGateway } from "./interfaces/ws/server.js";
export { attachWebSocketGateway } from "./interfaces/ws/server.js";
export type { SessionOptions, Socket } from "./interfaces/ws/session.js";
export { Session } from "./interfaces/ws/session.js";
