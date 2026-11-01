/**
 * `/v1/me/pins` (ADR 0040): which visit a person's messages in a space go to.
 *
 * Two properties are worth being strict about. A pin is checked against the space before it is
 * kept, because a pin nothing answers to would send messages where the person did not mean; and
 * a pin is the person's own, so Dana's is not Arjun's and neither can read the other's.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestWorkspace, type TestWorkspace } from "../../../testing/workspace.js";

let ws: TestWorkspace;

beforeEach(async () => {
  ws = await createTestWorkspace();
  await visit("scout:one");
  await visit("scout:two");
});

afterEach(async () => {
  await ws.close();
});

/** A visit to the workspace's space, as `session.started` would have projected one. */
async function visit(sessionRef: string, spaceId = ws.spaceId): Promise<void> {
  await ws.db
    .insertInto("sessions")
    .values({
      workspace_id: ws.workspaceId,
      session_ref: sessionRef,
      space_id: spaceId,
      harness_id: ws.scout.participantId,
      state: "live",
      started_at: "2026-09-07T09:00:00.000Z",
      last_event_seq: 1,
    })
    .execute();
}

async function call(
  method: string,
  path: string,
  person: TestWorkspace["arjun"],
  body?: unknown,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const raw = body === undefined ? "" : JSON.stringify(body);
  const response = await ws.gateway.app.fetch(
    new Request(`http://chips.local${path}`, {
      method,
      headers: { "content-type": "application/json", ...person.sign(method, path, raw) },
      ...(body === undefined ? {} : { body: raw }),
    }),
  );
  const text = await response.text();
  return { status: response.status, body: text === "" ? {} : JSON.parse(text) };
}

describe("a person's session pins", () => {
  it("are none until one is set, then are read back, and are let go again", async () => {
    const path = `/v1/me/pins/${ws.spaceId}`;
    expect((await call("GET", "/v1/me/pins", ws.arjun)).body["pins"]).toEqual([]);

    const pinned = await call("PUT", path, ws.arjun, { session_ref: "scout:one" });
    expect(pinned.status).toBe(200);
    expect((await call("GET", "/v1/me/pins", ws.arjun)).body["pins"]).toEqual([
      { space_id: ws.spaceId, session_ref: "scout:one" },
    ]);

    // Pinning again replaces rather than adding: one visit per person per space.
    await call("PUT", path, ws.arjun, { session_ref: "scout:two" });
    expect((await call("GET", "/v1/me/pins", ws.arjun)).body["pins"]).toEqual([
      { space_id: ws.spaceId, session_ref: "scout:two" },
    ]);

    expect((await call("DELETE", path, ws.arjun)).status).toBe(200);
    expect((await call("GET", "/v1/me/pins", ws.arjun)).body["pins"]).toEqual([]);
  });

  it("refuse a visit this space does not have", async () => {
    const refused = await call("PUT", `/v1/me/pins/${ws.spaceId}`, ws.arjun, {
      session_ref: "scout:elsewhere",
    });
    expect(refused.status).toBe(404);
    expect((await call("GET", "/v1/me/pins", ws.arjun)).body["pins"]).toEqual([]);
  });

  it("are one person's alone: Dana's pin is not Arjun's, and neither reads the other's", async () => {
    await call("PUT", `/v1/me/pins/${ws.spaceId}`, ws.arjun, { session_ref: "scout:one" });
    await call("PUT", `/v1/me/pins/${ws.spaceId}`, ws.dana, { session_ref: "scout:two" });

    expect((await call("GET", "/v1/me/pins", ws.arjun)).body["pins"]).toEqual([
      { space_id: ws.spaceId, session_ref: "scout:one" },
    ]);
    expect((await call("GET", "/v1/me/pins", ws.dana)).body["pins"]).toEqual([
      { space_id: ws.spaceId, session_ref: "scout:two" },
    ]);
  });

  it("refuse a body without a ref", async () => {
    const refused = await call("PUT", `/v1/me/pins/${ws.spaceId}`, ws.arjun, {});
    expect(refused.status).toBe(422);
  });
});
