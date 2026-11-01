/**
 * Join requests (ADR 0122), against a real workspace: what a person may decide, what a requester
 * is handed and how often, and the guards — expiry, five waiting, ten asks a minute, a device only
 * from this network. The clock is the test's.
 */

import { manualClock } from "@chipschat/platform";
import {
  JOIN_CODE_SECONDS,
  JOIN_LINK_SECONDS,
  type JoinedDevice,
  type JoinedHarness,
  type JoinRequestView,
} from "@chipschat/protocol";
import fc from "fast-check";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { joinRequestsOn } from "../../testing/join.js";
import { createTestWorkspace, type TestWorkspace } from "../../testing/workspace.js";
import type { Principal } from "../ports/identity.js";
import { type AskInput, type JoinRequests, viewOf } from "./join.js";

const KEY = "MCowBQYDK2VwAyEAr3z7c4a2j8mPqZ0y1xW9n4kL2vB6dF8hJ0sT5uY7wE0=";

let ws: TestWorkspace;
let join: JoinRequests;
let told: JoinRequestView[];
let owner: Principal;
let admin: Principal;
let member: Principal;
const clock = manualClock(Date.parse("2026-10-05T21:00:00.000Z"));
let address = 0;

const person = (participantId: string, role: Principal["role"]): Principal => ({
  kind: "person",
  participantId,
  workspaceId: ws.workspaceId,
  displayName: role ?? "",
  role,
  via: "device_key",
});

/** An ask from an address of its own, so the per-address count stays out of the way. */
function ask(input: Partial<AskInput> = {}): AskInput {
  address += 1;
  return {
    kind: "harness",
    name: "Tide",
    software: "tide 0.4.1",
    machine: "vps-fra-1",
    wants: ["autonomy", "new_spaces", "restarts"],
    fromAddr: `100.88.4.${address % 250}`,
    countedAs: `addr-${address}`,
    viaRelay: false,
    url: "http://127.0.0.1:4431",
    ...input,
  };
}

async function asked(input: Partial<AskInput> = {}) {
  const result = await join.ask(ask(input));
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
}

async function events(type: string) {
  const rows = await ws.db.selectFrom("events").selectAll().where("type", "=", type).execute();
  return rows.map((row) => JSON.parse(row.payload) as Record<string, unknown>);
}

beforeAll(async () => {
  ws = await createTestWorkspace();
  told = [];
  join = joinRequestsOn(ws, clock, (_workspaceId, request) => told.push(request));
  owner = person(ws.arjun.participantId, "owner");
  member = person(ws.dana.participantId, "member");
  admin = person((await ws.addPerson("Priya", "admin")).participantId, "admin");
});

afterAll(async () => {
  await ws.close();
});

// Whatever an earlier test left waiting has expired by the next.
beforeEach(() => {
  clock.advance(JOIN_LINK_SECONDS * 1000 + 1);
  told.length = 0;
});

describe("a harness that asks", () => {
  it("shows a code, waits for a person, and is handed exactly what it was allowed, once", async () => {
    const { request, secret } = await asked();
    expect(request.code).toMatch(/^[A-Z2-9]{3}-[A-Z2-9]{3}$/);
    expect(told.map((each) => each.state)).toEqual(["waiting"]);
    expect(told[0]).not.toHaveProperty("secret");

    expect(await join.poll({ id: request.id, secret })).toEqual({
      ok: true,
      value: { waiting: true, interval: 3 },
    });

    expect((await join.allow({ principal: member, id: request.id, capabilities: [] })).ok).toBe(
      false,
    );
    const allowed = await join.allow({
      principal: owner,
      id: request.id,
      // Restarts turned off; root was never asked for, so it is not granted either.
      capabilities: ["autonomy", "new_spaces", "root"],
    });
    expect(allowed.ok && allowed.value.capabilities).toEqual(["autonomy", "new_spaces"]);
    const audit = (await events("join.allowed")).find((each) => each["request_id"] === request.id);
    expect(audit).toMatchObject({
      by: owner.participantId,
      capabilities: ["autonomy", "new_spaces"],
      name: "Tide",
      from_addr: request.fromAddr,
      started_by: "requester",
    });

    const polled = await join.poll({ id: request.id, secret });
    if (!polled.ok || "waiting" in polled.value) throw new Error("not joined");
    const joined = polled.value as JoinedHarness;
    expect(joined).toMatchObject({ kind: "harness", url: "http://127.0.0.1:4431" });
    expect(joined.token).toMatch(/^chips_at_/);
    expect(joined.space_id).toMatch(/^spc_/);
    const harness = await ws.gateway.deps.readModels.participant(ws.workspaceId, joined.harness_id);
    expect(harness?.capabilities).toEqual(["autonomy", "new_spaces"]);
    expect(harness?.display_name).toBe("Tide");
    expect(harness?.owner_id).toBe(owner.participantId);

    const again = await join.poll({ id: request.id, secret });
    expect(again.ok === false && again.error.kind).toBe("spent");
    expect(told.at(-1)).toMatchObject({ state: "redeemed", harness_id: joined.harness_id });
  });

  it("is shown to the person deciding without what nobody sees in its words (SEC-33)", async () => {
    const { request } = await asked({ name: "Ti\u200bde\u202e", machine: "vps\u2066-fra" });
    expect(told[0]).toMatchObject({ name: "Tide", machine: "vps-fra" });
    expect(request.name).toBe("Tide");
    expect((await join.ask(ask({ name: "\u200b\u200f" }))).ok).toBe(false);
  });

  it("is told nothing with a wrong secret, and nothing that says the request exists", async () => {
    const { request } = await asked();
    const wrong = await join.poll({ id: request.id, secret: "chips_j_guessed" });
    const nowhere = await join.poll({ id: "jrq_01K4ZQPX00000000000000000Z", secret: "x" });
    expect(wrong).toEqual(nowhere);
    expect(wrong.ok === false && wrong.error.kind).toBe("unknown");
  });

  it("is refused when a person says no, and the audit says who", async () => {
    const { request, secret } = await asked();
    const denied = await join.deny({ principal: admin, id: request.id });
    expect(denied.ok && denied.value.state).toBe("denied");
    const polled = await join.poll({ id: request.id, secret });
    expect(polled.ok === false && polled.error.kind).toBe("denied");
    const again = await join.allow({ principal: owner, id: request.id, capabilities: [] });
    expect(again.ok === false && again.error.kind).toBe("denied");
    const audit = (await events("join.denied")).find((each) => each["request_id"] === request.id);
    expect(audit).toMatchObject({ by: admin.participantId, kind: "harness" });
  });

  it("expires after ten minutes, waiting or allowed, and the sweep says so", async () => {
    const waiting = await asked();
    const allowed = await asked();
    await join.allow({ principal: owner, id: allowed.request.id, capabilities: ["autonomy"] });
    clock.advance(JOIN_CODE_SECONDS * 1000);
    for (const { request, secret } of [waiting, allowed]) {
      const polled = await join.poll({ id: request.id, secret });
      expect(polled.ok === false && polled.error.kind).toBe("expired");
    }
    told.length = 0;
    expect(await join.expire()).toBeGreaterThanOrEqual(2);
    expect(told.filter((each) => each.state === "expired").map((each) => each.request_id)).toEqual(
      expect.arrayContaining([waiting.request.id, allowed.request.id]),
    );
  });

  it("is collected only before its expiry, whenever in the ten minutes it is allowed", async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 0, max: 2 * JOIN_CODE_SECONDS }), async (seconds) => {
        clock.advance(JOIN_LINK_SECONDS * 1000 + 1);
        const { request, secret } = await asked();
        await join.allow({ principal: owner, id: request.id, capabilities: [] });
        clock.advance(seconds * 1000);
        const polled = await join.poll({ id: request.id, secret });
        expect(polled.ok).toBe(seconds < JOIN_CODE_SECONDS);
      }),
      { numRuns: 15 },
    );
  });
});

describe("the guards", () => {
  it("keep five waiting at most, and ten asks a minute from one address", async () => {
    const one = { countedAs: "the-same-place" };
    const kinds: string[] = [];
    for (let i = 0; i < 11; i += 1) {
      const result = await join.ask(ask(one));
      kinds.push(result.ok ? "ok" : result.error.kind);
    }
    expect(kinds).toEqual([...Array(5).fill("ok"), ...Array(5).fill("too_many"), "too_fast"]);
    const listed = await join.list(owner, ["waiting"]);
    expect(listed.ok && listed.value.length).toBe(5);
  });

  it("show requests to owners and admins only", async () => {
    const { request } = await asked();
    const listed = await join.list(admin, ["waiting"]);
    expect(listed.ok && listed.value.map((each) => each.id)).toEqual([request.id]);
    // A member lists only the links they handed out (ADR 0232): nothing of a harness's.
    const theirs = await join.list(member, ["waiting"]);
    expect(theirs.ok && theirs.value).toEqual([]);
    const refused = await join.get(member, request.id);
    expect(refused.ok === false && refused.error.kind).toBe("not_allowed");
  });

  it("let a device ask only from this network, never through the relay", async () => {
    const device = { kind: "device" as const, name: "Pixel 9", publicKey: KEY, wants: [] };
    for (const where of [
      { fromAddr: "192.168.1.41", viaRelay: true },
      { fromAddr: "8.8.8.8", viaRelay: false },
    ]) {
      const refused = await join.ask(ask({ ...device, ...where }));
      expect(refused.ok === false && refused.error.kind).toBe("not_here");
    }
    const { request, secret } = await asked({ ...device, fromAddr: "192.168.1.41" });
    expect(request.wants).toEqual([]);
    // The code is the device's to show and the person's to type (SEC-6): the view withholds it,
    // and Allow with none, or with another, allows nothing.
    expect(viewOf(request, clock.nowMs()).code).toBeUndefined();
    expect(told.at(-1)?.code).toBeUndefined();
    const silent = await join.allow({ principal: owner, id: request.id, capabilities: [] });
    expect(silent.ok === false && silent.error.kind).toBe("wrong_code");
    const guessed = await join.allow({
      principal: owner,
      id: request.id,
      capabilities: [],
      code: "ZZZ-ZZZ",
    });
    expect(guessed.ok === false && guessed.error.kind).toBe("wrong_code");
    const waiting = await join.poll({ id: request.id, secret });
    expect(waiting.ok && "waiting" in waiting.value).toBe(true);
    // Typed as a person types it: in any case, with the dash or without.
    const typed = ` ${(request.code ?? "").toLowerCase().replace("-", " ")} `;
    const allowed = await join.allow({
      principal: owner,
      id: request.id,
      capabilities: ["autonomy"],
      code: typed,
    });
    expect(allowed.ok).toBe(true);
    const polled = await join.poll({ id: request.id, secret });
    if (!polled.ok || "waiting" in polled.value) throw new Error("not paired");
    // With its credential, the server's tunnel key (ADR 0191): what the device pins.
    expect(polled.value).toMatchObject({
      kind: "device",
      participant_id: owner.participantId,
      workspace_id: ws.workspaceId,
      server_key: await ws.gateway.deps.relay.publicKey(),
    } satisfies Partial<JoinedDevice>);
  });
});

describe("a link a person makes", () => {
  it("is allowed already, by an owner or admin, with what they chose", async () => {
    expect((await join.makeLink({ principal: member, capabilities: [], url: "http://x" })).ok).toBe(
      false,
    );
    const unknown = await join.makeLink({ principal: admin, capabilities: ["root"], url: "x" });
    expect(unknown.ok === false && unknown.error.kind).toBe("invalid");

    const made = await join.makeLink({
      principal: admin,
      capabilities: ["new_spaces", "restarts"],
      url: "http://100.64.0.7:4431",
    });
    if (!made.ok) throw new Error(made.error.message);
    expect(made.value.request).toMatchObject({ state: "allowed", startedBy: "person", code: null });
    // Turned one off before it was used.
    await join.allow({ principal: admin, id: made.value.request.id, capabilities: ["new_spaces"] });

    const joined = await join.redeemLink({
      secret: made.value.secret,
      name: "Kit",
      software: "openclaw 2026.9.6",
      machine: "vps-fra-1",
      fromAddr: "100.88.4.12",
    });
    if (!joined.ok) throw new Error(joined.error.message);
    expect(joined.value).toMatchObject({ kind: "harness", capabilities: ["new_spaces"] });
    const audit = (await events("join.allowed")).find(
      (each) => each["request_id"] === made.value.request.id,
    );
    expect(audit).toMatchObject({
      by: admin.participantId,
      started_by: "person",
      name: "Kit",
      harness_id: (joined.value as JoinedHarness).harness_id,
    });
    expect(told.at(-1)).toMatchObject({ state: "redeemed", name: "Kit", from_addr: "100.88.4.12" });

    const twice = await join.redeemLink({ secret: made.value.secret, name: "Kit" });
    expect(twice.ok === false && twice.error.kind).toBe("spent");
  });

  it("is redeemed by exactly one of many at once", async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 2, max: 6 }), async (racers) => {
        const made = await join.makeLink({ principal: owner, capabilities: [], url: "http://x" });
        if (!made.ok) throw new Error(made.error.message);
        const results = await Promise.all(
          Array.from({ length: racers }, (_, i) =>
            join.redeemLink({ secret: made.value.secret, name: `Racer ${i}` }),
          ),
        );
        expect(results.filter((each) => each.ok)).toHaveLength(1);
        for (const each of results.filter((result) => !result.ok)) {
          expect(each.ok === false && each.error.kind).toBe("spent");
        }
      }),
      { numRuns: 10 },
    );
  });

  it("lasts fifteen minutes, and a withdrawn one is refused", async () => {
    const late = await join.makeLink({ principal: owner, capabilities: [], url: "http://x" });
    const withdrawn = await join.makeLink({ principal: owner, capabilities: [], url: "http://x" });
    if (!late.ok || !withdrawn.ok) throw new Error("no link");
    await join.deny({ principal: owner, id: withdrawn.value.request.id });
    const refused = await join.redeemLink({ secret: withdrawn.value.secret, name: "x" });
    expect(refused.ok === false && refused.error.kind).toBe("denied");
    clock.advance(JOIN_LINK_SECONDS * 1000 - 1);
    expect((await join.get(owner, late.value.request.id)).ok).toBe(true);
    clock.advance(1);
    const expired = await join.redeemLink({ secret: late.value.secret, name: "x" });
    expect(expired.ok === false && expired.error.kind).toBe("expired");
  });
});
