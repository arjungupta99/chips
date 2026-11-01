/**
 * `GET /v1/health`. Unauthenticated on purpose: a load balancer and `chips doctor` both need it
 * before anybody has a credential, and it says nothing a stranger could not guess. The relay
 * line (M4.1) says whether the server is dialled in.
 *
 * Where the relay is and the server's tunnel key (ADR 0191) are said only to a request straight
 * from this machine (SEC-28): `chips doctor` beside the server, and the operator reading the key
 * for a relay's list of servers. Together they are how anybody dials this server through its
 * relay, so a stranger who reaches the port is not handed them. A paired device reads both from
 * `GET /v1/server`, signed; every pairing QR carries the key, and the tunnel door on this network
 * (`tunnel.path`) answers to it. Whether the server can push to phones (`pushes`, ADR 0244), and
 * why it isn't connected to its relay (`relay.why`), are said here too, for `chips doctor`.
 */

import { TUNNEL_DOOR_PATH } from "@chipschat/protocol";
import type { Hono } from "hono";
import { requestArrivedAt } from "../arrived-at.js";
import type { GatewayDeps, GatewayEnv } from "../context.js";

export function registerHealthRoutes(app: Hono<GatewayEnv>, deps: GatewayDeps): void {
  app.get("/v1/health", async (c) => {
    const here = requestArrivedAt(c) !== undefined;
    return c.json({
      status: "ok",
      name: "chipsd",
      version: deps.version ?? "0.0.0",
      protocol: { min: 1, max: 1 },
      mode: deps.config.mode,
      time: deps.clock.nowIso(),
      relay: {
        status: deps.relay.status(),
        ...(here
          ? {
              url: deps.relay.url ?? null,
              key: await deps.relay.publicKey(),
              why: deps.relay.trouble() ?? null,
            }
          : {}),
      },
      tunnel: { path: TUNNEL_DOOR_PATH },
      ...(here ? { pushes: deps.pushReadiness() } : {}),
    });
  });
}
