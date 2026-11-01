/**
 * Merges defaults, a configuration file and the environment into one validated object,
 * in that order of increasing precedence, and returns a `Result` rather than throwing:
 * a bad port number is something a caller reports, not a stack trace (technical-plan 6.1).
 */

import type { z } from "zod";
import { err, ok, type Result } from "../result/index.js";
import { type Environment, processEnvironment } from "./environment.js";
import { databaseUrlIn } from "./places.js";
import { type ChipsConfig, configSchema } from "./schema.js";

/**
 * Environment variables, mapped explicitly. A table beats a naming convention here: it is
 * the documented surface, and `CHIPS_MAX_UNACKED_FRAMES` would otherwise be guesswork.
 */
export const ENVIRONMENT_BINDINGS: ReadonlyArray<readonly [string, readonly string[]]> = [
  ["CHIPS_MODE", ["mode"]],
  ["CHIPS_DEV_MODE", ["devMode"]],
  ["CHIPS_HOST", ["server", "host"]],
  ["CHIPS_PORT", ["server", "port"]],
  ["CHIPS_PUBLIC_URL", ["server", "publicUrl"]],
  ["CHIPS_WEB_DIR", ["server", "webDir"]],
  ["CHIPS_CONNECTORS", ["server", "connectors"]],
  ["CHIPS_DATA_DIR", ["data", "dir"]],
  ["CHIPS_DATABASE_URL", ["data", "databaseUrl"]],
  ["CHIPS_LOG_LEVEL", ["log", "level"]],
  ["CHIPS_LOG_PRETTY", ["log", "pretty"]],
  ["CHIPS_HEARTBEAT_SECONDS", ["realtime", "heartbeatSeconds"]],
  ["CHIPS_IDLE_TIMEOUT_SECONDS", ["realtime", "idleTimeoutSeconds"]],
  ["CHIPS_MAX_UNACKED_FRAMES", ["realtime", "maxUnackedFrames"]],
  ["CHIPS_SWEEP_SECONDS", ["realtime", "sweepSeconds"]],
  ["CHIPS_ATTACHMENT_SECRET", ["attachments", "secret"]],
  ["CHIPS_FFMPEG", ["media", "ffmpegPath"]],
  ["CHIPS_FFPROBE", ["media", "ffprobePath"]],
  ["CHIPS_WHISPER", ["media", "whisperPath"]],
  ["CHIPS_WHISPER_MODEL", ["media", "whisperModel"]],
  ["CHIPS_PASSKEY_ORIGINS", ["auth", "passkeyOrigins"]],
  ["CHIPS_RELAY_URL", ["relay", "url"]],
  ["CHIPS_RELAY_HOST", ["relay", "host"]],
  ["CHIPS_RELAY_PORT", ["relay", "port"]],
  ["CHIPS_RELAY_MAX_SESSIONS_PER_SERVER", ["relay", "maxSessionsPerServer"]],
  ["CHIPS_RELAY_ALLOW_KEYS", ["relay", "allowKeys"]],
  ["CHIPS_RELAY_COUNTS_FILE", ["relay", "countsFile"]],
  ["CHIPS_PUSH_URL", ["push", "url"]],
  ["CHIPS_PUSH_ACCESS_TOKEN", ["push", "accessToken"]],
  ["CHIPS_MAX_MESSAGE_BYTES", ["limits", "maxMessageBytes"]],
  ["CHIPS_MAX_ATTACHMENT_BYTES", ["limits", "maxAttachmentBytes"]],
  ["CHIPS_MAX_PROJECT_BYTES", ["limits", "maxProjectBytes"]],
  ["CHIPS_MAX_BODY_BYTES", ["limits", "maxBodyBytes"]],
  ["CHIPS_MAX_PENDING_APPROVALS_PER_HARNESS", ["limits", "maxPendingApprovalsPerHarness"]],
  ["CHIPS_SIGNED_URL_TTL_SECONDS", ["limits", "signedUrlTtlSeconds"]],
];

export interface ConfigIssue {
  /** Dotted path to the offending setting, for example `server.port`. */
  readonly path: string;
  readonly message: string;
  /** The environment variable that set it, when the environment is to blame. */
  readonly source?: string;
}

export class ConfigError extends Error {
  override readonly name = "ConfigError";
  constructor(readonly issues: readonly ConfigIssue[]) {
    super(
      `configuration is invalid:\n${issues.map((i) => `  ${i.path}: ${i.message}`).join("\n")}`,
    );
  }
}

export interface LoadConfigOptions {
  /** Parsed contents of a configuration file, if there is one. */
  file?: unknown;
  /** Defaults to a snapshot of `process.env`. */
  environment?: Environment;
}

/** Merge, validate, and report every problem at once rather than the first one. */
export function loadConfig(options: LoadConfigOptions = {}): Result<ChipsConfig, ConfigError> {
  const environment = options.environment ?? processEnvironment();
  const merged = withDatabaseInDataDir(
    mergeDeep(asRecord(options.file), environmentOverrides(environment)),
  );

  const parsed = configSchema.safeParse(merged);
  if (!parsed.success) {
    return err(new ConfigError(describeIssues(parsed.error, environment)));
  }
  return ok(parsed.data);
}

/**
 * A data directory named without a database means the database inside it. Before this, setting
 * only `CHIPS_DATA_DIR` moved the operator token and the models but left the database in
 * `./.chips`, a split nobody would ask for.
 */
function withDatabaseInDataDir(merged: Record<string, unknown>): Record<string, unknown> {
  const data = merged["data"];
  if (!isPlainObject(data)) return merged;
  const dir = data["dir"];
  if (typeof dir !== "string" || dir === "" || data["databaseUrl"] !== undefined) return merged;
  return { ...merged, data: { ...data, databaseUrl: databaseUrlIn(dir) } };
}

function environmentOverrides(environment: Environment): Record<string, unknown> {
  const overrides: Record<string, unknown> = {};
  for (const [variable, path] of ENVIRONMENT_BINDINGS) {
    const value = environment[variable];
    if (value !== undefined && value !== "") setPath(overrides, path, value);
  }
  return overrides;
}

/** Which environment variable, if any, set the setting at this path, or the list it is one of. */
function sourceOf(path: readonly PropertyKey[], environment: Environment): string | undefined {
  const dotted = path.join(".");
  for (const [variable, bound] of ENVIRONMENT_BINDINGS) {
    const setting = bound.join(".");
    const under = dotted === setting || dotted.startsWith(`${setting}.`);
    if (under && environment[variable] !== undefined) return variable;
  }
  return undefined;
}

function describeIssues(error: z.ZodError, environment: Environment): ConfigIssue[] {
  return error.issues.map((issue) => {
    const source = sourceOf(issue.path, environment);
    const described: ConfigIssue = {
      path: issue.path.join(".") || "(root)",
      message: issue.message,
    };
    return source === undefined ? described : { ...described, source };
  });
}

function setPath(target: Record<string, unknown>, path: readonly string[], value: unknown): void {
  let cursor = target;
  for (let i = 0; i < path.length - 1; i += 1) {
    const key = path[i] ?? "";
    const existing = cursor[key];
    if (!isPlainObject(existing)) cursor[key] = {};
    cursor = cursor[key] as Record<string, unknown>;
  }
  cursor[path[path.length - 1] ?? ""] = value;
}

function mergeDeep(
  base: Record<string, unknown>,
  overlay: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(overlay)) {
    const existing = out[key];
    out[key] = isPlainObject(existing) && isPlainObject(value) ? mergeDeep(existing, value) : value;
  }
  return out;
}

function asRecord(value: unknown): Record<string, unknown> {
  return isPlainObject(value) ? value : {};
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
