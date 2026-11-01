/**
 * One error envelope for the whole HTTP surface.
 *
 * A client branches on `code`, which is the same closed set the WebSocket `error` frame uses,
 * and shows `message`, which is written in the product voice. `request_id` is the thread back
 * to the log line, so "it failed at 14:31" becomes one grep.
 */

import type { Logger } from "@chipschat/platform";
import type { ErrorCode } from "@chipschat/protocol";
import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { AppendRefused } from "../../application/ports/index.js";

export interface ErrorEnvelope {
  readonly error: {
    readonly code: ErrorCode;
    readonly message: string;
    readonly request_id: string;
    readonly issues?: readonly { readonly path: string; readonly message: string }[];
    readonly retry_after_seconds?: number;
    /** Which rule refused it, for a client that says what to do next: `spent`, `expired`… */
    readonly refusal?: string;
  };
}

const STATUS: Readonly<Record<ErrorCode, ContentfulStatusCode>> = {
  protocol_unsupported: 400,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  invalid_event: 422,
  invalid_frame: 400,
  rate_limited: 429,
  payload_too_large: 413,
  too_far_behind: 409,
  budget_exhausted: 402,
  stale_file: 409,
  stale_context: 409,
  internal: 500,
};

export function statusFor(code: ErrorCode): ContentfulStatusCode {
  return STATUS[code];
}

/** Thrown by a route; turned into the envelope by the error handler. */
export class HttpError extends Error {
  override readonly name = "HttpError";
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly issues?: readonly { path: string; message: string }[],
    readonly retryAfterSeconds?: number,
    readonly refusal?: string,
  ) {
    super(message);
  }
}

export function errorBody(
  code: ErrorCode,
  message: string,
  requestId: string,
  issues?: readonly { path: string; message: string }[],
  retryAfterSeconds?: number,
  refusal?: string,
): ErrorEnvelope {
  return {
    error: {
      code,
      message,
      request_id: requestId,
      ...(issues === undefined ? {} : { issues }),
      ...(retryAfterSeconds === undefined ? {} : { retry_after_seconds: retryAfterSeconds }),
      ...(refusal === undefined ? {} : { refusal }),
    },
  };
}

/**
 * The store's own refusal (agents review, findings 5 to 8), from a route whose use case had asked
 * the one-room rule and lost a race to somebody else's write: the rule's words, as a refusal.
 */
function refusedByTheStore(error: AppendRefused): HttpError {
  const { kind, message } = error.refusal;
  // A file's name opens the words, and is not made a capital (ADR 0099).
  if (kind === "stale_file") return new HttpError(kind, message);
  return new HttpError(kind === "unknown_space" ? "not_found" : "forbidden", sentence(message));
}

/** A rule's words as a sentence, as the routes' own refusals are written. */
function sentence(words: string): string {
  const capital = words.charAt(0).toUpperCase() + words.slice(1);
  return /[.!?]$/.test(capital) ? capital : `${capital}.`;
}

/** A caught error as the envelope words it, or nothing when it is not one the server raised. */
function asHttpError(raised: unknown): HttpError | undefined {
  const error = raised instanceof AppendRefused ? refusedByTheStore(raised) : raised;
  return error instanceof HttpError ? error : undefined;
}

/**
 * Log a request that threw. A refusal, answered under 500, is the server doing its job: one line
 * at `info` with the rule and the words the caller was told, and no stack (findings AM-2, T-13).
 * Where a refusal matters on its own, its route says so too, as authentication's `warn` does.
 * Anything else is a fault, and goes in whole at `error`.
 */
export function logThrown(logger: Logger, raised: unknown): void {
  const error = asHttpError(raised);
  const status = error === undefined ? statusFor("internal") : statusFor(error.code);
  if (error === undefined || status >= 500) {
    logger.error({ err: raised }, "request failed");
    return;
  }
  logger.info(
    {
      status,
      code: error.code,
      ...(error.refusal === undefined ? {} : { refusal: error.refusal }),
      answer: error.message,
    },
    "request refused",
  );
}

/** Write the envelope for a caught error. Anything unrecognised is `internal`, never a leak. */
export function respondWithError(c: Context, raised: unknown, requestId: string): Response {
  const error = asHttpError(raised);
  if (error !== undefined) {
    return c.json(
      errorBody(
        error.code,
        error.message,
        requestId,
        error.issues,
        error.retryAfterSeconds,
        error.refusal,
      ),
      statusFor(error.code),
    );
  }
  // An unexpected error's message may carry anything, including a path or a query. The log
  // gets it; the caller gets a request id to quote.
  return c.json(
    errorBody("internal", "Something went wrong on our side.", requestId),
    statusFor("internal"),
  );
}
