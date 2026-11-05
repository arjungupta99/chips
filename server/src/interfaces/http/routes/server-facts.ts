/**
 * The server, as the people paired to it see it (ADR 0170), and the gallery they bring an agent
 * from (ADR 0171).
 *
 * - `GET /v1/server`: which machine Chips runs on, its version, where another device reaches it,
 *   and its relay with the server's tunnel key. The welcome says "Chips is running on Arjun's Mac
 *   mini", the setup card says whether Chips is reachable away from home, and a device paired
 *   before its server had a relay, or a key, learns them here (ADR 0144, ADR 0191; SEC-28). And
 *   whether it can push to a phone at all (`pushes`, ADR 0244): `ready`, or why not, which the
 *   phone says under its switch rather than standing on for pushes that never come, or `failing`
 *   while its last pushes didn't get through. A person's: a harness has no welcome.
 * - `GET /v1/connectors`: the gallery's cards, as the docs say them, read from wherever the server
 *   was told. None, when it was told nowhere or the docs can't be read: the apps carry the two
 *   generic ways in themselves.
 */

import type { Hono } from "hono";
import type { Principal } from "../../../application/ports/identity.js";
import type { GatewayDeps, GatewayEnv } from "../context.js";
import { HttpError } from "../errors.js";

function person(principal: Principal): Principal {
  if (principal.kind !== "person") {
    throw new HttpError("forbidden", "This is for the people paired to Chips, not a harness.");
  }
  return principal;
}

export function registerServerFactsRoutes(app: Hono<GatewayEnv>, deps: GatewayDeps): void {
  app.get("/v1/server", async (c) => {
    person(c.get("principal"));
    return c.json({
      machine: deps.machine(),
      version: deps.version ?? "0.0.0",
      public_url: deps.reachableUrl(),
      relay: {
        url: deps.relay.url ?? null,
        status: deps.relay.status(),
        key: await deps.relay.publicKey(),
      },
      pushes: deps.pushStanding(),
    });
  });

  app.get("/v1/connectors", async (c) => {
    person(c.get("principal"));
    const read = await deps.connectors.read();
    return c.json({
      connectors: read.connectors,
      ...(read.readAt === undefined ? {} : { read_at: read.readAt }),
    });
  });
}
