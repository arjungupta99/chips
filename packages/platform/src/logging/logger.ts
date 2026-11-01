/**
 * Structured JSON logs with request, run and lane ids, and no personal data by default
 * (technical-plan 6.5). Secrets never appear in logs (6.4), which is why redaction is
 * part of the factory rather than something each caller remembers.
 */

import {
  type DestinationStream,
  type Logger as PinoLogger,
  pino,
  destination as pinoDestination,
} from "pino";
import prettyStream from "pino-pretty";
import type { LogLevel } from "../config/schema.js";

export type Logger = PinoLogger;

/** The ids an operator follows through the system when something is slow or wrong. */
export interface LogContext {
  readonly requestId?: string;
  readonly workspaceId?: string;
  readonly spaceId?: string;
  readonly runId?: string;
  readonly laneId?: string;
  readonly harnessId?: string;
}

export interface LoggerOptions {
  level?: LogLevel;
  /** Human-readable output for a terminal. Machines get one JSON object per line. */
  pretty?: boolean;
  /** Names the component, so `chipsd` and `chips` are told apart in one stream. */
  name?: string;
  /** Fields added to every line. */
  base?: Record<string, unknown>;
  /** Where the lines go. Defaults to stdout; tests pass a collector. Wins over `pretty`. */
  destination?: DestinationStream;
}

/**
 * A file the lines are appended to, its directory made if need be: where a server started by
 * `chips up` writes, so its terminal shows what a person needs and the log holds the rest. Made
 * owner-only (SEC-35): on Linux it lives under `~/.local/state`, and a log is a record of who
 * did what, redacted but not public.
 */
export function fileDestination(path: string): DestinationStream {
  return pinoDestination({ dest: path, mkdir: true, append: true, sync: false, mode: 0o600 });
}

/**
 * The names a secret travels under. A field so named — exactly, or with a prefix and a `_` or
 * a `-` before it, as `harness_token` and `x-chips-signature` are — is written as `[redacted]`
 * whatever it holds and wherever it sits (ADR 0006, SEC-23): at any depth of the object a line
 * carries, and in the bindings a child logger was made with. Tokens, keys, tickets, codes and
 * signatures are the things that end up in a support bundle by accident. `code` on its own is
 * not here: it names the rule a refused request met, on every such line, and a pairing code
 * travels as `pairing_code`.
 */
export const REDACTED_NAMES: readonly string[] = [
  "token",
  "authorization",
  "cookie",
  "password",
  "secret",
  "signature",
  "sig",
  "ticket",
  "invite",
  "pairing_code",
  "api_key",
  "public_key",
  "private_key",
];

/**
 * The names above as pino's paths, at the top and one level down: pino's own redaction is a
 * list of paths, and it is what reaches a child logger's bindings; `redacted` below is what
 * reaches every depth of a line.
 */
export const REDACTED_PATHS: readonly string[] = REDACTED_NAMES.flatMap((name) => [
  name,
  `*.${name}`,
]);

const SECRET_NAME = new RegExp(`^(?:.*[_-])?(?:${REDACTED_NAMES.join("|")})$`, "i");
const CENSOR = "[redacted]";
const MAX_DEPTH = 32;

/**
 * A copy of `value` with every secret-named field, at any depth, written as `[redacted]`. Plain
 * objects and arrays are walked; anything else — an `Error` on its way to its serializer, a
 * `Date`, a buffer — is left as it is. The caller's object is never changed.
 */
export function redacted(value: unknown, depth = 0, ancestors: object[] = []): unknown {
  if (typeof value !== "object" || value === null || depth > MAX_DEPTH) return value;
  if (ancestors.includes(value)) return value;
  const prototype = Object.getPrototypeOf(value);
  if (!Array.isArray(value) && prototype !== Object.prototype && prototype !== null) return value;
  ancestors.push(value);
  const copy = Array.isArray(value)
    ? value.map((each) => redacted(each, depth + 1, ancestors))
    : Object.fromEntries(
        Object.entries(value).map(([key, each]) => [
          key,
          SECRET_NAME.test(key) ? CENSOR : redacted(each, depth + 1, ancestors),
        ]),
      );
  ancestors.pop();
  return copy;
}

/**
 * A secret in a URL, wherever a line carries one: a message, an error's words, a field that is
 * a URL or a path. A grant's `sig` is a bearer for as long as it holds — a harness's, or one a
 * device handed its player (ADR 0058); a token or a ticket in a socket URL, an invite in a
 * link, a pairing code in a `chips://pair` link and a join link's secret in its path are the
 * same (SEC-23). Each is dropped from the line as it is written, not only from a field named
 * for it.
 */
const SECRET_IN_A_QUERY = /([?&#](?:sig|token|ticket|invite|code|pair)=)[A-Za-z0-9_.~%+/=-]+/g;
const SECRET_IN_A_JOIN_PATH = /(\/j\/)[A-Za-z0-9_-]{16,}/g;

/** The line as it will be written, with every secret in a URL dropped. */
export function withoutSecrets(line: string): string {
  return line.replace(SECRET_IN_A_QUERY, "$1[redacted]").replace(SECRET_IN_A_JOIN_PATH, "$1…");
}

export function createLogger(options: LoggerOptions = {}): Logger {
  const { level = "info", pretty = false, name, base, destination } = options;

  const settings = {
    level,
    base: { ...(name === undefined ? {} : { name }), ...base },
    redact: { paths: [...REDACTED_PATHS], censor: CENSOR },
    hooks: { streamWrite: withoutSecrets },
    formatters: {
      level: (label: string) => ({ level: label }),
      // Every depth, not only the paths above: the object a line carries, walked before pino
      // serializes it.
      log: (object: Record<string, unknown>) => redacted(object) as Record<string, unknown>,
    },
    timestamp: pino.stdTimeFunctions.isoTime,
  };

  // Pretty lines are formatted on this thread, as a stream, not by a transport: a transport
  // loads its target by name in a worker, which a bundled release has no module to give it.
  if (destination !== undefined) return pino(settings, destination);
  return pretty ? pino(settings, prettyStream({ colorize: true })) : pino(settings);
}

/** A child logger that stamps every line with the ids a runbook needs. */
export function withContext(logger: Logger, context: LogContext): Logger {
  return logger.child(compact(context));
}

function compact(context: LogContext): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(context)) {
    if (typeof value === "string" && value.length > 0) out[key] = value;
  }
  return out;
}
