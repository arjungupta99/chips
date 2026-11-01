/**
 * Add harness, Custom (M1.6): a person gets a token once, the harness has a room to speak in, and
 * the token works from the first line. Then the tokens a harness holds (ADR 0023): listed
 * without ever showing one, issued again for a rotation, and withdrawn — by the owner, and by
 * nobody else.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestWorkspace, type TestWorkspace } from "../../../testing/workspace.js";

let ws: TestWorkspace;
const BASE = "http://chips.local";

beforeEach(async () => {
  ws = await createTestWorkspace();
});
afterEach(async () => {
  await ws.close();
});

async function addHarness(name: string, extra: Record<string, unknown> = {}): Promise<Response> {
  const body = JSON.stringify({ name, ...extra });
  return await ws.gateway.app.fetch(
    new Request(`${BASE}/v1/harnesses`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...ws.arjun.sign("POST", "/v1/harnesses", body),
      },
      body,
    }),
  );
}

async function openSpace(
  harness: { participantId: string; headers: Record<string, string> },
  body: Record<string, unknown>,
  as?: { headers: Record<string, string> },
): Promise<Response> {
  return await ws.gateway.app.fetch(
    new Request(`${BASE}/v1/harnesses/${harness.participantId}/spaces`, {
      method: "POST",
      headers: { "content-type": "application/json", ...(as ?? harness).headers },
      body: JSON.stringify(body),
    }),
  );
}

/** A harness's default agent: the one it has for rooms with no key of their own (ADR 0087). */
/** The agent a harness has for one of its keys (ADR 0087's addendum of 30 September, point 2). */
async function keyAgent(harnessId: string, key: string): Promise<string> {
  const agent = await ws.gateway.deps.readModels.agentByKey(ws.workspaceId, harnessId, key);
  if (agent === undefined) throw new Error(`${harnessId} has no agent for ${key}`);
  return agent.agent_id;
}

async function defaultAgent(harnessId: string): Promise<string> {
  const agent = await ws.gateway.deps.readModels.agentByKey(ws.workspaceId, harnessId, harnessId);
  if (agent === undefined) throw new Error(`${harnessId} has no default agent`);
  return agent.agent_id;
}

describe("POST /v1/harnesses/:id/spaces", () => {
  const WORKTREE = "/Users/arjun/Work/Chips";

  it("opens the space for a worktree, and finds the same one every time after", async () => {
    const first = await openSpace(ws.scout, { key: WORKTREE, title: "Chips \u00b7 main" });
    expect(first.status).toBe(201);
    const opened = (await first.json()) as { space_id: string; created: boolean };
    expect(opened.space_id).toMatch(/^spc_/);
    expect(opened.created).toBe(true);

    // The space is the harness's and its owner's, which is what makes it somewhere to talk: the
    // harness is in it as its agent (ADR 0087's addendum), the key's own, named after the harness
    // when it does not follow its rooms, and not itself.
    const agent = await keyAgent(ws.scout.participantId, WORKTREE);
    expect(
      (await ws.gateway.deps.readModels.participant(ws.workspaceId, agent))?.display_name,
    ).toBe("Scout");
    expect(
      await ws.gateway.deps.readModels.memberRole(ws.workspaceId, opened.space_id, agent),
    ).toBe("member");
    expect(
      await ws.gateway.deps.readModels.memberRole(
        ws.workspaceId,
        opened.space_id,
        ws.scout.participantId,
      ),
    ).toBeUndefined();
    expect(
      await ws.gateway.deps.readModels.memberRole(
        ws.workspaceId,
        opened.space_id,
        ws.arjun.participantId,
      ),
    ).toBe("owner");

    // Tomorrow's terminal in the same worktree is the same space, not another one.
    const again = await openSpace(ws.scout, { key: WORKTREE });
    expect(again.status).toBe(200);
    expect(await again.json()).toEqual({
      space_id: opened.space_id,
      created: false,
      retitled: false,
      joined: false,
      claimed: false,
    });
  });

  it("takes a better title for a space found again, unless a person renamed it (M3.3)", async () => {
    const first = (await (await openSpace(ws.scout, { key: WORKTREE })).json()) as {
      space_id: string;
    };
    const named = await openSpace(ws.scout, { key: WORKTREE, title: "Chips \u00b7 main" });
    expect(await named.json()).toMatchObject({ space_id: first.space_id, retitled: true });
    expect((await ws.gateway.deps.readModels.space(ws.workspaceId, first.space_id))?.title).toBe(
      "Chips \u00b7 main",
    );
    // The same title again changes nothing.
    const same = await openSpace(ws.scout, { key: WORKTREE, title: "Chips \u00b7 main" });
    expect(await same.json()).toMatchObject({ retitled: false });

    // Arjun renames the room; the harness's next better idea does not overwrite his.
    await ws.gateway.deps.submitEvent({
      event: {
        type: "space.updated",
        space_id: first.space_id,
        title: "The Chips room",
        idempotency_key: "arjun-renames",
      },
      principal: {
        kind: "person",
        participantId: ws.arjun.participantId,
        workspaceId: ws.workspaceId,
        displayName: "Arjun",
        via: "device_key",
      },
    });
    const later = await openSpace(ws.scout, { key: WORKTREE, title: "Chips \u00b7 review" });
    expect(await later.json()).toMatchObject({ retitled: false });
    expect((await ws.gateway.deps.readModels.space(ws.workspaceId, first.space_id))?.title).toBe(
      "The Chips room",
    );
  });

  it("gives two worktrees two spaces", async () => {
    const one = (await (await openSpace(ws.scout, { key: WORKTREE })).json()) as {
      space_id: string;
    };
    const two = (await (await openSpace(ws.scout, { key: `${WORKTREE}-review` })).json()) as {
      space_id: string;
    };
    expect(two.space_id).not.toBe(one.space_id);
  });

  it("shares a worktree's space between two harnesses, the second joining it (ADR 0033)", async () => {
    const first = await openSpace(ws.scout, { key: WORKTREE, title: "Chips · main", shared: true });
    expect(first.status).toBe(201);
    const opened = (await first.json()) as { space_id: string; joined: boolean };
    expect(opened.joined).toBe(false);

    // Codex, on the same machine, in the same checkout: it finds Scout's space and joins it.
    const codex = (await (await addHarness("Codex", { open_direct_space: false })).json()) as {
      harness_id: string;
      token: string;
    };
    const second = await openSpace(
      { participantId: codex.harness_id, headers: { authorization: `Bearer ${codex.token}` } },
      { key: WORKTREE, title: "Chips · main", shared: true },
    );
    expect(second.status).toBe(200);
    expect(await second.json()).toMatchObject({
      space_id: opened.space_id,
      created: false,
      joined: true,
    });
    const role = (who: string) =>
      ws.gateway.deps.readModels.memberRole(ws.workspaceId, opened.space_id, who);
    expect(await role(await keyAgent(ws.scout.participantId, WORKTREE))).toBe("member");
    expect(await role(await defaultAgent(codex.harness_id))).toBe("member");
    expect(await role(ws.arjun.participantId)).toBe("owner");

    // Once in, it is simply found; and a key that is not shared stays the harness's own.
    const again = await openSpace(
      { participantId: codex.harness_id, headers: { authorization: `Bearer ${codex.token}` } },
      { key: WORKTREE, shared: true },
    );
    expect(await again.json()).toMatchObject({ space_id: opened.space_id, joined: false });
    const own = await openSpace(
      { participantId: codex.harness_id, headers: { authorization: `Bearer ${codex.token}` } },
      { key: WORKTREE },
    );
    expect(own.status).toBe(201);
    expect(((await own.json()) as { space_id: string }).space_id).not.toBe(opened.space_id);
  });

  it("finds the space it opened before worktree keys were shared (ADR 0033 addendum)", async () => {
    // A worktree opened the old way: under the harness's own namespace, as every one was until
    // 5 September. Nothing rewrote those rows when the namespace changed.
    const before = await openSpace(ws.scout, { key: WORKTREE, title: "Chips · main" });
    expect(before.status).toBe(201);
    const legacy = (await before.json()) as { space_id: string };

    // The same bridge, after the change, marking the key shared: it finds the room its history
    // is in rather than opening a second one beside it.
    const after = await openSpace(ws.scout, {
      key: WORKTREE,
      title: "Chips · main",
      shared: true,
    });
    expect(after.status).toBe(200);
    expect(await after.json()).toMatchObject({ space_id: legacy.space_id, created: false });
  });

  it("does not reach across the namespace for another harness's older space", async () => {
    const before = await openSpace(ws.scout, { key: WORKTREE, title: "Chips · main" });
    const legacy = ((await before.json()) as { space_id: string }).space_id;

    // Codex asking for the same worktree gets its own room, not Scout's private one: the
    // fallback is the asking harness's own key and nobody else's (ADR 0024, decision 3).
    const codex = (await (await addHarness("Codex", { open_direct_space: false })).json()) as {
      harness_id: string;
      token: string;
    };
    const theirs = await openSpace(
      { participantId: codex.harness_id, headers: { authorization: `Bearer ${codex.token}` } },
      { key: WORKTREE, shared: true },
    );
    expect(theirs.status).toBe(201);
    expect(((await theirs.json()) as { space_id: string }).space_id).not.toBe(legacy);
  });

  it("refuses a person, and one harness opening another's space", async () => {
    const person = await openSpace(
      ws.scout,
      { key: WORKTREE },
      {
        headers: ws.arjun.sign(
          "POST",
          `/v1/harnesses/${ws.scout.participantId}/spaces`,
          JSON.stringify({ key: WORKTREE }),
        ),
      },
    );
    expect(person.status).toBe(403);

    const other = await ws.gateway.app.fetch(
      new Request(`${BASE}/v1/harnesses/hrn_01K4ZQPX000000000000000009/spaces`, {
        method: "POST",
        headers: { "content-type": "application/json", ...ws.scout.headers },
        body: JSON.stringify({ key: WORKTREE }),
      }),
    );
    expect(other.status).toBe(403);
  });

  it("wants a key", async () => {
    expect((await openSpace(ws.scout, {})).status).toBe(422);
    expect((await openSpace(ws.scout, { key: "   " })).status).toBe(422);
  });
});

describe("GET /v1/harnesses/:id/spaces", () => {
  async function listSpaces(
    harness: { participantId: string },
    as: { headers: Record<string, string> },
  ): Promise<Response> {
    return await ws.gateway.app.fetch(
      new Request(`${BASE}/v1/harnesses/${harness.participantId}/spaces`, { headers: as.headers }),
    );
  }

  it("lists what the harness opened by key, and says which are closed", async () => {
    expect(await (await listSpaces(ws.scout, ws.scout)).json()).toEqual({ spaces: [], asked: [] });

    const trip = (await (
      await openSpace(ws.scout, { key: "e0d0f115", title: "India trip 2026" })
    ).json()) as { space_id: string };
    const tree = (await (
      await openSpace(ws.scout, { key: "/Users/arjun/Work/Chips", shared: true })
    ).json()) as { space_id: string };

    // Scout puts the trip away, through its own door: the event it may already send for a space
    // it opened (M3.3), and exactly what an adapter sends for something archived.
    const closing = JSON.stringify({
      type: "space.updated",
      space_id: trip.space_id,
      state: "closed",
    });
    const closed = await ws.gateway.app.fetch(
      new Request(`${BASE}/v1/harnesses/${ws.scout.participantId}/events`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "scout-archives-the-trip",
          ...ws.scout.headers,
        },
        body: closing,
      }),
    );
    expect(closed.status).toBe(201);

    const listed = await listSpaces(ws.scout, ws.scout);
    expect(listed.status).toBe(200);
    expect(await listed.json()).toEqual({
      spaces: [
        {
          space_id: trip.space_id,
          key: "e0d0f115",
          shared: false,
          title: "India trip 2026",
          state: "closed",
          moved_by: "harness",
        },
        {
          space_id: tree.space_id,
          key: "/Users/arjun/Work/Chips",
          shared: true,
          title: null,
          state: "open",
        },
      ],
      asked: [],
    });
  });

  it("says who archived a room, so a person's archive can go back into the harness", async () => {
    const trip = (await (
      await openSpace(ws.scout, { key: "e0d0f115", title: "India trip 2026" })
    ).json()) as { space_id: string };
    const archive = (state: "open" | "closed", key: string) =>
      ws.gateway.deps.store.append({
        v: 1,
        type: "space.updated",
        id: ws.ids.next("event"),
        ts: "2026-09-22T21:00:00.000Z",
        workspace_id: ws.workspaceId,
        space_id: trip.space_id,
        actor: { kind: "person", id: ws.arjun.participantId },
        idempotency_key: key,
        state,
      });
    const listed = async () =>
      ((await (await listSpaces(ws.scout, ws.scout)).json()) as { spaces: object[] }).spaces;

    await archive("closed", "arjun-archives-the-trip");
    expect(await listed()).toEqual([
      expect.objectContaining({ state: "closed", moved_by: "person" }),
    ]);

    // Unarchiving is a move too, and the person's word on it.
    await archive("open", "arjun-brings-it-back");
    expect(await listed()).toEqual([
      expect.objectContaining({ state: "open", moved_by: "person" }),
    ]);
  });

  it("is the harness's own: nobody else reads its keys, and asking makes no space", async () => {
    await openSpace(ws.scout, { key: "e0d0f115" });
    expect(
      (
        await listSpaces(ws.scout, {
          headers: ws.arjun.sign("GET", `/v1/harnesses/${ws.scout.participantId}/spaces`, ""),
        })
      ).status,
    ).toBe(403);
    const before = await ws.gateway.deps.readModels.spacesForMember(
      ws.workspaceId,
      ws.scout.participantId,
    );
    await listSpaces(ws.scout, ws.scout);
    expect(
      await ws.gateway.deps.readModels.spacesForMember(ws.workspaceId, ws.scout.participantId),
    ).toEqual(before);
  });
});

describe("POST /v1/harnesses", () => {
  it("opens no direct space when the caller says its spaces are its own", async () => {
    // A harness whose spaces are worktrees opens them as it finds them; a direct one would sit
    // empty for ever with nothing able to reach it (ADR 0024).
    const response = await addHarness("Jacobian", { open_direct_space: false });
    expect(response.status).toBe(201);
    const added = (await response.json()) as Record<string, string>;
    expect(added["harness_id"]).toMatch(/^hrn_/);
    expect(added["space_id"]).toBeUndefined();

    // And it is in no space at all: nothing was opened for it.
    const rooms = await ws.db
      .selectFrom("memberships")
      .select("space_id")
      .where("workspace_id", "=", ws.workspaceId)
      .where("participant_id", "=", added["harness_id"] as string)
      .execute();
    expect(rooms).toEqual([]);
  });

  it("registers the harness, hands the token over once, and opens a direct space", async () => {
    const response = await addHarness("Custom bot");
    expect(response.status).toBe(201);
    const added = (await response.json()) as Record<string, string>;
    expect(added["harness_id"]).toMatch(/^hrn_/);
    expect(added["display_name"]).toBe("Custom bot");
    expect(added["token"]).toMatch(/^chips_at_/);
    expect(added["space_id"]).toMatch(/^spc_/);

    // The token speaks for the harness from the first line, in the room it was given.

    const me = await ws.gateway.app.fetch(
      new Request(`${BASE}/v1/participants`, {
        headers: { authorization: `Bearer ${added["token"]}` },
      }),
    );
    expect(me.status).toBe(200);
    const { participants } = (await me.json()) as {
      participants: { id: string; display_name: string }[];
    };
    expect(participants.map((p) => p.display_name).sort()).toEqual(["Arjun", "Custom bot"]);

    // Its default agent is in the room, named after it (ADR 0087's addendum, point 5).
    const role = await ws.gateway.deps.readModels.memberRole(
      ws.workspaceId,
      String(added["space_id"]),
      await defaultAgent(String(added["harness_id"])),
    );
    expect(role).toBe("member");
    // A new harness starts at L1: ask first.
    const policy = await ws.gateway.deps.readModels.harnessPolicy(
      ws.workspaceId,
      String(added["harness_id"]),
    );
    expect(policy).toMatchObject({ autonomy: 1 });
    // The token is a digest in the registry and nowhere in the log.
    const head = await ws.gateway.deps.store.head(ws.workspaceId);
    const page = await ws.gateway.deps.store.since(ws.workspaceId, 0, head + 1);
    expect(JSON.stringify(page.events)).not.toContain(added["token"]);
  });

  it("refuses a harness adding a harness, and a nameless one", async () => {
    const byHarness = await ws.gateway.app.fetch(
      new Request(`${BASE}/v1/harnesses`, {
        method: "POST",
        headers: { ...ws.scout.headers, "content-type": "application/json" },
        body: JSON.stringify({ name: "Another" }),
      }),
    );
    expect(byHarness.status).toBe(403);
    expect((await addHarness("   ")).status).toBe(422);
  });
});

describe("a harness's tokens", () => {
  /** A fresh Custom harness, owned by Arjun, with the token it was given. */
  async function owned(): Promise<{ harnessId: string; token: string }> {
    const added = (await (await addHarness("Custom bot")).json()) as Record<string, string>;
    return { harnessId: String(added["harness_id"]), token: String(added["token"]) };
  }

  const call = async (
    person: TestWorkspace["arjun"],
    method: string,
    target: string,
    body = "",
  ): Promise<Response> =>
    await ws.gateway.app.fetch(
      new Request(`${BASE}${target}`, {
        method,
        headers: { "content-type": "application/json", ...person.sign(method, target, body) },
        ...(body === "" ? {} : { body }),
      }),
    );

  it("lists what a harness holds, and never a token", async () => {
    const { harnessId } = await owned();
    const response = await call(ws.arjun, "GET", `/v1/harnesses/${harnessId}/tokens`);
    expect(response.status).toBe(200);
    const { tokens } = (await response.json()) as { tokens: Record<string, unknown>[] };
    expect(tokens).toHaveLength(1);
    expect(tokens[0]).toMatchObject({ name: "custom", revoked_at: null });
    expect(JSON.stringify(tokens)).not.toContain("chips_at_");
  });

  it("rotates: the new token speaks, then the old one stops", async () => {
    const { harnessId, token } = await owned();
    const issued = await call(
      ws.arjun,
      "POST",
      `/v1/harnesses/${harnessId}/tokens`,
      '{"name":"laptop"}',
    );
    expect(issued.status).toBe(201);
    const fresh = (await issued.json()) as Record<string, string>;
    expect(fresh["token"]).toMatch(/^chips_at_/);
    expect(fresh["token"]).not.toBe(token);

    // Both speak while they overlap: that is what makes a rotation safe to do at any moment.
    for (const each of [token, fresh["token"]]) {
      const me = await ws.gateway.app.fetch(
        new Request(`${BASE}/v1/participants`, { headers: { authorization: `Bearer ${each}` } }),
      );
      expect(me.status).toBe(200);
    }

    const listed = (await (
      await call(ws.arjun, "GET", `/v1/harnesses/${harnessId}/tokens`)
    ).json()) as {
      tokens: { id: string; name: string }[];
    };
    const old = listed.tokens.find((each) => each.name === "custom") as { id: string };
    const revoked = await call(ws.arjun, "DELETE", `/v1/harnesses/${harnessId}/tokens/${old.id}`);
    expect(revoked.status).toBe(200);
    expect((await revoked.json()) as Record<string, unknown>).toMatchObject({ token_id: old.id });

    const withOld = await ws.gateway.app.fetch(
      new Request(`${BASE}/v1/participants`, { headers: { authorization: `Bearer ${token}` } }),
    );
    expect(withOld.status).toBe(401);
    const withNew = await ws.gateway.app.fetch(
      new Request(`${BASE}/v1/participants`, {
        headers: { authorization: `Bearer ${fresh["token"]}` },
      }),
    );
    expect(withNew.status).toBe(200);
  });

  it("refuses a second revocation of the same token", async () => {
    const { harnessId } = await owned();
    const { tokens } = (await (
      await call(ws.arjun, "GET", `/v1/harnesses/${harnessId}/tokens`)
    ).json()) as { tokens: { id: string }[] };
    const id = (tokens[0] as { id: string }).id;
    expect((await call(ws.arjun, "DELETE", `/v1/harnesses/${harnessId}/tokens/${id}`)).status).toBe(
      200,
    );
    expect((await call(ws.arjun, "DELETE", `/v1/harnesses/${harnessId}/tokens/${id}`)).status).toBe(
      404,
    );
  });

  it("is the owner's alone: another person in the workspace cannot look or touch", async () => {
    const { harnessId } = await owned();
    expect((await call(ws.dana, "GET", `/v1/harnesses/${harnessId}/tokens`)).status).toBe(403);
    expect((await call(ws.dana, "POST", `/v1/harnesses/${harnessId}/tokens`, "{}")).status).toBe(
      403,
    );
    expect((await call(ws.dana, "DELETE", `/v1/harnesses/${harnessId}/tokens/tok_1`)).status).toBe(
      403,
    );
  });

  it("is nobody's for a harness that is not there", async () => {
    expect((await call(ws.arjun, "GET", "/v1/harnesses/hrn_nope/tokens")).status).toBe(403);
  });

  it("refuses a harness presenting its own token", async () => {
    const { harnessId, token } = await owned();
    const response = await ws.gateway.app.fetch(
      new Request(`${BASE}/v1/harnesses/${harnessId}/tokens`, {
        headers: { authorization: `Bearer ${token}` },
      }),
    );
    expect(response.status).toBe(403);
  });
});

describe("whether a harness has ever connected (the OpenClaw test, finding 18)", () => {
  /** The directory as Arjun reads it, by id. */
  async function directory(): Promise<Record<string, Record<string, unknown>>> {
    const response = await ws.gateway.app.fetch(
      new Request(`${BASE}/v1/participants`, {
        headers: ws.arjun.sign("GET", "/v1/participants", ""),
      }),
    );
    const { participants } = (await response.json()) as {
      participants: Record<string, unknown>[];
    };
    return Object.fromEntries(participants.map((each) => [String(each["id"]), each]));
  }

  it("says a harness added and never connected has not been seen, until its token is used", async () => {
    const added = (await (await addHarness("Custom bot")).json()) as Record<string, string>;
    const harnessId = String(added["harness_id"]);
    const before = await directory();
    expect(before[harnessId]).toMatchObject({ kind: "harness", last_seen_at: null });
    // A person has no tokens, and says nothing of when.
    expect(before[ws.arjun.participantId]).toMatchObject({ kind: "person", last_seen_at: null });

    // Its token authenticates a request, as it does a socket's upgrade, and is stamped for it.
    const used = await ws.gateway.app.fetch(
      new Request(`${BASE}/v1/participants`, {
        headers: { authorization: `Bearer ${added["token"]}` },
      }),
    );
    expect(used.status).toBe(200);
    await vi.waitFor(async () => {
      expect((await directory())[harnessId]?.["last_seen_at"]).toEqual(expect.any(String));
    });
  });

  it("is the latest use across its tokens, a withdrawn one's too, whoever reads it", async () => {
    const token = (name: string, lastUsedAt: string | null, revokedAt: string | null) => ({
      id: ws.ids.next("token"),
      workspace_id: ws.workspaceId,
      harness_id: ws.scout.participantId,
      token_hash: `hash-${name}`,
      name,
      created_at: "2026-09-01T09:00:00.000Z",
      last_used_at: lastUsedAt,
      revoked_at: revokedAt,
    });
    await ws.db
      .insertInto("harness_tokens")
      .values([
        token("mini", "2026-09-26T10:00:00.000Z", null),
        // Withdrawn since, but it connected then: it has been seen all the same.
        token("old", "2026-09-26T11:00:00.000Z", "2026-09-26T12:00:00.000Z"),
      ])
      .execute();

    const latest = "2026-09-26T11:00:00.000Z";
    expect((await directory())[ws.scout.participantId]).toMatchObject({ last_seen_at: latest });
    // What a harness or a guest is told, scoped to the rooms they share, says the same.
    const shared = await ws.gateway.deps.readModels.participantsVisibleTo(
      ws.workspaceId,
      ws.dana.participantId,
    );
    expect(shared.find((each) => each.id === ws.scout.participantId)).toMatchObject({
      last_seen_at: latest,
    });
    expect(
      await ws.gateway.deps.readModels.participant(ws.workspaceId, ws.scout.participantId),
    ).toMatchObject({ last_seen_at: latest });
  });
});

describe("POST /v1/harnesses/:id/owner (M5.2)", () => {
  async function transfer(
    harnessId: string,
    body: Record<string, unknown>,
    as: { sign: TestWorkspace["arjun"]["sign"] },
  ): Promise<Response> {
    const raw = JSON.stringify(body);
    const path = `/v1/harnesses/${harnessId}/owner`;
    return await ws.gateway.app.fetch(
      new Request(`${BASE}${path}`, {
        method: "POST",
        headers: { "content-type": "application/json", ...as.sign("POST", path, raw) },
        body: raw,
      }),
    );
  }

  it("hands Scout to Dana, by its owner; the registry and the log both say so", async () => {
    const response = await transfer(
      ws.scout.participantId,
      { owner_id: ws.dana.participantId, reason: "Dana runs it." },
      ws.arjun,
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      harness_id: ws.scout.participantId,
      owner_id: ws.dana.participantId,
    });
    const scout = await ws.gateway.deps.readModels.participant(
      ws.workspaceId,
      ws.scout.participantId,
    );
    expect(scout?.owner_id).toBe(ws.dana.participantId);
    const page = await ws.gateway.deps.store.since(ws.workspaceId, 0, 100);
    expect(page.events.at(-1)?.type).toBe("harness.transferred");
    expect(page.events.at(-1)?.payload).toMatchObject({
      from_owner_id: ws.arjun.participantId,
      to_owner_id: ws.dana.participantId,
      reason: "Dana runs it.",
    });
    // Its tokens are Dana's now, and Arjun — the workspace's owner — still holds them too.
    const asDana = await ws.gateway.app.fetch(
      new Request(`${BASE}/v1/harnesses/${ws.scout.participantId}/tokens`, {
        headers: ws.dana.sign("GET", `/v1/harnesses/${ws.scout.participantId}/tokens`, ""),
      }),
    );
    expect(asDana.status).toBe(200);
    const asArjun = await ws.gateway.app.fetch(
      new Request(`${BASE}/v1/harnesses/${ws.scout.participantId}/tokens`, {
        headers: ws.arjun.sign("GET", `/v1/harnesses/${ws.scout.participantId}/tokens`, ""),
      }),
    );
    expect(asArjun.status).toBe(200);
    // And the handshake reports the new owner.
    const hello = await ws.gateway.deps.authenticator.authenticate({
      authorization: `Bearer ${ws.scout.token}`,
      method: "GET",
      target: "/v1/ws",
      body: "",
    });
    expect(hello.ok && hello.principal.ownerId).toBe(ws.dana.participantId);
  });

  it("is refused to a member who does not own it, and to a guest as the new owner", async () => {
    const byDana = await transfer(
      ws.scout.participantId,
      { owner_id: ws.dana.participantId },
      ws.dana,
    );
    expect(byDana.status).toBe(403);
    const vendor = await ws.addPerson("Vendor", "guest");
    const toGuest = await transfer(
      ws.scout.participantId,
      { owner_id: vendor.participantId },
      ws.arjun,
    );
    expect(toGuest.status).toBe(422);
    const nobody = await transfer(
      ws.scout.participantId,
      { owner_id: "usr_01K4ZQPX00000000000000000Z" },
      ws.arjun,
    );
    expect(nobody.status).toBe(404);
    const notAHarness = await transfer(
      ws.dana.participantId,
      { owner_id: ws.arjun.participantId },
      ws.arjun,
    );
    expect(notAHarness.status).toBe(404);
    expect((await transfer(ws.scout.participantId, {}, ws.arjun)).status).toBe(422);
  });

  it("is an admin's to do too", async () => {
    const admin = await ws.addPerson("Priya", "admin");
    const response = await transfer(
      ws.scout.participantId,
      { owner_id: ws.dana.participantId },
      admin,
    );
    expect(response.status).toBe(200);
  });
});

describe("DELETE /v1/harnesses/:id (ADR 0078)", () => {
  type Signer = { sign: TestWorkspace["arjun"]["sign"] };

  async function remove(harnessId: string, as: Signer | Record<string, string>) {
    const path = `/v1/harnesses/${harnessId}`;
    const headers = "sign" in as ? (as as Signer).sign("DELETE", path, "") : as;
    const response = await ws.gateway.app.fetch(
      new Request(`${BASE}${path}`, { method: "DELETE", headers }),
    );
    return { status: response.status, body: (await response.json()) as Record<string, unknown> };
  }

  async function directory(headers: Record<string, string>) {
    const response = await ws.gateway.app.fetch(
      new Request(`${BASE}/v1/participants`, { headers }),
    );
    const body = response.ok
      ? ((await response.json()) as { participants: Record<string, unknown>[] })
      : { participants: [] };
    return { status: response.status, participants: body.participants };
  }

  const arjun = () => ({
    kind: "person" as const,
    participantId: ws.arjun.participantId,
    workspaceId: ws.workspaceId,
    displayName: "Arjun",
    via: "device_key" as const,
    role: "owner" as const,
  });

  it("withdraws its tokens, says so in the log, and keeps its name for what it said", async () => {
    const removed = await remove(ws.scout.participantId, ws.arjun);
    expect(removed.status).toBe(200);
    expect(removed.body).toMatchObject({
      harness_id: ws.scout.participantId,
      already_removed: false,
      tokens_revoked: 1,
      homes: [],
    });
    expect(removed.body["event_id"]).toMatch(/^evt_/);

    // Its token speaks for nobody from here.
    expect((await directory(ws.scout.headers)).status).toBe(401);

    // Its name still resolves, marked, so a room's history reads as it did.
    const listed = await directory(ws.arjun.sign("GET", "/v1/participants", ""));
    expect(listed.participants.find((each) => each["id"] === ws.scout.participantId)).toMatchObject(
      { display_name: "Scout", removed_at: removed.body["removed_at"] },
    );
    expect(
      listed.participants.find((each) => each["id"] === ws.arjun.participantId)?.["removed_at"],
    ).toBeNull();

    const page = await ws.gateway.deps.store.since(ws.workspaceId, 0, 100);
    const line = page.events.at(-1);
    expect(line?.type).toBe("harness.removed");
    expect(line?.actor).toEqual({ kind: "person", id: ws.arjun.participantId });
    expect(line?.payload).toMatchObject({
      harness_id: ws.scout.participantId,
      display_name: "Scout",
    });
  });

  it("refuses a token of a removed harness that somehow outlived the removal", async () => {
    expect((await remove(ws.scout.participantId, ws.arjun)).status).toBe(200);
    // As if the revoke had never landed: the row is live again, and the harness is still gone.
    await ws.db
      .updateTable("harness_tokens")
      .set({ revoked_at: null })
      .where("harness_id", "=", ws.scout.participantId)
      .execute();
    const attempt = await ws.gateway.deps.authenticator.authenticate({
      authorization: `Bearer ${ws.scout.token}`,
      method: "GET",
      target: "/v1/participants",
      body: "",
    });
    expect(attempt).toEqual({ ok: false, reason: "removed_harness" });
    expect((await directory(ws.scout.headers)).status).toBe(401);
  });

  it("answers a second removal as the first did, and records it once", async () => {
    const first = await remove(ws.scout.participantId, ws.arjun);
    const second = await remove(ws.scout.participantId, ws.arjun);
    expect(second.status).toBe(200);
    expect(second.body).toMatchObject({
      already_removed: true,
      removed_at: first.body["removed_at"],
      tokens_revoked: 0,
    });
    expect(second.body["event_id"]).toBeUndefined();
    const page = await ws.gateway.deps.store.since(ws.workspaceId, 0, 100);
    expect(page.events.filter((each) => each.type === "harness.removed")).toHaveLength(1);
  });

  it("is its owner's or an admin's: not a member's, not a harness's, and nothing for nobody", async () => {
    expect((await remove(ws.scout.participantId, ws.dana)).status).toBe(403);
    expect((await remove(ws.scout.participantId, ws.scout.headers)).status).toBe(403);
    expect((await remove("hrn_01K4ZQPX00000000000000000Z", ws.arjun)).status).toBe(404);
    expect((await remove(ws.dana.participantId, ws.arjun)).status).toBe(404);
    // Nothing moved: Scout still speaks.
    expect((await directory(ws.scout.headers)).status).toBe(200);

    const admin = await ws.addPerson("Priya", "admin");
    expect((await remove(ws.scout.participantId, admin)).status).toBe(200);
  });

  it("leaves no way back in: no token, no room, no asking, no mention", async () => {
    const declared = JSON.stringify({ capabilities: ["new_spaces"] });
    const path = `/v1/harnesses/${ws.scout.participantId}`;
    await ws.gateway.app.fetch(
      new Request(`${BASE}${path}`, {
        method: "PATCH",
        headers: { "content-type": "application/json", ...ws.arjun.sign("PATCH", path, declared) },
        body: declared,
      }),
    );
    expect((await remove(ws.scout.participantId, ws.arjun)).status).toBe(200);

    const tokenPath = `/v1/harnesses/${ws.scout.participantId}/tokens`;
    const issued = await ws.gateway.app.fetch(
      new Request(`${BASE}${tokenPath}`, {
        method: "POST",
        headers: { "content-type": "application/json", ...ws.arjun.sign("POST", tokenPath, "") },
      }),
    );
    expect(issued.status).toBe(422);

    const room = ws.ids.next("space");
    const opened = await ws.gateway.deps.submitEvent({
      event: { type: "space.created", space_id: room, kind: "group", idempotency_key: "r" },
      principal: arjun(),
    });
    expect(opened.ok).toBe(true);
    const added = await ws.gateway.deps.submitEvent({
      event: {
        type: "membership.added",
        space_id: room,
        participant_id: ws.scout.participantId,
        idempotency_key: "add-scout",
      },
      principal: arjun(),
    });
    expect(added).toMatchObject({
      ok: false,
      error: { message: expect.stringMatching(/removed/) },
    });

    const asked = await ws.gateway.deps.submitEvent({
      event: {
        type: "space.created",
        space_id: ws.ids.next("space"),
        kind: "direct",
        asked_of: ws.scout.participantId,
        idempotency_key: "ask-scout",
      },
      principal: arjun(),
    });
    expect(asked).toMatchObject({
      ok: false,
      error: { message: expect.stringMatching(/removed/) },
    });

    // Still a member of the room it was in, for its history, and nobody a mention reaches.
    const said = await ws.gateway.deps.submitEvent({
      event: {
        type: "message.post",
        space_id: ws.spaceId,
        text: "@Scout are you there?",
        idempotency_key: "mention-scout",
      },
      principal: arjun(),
    });
    expect(said.ok && said.value.event.payload["mentions"]).toBeUndefined();
    // Nor is it anybody a message is for (ADR 0081).
    expect(said.ok && said.value.event.payload["addressed_to"]).toEqual([]);
  });

  it("stops its homes being homes, so a person may archive one, and a rebuild agrees", async () => {
    const harness = (path: string, body: Record<string, unknown>, key?: string) =>
      ws.gateway.app.fetch(
        new Request(`${BASE}/v1/harnesses/${ws.scout.participantId}/${path}`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            ...(key === undefined ? {} : { "idempotency-key": key }),
            ...ws.scout.headers,
          },
          body: JSON.stringify(body),
        }),
      );
    const opened = (await (await harness("spaces", { key: "global", title: "J" })).json()) as {
      space_id: string;
    };
    await harness("events", { type: "space.updated", space_id: opened.space_id, home: true }, "h");
    const home = () => ws.gateway.deps.readModels.space(ws.workspaceId, opened.space_id);
    expect(await home()).toMatchObject({ home: true });

    const removed = await remove(ws.scout.participantId, ws.arjun);
    expect(removed.body["homes"]).toEqual([opened.space_id]);
    expect(await home()).toMatchObject({ home: false });

    const archived = await ws.gateway.deps.submitEvent({
      event: {
        type: "space.updated",
        space_id: opened.space_id,
        state: "closed",
        idempotency_key: "arjun-archives-it",
      },
      principal: arjun(),
    });
    expect(archived.ok).toBe(true);

    await ws.gateway.deps.store.rebuild(ws.workspaceId);
    expect(await home()).toMatchObject({ home: false, state: "closed" });
  });
});

describe("a guest and a harness (ADR 0034)", () => {
  it("lets a guest of the workspace add none", async () => {
    const vendor = await ws.addPerson("Vendor", "guest");
    const body = JSON.stringify({ name: "Mine" });
    const response = await ws.gateway.app.fetch(
      new Request(`${BASE}/v1/harnesses`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...vendor.sign("POST", "/v1/harnesses", body),
        },
        body,
      }),
    );
    expect(response.status).toBe(403);
  });
});

describe("what a harness declares (ADR 0046)", () => {
  it("is carried to everyone who reads the directory, tools and the dial alike", async () => {
    const added = await addHarness("Ledger", { capabilities: ["ledger.read", "autonomy"] });
    expect(added.status).toBe(201);
    const { harness_id } = (await added.json()) as { harness_id: string };
    const directory = await ws.gateway.app.fetch(
      new Request(`${BASE}/v1/participants`, {
        headers: ws.arjun.sign("GET", "/v1/participants", ""),
      }),
    );
    const { participants } = (await directory.json()) as {
      participants: { id: string; capabilities: string[] | null }[];
    };
    expect(participants.find((each) => each.id === harness_id)?.capabilities).toEqual([
      "ledger.read",
      "autonomy",
    ]);
    // A harness registered with no list at all declares nothing, and says so as null.
    const quiet = (await (await addHarness("Quiet")).json()) as { harness_id: string };
    const again = (await (
      await ws.gateway.app.fetch(
        new Request(`${BASE}/v1/participants`, {
          headers: ws.arjun.sign("GET", "/v1/participants", ""),
        }),
      )
    ).json()) as { participants: { id: string; capabilities: string[] | null }[] };
    expect(
      again.participants.find((each) => each.id === quiet.harness_id)?.capabilities,
    ).toBeNull();
    // A person has none to declare.
    expect(participants.find((each) => each.id === ws.arjun.participantId)?.capabilities).toBe(
      null,
    );
  });
});

describe("a room a person asks a harness for", () => {
  const arjun = () => ({
    kind: "person" as const,
    participantId: ws.arjun.participantId,
    workspaceId: ws.workspaceId,
    displayName: "Arjun",
    via: "device_key" as const,
    role: "owner" as const,
  });

  /** What the phone sends on its first send: the room, asking Scout, Scout in it, the words. */
  async function ask(key: string, extra: Record<string, unknown> = {}) {
    const spaceId = ws.ids.next("space");
    const created = await ws.gateway.deps.submitEvent({
      event: {
        type: "space.created",
        space_id: spaceId,
        kind: "direct",
        asked_of: ws.scout.participantId,
        idempotency_key: `${key}-room`,
        ...extra,
      },
      principal: arjun(),
    });
    if (!created.ok) return { spaceId, created };
    for (const [event, suffix] of [
      {
        type: "membership.added",
        participant_id: ws.scout.participantId,
        participant_kind: "harness",
        role: "member",
      },
      { type: "message.post", text: "Plan the kitchen remodel: budget, contractors, dates." },
    ].map((each, index) => [each, `${key}-${index}`] as const)) {
      const sent = await ws.gateway.deps.submitEvent({
        event: { ...event, space_id: spaceId, idempotency_key: suffix },
        principal: arjun(),
      });
      expect(sent.ok).toBe(true);
    }
    return { spaceId, created };
  }

  async function declare(
    harnessId: string,
    capabilities: unknown,
    as: { sign: (m: string, t: string, b: string) => Record<string, string> } = ws.arjun,
  ): Promise<Response> {
    const path = `/v1/harnesses/${harnessId}`;
    const body = JSON.stringify({ capabilities });
    return await ws.gateway.app.fetch(
      new Request(`${BASE}${path}`, {
        method: "PATCH",
        headers: { "content-type": "application/json", ...as.sign("PATCH", path, body) },
        body,
      }),
    );
  }

  async function listed(): Promise<{ spaces: object[]; asked: object[] }> {
    const response = await ws.gateway.app.fetch(
      new Request(`${BASE}/v1/harnesses/${ws.scout.participantId}/spaces`, {
        headers: ws.scout.headers,
      }),
    );
    return (await response.json()) as { spaces: object[]; asked: object[] };
  }

  const takesNewSpaces = async () =>
    expect(
      (await declare(ws.scout.participantId, ["drive.read", "email.send", "new_spaces"])).status,
    ).toBe(200);

  it("is refused of a harness that has not said it takes new spaces, and taken once it says so", async () => {
    const early = await ask("too-early");
    expect(early.created).toMatchObject({
      ok: false,
      error: { kind: "invalid", message: expect.stringContaining("new_spaces") },
    });

    const declared = await declare(ws.scout.participantId, [
      "drive.read",
      "email.send",
      "new_spaces",
    ]);
    expect(await declared.json()).toEqual({
      harness_id: ws.scout.participantId,
      capabilities: ["drive.read", "email.send", "new_spaces"],
      previous: ["drive.read", "email.send"],
    });
    expect((await ask("in-time")).created.ok).toBe(true);
  });

  it("waits in the harness's listing until it is claimed, then is the harness's like any room it opened", async () => {
    await takesNewSpaces();
    const { spaceId } = await ask("kitchen");

    // The harness can read the ask: it is in the room, and the room says it was asked of it.
    const read = await ws.gateway.app.fetch(
      new Request(`${BASE}/v1/events?since=0&space_id=${spaceId}`, { headers: ws.scout.headers }),
    );
    const { events: all } = (await read.json()) as { events: Record<string, unknown>[] };
    const events = all.filter((each) => each["space_id"] === spaceId);
    expect(events.map((each) => each["type"])).toEqual([
      "space.created",
      "membership.added",
      "message.post",
    ]);
    expect(events[0]).toMatchObject({ asked_of: ws.scout.participantId });

    expect(await listed()).toEqual({
      spaces: [],
      asked: [
        {
          space_id: spaceId,
          asked_by: ws.arjun.participantId,
          title: null,
          state: "open",
          asked_at: expect.any(String),
        },
      ],
    });

    const claimed = await openSpace(ws.scout, {
      key: "e0d0f115",
      title: "Kitchen remodel",
      space_id: spaceId,
    });
    expect(claimed.status).toBe(200);
    expect(await claimed.json()).toEqual({
      space_id: spaceId,
      created: false,
      retitled: true,
      joined: false,
      claimed: true,
    });

    // Off the waiting list and on the harness's own, under its key and its name.
    expect(await listed()).toEqual({
      spaces: [
        {
          space_id: spaceId,
          key: "e0d0f115",
          shared: false,
          title: "Kitchen remodel",
          state: "open",
        },
      ],
      asked: [],
    });
    // Asking by the key alone finds it, which is what keeps an adapter from opening a second.
    const again = (await (await openSpace(ws.scout, { key: "e0d0f115" })).json()) as {
      space_id: string;
      created: boolean;
    };
    expect(again).toMatchObject({ space_id: spaceId, created: false });
    // A retry of the claim is harmless, and a claim under another key is not a second claim.
    expect(
      await (await openSpace(ws.scout, { key: "e0d0f115", space_id: spaceId })).json(),
    ).toMatchObject({ space_id: spaceId, claimed: false });
    const other = await openSpace(ws.scout, { key: "somewhere-else", space_id: spaceId });
    expect(other.status).toBe(422);

    // It is the harness's room now: it archives it through its own door, as it would its own.
    const closing = JSON.stringify({ type: "space.updated", space_id: spaceId, state: "closed" });
    const closed = await ws.gateway.app.fetch(
      new Request(`${BASE}/v1/harnesses/${ws.scout.participantId}/events`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "scout-archives-the-kitchen",
          ...ws.scout.headers,
        },
        body: closing,
      }),
    );
    expect(closed.status).toBe(201);
    expect(await ws.gateway.deps.readModels.space(ws.workspaceId, spaceId)).toMatchObject({
      external_key: `${ws.scout.participantId}:e0d0f115`,
      opened_by: ws.scout.participantId,
      title_by: "harness",
      asked_of: ws.scout.participantId,
    });

    // And the person who asked may erase it, as any room a harness keyed (ADR 0067); before
    // the claim it was a direct room nobody could open again, which is archived, not erased.
    const path = `/v1/spaces/${spaceId}`;
    const erased = await ws.gateway.app.fetch(
      new Request(`${BASE}${path}`, {
        method: "DELETE",
        headers: ws.arjun.sign("DELETE", path, ""),
      }),
    );
    expect(erased.status).toBe(200);
  });

  it("keeps a person's name for the room over the harness's", async () => {
    await takesNewSpaces();
    const { spaceId } = await ask("named", { title: "Our kitchen" });
    const claimed = await openSpace(ws.scout, {
      key: "kitchen",
      title: "Kitchen remodel",
      space_id: spaceId,
    });
    expect(await claimed.json()).toMatchObject({ claimed: true, retitled: false });
    expect(await ws.gateway.deps.readModels.space(ws.workspaceId, spaceId)).toMatchObject({
      title: "Our kitchen",
      title_by: "person",
    });
  });

  it("is claimed only by the harness asked, while it is in the room, under a key nothing else has", async () => {
    await takesNewSpaces();
    const { spaceId } = await ask("contested");

    // A room nobody asked Scout for: the workspace's group room.
    expect((await openSpace(ws.scout, { key: "grab", space_id: ws.spaceId })).status).toBe(403);
    // No such room.
    expect(
      (await openSpace(ws.scout, { key: "grab", space_id: ws.ids.next("space") })).status,
    ).toBe(404);
    // Another harness, even one that takes new spaces.
    const added = (await (await addHarness("Claw", { capabilities: ["new_spaces"] })).json()) as {
      harness_id: string;
      token: string;
    };
    const claw = {
      participantId: added.harness_id,
      headers: { authorization: `Bearer ${added.token}` },
    };
    expect((await openSpace(claw, { key: "grab", space_id: spaceId })).status).toBe(403);
    // A key that already has a room: the adapter is told which.
    const held = (await (await openSpace(ws.scout, { key: "taken" })).json()) as {
      space_id: string;
    };
    const clash = await openSpace(ws.scout, { key: "taken", space_id: spaceId });
    expect(clash.status).toBe(422);
    expect(((await clash.json()) as { error: { message: string } }).error.message).toContain(
      held.space_id,
    );
    // A worktree's shared key is not something a room asked for is claimed under.
    expect(
      (await openSpace(ws.scout, { key: "/tree", shared: true, space_id: spaceId })).status,
    ).toBe(422);

    // Taken out of the room before it claimed it: not listed, and not its to claim.
    const removed = await ws.gateway.deps.submitEvent({
      event: {
        type: "membership.removed",
        space_id: spaceId,
        participant_id: ws.scout.participantId,
        idempotency_key: "scout-out",
      },
      principal: arjun(),
    });
    expect(removed.ok).toBe(true);
    expect((await listed()).asked).toEqual([]);
    expect((await openSpace(ws.scout, { key: "late", space_id: spaceId })).status).toBe(403);
  });

  it("cannot be claimed by a person, nor written by anyone as an event", async () => {
    await takesNewSpaces();
    const { spaceId } = await ask("forged");
    const forged = await ws.gateway.deps.submitEvent({
      event: {
        type: "space.claimed",
        space_id: spaceId,
        external_key: `${ws.scout.participantId}:mine`,
        idempotency_key: "forged-claim",
      },
      principal: arjun(),
    });
    expect(forged).toMatchObject({ ok: false, error: { kind: "not_submittable" } });
  });
});

describe("PATCH /v1/harnesses/:id (ADR 0046)", () => {
  async function declare(
    harnessId: string,
    body: string,
    headers: Record<string, string>,
  ): Promise<Response> {
    return await ws.gateway.app.fetch(
      new Request(`${BASE}/v1/harnesses/${harnessId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json", ...headers },
        body,
      }),
    );
  }
  const signed = (as: typeof ws.arjun, harnessId: string, body: string) =>
    as.sign("PATCH", `/v1/harnesses/${harnessId}`, body);

  it("replaces the list whole, trimmed and each once, and the directory says so", async () => {
    const body = JSON.stringify({ capabilities: [" new_spaces", "new_spaces", "autonomy"] });
    const response = await declare(
      ws.scout.participantId,
      body,
      signed(ws.arjun, ws.scout.participantId, body),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ capabilities: ["new_spaces", "autonomy"] });
    const directory = (await (
      await ws.gateway.app.fetch(
        new Request(`${BASE}/v1/participants`, {
          headers: ws.arjun.sign("GET", "/v1/participants", ""),
        }),
      )
    ).json()) as { participants: { id: string; capabilities: string[] | null }[] };
    expect(
      directory.participants.find((each) => each.id === ws.scout.participantId)?.capabilities,
    ).toEqual(["new_spaces", "autonomy"]);
  });

  it("is its owner's: not another member's, not the harness's own, and not for nobody", async () => {
    const body = JSON.stringify({ capabilities: ["new_spaces"] });
    const id = ws.scout.participantId;
    expect((await declare(id, body, signed(ws.dana, id, body))).status).toBe(403);
    expect((await declare(id, body, ws.scout.headers)).status).toBe(403);
    const nobody = ws.ids.next("harness");
    expect((await declare(nobody, body, signed(ws.arjun, nobody, body))).status).toBe(404);
  });

  it("wants a list of names", async () => {
    const id = ws.scout.participantId;
    for (const body of [
      "{}",
      JSON.stringify({ capabilities: "new_spaces" }),
      JSON.stringify({ capabilities: [""] }),
      JSON.stringify({ capabilities: ["x".repeat(121)] }),
      JSON.stringify({ capabilities: Array.from({ length: 65 }, (_, index) => `tool.${index}`) }),
      "not json",
    ]) {
      expect((await declare(id, body, signed(ws.arjun, id, body))).status, body).toBe(422);
    }
  });
});
