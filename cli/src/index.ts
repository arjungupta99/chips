/**
 * `@chipschat/cli` — what `chips` does, as functions. The binary in `bin/chips.ts` parses the
 * arguments and prints; everything it calls is here, and takes its console, its clock and its
 * network as arguments, so a test drives the whole command rather than a piece of it.
 */

export type {
  ConformanceAdapter,
  ConformanceOptions,
  Conformed,
} from "./commands/conformance.js";
export { CONFORMANCE_ADAPTERS, conformance, conformanceAdapters } from "./commands/conformance.js";
export type { Connected, ConnectOptions } from "./commands/connect.js";
export { connect } from "./commands/connect.js";
export type { HarnessAddress } from "./commands/custom.js";
export { environmentLines, HELLO_LINES, sayCustom } from "./commands/custom.js";
export type { Declared, DeclareOptions } from "./commands/declare.js";
export { declare } from "./commands/declare.js";
export type { Disconnected, DisconnectOptions } from "./commands/disconnect.js";
export { disconnect } from "./commands/disconnect.js";
export type { DoctorOptions, Finding, Health } from "./commands/doctor.js";
export { doctor, report } from "./commands/doctor.js";
export type { DownDeps } from "./commands/down.js";
export { down } from "./commands/down.js";
export type { JoinCommandOptions } from "./commands/join.js";
export { exportLines, joinChips } from "./commands/join.js";
export type { IssuedCode, IssueOptions, OperatorServer } from "./commands/pair.js";
export {
  issuePairingCode,
  PAIR_DEFAULT_SERVER,
  pairingAsked,
  pairingFailed,
  requestPairingCode,
} from "./commands/pair.js";
export type { RelayOptions } from "./commands/relay.js";
export { relay } from "./commands/relay.js";
export type { Removed, RemoveOptions } from "./commands/remove.js";
export { remove } from "./commands/remove.js";
export type { ServeOptions, Serving } from "./commands/serve.js";
export { serve } from "./commands/serve.js";
export type { Snapshot } from "./commands/transfer.js";
export {
  ATTACHMENTS_DIR,
  attachmentFiles,
  EXPORTED_TABLES,
  exportWorkspace,
  ImportError,
  importWorkspace,
  readFolder,
  restoreAttachments,
  SNAPSHOT_FILE,
  writeFolder,
} from "./commands/transfer.js";
export type { UninstallDeps, UninstallFlags } from "./commands/uninstall.js";
export { uninstall, uninstallPlan } from "./commands/uninstall.js";
export type { Up, UpDeps, UpFlags, UpOptions, UpPath } from "./commands/up.js";
export { planUp, up } from "./commands/up.js";
export type { Connection, Harness } from "./connections.js";
export { accountFor, readConnections, writeConnection } from "./connections.js";
export type { CliDevice } from "./device.js";
export {
  call,
  loadDevice,
  newDeviceKey,
  PairingError,
  pairDevice,
  publicKeyOf,
  signRequest,
  storeDevice,
} from "./device.js";
export type { Advertisement, FoundServer } from "./discovery.js";
export { advertise, browse, SERVICE_TYPE } from "./discovery.js";
export type { FirstRun } from "./first-run.js";
export { ensureWorkspace } from "./first-run.js";
export type {
  HarnessAdapter,
  HarnessConnection,
  SubjectContext,
  SubjectFactory,
} from "./harnesses.js";
export {
  adapterFor,
  conformable,
  connectable,
  connectionShapeOf,
  customAdapter,
  harnessAdapters,
} from "./harnesses.js";
export { configHome, connectionsPath, devicePath } from "./home.js";
export type { Keychain, SecretStore } from "./keychain.js";
export { openKeychain } from "./keychain.js";
export type { Console } from "./output.js";
export { facts, heading, scriptedConsole, systemConsole } from "./output.js";
