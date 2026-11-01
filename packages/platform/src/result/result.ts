/**
 * Errors are values at boundaries (technical-plan 6.1). A boundary that can fail for a
 * reason the caller is expected to handle returns a `Result` rather than throwing, so the
 * failure shows up in the type and cannot be forgotten.
 */

export type Ok<T> = { readonly ok: true; readonly value: T };
export type Err<E> = { readonly ok: false; readonly error: E };
export type Result<T, E> = Ok<T> | Err<E>;

export function ok<T>(value: T): Ok<T> {
  return { ok: true, value };
}

export function err<E>(error: E): Err<E> {
  return { ok: false, error };
}

export function isOk<T, E>(result: Result<T, E>): result is Ok<T> {
  return result.ok;
}

export function isErr<T, E>(result: Result<T, E>): result is Err<E> {
  return !result.ok;
}

/** Unwrap a result, throwing the supplied error when it failed. For tests and startup paths. */
export function unwrap<T, E>(result: Result<T, E>, toError: (error: E) => Error): T {
  if (result.ok) return result.value;
  throw toError(result.error);
}

export function map<T, U, E>(result: Result<T, E>, fn: (value: T) => U): Result<U, E> {
  return result.ok ? ok(fn(result.value)) : result;
}
