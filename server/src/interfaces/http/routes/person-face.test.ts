/**
 * A person's own face (ADR 0139): `PUT /v1/people/:id/face` gives them a mark or a letter or two
 * on a ground, one for everybody, and `DELETE` gives them their initials back. Theirs alone to
 * choose, a guest's too, and never a harness's. It is the log's: `person.face_set` carries it,
 * the directory says it, a rebuild keeps it, and a harness is not told.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createTestWorkspace,
  type TestPerson,
  type TestWorkspace,
} from "../../../testing/workspace.js";

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
  headers: Readonly<Record<string, string>>,
  body?: unknown,
): Promise<{ status: number; json: Record<string, unknown> }> {
  const raw = body === undefined ? undefined : JSON.stringify(body);
  const response = await ws.gateway.app.fetch(
    new Request(`http://chips.local${path}`, {
      method,
      headers: { "content-type": "application/json", ...headers },
      ...(raw === undefined ? {} : { body: raw }),
    }),
  );
  const text = await response.text();
  return { status: response.status, json: text === "" ? {} : JSON.parse(text) };
}

const path = (who: TestPerson) => `/v1/people/${who.participantId}/face`;

function put(who: TestPerson, face: unknown, whose = who) {
  return call("PUT", path(whose), who.sign("PUT", path(whose), JSON.stringify(face)), face);
}

function clear(who: TestPerson, whose = who) {
  return call("DELETE", path(whose), who.sign("DELETE", path(whose), ""));
}

/** A person's row as the directory hands it to another. */
async function listed(
  reader: TestPerson,
  id: string,
): Promise<Record<string, unknown> | undefined> {
  const answer = await call("GET", "/v1/participants", reader.sign("GET", "/v1/participants", ""));
  const all = answer.json["participants"] as Record<string, unknown>[];
  return all.find((each) => each["id"] === id);
}

async function faces(): Promise<Record<string, unknown>[]> {
  const page = await ws.gateway.deps.store.since(ws.workspaceId, 0, 1000);
  return page.events
    .filter((event) => event.type === "person.face_set")
    .map((event) => ({ actor: event.actor, ...event.payload }));
}

describe("a person's own face", () => {
  it("is nothing until chosen, then the same for everybody, and can be taken back", async () => {
    const dana = ws.dana.participantId;
    expect((await listed(ws.arjun, dana))?.["face"]).toBeNull();

    const face = { icon: "", ground: 4, letters: "DK" };
    const set = await put(ws.dana, face);
    expect(set.status).toBe(200);
    expect(set.json).toEqual({ participant_id: dana, face });
    expect((await listed(ws.arjun, dana))?.["face"]).toEqual(face);
    expect(await faces()).toEqual([
      expect.objectContaining({ actor: { kind: "person", id: dana }, participant_id: dana, face }),
    ]);

    expect((await clear(ws.dana)).status).toBe(204);
    expect((await listed(ws.arjun, dana))?.["face"]).toBeNull();
    expect((await faces()).at(-1)).toMatchObject({ participant_id: dana, face: null });
  });

  it("takes a mark, an emoji, or only a colour", async () => {
    for (const face of [
      { icon: "rocket", ground: 2 },
      { icon: "", ground: 7, letters: "🦊" },
      { icon: "", ground: 26 },
    ]) {
      expect((await put(ws.arjun, face)).status).toBe(200);
      expect((await listed(ws.dana, ws.arjun.participantId))?.["face"]).toEqual(face);
    }
  });

  it("records nothing for the face already worn", async () => {
    const face = { icon: "tent", ground: 21 };
    await put(ws.arjun, face);
    await put(ws.arjun, face);
    expect(await faces()).toHaveLength(1);
    await clear(ws.arjun);
    await clear(ws.arjun);
    expect(await faces()).toHaveLength(2);
  });

  it("is still there after a rebuild, and through a rename", async () => {
    const face = { icon: "", ground: 9, letters: "AG" };
    await put(ws.arjun, face);
    await ws.gateway.deps.store.rebuild(ws.workspaceId);
    expect((await listed(ws.dana, ws.arjun.participantId))?.["face"]).toEqual(face);

    const name = `/v1/people/${ws.arjun.participantId}/name`;
    const body = { display_name: "Arjun G" };
    await call("POST", name, ws.arjun.sign("POST", name, JSON.stringify(body)), body);
    expect(await listed(ws.dana, ws.arjun.participantId)).toMatchObject({
      display_name: "Arjun G",
      face,
    });
  });

  it("is a guest's to choose for themselves", async () => {
    const gus = await ws.addPerson("Gus", "guest");
    expect((await put(gus, { icon: "", ground: 1, letters: "G" })).status).toBe(200);
  });

  it("refuses somebody else's face, a harness, and a body that is not a face", async () => {
    expect((await put(ws.arjun, { icon: "cart", ground: 4 }, ws.dana)).status).toBe(403);
    expect((await clear(ws.arjun, ws.dana)).status).toBe(403);
    const scout = `/v1/people/${ws.arjun.participantId}/face`;
    expect((await call("PUT", scout, ws.scout.headers, { icon: "cart", ground: 4 })).status).toBe(
      403,
    );
    for (const bad of [
      { icon: "", ground: 4, letters: "ABC" },
      { icon: "", ground: 4, letters: "" },
      { icon: "cart", ground: 27 },
      { ground: 1 },
    ]) {
      expect((await put(ws.arjun, bad)).status).toBe(422);
    }
    expect(await faces()).toEqual([]);
  });

  it("is not sent to a harness when it reads the log", async () => {
    await put(ws.arjun, { icon: "", ground: 3, letters: "A" });
    const events = "/v1/events?since=0";
    const read = await call("GET", events, ws.scout.headers);
    const types = (read.json["events"] as { type: string }[]).map((each) => each.type);
    expect(types).not.toContain("person.face_set");
    const asDana = await call("GET", events, ws.dana.sign("GET", events, ""));
    expect((asDana.json["events"] as { type: string }[]).map((each) => each.type)).toContain(
      "person.face_set",
    );
  });
});
