/**
 * Who a message is for (ADR 0081) against a real database: the projection keeps each message's
 * `addressed_to` and `held`, where a person's last message went is one indexed read, and the
 * referee counts what harnesses said to harnesses since a person last acted (ADR 0097; the rest
 * of its reads are `exchange.test.ts`).
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { IncomingEvent } from "../../application/ports/index.js";
import { createTestWorkspace, type TestWorkspace } from "../../testing/workspace.js";

let ws: TestWorkspace;
let clock = 1_756_820_000_000;

beforeEach(async () => {
  ws = await createTestWorkspace();
});

afterEach(async () => {
  await ws.close();
});

const LEDGER = "hrn_01K4ZQPX00000000000000000M";

async function say(
  actor: { kind: "person" | "harness"; id: string },
  extra: Record<string, unknown> = {},
): Promise<void> {
  clock += 1000;
  await ws.gateway.deps.store.append({
    v: 1,
    type: "message.post",
    id: ws.ids.next("event"),
    ts: new Date(clock).toISOString(),
    workspace_id: ws.workspaceId,
    space_id: ws.spaceId,
    actor,
    idempotency_key: ws.ids.next("event"),
    text: "words",
    ...extra,
  } as IncomingEvent);
}

describe("where a person's last message went", () => {
  it("is their newest message that says, and nothing before one does", async () => {
    const models = ws.gateway.deps.readModels;
    const arjun = { kind: "person" as const, id: ws.arjun.participantId };
    expect(await models.lastAddressed(ws.workspaceId, ws.spaceId, arjun.id)).toBeUndefined();

    // A message from before Chips said who it is for says nothing.
    await say(arjun);
    expect(await models.lastAddressed(ws.workspaceId, ws.spaceId, arjun.id)).toBeUndefined();

    await say(arjun, { addressed_to: [ws.scout.participantId] });
    await say(arjun, { addressed_to: [LEDGER] });
    await say({ kind: "person", id: ws.dana.participantId }, { addressed_to: [] });
    expect(await models.lastAddressed(ws.workspaceId, ws.spaceId, arjun.id)).toEqual([LEDGER]);
    expect(await models.lastAddressed(ws.workspaceId, ws.spaceId, ws.dana.participantId)).toEqual(
      [],
    );

    // A message for everyone reads as everyone, not as the harnesses there were.
    await say(arjun, { addressed_to: [ws.scout.participantId], addressed_to_all: true });
    expect(await models.lastAddressed(ws.workspaceId, ws.spaceId, arjun.id)).toBe("all");
  });
});

describe("the referee's count", () => {
  it("counts what harnesses addressed to harnesses, or had held, since a person spoke", async () => {
    const models = ws.gateway.deps.readModels;
    const scout = { kind: "harness" as const, id: ws.scout.participantId };
    const ledger = { kind: "harness" as const, id: LEDGER };
    const count = async () => (await models.exchangeOf(ws.workspaceId, ws.spaceId)).count;
    expect(await count()).toBe(0);

    await say(scout, { addressed_to: [LEDGER] });
    await say(ledger, { addressed_to: [scout.id] });
    // Words for the people, and a message from before Chips said, count for nothing.
    await say(scout, { addressed_to: [] });
    await say(scout);
    await say(ledger, { addressed_to: [], held: true });
    expect(await count()).toBe(3);

    await say({ kind: "person", id: ws.arjun.participantId }, { addressed_to: [LEDGER] });
    expect(await count()).toBe(0);
    await say(ledger, { addressed_to: [scout.id] });
    expect(await count()).toBe(1);
  });
});

describe("the message row", () => {
  it("keeps who a message was for and whether it was held, and nothing for an old one", async () => {
    const db = ws.db;
    await say({ kind: "person", id: ws.arjun.participantId });
    await say({ kind: "harness", id: ws.scout.participantId }, { addressed_to: [], held: true });
    const rows = await db
      .selectFrom("messages")
      .select(["addressed_to", "held"])
      .where("space_id", "=", ws.spaceId)
      .where("type", "=", "text")
      .orderBy("seq", "asc")
      .execute();
    expect(rows.slice(-2)).toEqual([
      { addressed_to: null, held: null },
      { addressed_to: "[]", held: 1 },
    ]);
  });
});
