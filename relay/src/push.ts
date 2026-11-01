/**
 * The push door, `POST /v1/push` (ADR 0246): the relay sends a server's pushes to the Chips app,
 * with the app's Expo access token, for a server that has none.
 *
 * It speaks Expo's own shape, a list of messages in and one ticket per message out, so a server
 * posts here exactly as it would post to Expo. What it forwards is only a Chips push: to an Expo
 * push token, with a Chips push's fields and nothing else, at most 4 KiB each. A push carries no
 * words worth reading (ADR 0045), and the ones a phone shows are sealed to it (ADR 0158), so what
 * crosses here is what crossed Expo before.
 *
 * Limits keep the token from being anybody's to spend: one place (an address, an IPv6 address
 * by its /64) sends at most `PER_PLACE` a minute, and one phone is pushed at most `PER_PHONE` a
 * minute, past which its message comes back as Expo says it, `MessageRateExceeded`, unsent.
 *
 * Nothing is kept or logged but how many: no token, word or id. When Expo refuses the relay's
 * token, servers are told `push_unavailable`, never a 401 or 403, which would tell a server its
 * own token was refused and stop it pushing until it restarted.
 */

import { type ChipsConfig, EXPO_PUSH, type Logger } from "@chipschat/platform";

/** One place's pushes in a minute: a household's or an office's servers, busy. */
export const PER_PLACE = 300;
/** One phone's pushes in a minute. A person answering agents gets a few; this is a flood. */
export const PER_PHONE = 30;
/** Expo takes up to a hundred messages in one request. */
export const MOST_MESSAGES = 100;
/** The most one push may be: Apple carries 4 KiB. */
export const MOST_MESSAGE_BYTES = 4096;
/** The places and phones a minute holds, so a minute of strangers can't fill the box. */
const MOST_COUNTED = 100_000;

const WINDOW_MS = 60_000;
const TIMEOUT_MS = 10_000;

/** What Expo answers a token it will not take. */
const REFUSED = new Set([401, 403]);

/** An Expo push token, which is all the Chips app registers. */
const PUSH_TOKEN = /^Expo(?:nent)?PushToken\[[^\]\s]{1,256}\]$/;

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
}

/** An answer, ready to write: its status and its JSON. */
export interface PushAnswer {
  readonly status: number;
  readonly body: string;
}

export interface PushDoor {
  /** A request's body, and the place it came from, as `countedAs` names it. */
  readonly send: (body: string, place: string) => Promise<PushAnswer>;
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

/** A Chips push, with only the fields one has; or nothing, when it isn't one. */
function messageOf(raw: unknown): Message | undefined {
  if (!isObject(raw) || typeof raw["to"] !== "string" || !PUSH_TOKEN.test(raw["to"])) return;
  const fits =
    optional(raw["title"], isString) &&
    optional(raw["body"], isString) &&
    optional(raw["categoryId"], isString) &&
    optional(raw["priority"], (value) => PRIORITIES.has(value as string)) &&
    optional(raw["ttl"], isTtl) &&
    optional(raw["sound"], (value) => value === "default" || value === null) &&
    optional(raw["mutableContent"], (value) => typeof value === "boolean") &&
    optional(raw["data"], isData);
  if (!fits) return;
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
  if (Buffer.byteLength(JSON.stringify(message)) > MOST_MESSAGE_BYTES) return;
  return message as Message;
}

/** The request's messages, every one a Chips push; or nothing, when any isn't. */
function messagesOf(body: string): Message[] | undefined {
  let raw: unknown;
  try {
    raw = JSON.parse(body);
  } catch {
    return;
  }
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MOST_MESSAGES) return;
  const messages = raw.map(messageOf);
  return messages.every((message) => message !== undefined) ? messages : undefined;
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
function createWindow(clock: () => number) {
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
      if (had === undefined && counts.size >= MOST_COUNTED) return false;
      if ((had ?? 0) + n > most) return false;
      counts.set(key, (had ?? 0) + n);
      return true;
    },
  };
}

export function createPushDoor(options: PushDoorOptions): PushDoor {
  const call = options.fetch ?? globalThis.fetch;
  const clock = options.clock ?? Date.now;
  const places = createWindow(clock);
  const phones = createWindow(clock);
  /** Said once when Expo refuses the token, and again only after it has taken one since. */
  let refusedSaid = false;

  /** Expo's answer to what was sent, or the answer the server gets in its place. */
  async function post(messages: readonly Message[]): Promise<Response | PushAnswer> {
    try {
      return await call(options.upstream, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json",
          authorization: `Bearer ${options.accessToken}`,
        },
        body: JSON.stringify(messages),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (error) {
      const why = error instanceof Error ? error.message : "unreachable";
      options.logger.warn({ event: "push.unreachable", why }, "Expo's push service is unreachable");
      return refusal(502, "push_failed", "The push service didn't answer.");
    }
  }

  /** Expo refused the token: said once, and a server told the relay can't push now. */
  function refused(status: number): PushAnswer {
    if (!refusedSaid) {
      refusedSaid = true;
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
      return refusal(502, "push_failed", "The push service didn't take the pushes.");
    }
    const data = await response.json().then(
      (body: unknown) => (isObject(body) ? body["data"] : undefined),
      () => undefined,
    );
    if (!Array.isArray(data) || data.length !== messages.length) {
      return refusal(502, "push_failed", "The push service answered with tickets of its own.");
    }
    refusedSaid = false;
    return data.map(ticketOf);
  }

  return {
    async send(body, place) {
      const messages = messagesOf(body);
      if (messages === undefined) return NOT_A_PUSH;
      if (!places.take(place, messages.length, PER_PLACE)) {
        return refusal(429, "busy", "Too many pushes from here this minute.");
      }
      const allowed = messages.map((message) => phones.take(message.to, 1, PER_PHONE));
      const sendable = messages.filter((_, index) => allowed[index]);
      const sent = sendable.length === 0 ? [] : await forward(sendable);
      if (!Array.isArray(sent)) return sent;
      options.counted?.(sent.filter((ticket) => ticket.status === "ok").length);
      let next = 0;
      const tickets = allowed.map((ok) => (ok ? (sent[next++] as Ticket) : LIMITED));
      return answer(200, { data: tickets });
    },
  };
}
