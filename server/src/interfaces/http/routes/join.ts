/**
 * Join requests (ADR 0122).
 *
 * Three doors take no credential, because they are how something gets one:
 * - `POST /v1/join`: a harness or a device asks. It is answered with a secret, which only it
 *   holds, and a code, which it shows.
 * - `POST /v1/join/:id/redeem`: it asks, with the secret, whether it was allowed, and is handed
 *   its credential once when it was.
 * - `POST /v1/join/redeem`: whoever holds a link a person made takes it up.
 *
 * The rest are for the owners and admins who decide: `POST /v1/join/links` makes a link, allowed
 * already; `GET /v1/join` and `GET /v1/join/:id` read requests; `POST /v1/join/:id/allow` allows
 * one, with what it may do; `DELETE /v1/join/:id` refuses one, or withdraws a link.
 *
 * And `GET /j/:secret`, the link itself opened in a browser, says what it is for without looking
 * it up: it is a harness's to use, and a page that read it would spend nothing but could tell a
 * passer-by that it was good.
 */

import { isIP } from "node:net";
import { type JoinState, joinAsk, joinLink, joinState } from "@chipschat/protocol";
import type { Context, Hono } from "hono";
import type { JoinRequestFailure } from "../../../application/index.js";
import { joinRequestView } from "../../../application/index.js";
import { requestArrivedAt } from "../arrived-at.js";
import type { GatewayDeps, GatewayEnv } from "../context.js";
import { HttpError } from "../errors.js";
import { addressOf, createLimiter } from "../limiter.js";

/** The doors with no credential: the middleware lets these through, by method and path. */
export function isOpenJoinRoute(method: string, path: string): boolean {
  if (method !== "POST") return false;
  return (
    path === "/v1/join" || path === "/v1/join/redeem" || /^\/v1\/join\/[^/]+\/redeem$/.test(path)
  );
}

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

function text(body: Record<string, unknown>, field: string): string | undefined {
  const value = body[field];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") throw new HttpError("invalid_event", `\`${field}\` is words.`);
  return value;
}

function names(body: Record<string, unknown>, field: string): string[] {
  const value = body[field] ?? [];
  if (!Array.isArray(value) || value.some((each) => typeof each !== "string")) {
    throw new HttpError("invalid_event", `\`${field}\` is a list of capability names.`);
  }
  return value as string[];
}

const STATUS_OF: Readonly<
  Record<JoinRequestFailure["kind"], ConstructorParameters<typeof HttpError>[0]>
> = {
  not_allowed: "forbidden",
  invalid: "invalid_event",
  unknown: "unauthorized",
  denied: "forbidden",
  expired: "forbidden",
  spent: "forbidden",
  decided: "forbidden",
  too_many: "rate_limited",
  too_fast: "rate_limited",
  not_here: "forbidden",
  not_pairing: "forbidden",
  wrong_code: "invalid_event",
};

/** A use case's refusal as an HTTP answer, with the rule named for a client to act on. */
function refuse(error: JoinRequestFailure): never {
  throw new HttpError(
    STATUS_OF[error.kind],
    error.message,
    undefined,
    error.retryAfterSeconds,
    error.kind,
  );
}

/** Where a requester came from, as people are shown it, and whether through the relay. */
function askedFrom(c: Context<GatewayEnv>): { fromAddr: string | undefined; viaRelay: boolean } {
  const relayed = c.env?.relay?.from;
  // The relay's word is shown only when it is an address (SEC-27); `unknown` is the limiter's.
  if (relayed !== undefined && relayed !== "") {
    return { fromAddr: isIP(relayed) === 0 ? undefined : relayed, viaRelay: true };
  }
  // Through the tunnel door on this network (ADR 0191): on the network, as a plain request is.
  const lan = c.env?.lan?.from;
  if (lan !== undefined && lan !== "") return { fromAddr: lan, viaRelay: false };
  const counted = addressOf(c);
  return { fromAddr: counted === "local" ? undefined : counted, viaRelay: false };
}

/**
 * Where to tell a requester Chips is: the address it asked at when it is on this machine, which it
 * can reach whether or not the tailnet is up; the server's own public address when it has one;
 * the relay's view of it when it came that way; and otherwise the address it asked at, which it
 * can reach by construction.
 */
function addressFor(c: Context<GatewayEnv>, deps: GatewayDeps): string {
  const local = requestArrivedAt(c);
  if (local !== undefined) return local;
  const configured = deps.config.server.publicUrl;
  if ((configured !== undefined && configured !== "") || c.env?.relay !== undefined) {
    return deps.reachableUrl();
  }
  const origin = new URL(c.req.url).origin;
  return /^https?:\/\//.test(origin) ? origin : deps.reachableUrl();
}

/** The states a list asks for: `?state=waiting,allowed`, or waiting when it names none. */
function statesOf(query: string | undefined): JoinState[] {
  if (query === undefined || query === "") return ["waiting"];
  const states = query.split(",").map((each) => each.trim());
  const known = states.filter((each): each is JoinState => joinState.safeParse(each).success);
  if (known.length !== states.length) {
    throw new HttpError(
      "invalid_event",
      "A state is waiting, allowed, denied, expired or redeemed.",
    );
  }
  return known;
}

/** The doors with no credential. Registered before the middleware that asks for one. */
export function registerOpenJoinRoutes(app: Hono<GatewayEnv>, deps: GatewayDeps): void {
  const limiter = createLimiter(() => deps.clock.nowMs(), {
    message: "Too many wrong join secrets from this address. Try again in a minute.",
  });

  // An ask that could not be taken — a body that is not one, a device on the wrong side of the
  // relay, a sixth while five wait — counts against its address as a wrong pairing code does
  // (SEC-6): five a minute, then a minute's wait. The ten asks a minute that are taken stand.
  const asks = createLimiter(() => deps.clock.nowMs(), {
    message: "Too many join requests from this address could not be taken. Try again in a minute.",
  });

  app.post("/v1/join", async (c) => {
    const asked = await asks.attempt(addressOf(c), async (wrong) => {
      try {
        const parsed = joinAsk.safeParse(parse(await c.req.text()));
        if (!parsed.success) {
          throw new HttpError(
            "invalid_event",
            "Say what it is called, and for a device, its key.",
            parsed.error.issues.map((issue) => ({
              path: issue.path.join("."),
              message: issue.message,
            })),
          );
        }
        const ask = parsed.data;
        const asked = await deps.joinRequests.ask({
          kind: ask.kind,
          name: ask.name,
          software: ask.software,
          machine: ask.machine,
          wants: ask.wants,
          publicKey: ask.public_key,
          commit: ask.commit,
          countedAs: addressOf(c),
          ...askedFrom(c),
          url: addressFor(c, deps),
        });
        if (!asked.ok) wrong();
        return asked;
      } catch (error) {
        wrong();
        throw error;
      }
    });
    if (!asked.ok) refuse(asked.error);
    const { request, secret, interval, expiresIn, check } = asked.value;
    c.get("logger").info({ requestId: request.id, kind: request.kind }, "join requested");
    return c.json(
      {
        request_id: request.id,
        secret,
        // A device that committed is handed the halves of its code instead (ADR 0278).
        ...(request.code === null ? {} : { code: request.code }),
        ...(check === undefined ? {} : { server_key: check.serverKey, nonce: check.nonce }),
        expires_in: expiresIn,
        interval,
      },
      201,
    );
  });

  app.post("/v1/join/:id/redeem", async (c) => {
    const polled = await limiter.attempt(addressOf(c), async (wrong) => {
      const body = parse(await c.req.text());
      const secret = text(body, "secret");
      if (secret === undefined)
        throw new HttpError("invalid_event", "Send the request's `secret`.");
      // A device that committed sends its nonce with its polls, which makes its code (ADR 0278).
      const nonce = text(body, "nonce");
      const polled = await deps.joinRequests.poll({ id: c.req.param("id"), secret, nonce });
      if (!polled.ok && polled.error.kind === "unknown") wrong();
      return polled;
    });
    if (!polled.ok) refuse(polled.error);
    if ("waiting" in polled.value) {
      return c.json({ state: "waiting", interval: polled.value.interval }, 202);
    }
    c.get("logger").info({ requestId: c.req.param("id") }, "join redeemed");
    return c.json(polled.value);
  });

  app.post("/v1/join/redeem", async (c) => {
    const joined = await limiter.attempt(addressOf(c), async (wrong) => {
      const body = parse(await c.req.text());
      const secret = text(body, "secret");
      const name = text(body, "name");
      if (secret === undefined || name === undefined) {
        throw new HttpError("invalid_event", "Send the link's `secret` and a `name`.");
      }
      const joined = await deps.joinRequests.redeemLink({
        secret,
        name,
        software: text(body, "software"),
        machine: text(body, "machine"),
        fromAddr: askedFrom(c).fromAddr,
      });
      if (!joined.ok && joined.error.kind === "unknown") wrong();
      return joined;
    });
    if (!joined.ok) refuse(joined.error);
    c.get("logger").info(
      { harnessId: "harness_id" in joined.value ? joined.value.harness_id : "" },
      "join link redeemed",
    );
    return c.json(joined.value);
  });

  app.get("/j/:secret", (c) =>
    c.text(
      [
        "This is a link for an agent to join Chips, good once, for fifteen minutes.",
        "",
        "Give it to the harness that runs the agent: `chips join <link>`, `join({ link })` from",
        "@chipschat/harness, or POST its secret to /v1/join/redeem. Opening it here does nothing.",
        "",
      ].join("\n"),
    ),
  );
}

/** The doors for the owners and admins who decide. */
export function registerJoinRoutes(app: Hono<GatewayEnv>, deps: GatewayDeps): void {
  const now = () => (deps.joinClock ?? deps.clock).nowMs();

  app.post("/v1/join/links", async (c) => {
    const body = parse(c.get("rawBody"));
    const made = await deps.joinRequests.makeLink({
      principal: c.get("principal"),
      capabilities: names(body, "capabilities"),
      url: deps.reachableUrl(),
    });
    if (!made.ok) refuse(made.error);
    const { request, secret } = made.value;
    return c.json(
      { request: joinRequestView(request, now()), link: joinLink(request.url, secret) },
      201,
    );
  });

  app.get("/v1/join", async (c) => {
    const listed = await deps.joinRequests.list(c.get("principal"), statesOf(c.req.query("state")));
    if (!listed.ok) refuse(listed.error);
    return c.json({ requests: listed.value.map((request) => joinRequestView(request, now())) });
  });

  app.get("/v1/join/:id", async (c) => {
    const found = await deps.joinRequests.get(c.get("principal"), c.req.param("id"));
    if (!found.ok) {
      if (found.error.kind === "unknown") throw new HttpError("not_found", found.error.message);
      refuse(found.error);
    }
    return c.json({ request: joinRequestView(found.value, now()) });
  });

  app.post("/v1/join/:id/allow", async (c) => {
    const body = parse(c.get("rawBody"));
    const allowed = await deps.joinRequests.allow({
      principal: c.get("principal"),
      id: c.req.param("id"),
      capabilities: names(body, "capabilities"),
      // For a device, the code it shows, typed by the person allowing it (SEC-6).
      code: text(body, "code"),
      // For a device, somebody already here an owner pairs it as (ADR 0206).
      as: text(body, "as"),
    });
    if (!allowed.ok) {
      if (allowed.error.kind === "unknown") throw new HttpError("not_found", allowed.error.message);
      refuse(allowed.error);
    }
    return c.json({ request: joinRequestView(allowed.value, now()) });
  });

  app.delete("/v1/join/:id", async (c) => {
    const denied = await deps.joinRequests.deny({
      principal: c.get("principal"),
      id: c.req.param("id"),
    });
    if (!denied.ok) {
      if (denied.error.kind === "unknown") throw new HttpError("not_found", denied.error.message);
      refuse(denied.error);
    }
    return c.json({ request: joinRequestView(denied.value, now()) });
  });
}
