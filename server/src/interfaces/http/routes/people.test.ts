/**
 * A person's own name (ADR 0082): changed by them and nobody else, to something that is nobody
 * else's here, written to the registry and recorded as `person.renamed`, and heard by the
 * harnesses that name people.
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

type Signer = { sign: TestWorkspace["arjun"]["sign"] };

async function rename(
  participantId: string,
  body: Record<string, unknown>,
  as: Signer | Record<string, string>,
): Promise<Response> {
  const path = `/v1/people/${participantId}/name`;
  const raw = JSON.stringify(body);
  const headers = "sign" in as ? (as as Signer).sign("POST", path, raw) : as;
  return await ws.gateway.app.fetch(
    new Request(`${BASE}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: raw,
    }),
  );
}

async function nameOf(participantId: string): Promise<string | undefined> {
  const row = await ws.db
    .selectFrom("participants")
    .select("display_name")
    .where("id", "=", participantId)
    .executeTakeFirst();
  return row?.display_name;
}

async function renames() {
  return await ws.db
    .selectFrom("events")
    .select(["payload", "actor_id"])
    .where("type", "=", "person.renamed")
    .execute();
}

describe("POST /v1/people/:id/name (ADR 0082)", () => {
  it("renames you, in the registry and the members row, and records it once", async () => {
    const response = await rename(
      ws.arjun.participantId,
      { display_name: "  Arjun   G " },
      ws.arjun,
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body).toMatchObject({
      participant_id: ws.arjun.participantId,
      display_name: "Arjun G",
      previous_name: "Arjun",
    });
    expect(body["event_id"]).toMatch(/^evt_/);
    expect(await nameOf(ws.arjun.participantId)).toBe("Arjun G");
    const member = await ws.db
      .selectFrom("workspace_members")
      .select("display_name")
      .where("participant_id", "=", ws.arjun.participantId)
      .executeTakeFirst();
    expect(member?.display_name).toBe("Arjun G");

    const logged = await renames();
    expect(logged).toHaveLength(1);
    expect(logged[0]?.actor_id).toBe(ws.arjun.participantId);
    expect(JSON.parse(String(logged[0]?.payload))).toMatchObject({
      participant_id: ws.arjun.participantId,
      display_name: "Arjun G",
      previous_name: "Arjun",
    });

    // The same name again changes nothing and records nothing.
    const again = await rename(ws.arjun.participantId, { display_name: "Arjun G" }, ws.arjun);
    expect(again.status).toBe(200);
    expect((await again.json()) as Record<string, unknown>).not.toHaveProperty("event_id");
    expect(await renames()).toHaveLength(1);
  });

  it("is yours alone: not an owner's for somebody else, and never a harness's", async () => {
    const forDana = await rename(ws.dana.participantId, { display_name: "Dee" }, ws.arjun);
    expect(forDana.status).toBe(403);
    const byScout = await rename(
      ws.arjun.participantId,
      { display_name: "Boss" },
      ws.scout.headers,
    );
    expect(byScout.status).toBe(403);
    expect(await nameOf(ws.dana.participantId)).toBe("Dana");
    expect(await renames()).toHaveLength(0);
  });

  it("refuses nothing, a paragraph, and a name somebody here goes by already", async () => {
    expect((await rename(ws.arjun.participantId, { display_name: "   " }, ws.arjun)).status).toBe(
      422,
    );
    expect(
      (await rename(ws.arjun.participantId, { display_name: "x".repeat(121) }, ws.arjun)).status,
    ).toBe(422);
    expect((await rename(ws.arjun.participantId, {}, ws.arjun)).status).toBe(422);
    const agent = await rename(ws.arjun.participantId, { display_name: "scout" }, ws.arjun);
    expect(agent.status).toBe(422);
    expect(((await agent.json()) as { error: { message: string } }).error.message).toBe(
      "An agent here goes by Scout already.",
    );
    const person = await rename(ws.arjun.participantId, { display_name: "Dana" }, ws.arjun);
    expect(person.status).toBe(422);
    expect(await nameOf(ws.arjun.participantId)).toBe("Arjun");
  });

  it("refuses a hidden character, mixed letters, and Dana in Cyrillic (SEC-33)", async () => {
    const said = async (display_name: string) => {
      const answer = await rename(ws.arjun.participantId, { display_name }, ws.arjun);
      return ((await answer.json()) as { error: { message: string } }).error.message;
    };
    expect(await said("\u202eArjun")).toMatch(/^A name can't have hidden characters in it/);
    expect(await said("Arj\u03c5n")).toMatch(/^A name can't mix Latin, Cyrillic and Greek/);
    // Dana with both its a's Cyrillic, beside a Latin D.
    expect(await said("D\u0430n\u0430")).toMatch(/^A name can't mix/);
    expect(await said("\uff24ana")).toBe("Somebody here goes by Dana already.");
    expect(await nameOf(ws.arjun.participantId)).toBe("Arjun");
    // A person may be called Main or You: only an agent may not.
    expect((await rename(ws.arjun.participantId, { display_name: "Main" }, ws.arjun)).status).toBe(
      200,
    );
  });

  it("is read back by the directory the apps draw names from", async () => {
    await rename(ws.arjun.participantId, { display_name: "AG" }, ws.arjun);
    const response = await ws.gateway.app.fetch(
      new Request(`${BASE}/v1/participants`, {
        headers: ws.arjun.sign("GET", "/v1/participants", ""),
      }),
    );
    const { participants } = (await response.json()) as {
      participants: { id: string; display_name: string }[];
    };
    expect(participants.find((each) => each.id === ws.arjun.participantId)?.display_name).toBe(
      "AG",
    );
  });
});
