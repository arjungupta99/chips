import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestWorkspace, type TestWorkspace } from "../../testing/workspace.js";

let ws: TestWorkspace;

beforeEach(async () => {
  ws = await createTestWorkspace();
});

afterEach(async () => {
  await ws.close();
});

const arjun = () => ({
  kind: "person" as const,
  participantId: ws.arjun.participantId,
  workspaceId: ws.workspaceId,
  displayName: "Arjun",
  via: "device_key" as const,
  role: "owner" as const,
});

const takeOut = (key: string) =>
  ws.gateway.deps.submitEvent({
    event: {
      type: "membership.removed",
      space_id: ws.spaceId,
      participant_id: ws.dana.participantId,
      idempotency_key: key,
    },
    principal: arjun(),
  });

async function removals(): Promise<number> {
  const rows = await ws.db
    .selectFrom("events")
    .select("seq")
    .where("workspace_id", "=", ws.workspaceId)
    .where("type", "=", "membership.removed")
    .execute();
  return rows.length;
}

describe("a person taken out of a room is in it (19 October 2026)", () => {
  it("takes Dana out once, answers the same ask again as itself, and refuses another", async () => {
    const first = await takeOut("take-dana-out-1");
    expect(first.ok, JSON.stringify(first)).toBe(true);
    // The same ask again, as a phone that resends after a dropped answer: the one in the log.
    const resent = await takeOut("take-dana-out-1");
    expect(resent.ok, JSON.stringify(resent)).toBe(true);
    // Asked afresh, as Arjun's phone asked twice more while it connected: she is out already.
    const again = await takeOut("take-dana-out-2");
    expect(again).toMatchObject({
      ok: false,
      error: { kind: "invalid", message: "they are not in this space any more" },
    });
    expect(await removals()).toBe(1);
  });

  it("refuses two at once but one", async () => {
    const both = await Promise.all([takeOut("at-once-1"), takeOut("at-once-2")]);
    expect(both.filter((each) => each.ok)).toHaveLength(1);
    expect(await removals()).toBe(1);
  });
});
