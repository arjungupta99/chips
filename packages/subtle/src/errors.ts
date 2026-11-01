/**
 * WebCrypto's errors, as callers catch them.
 *
 * A runtime with a real `crypto.subtle` throws `DOMException`s with these names, and code that
 * branches on `error.name` — or simply reports it — should read the same either way. Node has a
 * `DOMException` and so does every browser; where it is missing, this is an `Error` wearing the
 * same name.
 */

export type SubtleErrorName =
  | "NotSupportedError"
  | "InvalidAccessError"
  | "OperationError"
  | "DataError";

/** A `DOMException` of that name where the runtime has one, and an `Error` of it where it has not. */
export function subtleError(name: SubtleErrorName, message: string): Error {
  const Exception = (globalThis as { DOMException?: typeof DOMException }).DOMException;
  if (Exception !== undefined) return new Exception(message, name);
  const error = new Error(message);
  Object.defineProperty(error, "name", { value: name, configurable: true });
  return error;
}

/** What this package does not do. The message says so rather than failing somewhere deeper. */
export function unsupported(what: string): Error {
  return subtleError(
    "NotSupportedError",
    `${what} is not one of the things @chipschat/subtle does. It is the subset Chips itself uses: X25519, Ed25519, AES-GCM, HMAC-SHA-256 and SHA-256.`,
  );
}
