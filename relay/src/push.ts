/**
 * The push door, `POST /v1/push` (ADR 0246): the relay sends a server's pushes to the Chips app,
 * with the app's Expo access token, for a server that has none.
 *
 * It speaks Expo's own shape, a list of messages in and one ticket per message out, so a server
 * posts here exactly as it would post to Expo. What it forwards is only a Chips push: to an Expo
 * push token, with a Chips push's fields and nothing else, at most 4 KiB each, and in the clear
 * only the fixed sentences every server says (`PUSH_WORDS`, ADR 0246's second addendum). A push
 * carries no words worth reading (ADR 0045), and the ones a phone shows are sealed to it (ADR
 * 0158), so what crosses here is what crossed Expo before. Anyone can post here, and with any
 * words allowed anyone holding a phone's token could have put a sentence of their own on its lock
 * screen as Chips, buttons and all.
 *
 * An entry that isn't a Chips push gets a ticket of its own, as Expo answers a message it won't
 * send, and the rest go on: one made-up token among a room's phones used to spoil the request
 * for everybody in it. A token that isn't an Expo push token is answered as a dead one, so the
 * server that holds it forgets it.
 *
 * Limits keep the token from being anybody's to spend: one place (an address, an IPv6 address
 * by its /64) sends at most `PER_PLACE` a minute, a request the door can't read counted among
 * them, and one phone is pushed at most `PER_PHONE` a minute, past which its message comes back as
 * Expo says it, `MessageRateExceeded`, unsent. A minute holds the counts of `MOST_COUNTED` places
 * and phones; past that the oldest is forgotten to make room, so a minute of made-up tokens costs
 * a real phone its count, never its pushes.
 *
 * Beside it, `POST /v1/push/receipts` asks Expo what became of pushes it took, by their tickets'
 * ids, so a server learns of a phone whose app was deleted only after the push was taken (the
 * stranger review, 4 November 2026): `{ "ids": [...] }` in, Expo's `{ "data": { id: receipt } }`
 * out with only what a server reads. A ticket's id is Expo's, and only the server that sent the
 * push has it. A request for receipts counts one against its place's minute.
 *
 * Nothing is kept or logged but how many: no token, word or id. When Expo refuses the relay's
 * token, servers are told `push_unavailable`, never a 401 or 403, which would tell a server its
 * own token was refused and stop it pushing until it restarted. The relay's `/health` says what
 * became of the last pushes it sent on, so a monitor can tell whoever runs it.
 */

import { type ChipsConfig, EXPO_PUSH, type Logger, receiptsUrlOf } from "@chipschat/platform";
import { isExpoPushToken, isPushWords } from "@chipschat/protocol";

/** One place's pushes in a minute: a household's or an office's servers, busy. */
export const PER_PLACE = 300;
/** One phone's pushes in a minute. A person answering agents gets a few; this is a flood. */
export const PER_PHONE = 30;
/** Expo takes up to a hundred messages in one request. */
export const MOST_MESSAGES = 100;
/** The most receipts one request asks for. Expo takes a thousand. */
export const MOST_RECEIPTS = 300;
/** The most one push may be: Apple carries 4 KiB. */
export const MOST_MESSAGE_BYTES = 4096;
/** The places and phones a minute holds, so a minute of strangers can't fill the box. */
const MOST_COUNTED = 100_000;

const WINDOW_MS = 60_000;
/**
 * How long Expo gets. Less than a server gives the relay (ten seconds), so a server hears what
 * became of its pushes before it gives up on them and gives the banner to the person's computer:
 * at the same ten, a slow Expo buzzed the phone and the computer for one ask.
 */
const TIMEOUT_MS = 6000;

/** What Expo answers a token it will not take. */
const REFUSED = new Set([401, 403]);

const PRIORITIES = new Set(["default", "normal", "high"]);

export interface PushDoorOptions {
  /** The Chips app's Expo access token. */
  readonly accessToken: string;
  /** Where the pushes go on: Expo's push service. */
  readonly upstream: string;
  readonly logger: Logger;
  /** Pushes Expo took, for the day's counts. */
  readonly counted?: ((pushes: number) => void) | undefined;
  readonly clock?: (() => number) | undefined;
  /** Injected so a test can answer without a socket. */
  readonly fetch?: typeof globalThis.fetch | undefined;
  /** The places and phones a minute holds; `MOST_COUNTED` unless a test fills a smaller minute. */
  readonly mostCounted?: number | undefined;
}

/** An answer, ready to write: its status and its JSON. */
export interface PushAnswer {
  readonly status: number;
  readonly body: string;
}

/**
 * What became of the last pushes the door sent on: `refused` when Expo turned down the token,
 * `failing` when Expo didn't answer or didn't take them, `ready` from the start and again once
 * Expo takes some. A request the door turns away itself changes nothing.
 */
export type DoorReadiness = "ready" | "refused" | "failing";

export interface PushDoor {
  /** A request's body, and the place it came from, as `countedAs` names it. */
  readonly send: (body: string, place: string) => Promise<PushAnswer>;
  /** A request for receipts, `{ "ids": [...] }`, and the place it came from. */
  readonly receipts: (body: string, place: string) => Promise<PushAnswer>;
  readonly readiness: () => DoorReadiness;
}

type Message = Readonly<Record<string, unknown>> & { readonly to: string };

/** One ticket, as Expo writes it and a server reads it. */
interface Ticket {
  readonly status: "ok" | "error";
  readonly id?: string;
  readonly message?: string;
  readonly details?: { readonly error: string };
}

const LIMITED: Ticket = {
  status: "error",
  message: "This phone has had its pushes for the minute.",
  details: { error: "MessageRateExceeded" },
};

/** What Expo answers a token no phone holds, and so what a server forgets a token on. */
const NOT_A_PHONE: Ticket = {
  status: "error",
  message: "That isn't a Chips phone's push token.",
  details: { error: "DeviceNotRegistered" },
};

const NOT_A_CHIPS_PUSH: Ticket = { status: "error", message: "That isn't a Chips push." };

const TOO_BIG: Ticket = {
  status: "error",
  message: "That push is bigger than a phone takes.",
  details: { error: "MessageTooBig" },
};

/**
 * The push door a relay's configuration asks for: the token and where pushes go on, Expo's
 * unless `CHIPS_PUSH_URL` says otherwise. Nothing for a relay without the token.
 */
export function pushDoorOf(
  push: ChipsConfig["push"],
): { readonly accessToken: string; readonly upstream: string } | undefined {
  if (push.accessToken === undefined) return undefined;
  return { accessToken: push.accessToken, upstream: push.url ?? EXPO_PUSH };
}

function answer(status: number, body: unknown): PushAnswer {
  return { status, body: JSON.stringify(body) };
}

function refusal(status: number, code: string, message: string): PushAnswer {
  return answer(status, { error: { code, message } });
}

const NOT_A_PUSH = refusal(400, "bad_request", "That isn't a list of Chips pushes.");

const NOT_RECEIPTS = refusal(400, "bad_request", "That isn't a list of push tickets' ids.");

/** A ticket's id as Expo writes one: a UUID, and nothing that could be a path or a word. */
const TICKET_ID = /^[A-Za-z0-9-]{1,64}$/;

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const optional = (value: unknown, ok: (value: unknown) => boolean) =>
  value === undefined || ok(value);

const isString = (value: unknown) => typeof value === "string";

function isData(value: unknown): boolean {
  return isObject(value) && Object.values(value).every(isString);
}

function isTtl(value: unknown): boolean {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

/** Whether a push has a Chips push's fields, of their kinds, and its words. */
function fits(raw: Readonly<Record<string, unknown>>): boolean {
  return (
    optional(raw["priority"], (value) => PRIORITIES.has(value as string)) &&
    optional(raw["ttl"], isTtl) &&
    optional(raw["sound"], (value) => value === "default" || value === null) &&
    optional(raw["mutableContent"], (value) => typeof value === "boolean") &&
    optional(raw["data"], isData) &&
    isPushWords(raw)
  );
}

/** A Chips push, with only the fields one has; or the ticket it gets in its place. */
function messageOf(raw: unknown): Message | Ticket {
  if (!isObject(raw) || !isExpoPushToken(raw["to"])) return NOT_A_PHONE;
  if (!fits(raw)) return NOT_A_CHIPS_PUSH;
  const keep = [
    "title",
    "body",
    "categoryId",
    "priority",
    "ttl",
    "sound",
    "mutableContent",
    "data",
  ];
  const message: Record<string, unknown> = { to: raw["to"] };
  for (const field of keep) if (raw[field] !== undefined) message[field] = raw[field];
  if (Buffer.byteLength(JSON.stringify(message)) > MOST_MESSAGE_BYTES) return TOO_BIG;
  return message as Message;
}

const isMessage = (entry: Message | Ticket): entry is Message => "to" in entry;

/** The request's entries, each a Chips push or its ticket; or nothing, when it isn't a list of pushes. */
function entriesOf(body: string): (Message | Ticket)[] | undefined {
  let raw: unknown;
  try {
    raw = JSON.parse(body);
  } catch {
    return;
  }
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MOST_MESSAGES) return;
  return raw.map(messageOf);
}

/** The ids a request for receipts names; or nothing, when it isn't `{ "ids": [...] }`. */
function idsOf(body: string): string[] | undefined {
  let raw: unknown;
  try {
    raw = JSON.parse(body);
  } catch {
    return;
  }
  const ids = isObject(raw) ? raw["ids"] : undefined;
  if (!Array.isArray(ids) || ids.length === 0 || ids.length > MOST_RECEIPTS) return;
  if (!ids.every((id) => typeof id === "string" && TICKET_ID.test(id))) return;
  return ids as string[];
}

/** Expo's receipts, for the ids asked about and only what a server reads of each. */
function receiptsOf(data: unknown, ids: readonly string[]): Record<string, Ticket> {
  const found: Record<string, Ticket> = {};
  if (!isObject(data)) return found;
  for (const id of ids) {
    if (!isObject(data[id])) continue;
    const { id: _id, ...receipt } = ticketOf(data[id]);
    found[id] = receipt;
  }
  return found;
}

/** Expo's ticket, with only what a server reads. */
function ticketOf(raw: unknown): Ticket {
  const ticket = isObject(raw) ? raw : {};
  const error = isObject(ticket["details"]) ? ticket["details"]["error"] : undefined;
  return {
    status: ticket["status"] === "ok" ? "ok" : "error",
    ...(typeof ticket["id"] === "string" ? { id: ticket["id"] } : {}),
    ...(typeof ticket["message"] === "string" ? { message: ticket["message"] } : {}),
    ...(typeof error === "string" ? { details: { error } } : {}),
  };
}

/** A minute's counts, by key, forgotten as the next minute starts. */
function createWindow(clock: () => number, room: number) {
  let minute = Math.floor(clock() / WINDOW_MS);
  const counts = new Map<string, number>();
  return {
    /** Count `n` more for `key` if that keeps it at `most` or under; whether it did. */
    take(key: string, n: number, most: number): boolean {
      const now = Math.floor(clock() / WINDOW_MS);
      if (now !== minute) {
        minute = now;
        counts.clear();
      }
      const had = counts.get(key);
      if (had === undefined && counts.size >= room) {
        // The oldest count goes, rather than this one being refused for want of room.
        const oldest = counts.keys().next().value;
        if (oldest !== undefined) counts.delete(oldest);
      }
      if ((had ?? 0) + n > most) return false;
      counts.set(key, (had ?? 0) + n);
      return true;
    },
  };
}

export function createPushDoor(options: PushDoorOptions): PushDoor {
  const call = options.fetch ?? globalThis.fetch;
  const clock = options.clock ?? Date.now;
  const room = options.mostCounted ?? MOST_COUNTED;
  const places = createWindow(clock, room);
  const phones = createWindow(clock, room);
  let readiness: DoorReadiness = "ready";

  const receiptsUrl = receiptsUrlOf(options.upstream);

  /** Expo's answer to what was sent, or the answer the server gets in its place. */
  async function post(
    body: unknown,
    url: string = options.upstream,
  ): Promise<Response | PushAnswer> {
    try {
      return await call(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json",
          authorization: `Bearer ${options.accessToken}`,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (error) {
      const why = error instanceof Error ? error.message : "unreachable";
      options.logger.warn({ event: "push.unreachable", why }, "Expo's push service is unreachable");
      readiness = "failing";
      return refusal(502, "push_failed", "The push service didn't answer.");
    }
  }

  /** Expo refused the token: said once while it stays so; a server told the relay can't push. */
  function refused(status: number): PushAnswer {
    if (readiness !== "refused") {
      readiness = "refused";
      options.logger.warn(
        { event: "push.refused", status },
        "Expo refused the relay's access token: no pushes go until CHIPS_PUSH_ACCESS_TOKEN is one it takes",
      );
    }
    return refusal(503, "push_unavailable", "The relay can't send pushes right now.");
  }

  /** Expo's tickets for what was sent, or the answer the server gets in their place. */
  async function forward(messages: readonly Message[]): Promise<Ticket[] | PushAnswer> {
    const response = await post(messages);
    if (!(response instanceof Response)) return response;
    if (REFUSED.has(response.status)) return refused(response.status);
    if (!response.ok) {
      options.logger.warn({ event: "push.failed", status: response.status }, "push failed");
      readiness = "failing";
      return refusal(502, "push_failed", "The push service didn't take the pushes.");
    }
    const data = await response.json().then(
      (body: unknown) => (isObject(body) ? body["data"] : undefined),
      () => undefined,
    );
    if (!Array.isArray(data) || data.length !== messages.length) {
      readiness = "failing";
      return refusal(502, "push_failed", "The push service answered with tickets of its own.");
    }
    readiness = "ready";
    return data.map(ticketOf);
  }

  return {
    async send(body, place) {
      const entries = entriesOf(body);
      if (entries === undefined) {
        // Read and turned away, which costs the door too: counted as one push from there.
        places.take(place, 1, PER_PLACE);
        return NOT_A_PUSH;
      }
      if (!places.take(place, entries.length, PER_PLACE)) {
        return refusal(429, "busy", "Too many pushes from here this minute.");
      }
      const allowed = entries.map((entry) =>
        !isMessage(entry) || phones.take(entry.to, 1, PER_PHONE) ? entry : LIMITED,
      );
      const sendable = allowed.filter(isMessage);
      const sent = sendable.length === 0 ? [] : await forward(sendable);
      if (!Array.isArray(sent)) return sent;
      options.counted?.(sent.filter((ticket) => ticket.status === "ok").length);
      let next = 0;
      const tickets = allowed.map((entry) => (isMessage(entry) ? (sent[next++] as Ticket) : entry));
      return answer(200, { data: tickets });
    },
    async receipts(body, place) {
      const ids = idsOf(body);
      if (ids === undefined) {
        places.take(place, 1, PER_PLACE);
        return NOT_RECEIPTS;
      }
      if (!places.take(place, 1, PER_PLACE)) {
        return refusal(429, "busy", "Too many requests from here this minute.");
      }
      const response = await post({ ids }, receiptsUrl);
      if (!(response instanceof Response)) return response;
      if (REFUSED.has(response.status)) return refused(response.status);
      if (!response.ok) {
        options.logger.warn(
          { event: "push.receipts_failed", status: response.status },
          "receipts failed",
        );
        return refusal(502, "push_failed", "The push service didn't give the receipts.");
      }
      const data = await response.json().then(
        (answered: unknown) => (isObject(answered) ? answered["data"] : undefined),
        () => undefined,
      );
      return answer(200, { data: receiptsOf(data, ids) });
    },
    readiness: () => readiness,
  };
}
