/**
 * `POST /v1/operator/pairing-code` — a pairing code from the machine that runs the server
 * (ADR 0048).
 *
 * The server makes a token at every start and leaves it owner-only beside its database
 * (`infrastructure/auth/operator.ts`). Presenting it proves the caller can read what the
 * database holds, which is more than a pairing code ever grants, so the code is issued: for the
 * workspace's first person, the same person `chips serve` pairs its own machine as. It is how
 * `chips pair --issue` keeps working on the server's machine after that machine's device has
 * been withdrawn, and how `pnpm phone` pairs a phone with nobody typing.
 *
 * Unauthenticated the way `/v1/pair` is — the token is the credential — and compared in constant
 * time. A wrong token counts against the address as a wrong pairing code does; a 256-bit secret
 * needs no such help, and gets it anyway.
 */

import { timingSafeEqual } from "node:crypto";
import type { Hono } from "hono";
import type { GatewayDeps, GatewayEnv } from "../context.js";
import { HttpError } from "../errors.js";
import { addressOf, createLimiter } from "../limiter.js";
import { codeOnTheWire } from "./pairing-codes.js";

/** The header the token travels in. Kept beside the route rather than imported from an adapter. */
export const OPERATOR_HEADER = "x-chips-operator";

export function registerOperatorRoutes(app: Hono<GatewayEnv>, deps: GatewayDeps): void {
  const { pairingCodes, operatorToken } = deps;
  if (pairingCodes === undefined || operatorToken === undefined) return;
  const expected = Buffer.from(operatorToken, "utf8");
  const limiter = createLimiter(() => deps.clock.nowMs(), {
    message: "Too many wrong operator tokens from this address. Try again in a minute.",
  });

  app.post("/v1/operator/pairing-code", async (c) => {
    await limiter.attempt(addressOf(c), (wrong) => {
      const offered = Buffer.from(c.req.header(OPERATOR_HEADER) ?? "", "utf8");
      if (offered.length !== expected.length || !timingSafeEqual(offered, expected)) {
        wrong();
        throw new HttpError("unauthorized", "That is not this server's operator token.");
      }
    });
    const person = await deps.readModels.anyPerson();
    if (person === undefined) {
      throw new HttpError("not_found", "This server has no person to pair a device for yet.");
    }
    const issued = pairingCodes.issue({
      workspaceId: person.workspaceId,
      participantId: person.participantId,
    });
    c.get("logger").info({ expiresAt: issued.expiresAt, via: "operator" }, "pairing code issued");
    return c.json(await codeOnTheWire(deps, issued), 201);
  });
}
