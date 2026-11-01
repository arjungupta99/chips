/**
 * Dev-mode-only routes. Registered by `createApp` only when `config.devMode` is on, which is
 * "a laptop convenience, never on anywhere else" (the config refuses to start with a value it
 * cannot read, and defaults to off).
 *
 * `POST /v1/dev/pairing-code` mints a fresh pairing code for the demo person, so a script or a
 * second browser can pair without the one code the bootstrap wrote to `demo.json`. It is
 * unauthenticated for the same reason `POST /v1/pair` is — pairing is how you get a credential —
 * and it exists at all only in dev mode. In Phase 2 the real app issues codes from an
 * authenticated session behind a QR; this is the laptop stand-in.
 *
 * `POST /v1/dev/people` is the laptop stand-in for an invite (Phase 5): a second person, with a
 * pairing code of their own, so a group space can be tried with two people in it (M3.3).
 *
 * `POST /v1/dev/join-clock` moves the join requests' clock on (ADR 0122), so a test sees a code
 * expire in a call rather than in ten minutes. Nothing else's time moves.
 *
 * None of these routes authenticates, so none of them is there unless the server is bound to
 * loopback, and a request that arrives through a relay's tunnel is refused as if the route were
 * not there (SEC-4): a tunnelled request never meets the bound socket, and whoever holds the
 * server's public key can open a tunnel. On the port they stay, relay or not: the web e2e suite
 * and the relay bench run dev mode beside a relay and seed through them.
 */

import { HARNESS_CAPABILITIES } from "@chipschat/protocol";
import type { Hono } from "hono";
import type { Principal } from "../../../application/index.js";
import { isWorkspaceRole, type WorkspaceRole } from "../../../domain/index.js";
import type { GatewayDeps, GatewayEnv } from "../context.js";
import { HttpError } from "../errors.js";

/** The addresses that mean "this machine only". */
const LOOPBACK = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

export function registerDevRoutes(app: Hono<GatewayEnv>, deps: GatewayDeps): void {
  if (!deps.config.devMode || deps.pairingCodes === undefined) return;
  // A pairing code with no credential behind it is a laptop convenience and nothing else. Bound
  // to the network, it would hand a person's credential to anyone who can reach the port, so
  // the routes are simply not there (phase-1-interim-review finding 12).
  if (!LOOPBACK.has(deps.config.server.host)) {
    deps.logger.warn(
      { host: deps.config.server.host },
      "dev-mode routes are not registered: the server is not bound to loopback",
    );
    return;
  }
  const pairingCodes = deps.pairingCodes;

  // The same through the relay (SEC-4): a tunnelled request is handed to this app without
  // meeting the bound socket, so loopback keeps nobody out of it, and the public key that opens
  // a tunnel is on every QR, invite and health answer. So a request that came through a relay's
  // tunnel finds no dev route. A request at the tunnel door on this machine (ADR 0191) is not
  // one: the door is on the bound port, which is loopback here.
  app.use("/v1/dev/*", async (c, next) => {
    if (c.env?.relay !== undefined) {
      throw new HttpError("not_found", "There are no dev routes through the relay.");
    }
    await next();
  });

  /**
   * `POST /v1/dev/harnesses` — up to fifty harnesses at once, for a load run, each with a token and
   * a direct space, and a seat in `space_id` when one is named. The demo person adds them — or
   * the person `owner_id` names, so a second person can own one (M3.3) — so the person's key
   * stays in the browser where it belongs. `capabilities`, when given, is what each declares.
   */
  app.post("/v1/dev/harnesses", async (c) => {
    const person = await deps.readModels.anyPerson();
    if (person === undefined) throw new HttpError("not_found", "No demo person to add harnesses.");
    const { count, spaceId, name, ownerId, capabilities } = readLoadRequest(await c.req.text());
    const principal = await principalFor(deps, person, ownerId);
    const harnesses: Record<string, string>[] = [];
    for (let n = 1; n <= count; n += 1) {
      // A dev harness is a specialist on the SDK's terms: it takes the dial (ADR 0046). A test of
      // harnesses of other shapes names what each declares, nothing included (ADR 0077).
      const added = await deps.addHarness({
        principal,
        displayName: nameFor(name, count, n),
        capabilities: capabilities ?? [HARNESS_CAPABILITIES.autonomy],
      });
      if (!added.ok) throw new HttpError("invalid_event", added.error.message);
      if (spaceId !== undefined) {
        await seat(deps, principal, spaceId, added.value.harnessId);
      }
      harnesses.push({
        harness_id: added.value.harnessId,
        display_name: added.value.displayName,
        token: added.value.token,
        space_id: added.value.spaceId ?? "",
      });
    }
    return c.json({ harnesses }, 201);
  });

  /**
   * `POST /v1/dev/messages` — a space filled with `count` messages from a harness, in one
   * request, for the windowing measurement (Phase 1 review, condition 1). Ten thousand messages
   * posted one socket round trip at a time would measure the wire; the client is what is being
   * measured, so the log is filled here and the browser reads it the way it reads any other.
   * Like `seat` above it appends rather than going through the door: a load fixture, in dev
   * mode, on loopback.
   */
  app.post("/v1/dev/messages", async (c) => {
    const { count, spaceId, harnessId } = readFillRequest(await c.req.text());
    const person = await deps.readModels.anyPerson();
    if (person === undefined) throw new HttpError("not_found", "No demo workspace to fill.");
    for (let n = 1; n <= count; n += 1) {
      await deps.store.append({
        v: 1,
        type: "message.post",
        id: deps.ids.next("event"),
        ts: deps.clock.nowIso(),
        workspace_id: person.workspaceId,
        space_id: spaceId,
        actor: { kind: "harness", id: harnessId },
        idempotency_key: `fill-${spaceId}-${n}`,
        text: `Filler ${n} of ${count}`,
      });
    }
    return c.json({ count }, 201);
  });

  /**
   * `POST /v1/dev/people` — a second person, and the code they pair with. A member unless the
   * body names a role; joined the way an invite joins somebody (ADR 0034), so their role is in
   * the log.
   */
  app.post("/v1/dev/people", async (c) => {
    const person = await deps.readModels.anyPerson();
    if (person === undefined) throw new HttpError("not_found", "No demo workspace to join.");
    const { name, role } = readPersonRequest(await c.req.text());
    const joined = await deps.joinWorkspace({
      workspaceId: person.workspaceId,
      displayName: name,
      role,
    });
    if (!joined.ok) throw new HttpError("invalid_event", joined.error.message);
    const personId = joined.value.participantId;
    const code = pairingCodes.issue({ workspaceId: person.workspaceId, participantId: personId });
    return c.json(
      { person_id: personId, display_name: joined.value.displayName, role, code: code.code },
      201,
    );
  });

  app.post("/v1/dev/join-clock", async (c) => {
    const body: unknown = JSON.parse((await c.req.text()) || "{}");
    const seconds = (body as { advance_seconds?: unknown }).advance_seconds;
    if (typeof seconds !== "number" || !Number.isFinite(seconds) || seconds < 0) {
      throw new HttpError("invalid_event", "Send `advance_seconds`, a number of seconds ahead.");
    }
    deps.joinClock?.advance(seconds * 1000);
    return c.json({ now: (deps.joinClock ?? deps.clock).nowIso() });
  });

  app.post("/v1/dev/pairing-code", async (c) => {
    const person = await deps.readModels.anyPerson();
    if (person === undefined) throw new HttpError("not_found", "No demo person to pair.");
    const code = pairingCodes.issue({
      workspaceId: person.workspaceId,
      participantId: person.participantId,
    });
    return c.json({ code: code.code }, 201);
  });
}

/** A load run wants numbered harnesses; the lane demo wants one it can name (Ledger). */
function nameFor(name: string | undefined, count: number, n: number): string {
  if (name === undefined) return `Load harness ${n}`;
  return count === 1 ? name : `${name} ${n}`;
}

/** The person adding the harnesses: the demo person, or the one `owner_id` names. */
async function principalFor(
  deps: GatewayDeps,
  demo: { participantId: string; workspaceId: string },
  ownerId: string | undefined,
): Promise<Principal> {
  const owner =
    ownerId === undefined
      ? undefined
      : await deps.readModels.participant(demo.workspaceId, ownerId);
  if (ownerId !== undefined && owner?.kind !== "person") {
    throw new HttpError("not_found", "No person by that id to own the harness.");
  }
  return {
    kind: "person",
    participantId: owner?.id ?? demo.participantId,
    workspaceId: demo.workspaceId,
    displayName: owner?.display_name ?? "You",
    via: "device_key",
  };
}

/**
 * How many harnesses, up to fifty, the room to seat them in, an optional name for them, and who
 * owns them when not the demo person.
 */
function readLoadRequest(raw: string): {
  count: number;
  spaceId: string | undefined;
  name: string | undefined;
  ownerId: string | undefined;
  capabilities: readonly string[] | undefined;
} {
  let body: {
    count?: unknown;
    space_id?: unknown;
    display_name?: unknown;
    owner_id?: unknown;
    capabilities?: unknown;
  } = {};
  try {
    body = JSON.parse(raw || "{}");
  } catch {
    throw new HttpError("invalid_event", "The body is not JSON.");
  }
  return {
    count: Math.min(50, Math.max(1, Number(body.count ?? 1))),
    spaceId: typeof body.space_id === "string" ? body.space_id : undefined,
    name: typeof body.display_name === "string" ? body.display_name : undefined,
    ownerId: typeof body.owner_id === "string" ? body.owner_id : undefined,
    capabilities: stringsOf(body.capabilities),
  };
}

/** A list of strings as given, or nothing when it is not one. */
function stringsOf(value: unknown): readonly string[] | undefined {
  if (!Array.isArray(value) || !value.every((each) => typeof each === "string")) return undefined;
  return value as string[];
}

/** A person needs a name, and may be given a role; a member otherwise. */
function readPersonRequest(raw: string): { name: string; role: WorkspaceRole } {
  let body: { display_name?: unknown; role?: unknown } = {};
  try {
    body = JSON.parse(raw || "{}");
  } catch {
    throw new HttpError("invalid_event", "The body is not JSON.");
  }
  const name = typeof body.display_name === "string" ? body.display_name.trim() : "";
  if (name === "" || name.length > 120) {
    throw new HttpError("invalid_event", "Give the person a name, up to 120 characters.");
  }
  const role = body.role ?? "member";
  if (!isWorkspaceRole(role)) {
    throw new HttpError("invalid_event", "A role is owner, admin, member or guest.");
  }
  return { name, role };
}

/** How many messages, up to twenty thousand, in which room, from which harness. */
function readFillRequest(raw: string): {
  count: number;
  spaceId: string;
  harnessId: string;
} {
  let body: { count?: unknown; space_id?: unknown; harness_id?: unknown } = {};
  try {
    body = JSON.parse(raw || "{}");
  } catch {
    throw new HttpError("invalid_event", "The body is not JSON.");
  }
  const spaceId = body.space_id;
  const harnessId = body.harness_id;
  if (typeof spaceId !== "string" || typeof harnessId !== "string") {
    throw new HttpError("invalid_event", "space_id and harness_id are required.");
  }
  return {
    count: Math.min(20_000, Math.max(1, Number(body.count ?? 1))),
    spaceId,
    harnessId,
  };
}

/** A seat in the room: `membership.added`, by the person, like any other join. */
async function seat(
  deps: GatewayDeps,
  person: { participantId: string; workspaceId: string },
  spaceId: string,
  harnessId: string,
): Promise<void> {
  await deps.store.append({
    v: 1,
    type: "membership.added",
    id: deps.ids.next("event"),
    ts: deps.clock.nowIso(),
    workspace_id: person.workspaceId,
    space_id: spaceId,
    actor: { kind: "person", id: person.participantId },
    idempotency_key: `${spaceId}-member-${harnessId}`,
    participant_id: harnessId,
    participant_kind: "harness",
    role: "member",
  });
}
