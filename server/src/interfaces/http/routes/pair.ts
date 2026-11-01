/**
 * `POST /v1/pair`. The one route that does not need a credential, because it is how a person
 * gets one.
 *
 * The device generates its own Ed25519 key pair and sends only the public half, along with a
 * short-lived single-use code from the QR. Nothing secret crosses the wire in either direction,
 * and there is no password to phish (ADR 0006).
 *
 * The answer carries the server's tunnel key beside the credential (ADR 0191, decision 5): a
 * device pairing by a typed code holds no key yet, so this is the one exchange it makes on the
 * plain link, and the key it pins from it is what every tunnel after is a handshake against. A
 * device that came in through a tunnel already holds the key the tunnel was made to.
 *
 * A code a person's device made while the relay was on asks (ADR 0232): the answer is `202`, a
 * request that waits for that person's Allow, polled at `POST /v1/join/:id/redeem`.
 */

import type { LinkWaiting } from "@chipschat/protocol";
import type { Hono } from "hono";
import type { PairFailure, PairWaiting } from "../../../application/use-cases/pair-device.js";
import type { GatewayDeps, GatewayEnv } from "../context.js";
import { HttpError } from "../errors.js";
import { addressOf, createLimiter } from "../limiter.js";

/** The three fields a pairing carries, checked before anything is looked up. */
function readPairing(raw: string): { code: string; publicKey: string; name: string } {
  let body: { code?: unknown; public_key?: unknown; name?: unknown };
  try {
    body = JSON.parse(raw);
  } catch {
    throw new HttpError("invalid_event", "The body is not JSON.");
  }

  if (typeof body.code !== "string" || typeof body.public_key !== "string") {
    throw new HttpError("invalid_event", "Send a `code` and a `public_key`.");
  }

  return {
    code: body.code,
    publicKey: body.public_key,
    name: typeof body.name === "string" ? body.name : "A device",
  };
}

/**
 * Wrong pairing codes in a minute, from every address together, at which each address is
 * allowed one a minute rather than five (ADR 0056). Six addresses' whole allowance: more than
 * the people pairing with one server mistype, and far less than a guess spread over many
 * addresses makes.
 */
export const WRONG_CODES_BEFORE_STRAIN = 30;

/** A refused pairing as an HTTP answer. */
function refusePairing(error: PairFailure): never {
  if (error === "malformed_key") {
    throw new HttpError("invalid_event", "That is not an Ed25519 public key.");
  }
  if (error === "too_many") {
    throw new HttpError(
      "rate_limited",
      "Five requests are waiting already. Ask again in a few minutes.",
      undefined,
      undefined,
      "too_many",
    );
  }
  // A wrong code and an expired one are the same answer here: telling them apart would let
  // somebody learn which codes have ever existed.
  throw new HttpError("unauthorized", "That pairing code is not valid.");
}

/**
 * A link's request that waits (ADR 0232), as `POST /v1/pair` and `POST /v1/invites/redeem` both
 * answer it, `202`: what the device polls with, and the six digits it shows.
 */
export function waitingBody(waiting: PairWaiting["waiting"]): LinkWaiting {
  return {
    state: "waiting",
    request_id: waiting.requestId,
    secret: waiting.secret,
    code: waiting.code,
    expires_in: waiting.expiresIn,
    interval: waiting.interval,
  };
}

export function registerPairRoutes(app: Hono<GatewayEnv>, deps: GatewayDeps): void {
  // A code is six characters from thirty-two, good for fifteen minutes and once: a guesser who
  // is never slowed down has a small but real chance at it on a server bound to the network.
  const limiter = createLimiter(() => deps.clock.nowMs(), {
    message: "Too many wrong pairing codes from this address. Try again in a minute.",
    strainedAt: WRONG_CODES_BEFORE_STRAIN,
    strainedMessage:
      "This server is getting wrong pairing codes from many places, so each address has one try a minute. Try again in a minute.",
    onStrained: () =>
      deps.logger.warn(
        { perMinute: WRONG_CODES_BEFORE_STRAIN },
        "wrong pairing codes from many addresses: one try a minute each",
      ),
  });
  app.post("/v1/pair", async (c) => {
    const { pairDevice } = deps;
    if (pairDevice === undefined) {
      throw new HttpError("not_found", "This server is not accepting pairings.");
    }

    const result = await limiter.attempt(addressOf(c), async (wrong) => {
      const result = await pairDevice(readPairing(await c.req.text()));
      if (!result.ok && result.error !== "malformed_key" && result.error !== "too_many") wrong();
      return result;
    });

    if (!result.ok) {
      deps.logger.warn({ reason: result.error }, "pairing refused");
      refusePairing(result.error);
    }
    if ("waiting" in result.value) {
      const { waiting } = result.value;
      deps.logger.info({ requestId: waiting.requestId }, "pairing code used, waiting for an allow");
      return c.json(waitingBody(waiting), 202);
    }

    deps.logger.info({ deviceId: result.value.deviceId }, "device paired");
    return c.json(
      {
        device_id: result.value.deviceId,
        participant_id: result.value.participantId,
        workspace_id: result.value.workspaceId,
        display_name: result.value.displayName,
        ...(result.value.workspaceName === undefined
          ? {}
          : { workspace_name: result.value.workspaceName }),
        server_key: await deps.relay.publicKey(),
      },
      201,
    );
  });
}
