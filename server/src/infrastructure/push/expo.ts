/**
 * The `PushSender` that posts to Expo's push service (M4.3, ADR 0045), or to anything that speaks
 * its shape: Chips's push relay, for a server without Expo's access token (ADR 0246).
 *
 * Expo holds the APNs key and the FCM credential, so this server holds neither: what leaves
 * here is a token, two fixed words and a pair of ids. That is the whole privacy argument, and
 * it is why the messages this adapter is handed have nothing in them worth reading.
 *
 * A push is best effort. Nothing here throws at the caller: a service that is down, a request
 * that is refused, a body that is not what was expected all come back as failed tickets, and
 * the decision is still in the queue on the phone the next time it looks. The one ticket worth
 * acting on is `DeviceNotRegistered`, which the caller turns into a deleted row.
 *
 * Whether it can send at all is known here, and said (ADR 0244). The Chips app's Expo project has
 * enhanced security on, so a post to Expo without an access token is refused, every time: a
 * server pointed at Expo with none says so once as it starts and sends nothing. (A server with
 * no `CHIPS_PUSH_URL` and no token isn't pointed at Expo: it sends through the push relay.) A 401 or 403 means the token it
 * has is wrong or was revoked: said once, and nothing more is sent until Chips restarts.
 */

import type { Logger } from "@chipschat/platform";
import type {
  PushMessage,
  PushReadiness,
  PushSender,
  PushTicket,
} from "../../application/ports/push.js";

/** Expo takes up to a hundred messages in one request. */
const BATCH = 100;

const TIMEOUT_MS = 10_000;

/** Expo's own push service, which takes the Chips app's pushes only with an access token. */
const EXPO_HOST = "exp.host";

/** What the push service answers a request it will not take from this server. */
const REFUSED = new Set([401, 403]);

export interface ExpoPushOptions {
  readonly url: string;
  readonly accessToken?: string | undefined;
  readonly logger: Logger;
  /** Injected so a test can answer without a socket. */
  readonly fetch?: typeof globalThis.fetch;
}

/** One entry of Expo's `data` array. Anything else in it is not ours to care about. */
interface ExpoTicket {
  readonly status?: unknown;
  readonly id?: unknown;
  readonly message?: unknown;
  readonly details?: { readonly error?: unknown } | undefined;
}

function ticketFrom(raw: ExpoTicket): PushTicket {
  const ok = raw.status === "ok";
  return {
    ok,
    ...(typeof raw.id === "string" ? { id: raw.id } : {}),
    ...(typeof raw.details?.error === "string" ? { error: raw.details.error } : {}),
    ...(typeof raw.message === "string" ? { message: raw.message } : {}),
  };
}

function allFailed(count: number, message: string): PushTicket[] {
  return Array.from({ length: count }, () => ({ ok: false, message }));
}

function isExpo(url: string): boolean {
  try {
    return new URL(url).hostname === EXPO_HOST;
  } catch {
    return false;
  }
}

export function createExpoPushSender(options: ExpoPushOptions): PushSender {
  const call = options.fetch ?? globalThis.fetch;
  let readiness: PushReadiness =
    options.accessToken === undefined && isExpo(options.url) ? "no_access_token" : "ready";
  if (readiness === "no_access_token") {
    options.logger.warn(
      { event: "push.off", why: readiness },
      "pushes to phones are off: Expo takes the Chips app's pushes only with an access token, and CHIPS_PUSH_ACCESS_TOKEN is not set. Without CHIPS_PUSH_URL, they go through the Chips push relay",
    );
  }

  /** The request itself. A `string` in place of a response is why it did not happen. */
  async function post(batch: readonly PushMessage[]): Promise<Response | string> {
    try {
      const response = await call(options.url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json",
          ...(options.accessToken === undefined
            ? {}
            : { authorization: `Bearer ${options.accessToken}` }),
        },
        body: JSON.stringify(batch),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (response.ok) return response;
      if (REFUSED.has(response.status)) {
        readiness = "refused";
        options.logger.warn(
          { event: "push.refused", status: response.status },
          "the push service refused this server's access token: pushes to phones are off until Chips restarts with one that works",
        );
        return "refused";
      }
      options.logger.warn({ event: "push.failed", status: response.status }, "push failed");
      return `http ${response.status}`;
    } catch (error) {
      const why = error instanceof Error ? error.message : "unreachable";
      options.logger.warn({ event: "push.unreachable", why }, "the push service is unreachable");
      return why;
    }
  }

  async function sendBatch(batch: readonly PushMessage[]): Promise<PushTicket[]> {
    const response = await post(batch);
    if (typeof response === "string") return allFailed(batch.length, response);
    let body: { data?: unknown };
    try {
      body = (await response.json()) as { data?: unknown };
    } catch {
      return allFailed(batch.length, "the push service answered with something that is not JSON");
    }
    if (!Array.isArray(body.data) || body.data.length !== batch.length) {
      // Expo answers one ticket per message, in order. Anything else and the tickets cannot be
      // matched to the phones they were for, so none of them is trusted.
      return allFailed(batch.length, "the push service answered with a ticket list of its own");
    }
    return body.data.map((raw) => ticketFrom(raw as ExpoTicket));
  }

  return {
    async send(messages) {
      const tickets: PushTicket[] = [];
      for (let from = 0; from < messages.length; from += BATCH) {
        const batch = messages.slice(from, from + BATCH);
        tickets.push(
          ...(readiness === "ready" ? await sendBatch(batch) : allFailed(batch.length, readiness)),
        );
      }
      return tickets;
    },
    readiness: () => readiness,
  };
}
