/**
 * A person deletes their own account (ADR 0243): signed out everywhere, out of every room with a
 * line that says they left the workspace, their face gone, and what they owned and the asks only
 * they could answer handed to an owner. Anybody may, of themselves; an owner only while another
 * owner stays.
 */

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

const deleteAccount = (as: Signer) => call("DELETE", "/v1/people/me", as);

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

/** A harness of somebody's, as the registry holds one. */
async function harnessOf(ownerId: string, name: string): Promise<string> {
  const id = ws.ids.next("harness");
  await ws.db
    .insertInto("participants")
    .values({
      id,
      workspace_id: ws.workspaceId,
      kind: "harness",
      display_name: name,
      owner_id: ownerId,
      parent_id: null,
      ephemeral: 0,
      capabilities: null,
      created_at: new Date().toISOString(),
    })
    .execute();
  return id;
}

/** Scout asks for something only the people it is handed to may answer. */
async function askFor(to: string[]): Promise<string> {
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
  const handed = await ws.gateway.deps.submitEvent({
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
      run_id: runId,
      approval_id: approvalId,
      to,
      idempotency_key: `hand-${approvalId}`,
    },
  });
  expect(handed.ok).toBe(true);
  return approvalId;
}

describe("DELETE /v1/people/me (ADR 0243)", () => {
  it("signs a member out everywhere and takes them out of every room, saying they left", async () => {
    const response = await deleteAccount(ws.dana);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      participant_id: ws.dana.participantId,
      already_removed: false,
      spaces: [ws.spaceId],
      devices_withdrawn: 1,
    });

    const refused = await call("GET", "/v1/devices", ws.dana);
    expect(refused.status).toBe(401);
    expect(await refused.json()).toMatchObject({ error: { refusal: "person_removed" } });

    // Each room says she left the workspace, by her own hand: nobody removed her.
    const [out] = await logged("membership.removed");
    expect(out).toMatchObject({ space_id: ws.spaceId, actor_id: ws.dana.participantId });
    expect(out?.payload).toMatchObject({
      participant_id: ws.dana.participantId,
      reason: "person_left",
    });
    expect(out?.payload).not.toHaveProperty("removed_by");
    const [gone] = await logged("person.removed");
    expect(gone?.payload).toMatchObject({
      participant_id: ws.dana.participantId,
      display_name: "Dana",
      removed_by: ws.dana.participantId,
    });

    // Off the people list, and what she said keeps her name.
    const members = await ws.db
      .selectFrom("workspace_members")
      .select("participant_id")
      .where("participant_id", "=", ws.dana.participantId)
      .execute();
    expect(members).toEqual([]);
    const row = await ws.db
      .selectFrom("participants")
      .select(["display_name", "removed_at"])
      .where("id", "=", ws.dana.participantId)
      .executeTakeFirstOrThrow();
    expect(row.display_name).toBe("Dana");
    expect(row.removed_at).not.toBeNull();
  });

  it("takes her face away, so what she said shows her initials", async () => {
    const chose = await call("PUT", `/v1/people/${ws.dana.participantId}/face`, ws.dana, {
      icon: "",
      ground: 3,
      letters: "DK",
    });
    expect(chose.status).toBe(200);
    expect((await deleteAccount(ws.dana)).status).toBe(200);
    const faces = (await logged("person.face_set")).map((each) => each.payload["face"]);
    expect(faces.at(-1)).toBeNull();
    const row = await ws.db
      .selectFrom("participants")
      .select("face")
      .where("id", "=", ws.dana.participantId)
      .executeTakeFirstOrThrow();
    expect(row.face).toBeNull();
  });

  it("hands the harnesses she owns, and an ask only she could answer, to an owner", async () => {
    const ledger = await harnessOf(ws.dana.participantId, "Ledger");
    const alone = await askFor([ws.dana.participantId]);
    const response = await deleteAccount(ws.dana);
    expect(await response.json()).toMatchObject({ harnesses: [ledger], approvals: [alone] });

    const owner = await ws.db
      .selectFrom("participants")
      .select("owner_id")
      .where("id", "=", ledger)
      .executeTakeFirstOrThrow();
    expect(owner.owner_id).toBe(ws.arjun.participantId);
    const [handed] = await logged("harness.transferred");
    expect(handed?.payload).toMatchObject({
      harness_id: ledger,
      to_owner_id: ws.arjun.participantId,
      reason: "Its owner deleted their account.",
    });
    const routed = (await logged("approval.routed")).map((each) => each.payload).at(-1);
    expect(routed).toMatchObject({
      approval_id: alone,
      to: [ws.arjun.participantId],
      reason: "Dana deleted their account.",
    });
  });

  it("is anybody's of themselves, a guest's too, and never a harness's", async () => {
    const gus = await ws.addPerson("Gus", "guest");
    expect((await deleteAccount(gus)).status).toBe(200);
    const admin = await ws.addPerson("Ada", "admin");
    expect((await deleteAccount(admin)).status).toBe(200);
    const byHarness = await ws.gateway.app.fetch(
      new Request(`${BASE}/v1/people/me`, { method: "DELETE", headers: ws.scout.headers }),
    );
    expect(byHarness.status).toBe(403);
  });

  it("is refused to the only owner, and an owner's while another owner stays", async () => {
    const alone = await deleteAccount(ws.arjun);
    expect(alone.status).toBe(403);
    expect(await alone.json()).toMatchObject({
      error: { refusal: "only_owner", message: expect.stringContaining("chips uninstall") },
    });

    const ada = await ws.addPerson("Ada", "owner");
    expect((await deleteAccount(ws.arjun)).status).toBe(200);
    // Scout was Arjun's: it is the other owner's now.
    const scout = await ws.db
      .selectFrom("participants")
      .select("owner_id")
      .where("id", "=", ws.scout.participantId)
      .executeTakeFirstOrThrow();
    expect(scout.owner_id).toBe(ada.participantId);
  });
});
