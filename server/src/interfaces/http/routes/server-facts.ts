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
 *   while its last pushes didn't get through. A person's: a harness has no welcome. And which
 *   releases of Chips are out, with the App Store's version, as last read (`updates`, ADR 0296),
 *   for the update dot; absent where the server reads none.
 * - `GET /v1/software`: what each harness and device last said it runs (everything in step), for
 *   the harnesses the asker is told of and the devices still paired. A harness says whether its bridge is kept current (`keep_current`), how (`bridge_update`) when
 *   it is in this computer's data folder, and otherwise the release out for it (`release_out`).
 * - `PUT /v1/harnesses/:id/bridge-updates`: an owner's switch "Keep this bridge up to date".
 * - `GET /v1/connectors`: the gallery's cards, as the docs say them, read from wherever the server
 *   was told. None, when it was told nowhere or the docs can't be read: the apps carry the two
 *   generic ways in themselves.
 */

import type { Hono } from "hono";
import type { BridgeUpdateState } from "../../../application/ports/bridges.js";
import type { Principal } from "../../../application/ports/identity.js";
import type { GatewayDeps, GatewayEnv } from "../context.js";
import { directoryFor } from "../directory.js";
import { HttpError } from "../errors.js";

function person(principal: Principal): Principal {
  if (principal.kind !== "person") {
    throw new HttpError("forbidden", "This is for the people paired to Chips, not a harness.");
  }
  return principal;
}

/** How a bridge here is being kept current, on the wire (bridges-keep-current.md, rule 11). */
function bridgeUpdateOut(update: BridgeUpdateState) {
  return {
    package: update.package,
    running: update.running,
    phase: update.phase,
    since: update.since,
    ...(update.target === undefined ? {} : { target: update.target }),
    ...(update.reason === undefined ? {} : { reason: update.reason }),
    ...(update.needs === undefined ? {} : { needs: update.needs }),
    ...(update.last === undefined
      ? {}
      : {
          last: {
            outcome: update.last.outcome,
            from: update.last.from,
            to: update.last.to,
            at: update.last.at,
            ...(update.last.reason === undefined ? {} : { reason: update.last.reason }),
          },
        }),
  };
}

/** The computer's own updates, for its owner: whether it can, the switch, and how the last went. */
async function selfUpdateOut(deps: GatewayDeps) {
  const switched = await deps.computerUpdates.current();
  const last = deps.selfUpdate?.last();
  const onto = deps.restartsOnto?.();
  return {
    available: deps.selfUpdate !== undefined,
    automatic: switched.automatic,
    // A computer Chips for Mac carries follows the app: nobody updates it by hand (ADR 0298).
    ...(deps.restartsOnto === undefined ? {} : { with_app: true }),
    ...(onto === undefined ? {} : { restarts_onto: onto }),
    ...(last === undefined
      ? {}
      : {
          last: {
            state: last.state,
            from: last.from,
            at: last.at,
            ...(last.to === undefined ? {} : { to: last.to }),
            ...(last.why === undefined ? {} : { why: last.why }),
          },
        }),
  };
}

export function registerServerFactsRoutes(app: Hono<GatewayEnv>, deps: GatewayDeps): void {
  app.get("/v1/server", async (c) => {
    const asker = person(c.get("principal"));
    const updates = deps.updates?.();
    const selfUpdate = asker.role === "owner" ? await selfUpdateOut(deps) : undefined;
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
      ...(updates === undefined ? {} : { updates }),
      ...(selfUpdate === undefined ? {} : { self_update: selfUpdate }),
    });
  });

  // The owner's switch, "Update this computer automatically" (everything in step, phase 6): a
  // computer from the install line brings itself to the newest release at night. Off by default.
  app.put("/v1/server/self-update", async (c) => {
    const asker = person(c.get("principal"));
    if (asker.role !== "owner") {
      throw new HttpError("forbidden", "Only an owner of this computer turns its updates on.");
    }
    if (deps.selfUpdate === undefined) {
      throw new HttpError(
        "invalid_event",
        "This computer can't update itself: Chips for Mac updates with the app, and a checkout with git.",
        undefined,
        undefined,
        "not_available",
      );
    }
    let automatic: unknown;
    try {
      automatic = (JSON.parse(c.get("rawBody") || "{}") as { automatic?: unknown }).automatic;
    } catch {
      automatic = undefined;
    }
    if (typeof automatic !== "boolean") {
      throw new HttpError("invalid_event", "Send `{ automatic }`, true or false.");
    }
    await deps.computerUpdates.set({
      automatic,
      by: asker.participantId,
      workspaceId: asker.workspaceId,
      at: deps.clock.nowIso(),
    });
    return c.json(await selfUpdateOut(deps));
  });

  // What each harness and device last said it runs (everything in step): the harnesses the asker
  // is told of at all (the directory's scope, ADR 0034), and the asker's own devices, or everyone's
  // for an owner or an admin, who see who is behind. A harness removed since, or a device unpaired,
  // is nobody's any more and is left out.
  app.get("/v1/software", async (c) => {
    const asker = person(c.get("principal"));
    const seen = (await deps.software?.list(asker.workspaceId)) ?? [];
    const everyone = asker.role === "owner" || asker.role === "admin";
    const told = new Set(
      (await directoryFor(deps, asker))
        .filter((each) => each.kind === "harness" && each.removed_at === null)
        .map((each) => each.id),
    );
    const at = (each: (typeof seen)[number]) => ({
      name: each.name,
      version: each.version,
      seen_at: each.seenAt,
      changed_at: each.changedAt,
    });
    const updates = deps.bridgeUpdates?.();
    const off = await deps.bridgeSwitches.off();
    return c.json({
      harnesses: seen
        .filter((each) => each.kind === "harness" && told.has(each.subjectId))
        .map((each) => {
          const update = updates?.get(each.subjectId);
          const out = update === undefined ? deps.bridgeOut?.(each.name, each.version) : undefined;
          return {
            harness_id: each.subjectId,
            ...at(each),
            keep_current: !off.has(each.subjectId),
            ...(update === undefined ? {} : { bridge_update: bridgeUpdateOut(update) }),
            ...(out === undefined ? {} : { release_out: out }),
          };
        }),
      devices: seen
        .filter((each) => each.kind === "device")
        .filter((each) => everyone || each.participantId === asker.participantId)
        .map((each) => ({ device_id: each.subjectId, person_id: each.participantId, ...at(each) })),
    });
  });

  // The owner's switch on a harness page, "Keep this bridge up to date": on by default. Off, the
  // computer leaves the bridge on the release it runs and the page says what is out.
  app.put("/v1/harnesses/:id/bridge-updates", async (c) => {
    const asker = person(c.get("principal"));
    if (asker.role !== "owner") {
      throw new HttpError(
        "forbidden",
        "Only an owner of this computer decides how its bridges update.",
      );
    }
    const harnessId = c.req.param("id");
    const harness = await deps.readModels.participant(asker.workspaceId, harnessId);
    if (harness?.kind !== "harness")
      throw new HttpError("not_found", "There's no such harness here.");
    let keep: unknown;
    try {
      keep = (JSON.parse(c.get("rawBody") || "{}") as { keep_current?: unknown }).keep_current;
    } catch {
      keep = undefined;
    }
    if (typeof keep !== "boolean") {
      throw new HttpError("invalid_event", "Send `{ keep_current }`, true or false.");
    }
    await deps.bridgeSwitches.set({
      harnessId,
      workspaceId: asker.workspaceId,
      keepCurrent: keep,
      by: asker.participantId,
      at: deps.clock.nowIso(),
    });
    return c.json({ keep_current: keep });
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
