/**
 * `@chipschat/platform` holds the cross-cutting primitives every other package leans on:
 * the typed configuration, the logger, the metric instruments and the clock. Identifiers
 * live in `@chipschat/protocol`, because an id is part of the wire format. It sits beside the layers rather than inside them, and imports nothing of ours,
 * so it can never become a back door from an outer layer to an inner one.
 */

export type {
  ChipsConfig,
  ConfigIssue,
  Environment,
  LoadConfigOptions,
  LogLevel,
  Machine,
} from "./config/index.js";
export {
  CHIPS_PUSH_RELAY,
  CHIPS_RELAY,
  ConfigError,
  configSchema,
  databaseUrlIn,
  defaultConfig,
  ENVIRONMENT_BINDINGS,
  EXPO_PUSH,
  loadConfig,
  logLevels,
  platformDataDir,
  platformLogDir,
  processEnvironment,
  pushUrlOf,
} from "./config/index.js";
export type { LogContext, Logger, LoggerOptions } from "./logging/index.js";
export { createLogger, fileDestination, REDACTED_PATHS, withContext } from "./logging/index.js";
export type { ReachableServer, RunCommand } from "./net/index.js";
export {
  accountName,
  countedAs,
  firstName,
  isVirtualInterface,
  machineName,
  networkUrl,
  reachableUrl,
} from "./net/index.js";
export type { ChipsInstruments } from "./observability/index.js";
export { createInstruments, METER_NAME } from "./observability/index.js";
export type { ProcessHost } from "./process/index.js";
export { exitOnUncaught, LAST_LINE_MS } from "./process/index.js";
export type { Err, Ok, Result } from "./result/index.js";
export { err, isErr, isOk, map, ok, unwrap } from "./result/index.js";
export type { Clock, LeadingClock, ManualClock } from "./time/index.js";
export { leadingClock, manualClock, systemClock } from "./time/index.js";
