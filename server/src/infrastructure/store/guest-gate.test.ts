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

const asArjun = (event: Record<string, unknown>) =>
  ws.gateway.deps.submitEvent({
    event: { idempotency_key: ws.ids.next("event"), ...event },
    principal: arjun(),
  });

/** A room of Arjun's with the guest in it, archived when the trip ends. */
async function tripWith(guestId: string, title: string): Promise<string> {
  const id = ws.ids.next("space");
  expect((await asArjun({ type: "space.created", space_id: id, kind: "group", title })).ok).toBe(
    true,
  );
  const seated = await asArjun({
    type: "membership.added",
    space_id: id,
    participant_id: guestId,
    participant_kind: "person",
    role: "guest",
  });
  expect(seated.ok, JSON.stringify(seated)).toBe(true);
  expect((await asArjun({ type: "space.updated", space_id: id, state: "closed" })).ok).toBe(true);
  return id;
}

describe("a guest is in one open room, whoever unarchives (SEC-48, JR-24)", () => {
  it("unarchives one of two rooms that share a guest when both are asked at once", async () => {
    const vendor = await ws.addPerson("Vendor", "guest");
    const first = await tripWith(vendor.participantId, "Lisbon");
    const second = await tripWith(vendor.participantId, "Porto");
    const both = await Promise.all(
      [first, second].map((id) => asArjun({ type: "space.updated", space_id: id, state: "open" })),
    );
    expect(both.filter((each) => each.ok)).toHaveLength(1);
    expect(both.find((each) => !each.ok)).toMatchObject({
      ok: false,
      error: { kind: "guest_elsewhere", message: expect.stringMatching(/^Vendor is a guest/) },
    });
    expect(
      await ws.gateway.deps.readModels.spaceCountFor(ws.workspaceId, vendor.participantId),
    ).toBe(1);
  });
});
