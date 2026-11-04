/**
 * The Hono app. This is the interfaces layer: it reads the request, calls a use case, and
 * writes the answer. Every decision it looks like it is making is made somewhere inward.
 *
 * The middleware chain is short and in this order for a reason:
 *
 *   request id -> logging context -> error envelope -> the desktop's origin -> authentication -> route
 *
 * so that a failure anywhere after the first step still comes back as an envelope with an id
 * the log can be searched by, and the desktop window can read it (ADR 0086).
 *
 * Authentication takes three credentials: a harness's bearer token, a device's signature, and, for
 * an attachment's bytes alone, a grant a device handed its player (ADR 0058), which is checked
 * before anything is looked up and admits the device it names. A room's project over git takes its
 * own (ADR 0220), since git can sign nothing and its packs are never read here.
 */

import { createHash } from "node:crypto";
import { type ChipsConfig, withContext } from "@chipschat/platform";
import { type Context, Hono } from "hono";
import { cors } from "hono/cors";
import type { AuthFailure, Principal } from "../../application/index.js";
import { deviceGrantOf, verifyDeviceGrant } from "../../infrastructure/attachments/signing.js";
import type { GatewayDeps, GatewayEnv } from "./context.js";
import { HttpError, logThrown, respondWithError } from "./errors.js";
import { registerAgentContextRoutes } from "./routes/agent-context.js";
import { registerAgentContextWindowRoutes } from "./routes/agent-context-windows.js";
import { registerAgentFaceRoutes } from "./routes/agent-face.js";
import { registerAgentHeartbeatRoutes } from "./routes/agent-heartbeats.js";
import { registerAgentKeepRoutes } from "./routes/agent-keep.js";
import { registerAgentModelRoutes } from "./routes/agent-models.js";
import { registerAgentNameRoutes } from "./routes/agent-name.js";
import { registerApprovalRoutes } from "./routes/approvals.js";
import { registerDevRoutes } from "./routes/dev.js";
import { registerDeviceRoutes } from "./routes/devices.js";
import { registerDirectAskRoutes } from "./routes/direct-asks.js";
import { registerEventRoutes } from "./routes/events.js";
import { registerExchangeRoutes } from "./routes/exchange.js";
import { registerHarnessJobRoutes } from "./routes/harness-jobs.js";
import { registerHarnessRoutes } from "./routes/harnesses.js";
import { registerHealthRoutes } from "./routes/health.js";
import { registerHiddenSpaceRoutes } from "./routes/hidden-spaces.js";
import { registerInviteRoutes, UNAUTHENTICATED_INVITE_ROUTES } from "./routes/invites.js";
import { isOpenJoinRoute, registerJoinRoutes, registerOpenJoinRoutes } from "./routes/join.js";
import { registerLeadRoutes } from "./routes/lead.js";
import { registerLockRoutes } from "./routes/lock.js";
import { registerNotificationRoutes } from "./routes/notifications.js";
import { registerOperatorRoutes } from "./routes/operator.js";
import { isOpenPageRoute, registerPageRoutes } from "./routes/pages.js";
import { registerPairRoutes } from "./routes/pair.js";
import { registerPairingCodeRoutes } from "./routes/pairing-codes.js";
import { registerPasskeyRoutes, UNAUTHENTICATED_PASSKEY_ROUTES } from "./routes/passkeys.js";
import { registerPeopleRoutes } from "./routes/people.js";
import { registerPinnedSpaceRoutes } from "./routes/pinned-spaces.js";
import { registerPinRoutes } from "./routes/pins.js";
import {
  isProjectRoute,
  registerProjectGitRoutes,
  registerProjectReadRoutes,
  registerProjectTokenRoutes,
} from "./routes/project.js";
import { registerPushRoutes } from "./routes/push.js";
import { registerRelayRoutes } from "./routes/relay.js";
import { registerSearchRoutes } from "./routes/search.js";
import { registerServerFactsRoutes } from "./routes/server-facts.js";
import { registerSocketRoutes } from "./routes/sockets.js";
import { registerSpaceIconRoutes } from "./routes/space-icons.js";
import { registerSpaceRoutes } from "./routes/spaces.js";
import { registerSpendRoutes } from "./routes/spend.js";
import { registerUploadRoutes } from "./routes/uploads.js";
import { registerWebRoutes } from "./routes/web.js";
import { registerWorkspaceRoutes } from "./routes/workspace.js";

/**
 * The routes that work without a credential: liveness, how you get one — a pairing code, an
 * invite, a join request (by method and path, `isOpenJoinRoute`, ADR 0122) — how the server's
 * own machine mints a code with the token the server left it (ADR 0048), the page door, whose
 * ticket is its credential (`isOpenPageRoute`, ADR 0201), and, in dev mode only, how a laptop
 * mints one with nothing at all. The dev routes are all open, not only the one named
 * here: `registerDevRoutes` runs ahead of the credential check below, so every `/v1/dev/*` route
 * answers before the check is reached, which is why they are registered only on loopback with
 * no relay and refuse a tunnelled request themselves (SEC-4). Everything else authenticates.
 */
const UNAUTHENTICATED = new Set([
  "/v1/health",
  "/v1/pair",
  "/v1/operator/pairing-code",
  "/v1/dev/pairing-code",
  ...UNAUTHENTICATED_INVITE_ROUTES,
  ...UNAUTHENTICATED_PASSKEY_ROUTES,
]);

/**
 * Whether a request to this method and path meets no credential check: the set above, a join
 * request, or any dev route. The one answer for the credential middleware below and for the
 * relay link's stranger cap (SEC-21), which classifies a tunnelled request by where it is going
 * rather than by the headers it chose to carry.
 */
export function isOpenRoute(method: string, path: string): boolean {
  return (
    UNAUTHENTICATED.has(path) ||
    isOpenJoinRoute(method, path) ||
    isOpenPageRoute(method, path) ||
    path.startsWith("/v1/dev/")
  );
}

/** Whether a request meets no credential check here: an open route, or git's, which makes its own. */
function checksItsOwn(method: string, path: string): boolean {
  return isOpenRoute(method, path) || isProjectRoute(path);
}

/**
 * The one origin besides its own a page may call the server from: the desktop window, which
 * loads the app from inside itself and then talks to whichever server it paired with (ADR 0086).
 * No browser gives a web page this origin, and nothing here rides on a cookie, so naming it
 * opens the API to no site.
 */
const DESKTOP_ORIGIN = "tauri://localhost";

/** The response headers the client reads that a browser would otherwise hide from another origin. */
const EXPOSED_HEADERS = ["x-chips-playable", "x-chips-view"];

/**
 * The most a request with no credential in its headers may carry (SEC-11): a pairing, a join
 * request, an invite's redemption, a passkey assertion, each a small JSON body. Anybody on the
 * network can send one, so what one may cost is fixed here rather than set by the workspace.
 */
export const UNAUTHENTICATED_BODY_BYTES = 64 * 1024;

/** What a push's body may carry beyond the project's own limit (ADR 0220). */
const PROJECT_BODY_HEADROOM = 1024 * 1024;

/**
 * How much a body may hold, by what the request is: a stranger's the fixed budget above, an
 * upload's bytes what the workspace allows an attachment, a push to a room's project what a
 * project may hold (ADR 0220), anything else `limits.maxBodyBytes`.
 */
function bodyLimitFor(c: Context<GatewayEnv>, limits: ChipsConfig["limits"]): number {
  if (c.req.header("authorization") === undefined && c.req.header("x-chips-device") === undefined) {
    return UNAUTHENTICATED_BODY_BYTES;
  }
  if (c.req.method === "PUT" && c.req.path.startsWith("/v1/uploads/")) {
    return limits.maxAttachmentBytes;
  }
  // A megabyte over, for git's own framing: git holds a push to what the project has left, and
  // says so in words, which a refusal here could not.
  if (isProjectRoute(c.req.path)) return limits.maxProjectBytes + PROJECT_BODY_HEADROOM;
  return limits.maxBodyBytes;
}

function tooLarge(limit: number): HttpError {
  return new HttpError(
    "payload_too_large",
    `The body is more than ${limit} bytes, which is the most this request may carry.`,
  );
}

/**
 * Caps a body before anything reads it (SEC-11). A `content-length` over the limit is refused at
 * once; the body is counted as it streams, so a chunked one, or one longer than its header says,
 * is refused at the byte it goes over. Whoever reads the body then — `readBody` for a signed
 * request, an open route for its own — is handed the refusal instead of the bytes. Nothing is
 * read here, so a body nobody reads costs nothing; and nothing is checked after the credential,
 * since reading before checking is the hole.
 */
function capBody(c: Context<GatewayEnv>, limit: number): void {
  const declared = c.req.header("content-length");
  if (declared !== undefined && Number(declared) > limit) throw tooLarge(limit);
  const body = c.req.raw.body;
  if (body === null) return;
  const reader = body.getReader();
  let size = 0;
  const counted = new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { done, value } = await reader.read();
      if (done) {
        controller.close();
        return;
      }
      size += value.byteLength;
      if (size > limit) {
        controller.error(tooLarge(limit));
        await reader.cancel();
        return;
      }
      controller.enqueue(value);
    },
    cancel: (reason) => reader.cancel(reason),
  });
  // The request with the counted stream for its body, as Hono's own `bodyLimit` does it.
  c.req.raw = new Request(c.req.raw, { body: counted, duplex: "half" } as RequestInit);
}

/**
 * The body is read once, here, because a device signature covers the exact bytes and reading
 * it twice is not possible on a stream. An upload's bytes stay bytes: they are hashed as they
 * are, and the signature covers that digest.
 */
async function readBody(request: {
  readonly method: string;
  readonly path: string;
  readonly text: () => Promise<string>;
  readonly arrayBuffer: () => Promise<ArrayBuffer>;
}): Promise<{ rawBody: string; rawBytes: Uint8Array | undefined }> {
  if (request.method === "GET" || request.method === "HEAD") {
    return { rawBody: "", rawBytes: undefined };
  }
  if (request.method === "PUT" && request.path.startsWith("/v1/uploads/")) {
    return { rawBody: "", rawBytes: new Uint8Array(await request.arrayBuffer()) };
  }
  return { rawBody: await request.text(), rawBytes: undefined };
}

function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/**
 * A header's word that goes into every log line of a request, bounded first (SEC-38): a request
 * id or a workspace id is short and plain, and one that is not is dropped, so a caller can
 * neither bloat the log nor write a line's ids itself.
 */
const LOG_WORD = /^[A-Za-z0-9._:-]{1,64}$/;

function logWord(value: string | undefined): string | undefined {
  return value !== undefined && LOG_WORD.test(value) ? value : undefined;
}

export function createApp(deps: GatewayDeps): Hono<GatewayEnv> {
  const app = new Hono<GatewayEnv>();

  app.use("*", async (c, next) => {
    const requestId = logWord(c.req.header("x-request-id")) ?? deps.ids.next("event");
    c.set("requestId", requestId);
    c.set(
      "logger",
      withContext(deps.logger, {
        requestId,
        workspaceId: logWord(c.req.header("x-chips-workspace")) ?? "",
      }),
    );
    c.header("x-request-id", requestId);
    await next();
  });

  // Before anything reads a body, and so before the credential is checked (SEC-11).
  app.use("/v1/*", async (c, next) => {
    capBody(c, bodyLimitFor(c, deps.config.limits));
    await next();
  });

  // Before authentication: a preflight carries no credential, and it is answered here.
  app.use("/v1/*", cors({ origin: DESKTOP_ORIGIN, exposeHeaders: EXPOSED_HEADERS, maxAge: 600 }));

  // Hono routes a thrown error here rather than back through the middleware that awaited it,
  // so this is the one place the envelope is written.
  app.onError((error, c) => {
    const requestId = c.get("requestId") ?? "unknown";
    logThrown(c.get("logger") ?? deps.logger, error);
    return respondWithError(c, error, requestId);
  });

  registerHealthRoutes(app, deps);
  registerPairRoutes(app, deps);
  registerDevRoutes(app, deps);
  registerOperatorRoutes(app, deps);
  registerOpenJoinRoutes(app, deps);
  // Ahead of the credential check, which it makes itself: git's packs go to git unread.
  registerProjectGitRoutes(app, deps);

  // Everything past here needs a credential.
  app.use("/v1/*", async (c, next) => {
    if (checksItsOwn(c.req.method, c.req.path)) return next();

    const { rawBody, rawBytes } = await readBody(c.req);
    c.set("rawBody", rawBody);
    c.set("rawBytes", rawBytes);

    const granted = grantPresented(c);
    const result =
      granted === undefined
        ? await deps.authenticator.authenticate({
            authorization: c.req.header("authorization"),
            deviceId: c.req.header("x-chips-device"),
            signature: c.req.header("x-chips-signature"),
            timestamp: c.req.header("x-chips-timestamp"),
            signed: c.req.header("x-chips-signed"),
            // The tunnel this request arrived through, which a signature made inside it names
            // (ADR 0191, decision 6); nothing on the plain port.
            tunnelHash: c.env?.relay?.handshakeHash ?? c.env?.lan?.handshakeHash,
            method: c.req.method,
            // The full request target, path and query, is what the device signed (ADR 0006).
            target: requestTarget(c.req.url),
            body: rawBody,
            bodyDigest: rawBytes === undefined ? undefined : sha256Hex(rawBytes),
          })
        : await admitGrant(c, deps, granted);

    if (!result.ok) {
      c.get("logger").warn({ reason: result.reason }, "authentication refused");
      throw refusedCredential(result.reason);
    }

    c.set("principal", result.principal);
    c.set(
      "logger",
      withContext(c.get("logger"), {
        workspaceId: result.principal.workspaceId,
        harnessId: result.principal.kind === "harness" ? result.principal.participantId : "",
      }),
    );
    return next();
  });

  registerEventRoutes(app, deps);
  registerApprovalRoutes(app, deps);
  registerSocketRoutes(app, deps);
  registerUploadRoutes(app, deps);
  registerPageRoutes(app, deps);
  registerHarnessRoutes(app, deps);
  registerPairingCodeRoutes(app, deps);
  registerInviteRoutes(app, deps);
  registerJoinRoutes(app, deps);
  registerDirectAskRoutes(app, deps);
  registerRelayRoutes(app, deps);
  registerPeopleRoutes(app, deps);
  registerWorkspaceRoutes(app, deps);
  registerPasskeyRoutes(app, deps);
  registerDeviceRoutes(app, deps);
  registerServerFactsRoutes(app, deps);
  registerSearchRoutes(app, deps);
  registerNotificationRoutes(app, deps);
  registerSpaceIconRoutes(app, deps);
  registerHiddenSpaceRoutes(app, deps);
  registerPinnedSpaceRoutes(app, deps);
  registerAgentFaceRoutes(app, deps);
  registerAgentNameRoutes(app, deps);
  registerAgentContextRoutes(app, deps);
  registerAgentModelRoutes(app, deps);
  registerAgentHeartbeatRoutes(app, deps);
  registerHarnessJobRoutes(app, deps);
  registerAgentContextWindowRoutes(app, deps);
  registerAgentKeepRoutes(app, deps);
  registerExchangeRoutes(app, deps);
  registerLeadRoutes(app, deps);
  registerSpendRoutes(app, deps);
  registerLockRoutes(app, deps);
  registerProjectTokenRoutes(app, deps);
  registerProjectReadRoutes(app, deps);
  registerSpaceRoutes(app, deps);
  registerPushRoutes(app, deps);
  registerPinRoutes(app, deps);
  // The page, for every path that is not the API. Last, so it shadows no `/v1` route.
  registerWebRoutes(app, deps);

  app.notFound((c) =>
    respondWithError(c, new HttpError("not_found", "No route matches that."), c.get("requestId")),
  );

  return app;
}

/**
 * A device's grant, when it is the request's only credential: a read of an attachment's bytes with
 * `dev`, `exp` and `sig` in its query and no token or signature beside them. A request that signs
 * and carries a grant is the signer's, and the route holds it to the grant (`admitReader`).
 */
function grantPresented(c: Context<GatewayEnv>): ReturnType<typeof deviceGrantOf> {
  if (c.req.method !== "GET" && c.req.method !== "HEAD") return undefined;
  if (c.req.header("authorization") !== undefined || c.req.header("x-chips-device") !== undefined) {
    return undefined;
  }
  return deviceGrantOf(c.req.path, (name) => c.req.query(name));
}

/**
 * The person a grant admits. Its signature and its expiry are checked first, with nothing looked up,
 * and a grant that fails either is refused as the harness grant is: forbidden, with the reason. Only
 * then is the device it names found, still paired.
 */
async function admitGrant(
  c: Context<GatewayEnv>,
  deps: GatewayDeps,
  granted: NonNullable<ReturnType<typeof deviceGrantOf>>,
): Promise<{ ok: true; principal: Principal } | { ok: false; reason: AuthFailure }> {
  const verdict = verifyDeviceGrant({
    ...granted,
    secret: deps.grants.secret,
    presentedDeviceId: granted.grant.deviceId,
    nowSeconds: Math.floor(deps.clock.nowMs() / 1000),
  });
  if (!verdict.ok) {
    c.get("logger").warn(
      { attachmentId: granted.grant.attachmentId, reason: verdict.reason },
      "device grant refused",
    );
    throw new HttpError(
      "forbidden",
      `That link is not good here: ${verdict.reason.replace("_", " ")}.`,
    );
  }
  return deps.authenticator.grantedDevice(granted.grant.deviceId);
}

/**
 * A credential turned away, as the wire hears it: `unauthorized` and nothing else, since telling
 * an unknown token from a revoked one would say whether a token had ever existed. Somebody removed
 * from the workspace is told so (ADR 0160), in words true too of somebody who deleted their own
 * account (ADR 0243): it is said only to a request their own key signed. A device whose clock is
 * too far from this server's is told that too (`clock_skew`), whatever device it names, and sets
 * its clock by the server's: it used to hear what an unknown device hears, and said it had been
 * removed.
 */
function refusedCredential(reason: AuthFailure): HttpError {
  if (reason === "timestamp_out_of_range") {
    return new HttpError(
      "unauthorized",
      "This device's clock and the server's are more than five minutes apart.",
      undefined,
      undefined,
      "clock_skew",
    );
  }
  if (reason === "person_removed") {
    return new HttpError(
      "unauthorized",
      "You are no longer in this workspace.",
      undefined,
      undefined,
      "person_removed",
    );
  }
  return new HttpError("unauthorized", "That credential is not valid here.");
}

/** The path and query as they appear in the request line, which is what a device signs. */
function requestTarget(url: string): string {
  const parsed = new URL(url);
  return `${parsed.pathname}${parsed.search}`;
}
