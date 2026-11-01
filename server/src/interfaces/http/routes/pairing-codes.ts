/**
 * `POST /v1/pairing-codes` — a code for another device, from a device that is already paired.
 *
 * `chips serve` prints one code, and a code is single use: the first device takes it. Every
 * device after that — the desktop app on a laptop, the CLI on the server itself, a phone —
 * needs a code of its own, and the person holding a paired device is the one to issue it,
 * because it is their participant the new device will speak as. A harness cannot: a token is
 * not a person, and a harness that could pair devices could make itself one.
 *
 * Beside the code (M4.1, ADR 0038): the payload's version, the server's tunnel key, the relay
 * this server dials out to when it has one, and a candidate list that is empty in v0 — everything
 * a phone needs to reach the server from anywhere, for the caller to put in a QR. The key is there
 * relay or not (ADR 0191): the tunnel door on this network answers to it, so a phone pairs inside
 * the tunnel from its first request.
 *
 * And `server_url`, which is where this server is on a network (ADR 0028). The caller cannot
 * work that out: a browser only knows the origin it loaded from, which is a dev server on
 * another port, or the desktop app on another machine, or `127.0.0.1` — and a QR that says
 * `127.0.0.1` names the one device that is not holding the camera. So the server says.
 *
 * And `link`, the code as one link to send a computer (ADR 0210): the relay's `/pair` page when
 * there is a relay, which opens on any network and hands the payload to Chips for Mac, and this
 * server's own page otherwise. Built here, as an invite's link is, so every device that issues a
 * code sends the same thing.
 *
 * An owner may name somebody else in the body, `{ "for": "<person>" }` (ADR 0206): the code then
 * pairs a device as them, for a person whose phone is new and who has no other device to make
 * one with. Nobody else may, and the person must still be in the workspace.
 *
 * With the relay on, the link is the relay's page, which reads the code, so the code asks (ADR
 * 0232): the device that uses it waits until the person who made it allows it, on their devices.
 *
 * And `{ "replaces": "<device>" }` (ADR 0236), a live device of the person the code is for: the
 * phone that uses the code reconnects in its place, and it is signed out once the new one pairs.
 * A device of anybody else's, or one signed out already, is `404`.
 */

import { PAIRING_VERSION, pairingUrl, pairRelayUrl } from "@chipschat/protocol";
import type { Hono } from "hono";
import { pairingFor } from "../../../application/index.js";
import type { GatewayDeps, GatewayEnv } from "../context.js";
import { HttpError } from "../errors.js";
import { linkBase } from "./invites.js";

export function registerPairingCodeRoutes(app: Hono<GatewayEnv>, deps: GatewayDeps): void {
  app.post("/v1/pairing-codes", async (c) => {
    const principal = c.get("principal");
    if (principal.kind !== "person") {
      throw new HttpError("forbidden", "Only a person's device can issue a pairing code.");
    }
    if (deps.pairingCodes === undefined) {
      throw new HttpError("not_found", "This server is not accepting pairings.");
    }
    const body = bodyOf(c.get("rawBody"));
    const participantId = await whomFor(deps, principal, body.for);
    const replaces = await replacing(deps, principal.workspaceId, participantId, body.replaces);
    const issued = deps.pairingCodes.issue({
      workspaceId: principal.workspaceId,
      participantId,
      ...(deps.relay.url === undefined ? {} : { askedOf: principal.participantId }),
      ...(replaces === undefined ? {} : { replaces }),
    });
    said(c.get("logger"), issued.expiresAt, {
      participantId,
      by: principal.participantId,
      replaces,
    });
    return c.json(await codeOnTheWire(deps, issued, c.req.header("origin")), 201);
  });
}

/** The log's line for a code: for whom and by whom when not the caller's own, and what it replaces. */
function said(
  logger: { info: (fields: Record<string, unknown>, message: string) => void },
  expiresAt: number,
  code: {
    readonly participantId: string;
    readonly by: string;
    readonly replaces?: string | undefined;
  },
): void {
  const { participantId, by, replaces } = code;
  if (replaces !== undefined) {
    // A phone reconnected in the place of one of theirs (ADR 0236): which, for whom, by whom.
    logger.info(
      { expiresAt, for: participantId, by, replaces },
      "pairing code issued to reconnect a device",
    );
  } else if (participantId === by) {
    logger.info({ expiresAt }, "pairing code issued");
  } else {
    // Somebody else's phone (ADR 0206): the log says for whom, and by whom.
    logger.info({ expiresAt, for: participantId, by }, "pairing code issued for another person");
  }
}

/** Whom the code pairs a device as: the caller, or whom an owner names (ADR 0206); else refused. */
async function whomFor(
  deps: Pick<GatewayDeps, "readModels">,
  principal: Parameters<typeof pairingFor>[1],
  named: string | undefined,
): Promise<string> {
  const as = await pairingFor(deps.readModels, principal, named);
  if (as.ok) return as.participantId;
  throw new HttpError(as.error.kind === "unknown" ? "not_found" : "forbidden", as.error.message);
}

/** The device a code replaces (ADR 0236): a live one of the person it pairs as, or refused. */
async function replacing(
  deps: Pick<GatewayDeps, "devices">,
  workspaceId: string,
  participantId: string,
  named: string | undefined,
): Promise<string | undefined> {
  if (named === undefined) return undefined;
  const device = await deps.devices.device(workspaceId, named);
  if (device === undefined || device.participantId !== participantId || device.revokedAt !== null) {
    throw new HttpError(
      "not_found",
      "That isn't one of their devices, or it is signed out already.",
    );
  }
  return device.deviceId;
}

/**
 * What a body names: the person in `for`, and the device in `replaces`. An empty body is a code
 * for the caller.
 */
function bodyOf(raw: string): { readonly for?: string; readonly replaces?: string } {
  if (raw.trim() === "") return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new HttpError("invalid_event", "The body is not JSON.");
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new HttpError("invalid_event", "The body is a JSON object.");
  }
  const named = parsed as Record<string, unknown>;
  const forId = idIn(named, "for", "`for` is a person's id.");
  const replaces = idIn(named, "replaces", "`replaces` is a device's id.");
  return {
    ...(forId === undefined ? {} : { for: forId }),
    ...(replaces === undefined ? {} : { replaces }),
  };
}

/** One id a body names, or nothing: anything but a non-empty string is refused. */
function idIn(body: Record<string, unknown>, key: string, says: string): string | undefined {
  const value = body[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string" || value === "") throw new HttpError("invalid_event", says);
  return value;
}

/**
 * A code as every door that issues one answers: the code, when it dies, the payload's version,
 * where this server is on a network, the server's key, the relay beside it when there is one, and
 * the link a computer is sent (ADR 0210). One shape, so a caller building a QR or a link needs to
 * know one thing.
 */
export async function codeOnTheWire(
  deps: Pick<GatewayDeps, "relay" | "reachableUrl" | "config">,
  issued: { readonly code: string; readonly expiresAt: number },
  /** The page that asked, when a browser did: the link names it as an invite's does. */
  origin?: string | undefined,
): Promise<Record<string, unknown>> {
  const relay = deps.relay.url;
  const key = await deps.relay.publicKey();
  // Where a browser on the server's network pairs: the configured address, else the page that
  // asked when it is one this server serves (`linkBase`, as for an invite's link).
  const lan = linkBase(origin, deps);
  const link =
    relay === undefined
      ? pairingUrl(lan, issued.code, { key })
      : pairRelayUrl(relay, issued.code, { lan, key, until: issued.expiresAt / 1000 });
  return {
    code: issued.code,
    expires_at: new Date(issued.expiresAt).toISOString(),
    v: PAIRING_VERSION,
    server_url: deps.reachableUrl(),
    relay: relay ?? null,
    server_key: key,
    candidates: [],
    link,
  };
}
