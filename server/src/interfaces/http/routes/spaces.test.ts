/**
 * `DELETE /v1/spaces/:id` (ADR 0067): who may erase a room, what everybody is told, and what a
 * harness finds when it next asks for the room it had.
 */

import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestWorkspace, type TestWorkspace } from "../../../testing/workspace.js";

let ws: TestWorkspace;

beforeEach(async () => {
  ws = await createTestWorkspace();
});

afterEach(async () => {
  await ws.close();
});

async function call(
  method: string,
  path: string,
  headers: Record<string, string>,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const response = await ws.gateway.app.fetch(
    new Request(`http://chips.local${path}`, { method, headers }),
  );
  const text = await response.text();
  return { status: response.status, body: text === "" ? {} : JSON.parse(text) };
}

function erase(person: TestWorkspace["arjun"], spaceId: string) {
  const path = `/v1/spaces/${spaceId}`;
  return call("DELETE", path, person.sign("DELETE", path, ""));
}

/** A space opened by a person, with whoever else is named in it as a member. */
async function room(kind: "group" | "direct", fields: Record<string, unknown> = {}) {
  const spaceId = ws.ids.next("space");
  await ws.gateway.deps.store.append({
    v: 1,
    type: "space.created",
    id: ws.ids.next("event"),
    ts: "2026-09-22T20:00:00.000Z",
    workspace_id: ws.workspaceId,
    space_id: spaceId,
    actor: { kind: "person", id: ws.arjun.participantId },
    idempotency_key: `room-${spaceId}`,
    kind,
    ...fields,
  });
  return spaceId;
}

async function said(spaceId: string, text: string, extra: Record<string, unknown> = {}) {
  await ws.gateway.deps.store.append({
    v: 1,
    type: "message.post",
    id: ws.ids.next("event"),
    ts: "2026-09-22T20:01:00.000Z",
    workspace_id: ws.workspaceId,
    space_id: spaceId,
    actor: { kind: "person", id: ws.arjun.participantId },
    idempotency_key: `said-${ws.ids.next("event")}`,
    text,
    ...extra,
  });
}

describe("DELETE /v1/spaces/:id", () => {
  it("erases the room for everyone, and every device is told which", async () => {
    await said(ws.spaceId, "The quote is €4,200.");

    const erased = await erase(ws.arjun, ws.spaceId);

    expect(erased.status).toBe(200);
    expect(erased.body).toEqual({
      event_id: expect.stringMatching(/^evt_/),
      erased: [ws.spaceId],
      files: 0,
    });
    expect(await ws.gateway.deps.readModels.space(ws.workspaceId, ws.spaceId)).toBeUndefined();
    const left = await ws.db
      .selectFrom("events")
      .select("type")
      .where("space_id", "=", ws.spaceId)
      .execute();
    expect(left).toEqual([]);

    // Dana was in it: her replay has the line that says it went, and nothing of what was said.
    const path = "/v1/events?since=0";
    const replay = await call("GET", path, ws.dana.sign("GET", path, ""));
    const events = replay.body["events"] as { type: string; erased?: string[] }[];
    expect(events.filter((event) => event.type === "space.erased")).toEqual([
      expect.objectContaining({ erased: [ws.spaceId] }),
    ]);
    expect(JSON.stringify(events)).not.toContain("€4,200");
  });

  it("is the room's owner's, or a workspace owner's or admin's, and nobody else's", async () => {
    // Dana is a member of the room, not its owner.
    expect((await erase(ws.dana, ws.spaceId)).status).toBe(403);
    const vendor = await ws.addPerson("Vendor", "guest");
    expect((await erase(vendor, ws.spaceId)).status).toBe(403);
    const harness = await call("DELETE", `/v1/spaces/${ws.spaceId}`, ws.scout.headers);
    expect(harness.status).toBe(403);
    // An admin who is not in the room cannot see it, so cannot erase it either.
    const priya = await ws.addPerson("Priya", "admin");
    expect((await erase(priya, ws.spaceId)).status).toBe(404);

    expect(await ws.gateway.deps.readModels.space(ws.workspaceId, ws.spaceId)).toBeDefined();
  });

  it("will not erase a direct space nobody can open again, or a thread, and says why", async () => {
    const direct = await room("direct");
    const refused = await erase(ws.arjun, direct);
    expect(refused.status).toBe(422);
    expect((refused.body["error"] as { message: string }).message).toMatch(/archived/);

    const thread = await room("group", {
      parent_space_id: ws.spaceId,
      root_message_id: "msg_01K4ZQPX000000000000000001",
    });
    const refusedThread = await erase(ws.arjun, thread);
    expect(refusedThread.status).toBe(422);
    expect((refusedThread.body["error"] as { message: string }).message).toMatch(/thread/);
  });

  it("erases a room asked of a harness that never claimed it, which then has nothing to claim", async () => {
    const asked = await room("direct", { asked_of: ws.scout.participantId });
    await said(asked, "Plan the kitchen remodel");

    expect((await erase(ws.dana, asked)).status).toBe(404);
    const erased = await erase(ws.arjun, asked);

    expect(erased.status).toBe(200);
    expect(erased.body["erased"]).toEqual([asked]);
    // The harness, catching up late, finds no room by that id.
    const claim = await ws.gateway.app.fetch(
      new Request(`http://chips.local/v1/harnesses/${ws.scout.participantId}/spaces`, {
        method: "POST",
        headers: { "content-type": "application/json", ...ws.scout.headers },
        body: JSON.stringify({ key: "brief:late", title: "Kitchen remodel", space_id: asked }),
      }),
    );
    expect(claim.status).toBe(404);
  });

  it("will not erase a harness's home, nor let a person archive it (ADR 0069)", async () => {
    const harness = (path: string, body: Record<string, unknown>, key?: string) =>
      ws.gateway.app.fetch(
        new Request(`http://chips.local/v1/harnesses/${ws.scout.participantId}/${path}`, {
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
    const named = await harness(
      "events",
      { type: "space.updated", space_id: opened.space_id, home: true },
      "scout-home",
    );
    expect(named.status).toBeLessThan(300);
    expect(await ws.gateway.deps.readModels.space(ws.workspaceId, opened.space_id)).toMatchObject({
      home: true,
    });

    const refused = await erase(ws.arjun, opened.space_id);
    expect(refused.status).toBe(422);
    expect((refused.body["error"] as { message: string }).message).toMatch(/home/);

    const archived = await ws.gateway.deps.submitEvent({
      event: {
        type: "space.updated",
        space_id: opened.space_id,
        state: "closed",
        idempotency_key: "arjun-archives-j",
      },
      principal: {
        kind: "person",
        participantId: ws.arjun.participantId,
        workspaceId: ws.workspaceId,
        displayName: "Arjun",
        via: "device_key",
      },
    });
    expect(archived).toMatchObject({ ok: false, error: { kind: "invalid" } });
    expect(await ws.gateway.deps.readModels.space(ws.workspaceId, opened.space_id)).toMatchObject({
      state: "open",
    });
  });

  it("answers not_found for a room that is not there", async () => {
    expect((await erase(ws.arjun, "spc_01K4ZQPX00000000000000GONE")).status).toBe(404);
  });

  it("takes a file only the room had off the disk", async () => {
    const bytes = new TextEncoder().encode("a photo of the board");
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    await ws.gateway.deps.blobs.put(sha256, bytes);
    const attachmentId = ws.ids.next("attachment");
    await ws.db
      .insertInto("uploads")
      .values({
        id: attachmentId,
        workspace_id: ws.workspaceId,
        uploaded_by: ws.arjun.participantId,
        filename: "board.jpg",
        state: "stored",
        mime_type: "image/jpeg",
        byte_size: bytes.byteLength,
        sha256,
        width: null,
        height: null,
        duration_ms: null,
        thumbnail_sha256: null,
        thumbnail_mime_type: null,
        keep_metadata: 0,
        created_at: "2026-09-22T20:00:00.000Z",
        expires_at: "2026-09-23T20:00:00.000Z",
        stored_at: "2026-09-22T20:00:00.000Z",
        declared_bytes: null,
        playable_state: null,
        playable_how: null,
        playable_sha256: null,
        playable_mime_type: null,
        playable_note: null,
        transcript: null,
        view_sha256: null,
        view_mime_type: null,
      })
      .execute();
    await said(ws.spaceId, "The board.", {
      attachments: [
        {
          attachment_id: attachmentId,
          filename: "board.jpg",
          mime_type: "image/jpeg",
          byte_size: bytes.byteLength,
          sha256,
        },
      ],
    });

    const erased = await erase(ws.arjun, ws.spaceId);

    expect(erased.body["files"]).toBe(1);
    expect(await ws.gateway.deps.blobs.size(sha256)).toBeUndefined();
  });

  it("frees the harness's key: the next time it asks for the room, it gets a new one", async () => {
    const open = async () => {
      const response = await ws.gateway.app.fetch(
        new Request(`http://chips.local/v1/harnesses/${ws.scout.participantId}/spaces`, {
          method: "POST",
          headers: { "content-type": "application/json", ...ws.scout.headers },
          body: JSON.stringify({ key: "chess", title: "Chess Game" }),
        }),
      );
      return (await response.json()) as { space_id: string; created: boolean };
    };
    const first = await open();
    // Opened for Scout's owner, who is its owner.
    expect((await erase(ws.arjun, first.space_id)).status).toBe(200);

    const second = await open();

    expect(second.created).toBe(true);
    expect(second.space_id).not.toBe(first.space_id);
  });
});

describe("GET /v1/spaces/:id/context (ADR 0088)", () => {
  function read(spaceId: string, query = "", headers = ws.scout.headers) {
    return call("GET", `/v1/spaces/${spaceId}/context${query}`, headers);
  }

  type Page = {
    lines: { seq: number; kind: string; text?: string; from: { name: string } }[];
    since_seq: number;
    truncated: boolean;
    before: number;
  };

  it("reads a room's lines to a harness in it, newest last, a page at a time", async () => {
    for (const text of ["one", "two", "three", "four", "five"]) await said(ws.spaceId, text);

    const first = await read(ws.spaceId, "?limit=2");
    expect(first.status).toBe(200);
    const page = first.body as unknown as Page;
    expect(page.lines.map((line) => line.text)).toEqual(["four", "five"]);
    expect(page).toMatchObject({ since_seq: 0, truncated: true });

    const next = (await read(ws.spaceId, `?limit=2&before=${page.before}`)).body as unknown as Page;
    expect(next.lines.map((line) => line.text)).toEqual(["two", "three"]);

    // Further back, the room's first lines: who came into it when it was opened.
    const rest = (await read(ws.spaceId, `?limit=50&before=${next.before}`))
      .body as unknown as Page;
    expect(rest.lines.map((line) => line.kind)).toEqual(["joined", "joined", "joined", "said"]);
    expect(rest.truncated).toBe(false);
  });

  it("hands forty when asked for no number (ADR 0249), and two hundred at most", async () => {
    for (let at = 1; at <= 45; at += 1) await said(ws.spaceId, `line ${at}`);
    expect(((await read(ws.spaceId)).body as unknown as Page).lines).toHaveLength(40);
    expect(((await read(ws.spaceId, "?limit=900")).body as unknown as Page).lines).toHaveLength(48);
  });

  it("refuses a person, who reads the room itself", async () => {
    const path = `/v1/spaces/${ws.spaceId}/context`;
    expect((await read(ws.spaceId, "", ws.arjun.sign("GET", path, ""))).status).toBe(403);
  });

  it("knows no room the harness is not in", async () => {
    const elsewhere = await room("group");
    await said(elsewhere, "Not for Scout.");
    expect((await read(elsewhere)).status).toBe(404);
  });

  it("refuses a cursor that is not a whole number", async () => {
    expect((await read(ws.spaceId, "?before=soon")).status).toBe(400);
    expect((await read(ws.spaceId, "?limit=0")).status).toBe(400);
  });
});
