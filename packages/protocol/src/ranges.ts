/**
 * What a `Range` header asks of an attachment's bytes (RFC 9110 §14), for
 * `GET /v1/attachments/:id` (ADR 0058). A player seeks by asking for a run of the file, and
 * AVPlayer will not start a video it cannot ask a run of; the server answers `206` with that run.
 *
 * One run, in bytes: a first and a last byte (`bytes=0-499`), a first byte and the rest
 * (`bytes=500-`), or the last so many (`bytes=-500`). A last byte past the end means the end. A
 * header this does not read — another unit, several runs, a last byte before the first — is
 * ignored and the whole file is served, which the standard allows. A run that starts past the end,
 * or asks for the last nought bytes, cannot be served: `416`.
 *
 * Here rather than in the server because the conformance kit's stand-in answers the same route
 * and must answer it the same way.
 */

/** What to serve for a `Range` header, over a file of so many bytes. */
export type RangeAnswer =
  | { readonly kind: "whole" }
  /** From `start` to `end`, both included, as `Content-Range` counts them. */
  | { readonly kind: "part"; readonly start: number; readonly end: number }
  | { readonly kind: "unsatisfiable" };

const WHOLE: RangeAnswer = { kind: "whole" };
const UNSATISFIABLE: RangeAnswer = { kind: "unsatisfiable" };

/** `bytes=first-last`, either side of the dash possibly empty; the unit is case-insensitive. */
const ONE_RUN = /^bytes[ \t]*=[ \t]*(\d*)[ \t]*-[ \t]*(\d*)[ \t]*$/i;

/** The run a `Range` header asks for, of a file `size` bytes long. */
export function byteRange(header: string | null | undefined, size: number): RangeAnswer {
  const run = header === null || header === undefined ? null : ONE_RUN.exec(header.trim());
  if (run === null) return WHOLE;
  const [, first = "", last = ""] = run;
  return first === "" ? lastBytes(last, size) : fromByte(Number(first), last, size);
}

/** `bytes=-500`: the last so many. Asking for none of them is asking for nothing that can be served. */
function lastBytes(count: string, size: number): RangeAnswer {
  if (count === "") return WHOLE;
  if (Number(count) === 0 || size === 0) return UNSATISFIABLE;
  return { kind: "part", start: Math.max(0, size - Number(count)), end: size - 1 };
}

/** `bytes=500-999`, or `bytes=500-` for the rest. A last byte past the end is the end. */
function fromByte(start: number, last: string, size: number): RangeAnswer {
  if (last !== "" && Number(last) < start) return WHOLE;
  if (start >= size) return UNSATISFIABLE;
  return { kind: "part", start, end: last === "" ? size - 1 : Math.min(Number(last), size - 1) };
}

/** `Content-Range` for a part of a file, or for a range that could not be served. */
export function contentRange(answer: RangeAnswer, size: number): string | undefined {
  if (answer.kind === "part") return `bytes ${answer.start}-${answer.end}/${size}`;
  if (answer.kind === "unsatisfiable") return `bytes */${size}`;
  return undefined;
}
