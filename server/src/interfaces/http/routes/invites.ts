/**
 * Invites (ADR 0034).
 *
 * `POST /v1/invites` makes one — an owner, with a role, single-use unless said otherwise, for 30
 * minutes or less — and answers with the link, once, the relay and the server's key beside
 * the token when the server has a relay (ADR 0164). `GET /v1/invites` lists what exists without
 * ever returning a token; `DELETE /v1/invites/:id` withdraws one.
 *
 * Two routes take no credential, because they are how somebody gets one: `POST /v1/invites/peek`
 * says what a link is for — the workspace, the role — so the person can be asked their name
 * knowing where they are going; `POST /v1/invites/redeem` joins them and pairs the device that
 * asked, the way `POST /v1/pair` does, behind the same limiter.
 *
 * A link may name a space (ADR 0168, `space_id` when it is made): joining by it puts the person
 * in that space too, and `POST /v1/invites/enter`, signed by somebody already in the workspace,
 * lets them into the space without spending the link.
 *
 * A link lasts 30 minutes at most (ADR 0232). One made while the relay is on goes out as the
 * relay's page and asks: redeeming it answers `202` with a request that waits for its maker's
 * Allow, which the device polls at `POST /v1/join/:id/redeem` as a device that asked does.
 */

import { inviteRelayUrl, inviteUrl } from "@chipschat/protocol";
import type { Hono } from "hono";
import { isWorkspaceRole, type WorkspaceRole } from "../../../domain/index.js";
import type { GatewayDeps, GatewayEnv } from "../context.js";
import { HttpError } from "../errors.js";
import { addressOf, createLimiter } from "../limiter.js";
import { waitingBody } from "./pair.js";

/** The routes here that work without a credential. `createApp` reads this list. */
export const UNAUTHENTICATED_INVITE_ROUTES = ["/v1/invites/peek", "/v1/invites/redeem"];

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

function readCreate(raw: string): {
  role: WorkspaceRole;
  singleUse: boolean | undefined;
  expiresInSeconds: number | undefined;
  spaceId: string | undefined;
} {
  const body = parse(raw);
  const role = body["role"] ?? "member";
  if (!isWorkspaceRole(role)) {
    throw new HttpError("invalid_event", "A role is owner, admin, member or guest.");
  }
  const single = body["single_use"];
  if (single !== undefined && typeof single !== "boolean") {
    throw new HttpError("invalid_event", "`single_use` is true or false.");
  }
  const ttl = body["expires_in_seconds"];
  if (ttl !== undefined && typeof ttl !== "number") {
    throw new HttpError("invalid_event", "`expires_in_seconds` is a number.");
  }
  const space = body["space_id"];
  if (space !== undefined && (typeof space !== "string" || space === "")) {
    throw new HttpError("invalid_event", "`space_id` names a space.");
  }
  return { role, singleUse: single, expiresInSeconds: ttl, spaceId: space };
}

function readToken(raw: string): { token: string; body: Record<string, unknown> } {
  const body = parse(raw);
  const token = body["token"];
  if (typeof token !== "string" || token.trim() === "") {
    throw new HttpError("invalid_event", "Send the invite's `token`.");
  }
  return { token, body };
}

/** Every failure of the invite use cases, as an HTTP answer. */
function refuse(error: { kind: string; message: string }): never {
  switch (error.kind) {
    case "not_allowed":
    case "guest_elsewhere":
      throw new HttpError("forbidden", error.message);
    case "invalid":
      throw new HttpError("invalid_event", error.message);
    case "taken":
      // Named, so a client asks for another name rather than reading the words for it.
      throw new HttpError("invalid_event", error.message, undefined, undefined, "name_taken");
    case "too_many":
      throw new HttpError("rate_limited", error.message, undefined, undefined, "too_many");
    default:
      // A wrong token, a spent, expired or withdrawn invite: one answer, so the wire cannot
      // learn which tokens have ever existed.
      throw new HttpError("unauthorized", "That invite is not valid.");
  }
}

/**
 * Entering is asked by somebody signed in, so a link that is no good is something not found here,
 * in the same words for every way it can be no good, rather than a credential refused.
 */
function refuseEntering(error: { kind: string; message: string }): never {
  if (
    error.kind === "not_allowed" ||
    error.kind === "guest_elsewhere" ||
    error.kind === "invalid"
  ) {
    refuse(error);
  }
  throw new HttpError("not_found", "That invite is not valid.");
}

/**
 * Where a link points, which is somewhere the person it is sent to can open it: another
 * machine, as a rule. The server's own public address when one is set (`CHIPS_PUBLIC_URL`), since
 * that is the server saying where it is, as a pairing code's does (ADR 0028). Else the page the
 * link was made from, when the browser said what that is and it is not this machine's loopback —
 * a dev server proxying `/v1` serves the app as well as the server does. A loopback page is kept
 * only while the server is on loopback too, where whoever opens the link is on this machine. Else,
 * and for the desktop app, whose page is `tauri://localhost`, the address the server is reached
 * at. Until 29 September 2026 the page always won, so an owner at `127.0.0.1` sent a link that
 * opened on nobody's machine but their own. With a relay, this is the server the relay's link
 * names as `lan` (ADR 0207), and the page a browser on the server's network goes on to.
 */
export function linkBase(
  origin: string | undefined,
  deps: {
    readonly config: Pick<GatewayDeps["config"], "server">;
    readonly reachableUrl: () => string;
  },
): string {
  const reachable = deps.reachableUrl();
  const configured = deps.config.server.publicUrl;
  if (configured !== undefined && configured !== "") return reachable;
  if (origin === undefined || !/^https?:\/\//.test(origin)) return reachable;
  const page = origin.replace(/\/$/, "");
  return !isLoopback(page) || isLoopback(reachable) ? page : reachable;
}

/** An address on this machine alone: `localhost`, `127.x.x.x` or `::1`. */
function isLoopback(url: string): boolean {
  const host = new URL(url).hostname;
  return host === "localhost" || host === "[::1]" || host === "::1" || /^127\./.test(host);
}

export function registerInviteRoutes(app: Hono<GatewayEnv>, deps: GatewayDeps): void {
  const limiter = createLimiter(() => deps.clock.nowMs(), {
    message: "Too many wrong invites from this address. Try again in a minute.",
  });

  app.post("/v1/invites/peek", async (c) => {
    const peeked = await limiter.attempt(addressOf(c), async (wrong) => {
      const { token } = readToken(await c.req.text());
      const peeked = await deps.invites.peek(token);
      if (!peeked.ok) wrong();
      return peeked;
    });
    if (!peeked.ok) refuse(peeked.error);
    return c.json({
      invite_id: peeked.value.inviteId,
      workspace_id: peeked.value.workspaceId,
      workspace_name: peeked.value.workspaceName,
      role: peeked.value.role,
      single_use: peeked.value.singleUse,
      expires_at: peeked.value.expiresAt,
      invited_by_name: peeked.value.invitedByName,
      space_id: peeked.value.spaceId,
      space_name: peeked.value.spaceName,
    });
  });

  app.post("/v1/invites/redeem", async (c) => {
    const redeemed = await limiter.attempt(addressOf(c), async (wrong) => {
      const { token, body } = readToken(await c.req.text());
      const displayName = body["display_name"];
      const publicKey = body["public_key"];
      if (typeof displayName !== "string" || typeof publicKey !== "string") {
        throw new HttpError("invalid_event", "Send a `display_name` and a `public_key`.");
      }
      const redeemed = await deps.invites.redeem({
        token,
        displayName,
        publicKey,
        deviceName: typeof body["device_name"] === "string" ? body["device_name"] : "A device",
      });
      // A name somebody here goes by already is said, so the person can pick another, and
      // counted (SEC-24): said and not counted, a link holder could list everyone here by name.
      const counted = !redeemed.ok && !["invalid", "too_many"].includes(redeemed.error.kind);
      if (counted) wrong();
      return redeemed;
    });
    if (!redeemed.ok) refuse(redeemed.error);
    if ("waiting" in redeemed.value) {
      const { waiting } = redeemed.value;
      deps.logger.info({ requestId: waiting.requestId }, "invite redeemed, waiting for an allow");
      return c.json(waitingBody(waiting), 202);
    }
    deps.logger.info(
      { deviceId: redeemed.value.deviceId, role: redeemed.value.role },
      "invite redeemed",
    );
    return c.json(
      {
        device_id: redeemed.value.deviceId,
        participant_id: redeemed.value.participantId,
        workspace_id: redeemed.value.workspaceId,
        workspace_name: redeemed.value.workspaceName,
        display_name: redeemed.value.displayName,
        role: redeemed.value.role,
        space_id: redeemed.value.spaceId,
      },
      201,
    );
  });

  app.post("/v1/invites/enter", async (c) => {
    const { token } = readToken(c.get("rawBody"));
    const entered = await deps.invites.enter({ principal: c.get("principal"), token });
    if (!entered.ok) refuseEntering(entered.error);
    c.get("logger").info(
      { spaceId: entered.value.spaceId, already: entered.value.already },
      "let into a space by its link",
    );
    return c.json({
      space_id: entered.value.spaceId,
      workspace_id: entered.value.workspaceId,
      already: entered.value.already,
    });
  });

  app.post("/v1/invites", async (c) => {
    const { role, singleUse, expiresInSeconds, spaceId } = readCreate(c.get("rawBody"));
    const relay = deps.relay.url;
    const issued = await deps.invites.create({
      principal: c.get("principal"),
      role,
      singleUse,
      expiresInSeconds,
      spaceId,
      // The link below is the relay's page, which reads the token: redeeming it asks (ADR 0232).
      asks: relay !== undefined,
    });
    if (!issued.ok) refuse(issued.error);
    // The server's key rides beside the token, and the relay when there is one, so an app off this
    // network joins through the relay (ADR 0164) and one on it through the tunnel door (ADR 0191);
    // a browser reads the token alone. With a relay the link is the relay's page, which opens from
    // anywhere and opens the iPhone app, with this server in it as `lan` (ADR 0207).
    const key = await deps.relay.publicKey();
    const lan = linkBase(c.req.header("origin"), deps);
    const url =
      relay === undefined
        ? inviteUrl(lan, issued.value.token, { key })
        : inviteRelayUrl(relay, issued.value.token, {
            lan,
            key,
            until: Date.parse(issued.value.expiresAt) / 1000,
          });
    c.get("logger").info({ inviteId: issued.value.id, role }, "invite issued");
    return c.json(
      {
        invite_id: issued.value.id,
        token: issued.value.token,
        url,
        role: issued.value.role,
        single_use: issued.value.singleUse,
        expires_at: issued.value.expiresAt,
        created_at: issued.value.createdAt,
        space_id: issued.value.spaceId,
      },
      201,
    );
  });

  app.get("/v1/invites", async (c) => {
    const listed = await deps.invites.list(c.get("principal"));
    if (!listed.ok) refuse(listed.error);
    return c.json({
      invites: listed.value.map((invite) => ({
        invite_id: invite.id,
        role: invite.role,
        single_use: invite.singleUse,
        uses: invite.uses,
        created_by: invite.createdBy,
        created_at: invite.createdAt,
        expires_at: invite.expiresAt,
        revoked_at: invite.revokedAt,
        space_id: invite.spaceId,
      })),
    });
  });

  app.delete("/v1/invites/:id", async (c) => {
    const revoked = await deps.invites.revoke({
      principal: c.get("principal"),
      inviteId: c.req.param("id"),
    });
    if (!revoked.ok) {
      if (revoked.error.kind === "unknown_invite") {
        throw new HttpError("not_found", revoked.error.message);
      }
      refuse(revoked.error);
    }
    return c.json({ invite_id: revoked.value.inviteId, revoked_at: revoked.value.revokedAt });
  });
}
