/**
 * What crosses the tunnel: requests, responses and sockets, as messages (ADR 0039).
 *
 * The phone's client makes the same calls through the relay that it makes on the network the
 * server is on — a signed request, a socket opened with a ticket — and nothing on either side
 * of the tunnel wants to speak HTTP over a byte stream: a browser cannot, a phone would have to
 * write the parser, and the server has `app.fetch`. So each request is a message with a JSON
 * header and its body, split into chunks the Noise message size allows, and the answer is the
 * same the other way; a socket is a message that opens a channel and messages that carry its
 * text. One integer names each exchange. The **caller** end opens things and the **answerer**
 * end answers them; nothing else is asymmetric.
 *
 * A frame is `u16 header length | header (JSON) | body`, inside one Noise transport message.
 */

import { type Bytes, bytes, concat, copy, text, utf8 } from "./bytes.js";
import { type Tunnel, TunnelClosedError, TunnelError } from "./noise.js";

/** The bytes a wire moves: ciphertext, once the tunnel is up. */
export interface Wire {
  readonly send: (data: Bytes) => void;
  readonly close: () => void;
  /**
   * Bytes the wire has taken and not yet put on the network: its socket's `bufferedAmount`.
   * Absent, a streamed body is paced by the channel's own queue alone.
   */
  readonly backlog?: (() => number) | undefined;
  onmessage: ((data: Bytes) => void) | undefined;
  onclose: ((reason: string) => void) | undefined;
}

export type Header =
  | {
      t: "req";
      id: number;
      method: string;
      target: string;
      headers: Record<string, string>;
      end: boolean;
    }
  | { t: "res"; id: number; status: number; headers: Record<string, string>; end: boolean }
  | { t: "data"; id: number; end: boolean }
  /**
   * A socket asked for. Its headers, when it has them, are the ask for its ticket (ADR 0253): the
   * answerer may let it in on them, as on a ticket in its target.
   */
  | { t: "open"; id: number; target: string; headers?: Record<string, string> }
  | { t: "opened"; id: number }
  | { t: "msg"; id: number; end: boolean }
  | { t: "close"; id: number; code: number; reason: string }
  | { t: "error"; id: number; message: string }
  /**
   * Each end's first word (id 0): from the answerer, how far a request's body may run ahead of its
   * acks; from the caller, that it says what it has taken of answers, and how far they may run.
   */
  | { t: "window"; id: number; bytes: number }
  /** How much of a request's body the answerer has taken, or of an answer the caller has. */
  | { t: "ack"; id: number; bytes: number }
  /** A caller that stopped reading an answer: send no more of it. */
  | { t: "cancel"; id: number };

/** The body one frame carries; the rest follows in `data` frames. */
export const CHUNK_BYTES = 32 * 1024;
/**
 * How far a streamed body may run ahead of the network (ADR 0152): the most any other frame on
 * the tunnel waits behind it. A quarter of a megabyte is under a tenth of a second on a home
 * uplink, and enough in hand to keep a fast one full.
 */
export const STREAM_AHEAD_BYTES = 256 * 1024;
/** How often a streamed body looks again at a backlog that was too long. */
const PACE_MS = 10;
/**
 * How far a request's body may run ahead of what the answerer has said it took (ADR 0153). A
 * phone cannot see its own socket's backlog, so this is the measure of what it has in flight: a
 * megabyte keeps a 3 MB/s uplink full across a 300 ms round trip, and is the most anything else
 * the phone sends waits behind an upload.
 */
export const UPLOAD_WINDOW_BYTES = 1024 * 1024;
/** How often the answerer says how much of a body it has taken. */
const ACK_EVERY_BYTES = 128 * 1024;
/**
 * The most answers may run ahead of what the caller has said it took, all of them together (ADR
 * 0153's addendum): the caller's word, and the bound on what it holds. `STREAM_AHEAD_BYTES` reads
 * only the server's own socket, and a relay between the two takes what that socket sends and
 * holds up to 4 MiB for a slow phone: on a weak signal a page of a megabyte and a quarter, asked
 * for three times, held every other answer and the socket's own frames for a minute, and the
 * phone gave the connection up and asked again (his iPhone on 5G, 24 October 2026).
 */
export const ANSWER_WINDOW_BYTES = 4 * 1024 * 1024;
/**
 * How long anything else may wait behind the answers on their way, as the answerer keeps them:
 * about a second of what the caller has been taking, measured from its acks. A second of a weak
 * signal is a few tens of kilobytes; of a fast one, enough to keep it full.
 */
const ANSWER_AHEAD_MS = 1000;
/** The window before the caller has taken anything, and the least it ever is. */
const ANSWER_LEAST_BYTES = 128 * 1024;
/** How often a caller says how much of an answer has come. */
const ANSWER_ACK_EVERY_BYTES = 64 * 1024;
/**
 * The caller's take rate is measured over this long, from one mark per `MARK_EVERY_MS` of its
 * acks: acks closer together move the last mark on, so the marks are a few dozen however fast acks
 * come (SEC-43).
 */
const MARKS_SPAN_MS = 2000;
const MARK_EVERY_MS = 50;
/**
 * A finished answer counts until the caller says it took all of it, which it says at the end. One
 * it has been silent on this long is forgotten, and past this many waiting the oldest go first, so
 * a caller that never acks holds nothing (SEC-43).
 */
const ANSWER_FORGET_MS = 60_000;
const ANSWERS_ENDED_MOST = 1024;
const MAX_HEADER_BYTES = 16 * 1024;
/** The most a request, a response or a socket message may carry, by default. */
export const DEFAULT_MAX_BODY_BYTES = 128 * 1024 * 1024;

type Raw = Record<string, unknown>;

const isRecord = (value: unknown): value is Raw => typeof value === "object" && value !== null;

function isHeaders(value: unknown): value is Record<string, string> {
  return isRecord(value) && Object.values(value).every((each) => typeof each === "string");
}

/** One reader per kind of header, each checking the fields its kind carries. */
const READERS: Record<string, (raw: Raw, id: number, end: boolean) => Header | undefined> = {
  req: (raw, id, end) =>
    typeof raw["method"] === "string" &&
    typeof raw["target"] === "string" &&
    isHeaders(raw["headers"])
      ? { t: "req", id, method: raw["method"], target: raw["target"], headers: raw["headers"], end }
      : undefined,
  res: (raw, id, end) =>
    typeof raw["status"] === "number" && isHeaders(raw["headers"])
      ? { t: "res", id, status: raw["status"], headers: raw["headers"], end }
      : undefined,
  data: (_raw, id, end) => ({ t: "data", id, end }),
  open: (raw, id) => {
    if (typeof raw["target"] !== "string") return undefined;
    const headers = raw["headers"];
    if (headers === undefined) return { t: "open", id, target: raw["target"] };
    return isHeaders(headers) ? { t: "open", id, target: raw["target"], headers } : undefined;
  },
  opened: (_raw, id) => ({ t: "opened", id }),
  msg: (_raw, id, end) => ({ t: "msg", id, end }),
  close: (raw, id) =>
    typeof raw["code"] === "number" && typeof raw["reason"] === "string"
      ? { t: "close", id, code: raw["code"], reason: raw["reason"] }
      : undefined,
  error: (raw, id) =>
    typeof raw["message"] === "string" ? { t: "error", id, message: raw["message"] } : undefined,
  window: (raw, id) => {
    const many = raw["bytes"];
    return typeof many === "number" && Number.isSafeInteger(many) && many > 0
      ? { t: "window", id, bytes: many }
      : undefined;
  },
  ack: (raw, id) => {
    const many = raw["bytes"];
    return typeof many === "number" && Number.isSafeInteger(many) && many >= 0
      ? { t: "ack", id, bytes: many }
      : undefined;
  },
  cancel: (_raw, id) => ({ t: "cancel", id }),
};

/** A header as it arrived, or nothing: a shape this end does not know is not acted on. */
export function readHeader(value: unknown): Header | undefined {
  if (!isRecord(value) || !Number.isInteger(value["id"])) return undefined;
  const reader = typeof value["t"] === "string" ? READERS[value["t"]] : undefined;
  return reader?.(value, value["id"] as number, value["end"] === true);
}

export function encodeFrame(header: Header, body: Uint8Array = bytes(0)): Bytes {
  const encoded = utf8(JSON.stringify(header));
  if (encoded.length > MAX_HEADER_BYTES) throw new TunnelError("A header is too long.");
  const length = bytes(2);
  new DataView(length.buffer).setUint16(0, encoded.length);
  return concat(length, encoded, body);
}

export function decodeFrame(frame: Uint8Array): { header: Header; body: Bytes } | undefined {
  if (frame.length < 2) return undefined;
  const length = new DataView(frame.buffer, frame.byteOffset, frame.byteLength).getUint16(0);
  if (frame.length < 2 + length) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text(frame.subarray(2, 2 + length)));
  } catch {
    return undefined;
  }
  const header = readHeader(parsed);
  return header === undefined ? undefined : { header, body: copy(frame.subarray(2 + length)) };
}

/** Frames in, frames out, each one a Noise message, each direction in order. */
export interface Channel {
  readonly send: (header: Header, body?: Uint8Array) => void;
  readonly close: (reason?: string) => void;
  readonly isClosed: () => boolean;
  /** Bytes sent here and not yet on the network: frames still to seal, and the wire's backlog. */
  readonly backlog: () => number;
  /** Resolves once the backlog is under `bytes`, or the channel has closed. */
  readonly below: (bytes: number) => Promise<void>;
  onframe: ((header: Header, body: Bytes) => void) | undefined;
  onclose: ((reason: string) => void) | undefined;
}

export function createChannel(tunnel: Tunnel, wire: Wire): Channel {
  let closed = false;
  let sends: Promise<void> = Promise.resolve();
  let queued = 0;
  const backlog = () => queued + (wire.backlog?.() ?? 0);
  const channel: Channel = {
    onframe: undefined,
    onclose: undefined,
    isClosed: () => closed,
    backlog,
    below: (bytes) =>
      new Promise<void>((resolve) => {
        const look = () => {
          if (closed || backlog() < bytes) resolve();
          else setTimeout(look, PACE_MS);
        };
        look();
      }),
    send(header, body) {
      if (closed) return;
      const frame = encodeFrame(header, body);
      queued += frame.length;
      sends = sends
        .then(async () => {
          try {
            if (!closed) wire.send(await tunnel.encrypt(frame));
          } finally {
            queued -= frame.length;
          }
        })
        .catch(() => channel.close("send_failed"));
    },
    close(reason = "closed") {
      if (closed) return;
      closed = true;
      wire.close();
      channel.onclose?.(reason);
    },
  };
  wire.onmessage = (data) => {
    if (closed) return;
    tunnel
      .decrypt(data)
      .then((plain) => {
        const frame = decodeFrame(plain);
        if (frame === undefined) return;
        if (!closed) channel.onframe?.(frame.header, frame.body);
      })
      .catch(() => channel.close("not_authenticated"));
  };
  wire.onclose = (reason) => {
    if (closed) return;
    closed = true;
    channel.onclose?.(reason);
  };
  return channel;
}

/** The headers that carry a body: sent with the first chunk, then `data` for the rest. */
type BodyHeader = Extract<Header, { end: boolean }>;

/** A frame with a body is sent as its header with the first chunk, then `data` for the rest. */
function sendInChunks(channel: Channel, header: BodyHeader, body: Uint8Array): void {
  const first = body.subarray(0, CHUNK_BYTES);
  const last = body.length <= CHUNK_BYTES;
  channel.send({ ...header, end: last }, first);
  for (let at = CHUNK_BYTES; at < body.length; at += CHUNK_BYTES) {
    const end = at + CHUNK_BYTES >= body.length;
    channel.send({ t: "data", id: header.id, end }, body.subarray(at, at + CHUNK_BYTES));
  }
}

/**
 * A body read as it is sent (ADR 0152): the answer's header with the first chunk, then `data`,
 * each frame only once the channel has less than `STREAM_AHEAD_BYTES` waiting, and the answers
 * on their way are under the caller's window (`ANSWER_WINDOW_BYTES`, ADR 0153's addendum). So every other
 * frame on the tunnel — a message, a small answer — goes out behind a quarter of a megabyte rather
 * than behind the whole file, and the file is never in memory whole. Until 12 October 2026 a
 * 40 MB file through a 3 MB/s uplink held everything else on the tunnel for 14 seconds.
 */
async function sendStreamed(
  channel: Channel,
  id: number,
  answer: StreamedOutput,
  limit: number,
  stopped: () => boolean,
  pace: Pace,
): Promise<boolean> {
  const reader = answer.body.getReader();
  let opened = false;
  /**
   * One frame, once the backlog and the caller's window allow; false when the channel closed while
   * it waited, or the caller said it has stopped reading (`cancel`, ADR 0153).
   */
  const frame = async (piece: Uint8Array, end: boolean): Promise<boolean> => {
    await channel.below(STREAM_AHEAD_BYTES);
    await pace.room(id);
    if (channel.isClosed() || stopped()) return false;
    const { status, headers } = answer;
    channel.send(opened ? { t: "data", id, end } : { t: "res", id, status, headers, end }, piece);
    pace.sent(id, piece.length);
    opened = true;
    return true;
  };
  /** A read cut at the chunk size, frame by frame. */
  const pieces = async (read: Uint8Array): Promise<boolean> => {
    for (let at = 0; at < read.length; at += CHUNK_BYTES) {
      if (!(await frame(read.subarray(at, at + CHUNK_BYTES), false))) return false;
    }
    return true;
  };
  let size = 0;
  try {
    for (let read = await reader.read(); !read.done; read = await reader.read()) {
      size += read.value.length;
      if (size > limit) throw new TunnelError("The answer is too long.");
      if (!(await pieces(read.value))) {
        await reader.cancel();
        return false;
      }
    }
    return await frame(bytes(0), true);
  } catch (error) {
    const message = error instanceof Error ? error.message : "The answer could not be read.";
    if (!channel.isClosed()) channel.send({ t: "error", id, message });
    await reader.cancel().catch(() => undefined);
    return false;
  }
}

/**
 * The answers' bytes on their way to the caller, against what it has said it took (ADR 0153's
 * addendum). A caller that never said its window is never waited on, as before.
 */
export interface Pace {
  /**
   * Resolves once the answers in flight, all together, are under the caller's window, or this
   * answer has less on its way than the caller acks at: it will not hear of that until it has more
   * or its end, so holding it could hold every answer.
   */
  readonly room: (id: number) => Promise<void>;
  readonly sent: (id: number, bytes: number) => void;
  readonly took: (id: number, bytes: number) => void;
  /** An answer sent to its end: it counts until the caller says it took all of it. */
  readonly finished: (id: number) => void;
  /** An answer the caller will say no more of (it failed, or the caller stopped reading it). */
  readonly forget: (id: number) => void;
  readonly windowOf: (bytes: number) => void;
  readonly closed: () => void;
  /** The answers' bytes on their way, all together, less what the caller has said it took. */
  readonly inFlight: () => number;
}

/** Exported for its tests; the answerer is its one user. */
export function pace(isClosed: () => boolean, now: () => number = () => Date.now()): Pace {
  /** The caller's word: the most it will hold. Undefined, it never acks, and nothing waits. */
  let most: number | undefined;
  /** Each answer's bytes sent, and taken; only once the caller has said its window. */
  const sent = new Map<number, number>();
  const taken = new Map<number, number>();
  /** Answers sent to their end, and when, oldest first. */
  const ended = new Map<number, number>();
  /** What `sent` holds less what `taken` does, kept as each changes, so no ack walks them all. */
  let owed = 0;
  /** Every byte the caller has said it took, and when, over the last stretch: its rate. */
  let takenEver = 0;
  const marks: { readonly at: number; readonly total: number }[] = [];
  let waiting: (() => void)[] = [];
  const inFlight = () => owed;
  /** About `ANSWER_AHEAD_MS` of what the caller has been taking, within its word. */
  const window = (): number | undefined => {
    if (most === undefined) return undefined;
    const first = marks[0];
    const last = marks.at(-1);
    if (first === undefined || last === undefined || last.at - first.at < 50) {
      return Math.min(most, ANSWER_LEAST_BYTES);
    }
    const perMs = (last.total - first.total) / (last.at - first.at);
    return Math.min(most, Math.max(ANSWER_LEAST_BYTES, perMs * ANSWER_AHEAD_MS));
  };
  const mark = (more: number) => {
    takenEver += more;
    const at = now();
    const before = marks.at(-2);
    if (before !== undefined && at - before.at < MARK_EVERY_MS) {
      marks[marks.length - 1] = { at, total: takenEver };
    } else marks.push({ at, total: takenEver });
    // Two seconds of acks, and at least the last two: a weak signal acks seconds apart.
    while (marks.length > 2 && at - (marks[0]?.at ?? at) > MARKS_SPAN_MS) marks.shift();
  };
  const wake = () => {
    const ready = waiting;
    waiting = [];
    for (const each of ready) each();
  };
  const forget = (id: number) => {
    owed -= (sent.get(id) ?? 0) - (taken.get(id) ?? 0);
    sent.delete(id);
    taken.delete(id);
    ended.delete(id);
    wake();
  };
  /** Gone from the count once it is ended and all of it taken. */
  const settle = (id: number) => {
    if (ended.has(id) && (taken.get(id) ?? 0) >= (sent.get(id) ?? 0)) forget(id);
  };
  /** Finished answers the caller has been silent on too long, or too many of: oldest first. */
  const sweep = () => {
    const at = now();
    for (const [id, when] of ended) {
      if (at - when < ANSWER_FORGET_MS && ended.size <= ANSWERS_ENDED_MOST) return;
      forget(id);
    }
  };
  return {
    room: async (id) => {
      for (;;) {
        const allowed = window();
        if (allowed === undefined || isClosed() || inFlight() < allowed) return;
        if ((sent.get(id) ?? 0) - (taken.get(id) ?? 0) < ANSWER_ACK_EVERY_BYTES) return;
        await new Promise<void>((resolve) => waiting.push(resolve));
      }
    },
    sent: (id, bytes) => {
      if (most === undefined) return;
      sent.set(id, (sent.get(id) ?? 0) + bytes);
      owed += bytes;
      sweep();
    },
    took: (id, bytes) => {
      const gone = sent.get(id);
      if (gone === undefined) return;
      const before = taken.get(id) ?? 0;
      // An ack says no more than was sent: a caller claiming more would widen its own window.
      const upTo = Math.min(bytes, gone);
      if (upTo > before) {
        taken.set(id, upTo);
        owed -= upTo - before;
        mark(upTo - before);
      }
      settle(id);
      sweep();
      wake();
    },
    finished: (id) => {
      ended.set(id, now());
      settle(id);
      sweep();
    },
    forget,
    windowOf: (bytes) => {
      most = bytes;
    },
    closed: wake,
    inFlight,
  };
}

/** A body in hand, as a stream, for an answer paced like any other. */
function streamOfBytes(body: Bytes): ReadableStream<Bytes> {
  return new ReadableStream<Bytes>({
    start: (controller) => {
      controller.enqueue(body);
      controller.close();
    },
  });
}

/** Chunks arriving for one exchange, until the one marked `end`. */
class Assembly<T> {
  private readonly parts: Bytes[] = [];
  private size = 0;
  constructor(
    readonly opened: T,
    private readonly limit: number,
  ) {}
  /** How many bytes have come. */
  get received(): number {
    return this.size;
  }
  /** Take a chunk. False when it would take the body over the limit. */
  add(chunk: Bytes): boolean {
    this.size += chunk.length;
    if (this.size > this.limit) return false;
    this.parts.push(chunk);
    return true;
  }
  body(): Bytes {
    return concat(...this.parts);
  }
}

export interface RequestInput {
  readonly method: string;
  readonly target: string;
  readonly headers?: Record<string, string> | undefined;
  readonly body?: Uint8Array | undefined;
  /**
   * The caller's: it has given up on the answer, a page sheet closed before its page came. The
   * request fails here as `fetch` fails, and the answerer is told to send no more of it.
   */
  readonly signal?: AbortSignal | undefined;
}

export interface ResponseOutput {
  readonly status: number;
  readonly headers: Record<string, string>;
  readonly body: Bytes;
}

/**
 * An answer as its headers arrive, with its body to read as the chunks come: what a download that
 * says how far it has got reads, where `ResponseOutput` would hold everything until the last byte.
 */
export interface StreamedOutput {
  readonly status: number;
  readonly headers: Record<string, string>;
  /** The chunks as they arrive. It errors if the tunnel closes, or the answer runs over the limit, first. */
  readonly body: ReadableStream<Bytes>;
}

/** A socket as either end holds it: text in, text out, and a close with a code. */
export interface TunnelSocket {
  readonly send: (message: string) => void;
  readonly close: (code?: number, reason?: string) => void;
  onopen: (() => void) | undefined;
  onmessage: ((message: string) => void) | undefined;
  onclose: ((code: number, reason: string) => void) | undefined;
}

export interface MuxOptions {
  readonly maxBodyBytes?: number | undefined;
}

/** The close code a socket hears when the tunnel itself went. */
export const CLOSE_TUNNEL_GONE = 4006;
/**
 * The close code a socket hears when the answerer failed to decide whether to open it: worth
 * asking again. Not 4003, which a phone reads as its person removed (ADR 0160).
 */
export const CLOSE_REFUSED = 1011;
/** The close code a socket hears when the answerer holds enough sockets already. */
export const CLOSE_TOO_MANY = 4008;

/** What has come for a socket the answerer has not taken yet (ADR 0253). */
interface Held {
  messages: string[];
  /** Its bytes as they came, the message still coming among them. */
  bytes: number;
  /** The caller, or the tunnel, went while it was being taken. */
  gone: boolean;
}

/** The sockets one end holds, and the messages arriving for them in chunks. */
class Sockets {
  readonly open = new Map<number, TunnelSocket>();
  private readonly messages = new Map<number, Assembly<undefined>>();
  /**
   * Sockets the answerer has not taken yet (ADR 0253): a caller may send behind its open, and
   * nothing reads that unless the socket is taken. One that went while it was being taken still
   * counts as open until its handler has answered, so it still counts against the cap.
   */
  private readonly held = new Map<number, Held>();
  /** The bytes held for every socket not yet taken, together: at most one message's. */
  private heldBytes = 0;

  constructor(
    private readonly channel: Channel,
    private readonly limit: number,
  ) {}

  /** A socket over the channel, sending and closing by frames. */
  make(id: number): TunnelSocket {
    let live = true;
    const sockets = this;
    const { channel } = this;
    const socket: TunnelSocket = {
      onopen: undefined,
      onmessage: undefined,
      onclose: undefined,
      send(message) {
        if (live) sendInChunks(channel, { t: "msg", id, end: true }, utf8(message));
      },
      close(code = 1000, reason = "") {
        if (!live) return;
        live = false;
        sockets.forget(id);
        channel.send({ t: "close", id, code, reason });
        socket.onclose?.(code, reason);
      },
    };
    this.open.set(id, socket);
    return socket;
  }

  /** A message begins for a socket that is here. */
  begin(id: number): void {
    if (this.open.has(id) && this.held.get(id)?.gone !== true) {
      this.messages.set(id, new Assembly(undefined, this.limit));
    }
  }

  /** Take a chunk of a socket message. False when no message is in progress for this id. */
  chunk(id: number, body: Bytes, end: boolean): boolean {
    const message = this.messages.get(id);
    if (message === undefined) return false;
    const waiting = this.held.get(id);
    if (waiting !== undefined) {
      waiting.bytes += body.length;
      this.heldBytes += body.length;
      if (this.heldBytes > this.limit) {
        this.channel.close("message_too_long");
        return true;
      }
    }
    if (!message.add(body)) this.channel.close("message_too_long");
    else if (end) {
      this.messages.delete(id);
      const whole = text(message.body());
      if (waiting === undefined) this.open.get(id)?.onmessage?.(whole);
      else waiting.messages.push(whole);
    }
    return true;
  }

  /** Hold what comes for a socket until it is taken (`take`) or turned away (`turnAway`). */
  hold(id: number): void {
    this.held.set(id, { messages: [], bytes: 0, gone: false });
  }

  /** Whether a socket held while it was being taken went meanwhile. */
  wentWhileHeld(id: number): boolean {
    return this.held.get(id)?.gone ?? true;
  }

  /** The socket is taken: what came for it while it was being taken is read now, in order. */
  take(id: number): void {
    const waiting = this.held.get(id);
    this.release(id);
    for (const message of waiting?.messages ?? []) this.open.get(id)?.onmessage?.(message);
  }

  /** The socket is not taken, or went while it was being taken: what came for it is never read. */
  turnAway(id: number): void {
    this.forget(id);
  }

  private release(id: number): void {
    const waiting = this.held.get(id);
    if (waiting === undefined) return;
    this.heldBytes -= waiting.bytes;
    this.held.delete(id);
  }

  /** Everything about a socket, gone: it, what was held for it, and any message half come. */
  private forget(id: number): void {
    this.release(id);
    this.open.delete(id);
    this.messages.delete(id);
  }

  /**
   * The other side closed a socket: it is gone without answering. One still being taken keeps
   * its place until its handler has answered, and hears it then (`createAnswerer`'s `open`), so
   * it hears it once; what was held for it goes now.
   */
  closedByPeer(id: number, code: number, reason: string): void {
    const socket = this.open.get(id);
    if (socket === undefined) return;
    const waiting = this.held.get(id);
    if (waiting !== undefined) {
      this.heldBytes -= waiting.bytes;
      this.held.set(id, { messages: [], bytes: 0, gone: true });
      this.messages.delete(id);
      return;
    }
    this.forget(id);
    socket.onclose?.(code, reason);
  }

  closeAll(code: number, reason: string): void {
    for (const id of [...this.open.keys()]) this.closedByPeer(id, code, reason);
  }
}

export interface Caller {
  readonly fetch: (input: RequestInput) => Promise<ResponseOutput>;
  /** The same request, answered when its headers arrive, with the body still coming. */
  readonly stream: (input: RequestInput) => Promise<StreamedOutput>;
  /** A socket at `target`; its `headers`, when given, are the ask for its ticket (ADR 0253). */
  readonly open: (target: string, headers?: Record<string, string>) => TunnelSocket;
  readonly close: (reason?: string) => void;
  onclose: ((reason: string) => void) | undefined;
}

interface Pending {
  readonly resolve: (response: StreamedOutput) => void;
  readonly reject: (error: Error) => void;
}

/** A body on its way: where its chunks go, and how many bytes have come. */
interface Flowing {
  readonly into: ReadableStreamDefaultController<Bytes>;
  size: number;
  /** How much of it the answerer has been told has come. */
  told: number;
}

/** Why a request its caller gave up on fails: the signal's reason, or an `AbortError` as `fetch`'s. */
function stoppedBy(signal: AbortSignal): Error {
  if (signal.reason instanceof Error) return signal.reason;
  const error = new Error("The request was stopped.");
  error.name = "AbortError";
  return error;
}

/** Every chunk of a body, in one piece: the answer `fetch` gives. */
async function readWhole(body: ReadableStream<Bytes>): Promise<Bytes> {
  const reader = body.getReader();
  const parts: Bytes[] = [];
  for (let read = await reader.read(); !read.done; read = await reader.read()) {
    parts.push(read.value);
  }
  return concat(...parts);
}

/**
 * The phone's end: it asks, and it opens sockets. An answer is handed over as its headers arrive,
 * and its body flows into a stream chunk by chunk, so a download can say how far it has got.
 */
export function createCaller(channel: Channel, options: MuxOptions = {}): Caller {
  const limit = options.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES;
  let nextId = 1;
  const pending = new Map<number, Pending>();
  const flowing = new Map<number, Flowing>();
  const sockets = new Sockets(channel, limit);
  /** How far a body may run ahead of its acks: unknown until the answerer says (`window`). */
  let window: number | undefined;
  /** How much of each request's body the answerer has said it took. */
  const taken = new Map<number, number>();
  /** A paced body waiting for its next ack. */
  const wakers = new Map<number, () => void>();
  /**
   * This end's word on answers, said once before its first frame (ADR 0153's addendum): that it
   * says what it has taken of each, so the answerer keeps them within `ANSWER_WINDOW_BYTES`. An
   * answerer from before that hears a frame it has no use for, and sends as it always has.
   */
  let windowSaid = false;
  const sayWindow = () => {
    if (windowSaid || channel.isClosed()) return;
    windowSaid = true;
    channel.send({ t: "window", id: 0, bytes: ANSWER_WINDOW_BYTES });
  };
  /** What has come of an answer, every `ANSWER_ACK_EVERY_BYTES` of it and at its end. */
  const tellTaken = (id: number, flow: Flowing, end: boolean) => {
    if (flow.size === flow.told || channel.isClosed()) return;
    if (!end && flow.size - flow.told < ANSWER_ACK_EVERY_BYTES) return;
    flow.told = flow.size;
    channel.send({ t: "ack", id, bytes: flow.size });
  };
  const wake = (id: number) => {
    wakers.get(id)?.();
    wakers.delete(id);
  };

  const fail = (id: number, error: Error) => {
    pending.get(id)?.reject(error);
    pending.delete(id);
    flowing.get(id)?.into.error(error);
    flowing.delete(id);
    wake(id);
  };
  const chunk = (id: number, body: Bytes, end: boolean) => {
    const flow = flowing.get(id);
    if (flow === undefined) {
      sockets.chunk(id, body, end);
      return;
    }
    flow.size += body.length;
    if (flow.size > limit) {
      fail(id, new TunnelError("The answer is too long."));
      return;
    }
    if (body.length > 0) flow.into.enqueue(body);
    tellTaken(id, flow, end);
    if (end) {
      flowing.delete(id);
      flow.into.close();
    }
  };
  const opened = (header: Extract<Header, { t: "res" }>, body: Bytes) => {
    const waiting = pending.get(header.id);
    if (waiting === undefined) return;
    pending.delete(header.id);
    let into: ReadableStreamDefaultController<Bytes> | undefined;
    const stream = new ReadableStream<Bytes>({
      start: (controller) => {
        into = controller;
      },
      // A reader that stops reading lets the rest of the body fall on the floor, and tells the
      // answerer to send no more of it (ADR 0153); one from before that sends it anyway.
      cancel: () => {
        if (flowing.delete(header.id) && !channel.isClosed()) {
          channel.send({ t: "cancel", id: header.id });
        }
      },
    });
    if (into === undefined) throw new TunnelError("A stream did not start.");
    flowing.set(header.id, { into, size: 0, told: 0 });
    waiting.resolve({ status: header.status, headers: header.headers, body: stream });
    chunk(header.id, body, header.end);
  };

  /**
   * The caller gave up on an answer before all of it came: it fails here, and the answerer is told
   * to send no more, as a reader that stops reading tells it (ADR 0153), so what it would have sent
   * leaves the window to the answers still wanted.
   */
  const giveUp = (id: number, signal: AbortSignal) => {
    if (!pending.has(id) && !flowing.has(id)) return;
    fail(id, stoppedBy(signal));
    if (!channel.isClosed()) channel.send({ t: "cancel", id });
  };

  const onRequestFrame = (header: Header, body: Bytes) => {
    if (header.t === "res") opened(header, body);
    else if (header.t === "data") chunk(header.id, body, header.end);
    else if (header.t === "error") fail(header.id, new TunnelError(header.message));
    else if (header.t === "ack") {
      taken.set(header.id, header.bytes);
      wake(header.id);
    }
  };
  const onSocketFrame = (header: Header, body: Bytes) => {
    if (header.t === "opened") sockets.open.get(header.id)?.onopen?.();
    else if (header.t === "msg") {
      sockets.begin(header.id);
      sockets.chunk(header.id, body, header.end);
    } else if (header.t === "close") sockets.closedByPeer(header.id, header.code, header.reason);
  };

  channel.onframe = (header, body) => {
    if (header.t === "window") window = header.bytes;
    else if (
      header.t === "res" ||
      header.t === "data" ||
      header.t === "error" ||
      header.t === "ack"
    ) {
      onRequestFrame(header, body);
    } else onSocketFrame(header, body);
  };
  channel.onclose = (reason) => {
    for (const id of [...pending.keys(), ...flowing.keys()]) {
      fail(id, new TunnelClosedError(reason));
    }
    for (const id of [...wakers.keys()]) wake(id);
    sockets.closeAll(CLOSE_TUNNEL_GONE, reason);
    caller.onclose?.(reason);
  };

  /**
   * A request's body, frame by frame, never more than `ahead` bytes past what the answerer has
   * said it took (ADR 0153), so an upload leaves room between its frames for everything else this
   * end sends. Stops when the request fails or the tunnel closes.
   */
  /** Until `at` is less than `ahead` past what was taken; false if the request or tunnel went. */
  const roomFor = async (id: number, at: number, ahead: number): Promise<boolean> => {
    while (at - (taken.get(id) ?? 0) >= ahead) {
      await new Promise<void>((resolve) => wakers.set(id, resolve));
      if (channel.isClosed() || !pending.has(id)) return false;
    }
    return true;
  };
  const sendPaced = async (
    header: Extract<Header, { t: "req" }>,
    body: Uint8Array,
    ahead: number,
  ) => {
    const { id } = header;
    for (let at = 0; at < body.length; at += CHUNK_BYTES) {
      if (!(await roomFor(id, at, ahead))) return;
      const end = at + CHUNK_BYTES >= body.length;
      const piece = body.subarray(at, at + CHUNK_BYTES);
      channel.send(at === 0 ? { ...header, end } : { t: "data", id, end }, piece);
    }
    taken.delete(id);
  };

  const stream = (input: RequestInput): Promise<StreamedOutput> => {
    if (channel.isClosed())
      return Promise.reject(new TunnelClosedError(undefined, { sent: false }));
    const { signal } = input;
    if (signal?.aborted) return Promise.reject(stoppedBy(signal));
    const body = input.body ?? bytes(0);
    if (body.length > limit) return Promise.reject(new TunnelError("The body is too long."));
    const id = nextId++;
    sayWindow();
    return new Promise<StreamedOutput>((resolve, reject) => {
      pending.set(id, { resolve, reject });
      signal?.addEventListener("abort", () => giveUp(id, signal), { once: true });
      const { method, target } = input;
      const header = {
        t: "req" as const,
        id,
        method,
        target,
        headers: input.headers ?? {},
        end: true,
      };
      // An answerer from before ADR 0153 says no window and sends no acks: all of it at once.
      if (window === undefined || body.length <= window) sendInChunks(channel, header, body);
      else void sendPaced(header, body, window);
    });
  };

  const caller: Caller = {
    onclose: undefined,
    stream,
    async fetch(input) {
      const answer = await stream(input);
      return { status: answer.status, headers: answer.headers, body: await readWhole(answer.body) };
    },
    open(target, headers) {
      const id = nextId++;
      const socket = sockets.make(id);
      sayWindow();
      channel.send({ t: "open", id, target, ...(headers === undefined ? {} : { headers }) });
      // In a task of its own, as a WebSocket tells it, not a microtask: a microtask runs before the
      // `await` that hands this socket to whoever asked for it, so their `onclose` missed it, and
      // the transport waited on a socket that had already gone (CI, 13 September 2026).
      if (channel.isClosed()) {
        setTimeout(() => sockets.closedByPeer(id, CLOSE_TUNNEL_GONE, "closed"), 0);
      }
      return socket;
    },
    close(reason) {
      channel.close(reason);
    },
  };
  return caller;
}

export interface AnswererHandlers {
  /** The answer whole, or with a body to read as it is sent (`sendStreamed`). */
  readonly request: (input: RequestInput) => Promise<ResponseOutput | StreamedOutput>;
  /**
   * A socket the caller opened, with the headers its open carried. The handler wires the peer's
   * `onmessage` and `onclose` and answers whether it took it; refused, the caller's socket hears
   * the code and the reason. What the caller sent behind the open is held until it is taken, and
   * never read if it is not.
   */
  readonly socket: (
    target: string,
    peer: TunnelSocket,
    headers: Record<string, string> | undefined,
  ) => Promise<{ ok: true } | { ok: false; code: number; reason: string }>;
}

export interface AnswererOptions extends MuxOptions {
  /** Requests in flight at once, before the rest are refused. */
  readonly maxInFlight?: number | undefined;
  /**
   * A smaller limit for one request, read off its first frame — a request with no credential in
   * its headers, say (SEC-11) — or nothing for `maxBodyBytes`. Its body is refused at the byte it
   * goes over, as any body over the limit is.
   */
  readonly bodyBytesFor?: ((request: Omit<RequestInput, "body">) => number | undefined) | undefined;
  /** The most one socket message may carry; `maxBodyBytes` unless said. */
  readonly maxSocketMessageBytes?: number | undefined;
  /** How far a caller's body may run ahead of this end's acks; `UPLOAD_WINDOW_BYTES` unless said. */
  readonly uploadWindowBytes?: number | undefined;
  /** Sockets open at once. */
  readonly maxSockets?: number | undefined;
}

export interface Answerer {
  readonly close: (reason?: string) => void;
  readonly inFlight: () => number;
  readonly openSockets: () => number;
  onclose: ((reason: string) => void) | undefined;
}

/** The server's end: it answers what the caller asks and takes the sockets it opens. */
export function createAnswerer(
  channel: Channel,
  handlers: AnswererHandlers,
  options: AnswererOptions = {},
): Answerer {
  const limit = options.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES;
  const maxInFlight = options.maxInFlight ?? 64;
  const maxSockets = options.maxSockets ?? 8;
  const requests = new Map<number, Assembly<Omit<RequestInput, "body">>>();
  const answering = new Set<number>();
  const sockets = new Sockets(channel, options.maxSocketMessageBytes ?? limit);
  /** How much of each body the caller has been told was taken. */
  const told = new Map<number, number>();
  /** Answers the caller has stopped reading. */
  const cancelled = new Set<number>();
  /** Answers on their way, against what the caller has said it took. */
  const paced = pace(() => channel.isClosed());

  /**
   * This end's window, said once, in answer to the caller's first frame: a caller may pace its
   * bodies by it. Never before then. A phone finishes its half of the handshake before it listens
   * on the channel, and a frame that arrived in between was lost, and every one after it then
   * failed to decrypt; the caller having spoken is how this end knows it is listening.
   */
  let windowSaid = false;
  const sayWindow = () => {
    if (windowSaid) return;
    windowSaid = true;
    channel.send({ t: "window", id: 0, bytes: options.uploadWindowBytes ?? UPLOAD_WINDOW_BYTES });
  };

  /**
   * An answer sent whole or as it is read, unless the caller has stopped reading it: true once its
   * end has gone. A body in hand longer than one chunk goes as it is read too, to a caller that
   * says what it has taken, so it waits on that caller's window like any other.
   */
  const deliver = async (id: number, output: ResponseOutput | StreamedOutput): Promise<boolean> => {
    const stopped = () => channel.isClosed() || cancelled.has(id);
    if (output.body instanceof Uint8Array && output.body.length <= CHUNK_BYTES) {
      const { status, headers, body } = output;
      if (stopped()) return false;
      sendInChunks(channel, { t: "res", id, status, headers, end: true }, body);
      paced.sent(id, body.length);
      return true;
    }
    const streamed: StreamedOutput =
      output.body instanceof Uint8Array
        ? { ...output, body: streamOfBytes(output.body) }
        : (output as StreamedOutput);
    if (stopped()) {
      await streamed.body.cancel();
      return false;
    }
    return await sendStreamed(channel, id, streamed, limit, stopped, paced);
  };
  const answer = async (id: number, request: RequestInput) => {
    answering.add(id);
    let whole = false;
    try {
      whole = await deliver(id, await handlers.request(request));
    } catch (error) {
      const message = error instanceof Error ? error.message : "The request failed.";
      channel.send({ t: "error", id, message });
    } finally {
      answering.delete(id);
      cancelled.delete(id);
      // Counted until the caller has taken all of it; one cut short, it will say no more of.
      if (whole) paced.finished(id);
      else paced.forget(id);
    }
  };
  /** Say how much of a body has come, every `ACK_EVERY_BYTES` of it. */
  const acknowledge = (id: number, received: number) => {
    if (received - (told.get(id) ?? 0) < ACK_EVERY_BYTES) return;
    told.set(id, received);
    channel.send({ t: "ack", id, bytes: received });
  };
  const chunk = (id: number, body: Bytes, end: boolean) => {
    const request = requests.get(id);
    if (request === undefined) {
      sockets.chunk(id, body, end);
      return;
    }
    if (!request.add(body)) {
      requests.delete(id);
      told.delete(id);
      channel.send({ t: "error", id, message: "The body is too long." });
    } else if (end) {
      requests.delete(id);
      told.delete(id);
      void answer(id, { ...request.opened, body: request.body() });
    } else acknowledge(id, request.received);
  };
  /** The last id a socket was opened under: a caller's only rise, so one used again is no caller's. */
  let lastSocketId = 0;
  const open = async (id: number, target: string, headers: Record<string, string> | undefined) => {
    if (id <= lastSocketId) {
      channel.close("socket_id_reused");
      return;
    }
    lastSocketId = id;
    if (sockets.open.size >= maxSockets) {
      channel.send({ t: "close", id, code: CLOSE_TOO_MANY, reason: "too_many_sockets" });
      return;
    }
    const peer = sockets.make(id);
    sockets.hold(id);
    const taken = await handlers
      .socket(target, peer, headers)
      .catch(() => ({ ok: false as const, code: CLOSE_REFUSED, reason: "refused" }));
    if (sockets.wentWhileHeld(id)) {
      sockets.turnAway(id);
      // Taken, but the caller or the tunnel went while it was being taken: the handler's socket
      // hears that it closed, as it would have had it gone a moment later.
      if (taken.ok) peer.onclose?.(CLOSE_TUNNEL_GONE, "gone");
      return;
    }
    if (!taken.ok) {
      sockets.turnAway(id);
      channel.send({ t: "close", id, code: taken.code, reason: taken.reason });
      return;
    }
    channel.send({ t: "opened", id });
    sockets.take(id);
  };

  /** The caller has stopped reading an answer: send no more of it, and stop counting it. */
  const stopReading = (id: number) => {
    if (answering.has(id)) cancelled.add(id);
    paced.forget(id);
  };
  const onRequestFrame = (header: Header, body: Bytes) => {
    if (header.t === "req") {
      if (answering.size + requests.size >= maxInFlight) {
        channel.send({ t: "error", id: header.id, message: "Too many requests at once." });
        return;
      }
      const { method, target, headers } = header;
      const opened = { method, target, headers };
      requests.set(header.id, new Assembly(opened, options.bodyBytesFor?.(opened) ?? limit));
      chunk(header.id, body, header.end);
    } else if (header.t === "data") chunk(header.id, body, header.end);
    else if (header.t === "cancel") stopReading(header.id);
  };
  const onSocketFrame = (header: Header, body: Bytes) => {
    if (header.t === "open") void open(header.id, header.target, header.headers);
    else if (header.t === "msg") {
      sockets.begin(header.id);
      sockets.chunk(header.id, body, header.end);
    } else if (header.t === "close") sockets.closedByPeer(header.id, header.code, header.reason);
  };

  channel.onframe = (header, body) => {
    sayWindow();
    // The caller's word on answers (ADR 0153's addendum): its window, then what it has taken.
    if (header.t === "window") paced.windowOf(header.bytes);
    else if (header.t === "ack") paced.took(header.id, header.bytes);
    else if (header.t === "req" || header.t === "data" || header.t === "cancel") {
      onRequestFrame(header, body);
    } else onSocketFrame(header, body);
  };
  channel.onclose = (reason) => {
    paced.closed();
    sockets.closeAll(CLOSE_TUNNEL_GONE, reason);
    answerer.onclose?.(reason);
  };

  const answerer: Answerer = {
    onclose: undefined,
    inFlight: () => answering.size + requests.size,
    openSockets: () => sockets.open.size,
    close(reason) {
      channel.close(reason);
    },
  };
  return answerer;
}
