/**
 * Passkeys (ADR 0034, decision 4).
 *
 * From a paired device: `POST /v1/passkeys/options` hands the browser what to register with,
 * `POST /v1/passkeys` takes the answer and keeps the key, `GET /v1/passkeys` lists a person's
 * own, `DELETE /v1/passkeys/:id` withdraws one. Nobody sees or ends another person's passkeys;
 * an owner removes a person's devices instead.
 *
 * Two routes take no credential, because they are how a new device gets one:
 * `POST /v1/passkeys/assertion-options` issues a sign-in challenge, and `POST /v1/passkeys/assert`
 * takes the authenticator's answer and pairs the device that asked, behind the pairing limiter.
 */

import type { Hono } from "hono";
import type { GatewayDeps, GatewayEnv } from "../context.js";
import { HttpError } from "../errors.js";
import { addressOf, createLimiter } from "../limiter.js";

export const UNAUTHENTICATED_PASSKEY_ROUTES = [
  "/v1/passkeys/assertion-options",
  "/v1/passkeys/assert",
];

function parse(raw: string): Record<string, unknown> {
  try {
    const body: unknown = JSON.parse(raw === "" ? "{}" : raw);
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      throw new HttpError("invalid_event", "The body is a JSON object.");
    }
    return body as Record<string, unknown>;
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError("invalid_event", "The body is not JSON.");
  }
}

/** The browser's credential JSON, as far as the routes look at it: an id and a response. */
function readAnswer(body: Record<string, unknown>): {
  challenge: string;
  answer: { id: string; response: Record<string, unknown> };
} {
  const challenge = body["challenge"];
  const credential = body["credential"] as Record<string, unknown> | undefined;
  const response = credential?.["response"];
  if (
    typeof challenge !== "string" ||
    typeof credential?.["id"] !== "string" ||
    typeof response !== "object" ||
    response === null
  ) {
    throw new HttpError("invalid_event", "Send the `challenge` and the browser's `credential`.");
  }
  return {
    challenge,
    answer: { id: credential["id"], response: response as Record<string, unknown> },
  };
}

function refuse(error: { kind: string; message: string }): never {
  switch (error.kind) {
    case "not_a_person":
      throw new HttpError("forbidden", error.message);
    case "invalid":
      throw new HttpError("invalid_event", error.message);
    case "unknown_passkey":
      throw new HttpError("not_found", error.message);
    default:
      // A wrong challenge, a signature that does not verify: one answer.
      throw new HttpError("unauthorized", "That passkey answer is not valid.");
  }
}

function passkeyJson(passkey: {
  id: string;
  name: string;
  algorithm: number;
  transports: readonly string[];
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}) {
  return {
    passkey_id: passkey.id,
    name: passkey.name,
    algorithm: passkey.algorithm,
    transports: passkey.transports,
    created_at: passkey.createdAt,
    last_used_at: passkey.lastUsedAt,
    revoked_at: passkey.revokedAt,
  };
}

export function registerPasskeyRoutes(app: Hono<GatewayEnv>, deps: GatewayDeps): void {
  const limiter = createLimiter(() => deps.clock.nowMs(), {
    message: "Too many failed sign-ins from this address. Try again in a minute.",
  });
  // Every sign-in challenge is counted against its address, answered or not (SEC-13): each is
  // held five minutes, and a person signing in by hand asks for one or two.
  const challenges = createLimiter(() => deps.clock.nowMs(), {
    message: "Too many sign-ins begun from this address. Try again in a minute.",
  });

  app.post("/v1/passkeys/assertion-options", async (c) => {
    const address = addressOf(c);
    limiter.check(address);
    const options = await challenges.attempt(address, (counted) => {
      counted();
      return deps.passkeys.assertionOptions();
    });
    return c.json(options);
  });

  app.post("/v1/passkeys/assert", async (c) => {
    const signedIn = await limiter.attempt(addressOf(c), async (wrong) => {
      const body = parse(await c.req.text());
      const { challenge, answer } = readAnswer(body);
      const publicKey = body["public_key"];
      if (typeof publicKey !== "string") {
        throw new HttpError("invalid_event", "Send the new device's `public_key`.");
      }
      const signedIn = await deps.passkeys.signIn({
        challenge,
        answer: answer as never,
        publicKey,
        deviceName: typeof body["device_name"] === "string" ? body["device_name"] : "A device",
      });
      if (!signedIn.ok && signedIn.error.kind !== "invalid") wrong();
      return signedIn;
    });
    if (!signedIn.ok) {
      // A passkey nobody has and a signature that does not verify are one answer here: the
      // wire must not learn which credential ids exist.
      if (signedIn.error.kind === "unknown_passkey") {
        throw new HttpError("unauthorized", "That passkey answer is not valid.");
      }
      refuse(signedIn.error);
    }
    deps.logger.info({ deviceId: signedIn.value.deviceId }, "signed in with a passkey");
    return c.json(
      {
        device_id: signedIn.value.deviceId,
        participant_id: signedIn.value.participantId,
        workspace_id: signedIn.value.workspaceId,
        workspace_name: signedIn.value.workspaceName,
        display_name: signedIn.value.displayName,
        role: signedIn.value.role,
      },
      201,
    );
  });

  app.post("/v1/passkeys/options", async (c) => {
    const options = await deps.passkeys.registrationOptions(c.get("principal"));
    if (!options.ok) refuse(options.error);
    return c.json(options.value);
  });

  app.post("/v1/passkeys", async (c) => {
    const body = parse(c.get("rawBody"));
    const { challenge, answer } = readAnswer(body);
    const registered = await deps.passkeys.register({
      principal: c.get("principal"),
      challenge,
      answer: answer as never,
      name: typeof body["name"] === "string" ? body["name"] : undefined,
    });
    if (!registered.ok) {
      // The caller is a known person on a paired device: a challenge that was not theirs, or
      // an answer that does not verify, is bad input, not a credential that failed.
      if (registered.error.kind === "unknown_challenge" || registered.error.kind === "refused") {
        throw new HttpError("invalid_event", registered.error.message);
      }
      refuse(registered.error);
    }
    c.get("logger").info({ passkeyId: registered.value.id }, "passkey registered");
    return c.json(passkeyJson(registered.value), 201);
  });

  app.get("/v1/passkeys", async (c) => {
    const listed = await deps.passkeys.list(c.get("principal"));
    if (!listed.ok) refuse(listed.error);
    return c.json({ passkeys: listed.value.map(passkeyJson) });
  });

  app.delete("/v1/passkeys/:id", async (c) => {
    const revoked = await deps.passkeys.revoke({
      principal: c.get("principal"),
      passkeyId: c.req.param("id"),
    });
    if (!revoked.ok) refuse(revoked.error);
    return c.json({ passkey_id: revoked.value.passkeyId, revoked_at: revoked.value.revokedAt });
  });
}
