/**
 * Identifiers are ULIDs with a type prefix (technical-plan decision 11). Always strings,
 * always sortable by creation time, and self-describing: `run_01JB...` can only ever be a
 * run. Generation goes through a port so tests are deterministic (6.1).
 *
 * This lives in `packages/protocol` rather than `packages/platform` because an id is part of
 * the wire format: every envelope carries three of them. Keeping it here means `@chipschat/harness`
 * can validate ids without pulling a logger and a metrics API into an SDK.
 *
 * The encoding is the ULID spec: 48 bits of millisecond timestamp in ten Crockford base32
 * characters, then 80 bits of randomness in sixteen. Ids minted in the same millisecond are
 * made strictly increasing by incrementing the random component, so `seq` is not the only
 * thing that orders a workspace's history.
 */

/**
 * The prefix for each kind of thing Chips names.
 *
 * The first eleven are decision 11's list. The rest extend it: an event needs an id of its own
 * to be idempotent across a reconnect, and devices and harness tokens are rows in the schema
 * M0.3 creates (recorded in STATUS.md); an agent is who a harness takes part in rooms as (ADR
 * 0087), a join request is somebody asking to come in (ADR 0122), and an edit is a person's change
 * to an agent's context on its way to its harness (ADR 0134), and a change is a person's choice of
 * an agent's model and effort, of its heartbeat, or of its context window's limit, or a Compact
 * now, on its way there too (ADR 0140, ADR 0143, ADR 0146). A direct ask is a guest asking an
 * owner to share the server's machine in Tailscale (ADR 0211, Phase 3).
 * `agt` was the harness's prefix before the rename of 4 September, and no log holds one.
 */
export const ID_PREFIXES = {
  workspace: "ws",
  person: "usr",
  harness: "hrn",
  space: "spc",
  message: "msg",
  run: "run",
  step: "stp",
  approval: "apr",
  question: "qst",
  lane: "lane",
  attachment: "att",
  event: "evt",
  device: "dev",
  token: "tok",
  invite: "inv",
  passkey: "pky",
  agent: "agt",
  join: "jrq",
  direct: "dra",
  edit: "edt",
  change: "chg",
} as const;

export type IdKind = keyof typeof ID_PREFIXES;
export type IdPrefix = (typeof ID_PREFIXES)[IdKind];
export type Id<K extends IdKind = IdKind> = `${(typeof ID_PREFIXES)[K]}_${string}`;

const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const TIME_CHARS = 10;
const RANDOM_CHARS = 16;
const RANDOM_BYTES = 10;
const ULID_CHARS = TIME_CHARS + RANDOM_CHARS;
const MAX_TIME_MS = 281_474_976_710_655; // 2^48 - 1

const PREFIX_TO_KIND: ReadonlyMap<string, IdKind> = new Map(
  Object.entries(ID_PREFIXES).map(([kind, prefix]) => [prefix, kind as IdKind]),
);

/** Thrown when a string that should be an id is not one. */
export class InvalidIdError extends Error {
  override readonly name = "InvalidIdError";
  constructor(
    readonly value: string,
    reason: string,
  ) {
    super(`invalid id ${JSON.stringify(value)}: ${reason}`);
  }
}

export interface IdGenerator {
  /** Mint a new id of the given kind. */
  next: <K extends IdKind>(kind: K) => Id<K>;
}

export interface IdGeneratorOptions {
  /** Milliseconds since the epoch. Defaults to the system clock. */
  now?: () => number;
  /** Fills the supplied buffer with randomness. Defaults to `crypto.getRandomValues`. */
  randomFill?: (into: Uint8Array) => void;
}

/**
 * A generator that is monotonic within a millisecond. Two generators are independent; a
 * process that needs strictly ordered ids uses one.
 */
export function createIdGenerator(options: IdGeneratorOptions = {}): IdGenerator {
  const now = options.now ?? Date.now;
  const randomFill = options.randomFill ?? defaultRandomFill;
  const cursor: Cursor = { time: -1, random: new Uint8Array(RANDOM_BYTES) };

  return {
    next<K extends IdKind>(kind: K): Id<K> {
      const prefix = ID_PREFIXES[kind];
      if (prefix === undefined) throw new InvalidIdError(String(kind), "unknown id kind");

      advance(cursor, requireTimestamp(now()), randomFill);
      return `${prefix}_${encodeTime(cursor.time)}${encodeRandom(cursor.random)}` as Id<K>;
    },
  };
}

/** Where the generator got to: the last instant it used and the randomness it used there. */
interface Cursor {
  time: number;
  random: Uint8Array;
}

/**
 * Move the cursor to the next id position. A later millisecond starts fresh. The same
 * millisecond, or a clock that has moved backwards, steps the randomness instead, so the
 * id still sorts after its predecessor; when the randomness is exhausted it borrows the
 * next millisecond rather than colliding.
 */
function advance(cursor: Cursor, nowMs: number, randomFill: (into: Uint8Array) => void): void {
  if (nowMs > cursor.time) {
    cursor.time = nowMs;
    cursor.random = freshRandom(randomFill);
    return;
  }
  if (!incrementInPlace(cursor.random)) {
    cursor.time += 1;
    cursor.random = freshRandom(randomFill);
  }
}

function requireTimestamp(value: number): number {
  const time = Math.floor(value);
  if (!Number.isFinite(time) || time < 0 || time > MAX_TIME_MS) {
    throw new RangeError(`timestamp ${value} is outside the range a ULID can hold`);
  }
  return time;
}

/** The process-wide generator. Code that can inject a generator should do that instead. */
export const defaultIdGenerator: IdGenerator = createIdGenerator();

/** Mint an id with the process-wide generator. */
export function newId<K extends IdKind>(kind: K): Id<K> {
  return defaultIdGenerator.next(kind);
}

/** True when `value` is an id of the given kind. */
export function isId<K extends IdKind>(kind: K, value: unknown): value is Id<K> {
  if (typeof value !== "string") return false;
  const parsed = tryParseId(value);
  return parsed !== undefined && parsed.kind === kind;
}

/** Split an id into its kind and ULID, or throw if it is not an id. */
export function parseId(value: string): { kind: IdKind; ulid: string } {
  const parsed = tryParseId(value);
  if (parsed === undefined) {
    throw new InvalidIdError(value, "expected <prefix>_<26 character ULID>");
  }
  return parsed;
}

/** The instant an id was minted. */
export function timestampOf(value: string): number {
  return decodeTime(parseId(value).ulid);
}

function tryParseId(value: string): { kind: IdKind; ulid: string } | undefined {
  const underscore = value.indexOf("_");
  if (underscore <= 0) return undefined;

  const kind = PREFIX_TO_KIND.get(value.slice(0, underscore));
  if (kind === undefined) return undefined;

  const ulid = value.slice(underscore + 1);
  if (ulid.length !== ULID_CHARS) return undefined;
  for (let i = 0; i < ULID_CHARS; i += 1) {
    if (ALPHABET.indexOf(ulid.charAt(i)) < 0) return undefined;
  }
  // Ten base32 characters hold fifty bits; a timestamp holds forty-eight.
  if (ALPHABET.indexOf(ulid.charAt(0)) > 7) return undefined;

  return { kind, ulid };
}

function encodeTime(timeMs: number): string {
  let remaining = timeMs;
  let out = "";
  for (let i = 0; i < TIME_CHARS; i += 1) {
    out = ALPHABET.charAt(remaining % 32) + out;
    remaining = Math.floor(remaining / 32);
  }
  return out;
}

function decodeTime(ulid: string): number {
  let time = 0;
  for (let i = 0; i < TIME_CHARS; i += 1) {
    time = time * 32 + ALPHABET.indexOf(ulid.charAt(i));
  }
  return time;
}

function encodeRandom(bytes: Uint8Array): string {
  let value = 0n;
  for (const byte of bytes) value = (value << 8n) | BigInt(byte);
  let out = "";
  for (let i = 0; i < RANDOM_CHARS; i += 1) {
    out = ALPHABET.charAt(Number(value & 31n)) + out;
    value >>= 5n;
  }
  return out;
}

function freshRandom(randomFill: (into: Uint8Array) => void): Uint8Array {
  const bytes = new Uint8Array(RANDOM_BYTES);
  randomFill(bytes);
  return bytes;
}

/** Adds one to a big-endian byte array. Returns false when it would overflow. */
function incrementInPlace(bytes: Uint8Array): boolean {
  for (let i = bytes.length - 1; i >= 0; i -= 1) {
    const byte = bytes[i] ?? 0;
    if (byte < 0xff) {
      bytes[i] = byte + 1;
      return true;
    }
    bytes[i] = 0;
  }
  return false;
}

function defaultRandomFill(into: Uint8Array): void {
  globalThis.crypto.getRandomValues(into);
}

/**
 * The id a message has on the wire. A message is its event: the row and the reference both
 * carry the event's ULID, and `message.new` names it with the message prefix so a `reply_to`
 * is a message id and not an event id. Pure, and the same in both directions.
 */
export function messageIdOf(eventId: string): Id<"message"> {
  return `${ID_PREFIXES.message}_${parseId(eventId).ulid}`;
}

/** The event an on-the-wire message id names. */
export function eventIdOfMessage(messageId: string): Id<"event"> {
  return `${ID_PREFIXES.event}_${parseId(messageId).ulid}`;
}
