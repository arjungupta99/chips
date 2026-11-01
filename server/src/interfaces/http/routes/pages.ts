/**
 * The page door (ADR 0201): where the Mac and the web load an HTML page a harness sent, so that
 * its script runs and nothing leaves it.
 *
 *   POST /v1/attachments/:id/page   a ticket for the page, from a person's signed device: the
 *                                   uploader's, or a member of a space it was sent in. `201
 *                                   { url, expires_in }`, the URL good once, for thirty seconds.
 *                                   A page of a room's project has its own ask, which builds it
 *                                   first (`POST /v1/spaces/:id/project/page`, ADR 0223).
 *   GET  /v1/pages/:ticket          the page itself, with no other credential: the ticket is
 *                                   spent, the reader asked again, and the bytes go out as HTML
 *                                   under the page's own policy as a header — the one the phone
 *                                   writes into the document — with the frame's sandbox in it, so
 *                                   the document sandboxes itself wherever it is opened.
 *
 * A frame cannot sign the request for its document, and a frame given its document takes the
 * app's own policy with it, which runs no inline script (ADR 0100). So the view asks here with a
 * signed request and loads the URL it is handed, as the socket is opened with a ticket from
 * `POST /v1/socket-tickets`. The attachment route is untouched: a harness's URL and a download are
 * what they were (ADR 0010).
 */

import { PAGE_HEADER_POLICY } from "@chipschat/protocol";
import type { Hono } from "hono";
import { PAGE_TICKET_TTL_SECONDS, type PageTicket } from "../../../application/index.js";
import type { GatewayDeps, GatewayEnv } from "../context.js";
import { HttpError } from "../errors.js";
import { addressOf, createLimiter } from "../limiter.js";
import { mayRead, storedUpload } from "./uploads.js";

/** A ticket as `createTickets` mints one: base64url, and nothing else is looked up. */
const PAGE_PATH = /^\/v1\/pages\/[A-Za-z0-9_-]{1,64}$/;

/**
 * Whether a request is the page door's `GET`, which meets no credential check: the ticket in its
 * path is the credential. One answer for the credential middleware and for the relay link's
 * stranger cap (SEC-21), as `isOpenJoinRoute` is.
 */
export function isOpenPageRoute(method: string, path: string): boolean {
  return method === "GET" && PAGE_PATH.test(path);
}

/** `text/html`, with or without its parameters: what the server called the bytes (`sniff.ts`). */
function isHtml(mimeType: string | null): boolean {
  return (mimeType ?? "").split(";")[0]?.trim().toLowerCase() === "text/html";
}

export function registerPageRoutes(app: Hono<GatewayEnv>, deps: GatewayDeps): void {
  // A ticket is 256 random bits, which needs no limiter; it gets one anyway, as the pairing door
  // does, so an address trying links is slowed down and said in the log.
  const limiter = createLimiter(() => deps.clock.nowMs(), {
    message: "Too many page links from this address that were not good. Try again in a minute.",
  });

  app.post("/v1/attachments/:id/page", async (c) => {
    const principal = c.get("principal");
    if (principal.kind !== "person" || principal.deviceId === undefined) {
      throw new HttpError(
        "forbidden",
        "A page opens on a person's device; a harness is given its URL in message.new.",
      );
    }
    const upload = await storedUpload(deps, principal, c.req.param("id"));
    if (!isHtml(upload.mime_type)) {
      throw new HttpError("invalid_event", "Only an HTML file opens as a page here.");
    }
    await mayRead(deps, principal, upload);
    const ticket = issuePageTicket(deps, { principal, attachmentId: upload.id });
    c.get("logger").info({ attachmentId: upload.id }, "page ticket issued");
    return c.json({ url: `/v1/pages/${ticket}`, expires_in: PAGE_TICKET_TTL_SECONDS }, 201);
  });

  app.get("/v1/pages/:ticket", async (c) => {
    const held = await limiter.attempt(addressOf(c), (wrong) => {
      const found = deps.pageTickets.redeem(c.req.param("ticket"));
      if (found === undefined) wrong();
      return found;
    });
    if (held === undefined) {
      // Spent, run out, or never minted: the same answer, since telling them apart would say
      // which tickets have existed.
      c.get("logger").warn("page ticket refused");
      throw new HttpError("unauthorized", "That page link is not good here.");
    }
    if ("built" in held) {
      c.get("logger").info(
        { spaceId: held.built.spaceId, path: held.built.path },
        "project page served",
      );
      return new Response(held.built.html, {
        status: 200,
        headers: pageHeaders(Buffer.byteLength(held.built.html)),
      });
    }
    const upload = await storedUpload(deps, held.principal, held.attachmentId);
    if (!isHtml(upload.mime_type)) throw new HttpError("not_found", "That file is not a page.");
    await mayRead(deps, held.principal, upload);
    const sha256 = upload.sha256 ?? "";
    const size = await deps.blobs.size(sha256);
    const body = size === undefined ? undefined : await deps.blobs.read(sha256);
    if (size === undefined || body === undefined) {
      throw new HttpError("not_found", "The bytes are not in the store.");
    }
    c.get("logger").info({ attachmentId: upload.id }, "page served");
    return new Response(body, { status: 200, headers: pageHeaders(size) });
  });
}

/**
 * A ticket for the person asking, or `429` while they hold as many unspent as they may (SEC-53):
 * a project page's ticket holds its whole built document until it is spent.
 */
export function issuePageTicket(deps: GatewayDeps, held: PageTicket): string {
  const issued = deps.pageTickets.issue(held);
  if (issued === undefined) {
    throw new HttpError(
      "rate_limited",
      "Too many pages are opening at once. Try again in a moment.",
      undefined,
      PAGE_TICKET_TTL_SECONDS,
    );
  }
  return issued.ticket;
}

/** How a page goes out of the door: as HTML, under the page's own policy, kept by nothing. */
export function pageHeaders(size: number): Record<string, string> {
  return {
    "content-type": "text/html; charset=utf-8",
    "content-length": String(size),
    "content-security-policy": PAGE_HEADER_POLICY,
    "x-content-type-options": "nosniff",
    // A ticket's answer is for the frame that asked, now; nothing keeps it.
    "cache-control": "no-store",
    // A window the page opens learns nothing of where it came from.
    "referrer-policy": "no-referrer",
  };
}
