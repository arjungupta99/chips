/**
 * A person taken out of the workspace (ADR 0160): by an owner or an admin, never an owner by an
 * admin, never yourself. Signed out everywhere at once, out of every room with a line in each,
 * their harnesses handed on, every way back in closed, and their name free for somebody new.
 */

import { generateKeyPairSync } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestWorkspace, type TestWorkspace } from "../../../testing/workspace.js";

let ws: TestWorkspace;
const BASE = "http://chips.local";

beforeEach(async () => {
  ws = await createTestWorkspace();
});
afterEach(async () => {
  await ws.close();
});

type Signer = Pick<TestWorkspace["arjun"], "sign">;

async function call(method: string, path: string, as?: Signer, body?: unknown) {
  const raw = body === undefined ? "" : JSON.stringify(body);
  return await ws.gateway.app.fetch(
    new Request(`${BASE}${path}`, {
      method,
      headers: {
        ...(body === undefined ? {} : { "content-type": "application/json" }),
        ...(as === undefined ? {} : as.sign(method, path, raw)),
      },
      ...(body === undefined ? {} : { body: raw }),
    }),
  );
}

const remove = (participantId: string, as: Signer) =>
  call("DELETE", `/v1/people/${participantId}`, as);

async function logged(type: string) {
  const rows = await ws.db
    .selectFrom("events")
    .select(["payload", "space_id", "actor_id"])
    .where("type", "=", type)
    .execute();
  return rows.map((row) => ({
    ...row,
    payload: JSON.parse(String(row.payload)) as Record<string, unknown>,
  }));
}

function aPublicKey(): string {
  return generateKeyPairSync("ed25519")
    .publicKey.export({ format: "der", type: "spki" })
    .toString("base64");
}

/** Scout starts a run and asks for something a person must allow. */
async function raiseAsk(): Promise<{ approvalId: string; runId: string }> {
  const runId = ws.ids.next("run");
  const approvalId = ws.ids.next("approval");
  const post = (key: string, body: unknown) =>
    ws.gateway.app.fetch(
      new Request(`${BASE}/v1/runs/${runId}/events`, {
        method: "POST",
        headers: {
          ...ws.scout.headers,
          "content-type": "application/json",
          "idempotency-key": key,
        },
        body: JSON.stringify(body),
      }),
    );
  await post(`run-${runId}`, { type: "run.started", space_id: ws.spaceId, goal: "Pay", plan: [] });
  await post(`ask-${approvalId}`, {
    type: "approval.request",
    space_id: ws.spaceId,
    approval_id: approvalId,
    action: { kind: "payment.transfer", money_usd: 500, external: true },
    risk: ["financial"],
    expires_in: 3600,
  });
  return { approvalId, runId };
}

/** Arjun hands an approval on to whoever is named, as his app would over its socket. */
async function handTo(ask: { approvalId: string; runId: string }, to: string[]): Promise<void> {
  const result = await ws.gateway.deps.submitEvent({
    principal: {
      kind: "person",
      participantId: ws.arjun.participantId,
      workspaceId: ws.workspaceId,
      displayName: "Arjun",
      role: "owner",
      via: "device_key",
      deviceId: ws.arjun.deviceId,
    },
    event: {
      type: "approval.routed",
      space_id: ws.spaceId,
      run_id: ask.runId,
      approval_id: ask.approvalId,
      to,
      idempotency_key: `hand-${ask.approvalId}`,
    },
  });
  expect(result.ok).toBe(true);
}

async function approversOf(approvalId: string): Promise<string[]> {
  const row = await ws.db
    .selectFrom("approvals")
    .select("approvers")
    .where("id", "=", approvalId)
    .executeTakeFirstOrThrow();
  return JSON.parse(String(row.approvers)) as string[];
}

describe("DELETE /v1/people/:id (ADR 0160)", () => {
  it("signs them out, takes them out of every room with a line, and records it", async () => {
    const response = await remove(ws.dana.participantId, ws.arjun);
    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body).toMatchObject({
      participant_id: ws.dana.participantId,
      already_removed: false,
      spaces: [ws.spaceId],
      devices_withdrawn: 1,
    });

    // Her next request is refused, and told why: only she, who signed it, hears it.
    const refused = await call("GET", "/v1/devices", ws.dana);
    expect(refused.status).toBe(401);
    expect(await refused.json()).toMatchObject({
      error: { code: "unauthorized", refusal: "person_removed" },
    });

    const [out] = await logged("membership.removed");
    expect(out).toMatchObject({
      space_id: ws.spaceId,
      actor_id: ws.arjun.participantId,
      payload: {
        participant_id: ws.dana.participantId,
        removed_by: ws.arjun.participantId,
        reason: "person_removed",
      },
    });
    const [record] = await logged("person.removed");
    expect(record?.payload).toMatchObject({
      participant_id: ws.dana.participantId,
      display_name: "Dana",
      removed_by: ws.arjun.participantId,
      spaces: [ws.spaceId],
    });

    // No standing, and no room: the role rules and the room's members agree.
    const member = await ws.db
      .selectFrom("workspace_members")
      .select("role")
      .where("participant_id", "=", ws.dana.participantId)
      .executeTakeFirst();
    expect(member).toBeUndefined();
    const inRoom = await ws.gateway.deps.readModels.isMember(
      ws.workspaceId,
      ws.spaceId,
      ws.dana.participantId,
    );
    expect(inRoom).toBe(false);
    // What she said keeps her name: the row stays, marked.
    const row = await ws.db
      .selectFrom("participants")
      .select(["display_name", "removed_at"])
      .where("id", "=", ws.dana.participantId)
      .executeTakeFirst();
    expect(row?.display_name).toBe("Dana");
    expect(row?.removed_at).not.toBeNull();
  });

  it("hands the harnesses they own to whoever removed them", async () => {
    const ada = await ws.addPerson("Ada", "admin");
    const ledger = ws.ids.next("harness");
    await ws.db
      .insertInto("participants")
      .values({
        id: ledger,
        workspace_id: ws.workspaceId,
        kind: "harness",
        display_name: "Ledger",
        owner_id: ada.participantId,
        parent_id: null,
        ephemeral: 0,
        capabilities: null,
        created_at: new Date().toISOString(),
      })
      .execute();

    const response = await remove(ada.participantId, ws.arjun);
    expect(await response.json()).toMatchObject({ harnesses: [ledger] });
    const owner = await ws.db
      .selectFrom("participants")
      .select("owner_id")
      .where("id", "=", ledger)
      .executeTakeFirst();
    expect(owner?.owner_id).toBe(ws.arjun.participantId);
    const [handed] = await logged("harness.transferred");
    expect(handed?.payload).toMatchObject({
      harness_id: ledger,
      from_owner_id: ada.participantId,
      to_owner_id: ws.arjun.participantId,
    });
  });

  it("closes every way back in: their invites, a code they hold, and a code made since", async () => {
    // An owner, since only an owner invites (ADR 0034's addendum of 14 October 2026).
    const ada = await ws.addPerson("Ada", "owner");
    const made = await call("POST", "/v1/invites", ada, { role: "member", single_use: true });
    expect(made.status).toBe(201);
    const { token } = (await made.json()) as { token: string };
    const codes = ws.gateway.deps.pairingCodes;
    if (codes === undefined) throw new Error("the test gateway issues codes");
    const held = codes.issue({ workspaceId: ws.workspaceId, participantId: ada.participantId });

    const response = await remove(ada.participantId, ws.arjun);
    expect(await response.json()).toMatchObject({ invites_withdrawn: 1 });

    // Withdrawn: the one answer every dead link gets (ADR 0034).
    const peek = await call("POST", "/v1/invites/peek", undefined, { token });
    expect(peek.status).toBe(401);
    const withHeld = await call("POST", "/v1/pair", undefined, {
      code: held.code,
      public_key: aPublicKey(),
    });
    expect(withHeld.status).toBe(401);
    // A code the registry would still have made: the door itself refuses her.
    const late = codes.issue({ workspaceId: ws.workspaceId, participantId: ada.participantId });
    const withLate = await call("POST", "/v1/pair", undefined, {
      code: late.code,
      public_key: aPublicKey(),
    });
    expect(withLate.status).toBe(401);
    expect(await withLate.json()).toMatchObject({
      error: { message: "That pairing code is not valid." },
    });
  });

  it("frees their name: a new invite makes a new person, who may take it", async () => {
    await remove(ws.dana.participantId, ws.arjun);
    const made = await call("POST", "/v1/invites", ws.arjun, { role: "member", single_use: true });
    const { token } = (await made.json()) as { token: string };
    const joined = await call("POST", "/v1/invites/redeem", undefined, {
      token,
      display_name: "Dana",
      public_key: aPublicKey(),
    });
    expect(joined.status).toBe(201);
    const body = (await joined.json()) as { participant_id: string };
    expect(body.participant_id).not.toBe(ws.dana.participantId);
  });

  it("records nothing the second time, and says when it was done", async () => {
    const first = (await (await remove(ws.dana.participantId, ws.arjun)).json()) as {
      removed_at: string;
    };
    const again = await remove(ws.dana.participantId, ws.arjun);
    expect(again.status).toBe(200);
    expect(await again.json()).toMatchObject({
      already_removed: true,
      removed_at: first.removed_at,
      spaces: [],
    });
    expect(await logged("person.removed")).toHaveLength(1);
  });

  it("hands an approval only they could answer to whoever removed them, and leaves a shared one", async () => {
    const alone = await raiseAsk();
    const shared = await raiseAsk();
    await handTo(alone, [ws.dana.participantId]);
    await handTo(shared, [ws.dana.participantId, ws.arjun.participantId]);

    const response = await remove(ws.dana.participantId, ws.arjun);
    expect(await response.json()).toMatchObject({ approvals: [alone.approvalId] });
    expect(await approversOf(alone.approvalId)).toEqual([ws.arjun.participantId]);
    expect(await approversOf(shared.approvalId)).toEqual([
      ws.dana.participantId,
      ws.arjun.participantId,
    ]);
    const routed = (await logged("approval.routed")).map((row) => row.payload);
    expect(routed.at(-1)).toMatchObject({
      approval_id: alone.approvalId,
      routed_by: ws.arjun.participantId,
      reason: expect.stringContaining("was removed from the workspace"),
    });
  });

  it("is an owner's or an admin's, never on an owner by an admin, and never on yourself", async () => {
    const ada = await ws.addPerson("Ada", "admin");
    const byMember = await remove(ada.participantId, ws.dana);
    expect(byMember.status).toBe(403);
    const onOwner = await remove(ws.arjun.participantId, ada);
    expect(onOwner.status).toBe(403);
    expect(await onOwner.json()).toMatchObject({
      error: { message: "An admin does not remove an owner." },
    });
    const yourself = await remove(ws.arjun.participantId, ws.arjun);
    expect(yourself.status).toBe(403);
    const aHarness = await remove(ws.scout.participantId, ws.arjun);
    expect(aHarness.status).toBe(404);
    // An admin removes a member.
    const byAdmin = await remove(ws.dana.participantId, ada);
    expect(byAdmin.status).toBe(200);
    expect(await logged("person.removed")).toHaveLength(1);
  });
});
