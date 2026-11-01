/**
 * Handing a harness to another person (M5.2): by its owner or by somebody who runs the
 * workspace, to a person here who is not a guest; the registry moves and the log says so.
 */

import { manualClock } from "@chipschat/platform";
import { createIdGenerator } from "@chipschat/protocol";
import { describe, expect, it } from "vitest";
import type { Principal } from "../ports/identity.js";
import type { EventStore, IncomingEvent, ParticipantView, StoredEvent } from "../ports/index.js";
import { createTransferHarness } from "./transfer-harness.js";

const WS = "ws_01K4ZQPX000000000000000001";
const ARJUN = "usr_01K4ZQPX000000000000000003";
const DANA = "usr_01K4ZQPX000000000000000009";
const VENDOR = "usr_01K4ZQPX00000000000000000C";
const SCOUT = "hrn_01K4ZQPX000000000000000004";

const PEOPLE: Record<string, ParticipantView> = {
  [ARJUN]: {
    id: ARJUN,
    kind: "person",
    display_name: "Arjun",
    owner_id: null,
    role: "owner",
    capabilities: null,
    removed_at: null,
    last_seen_at: null,
  },
  [DANA]: {
    id: DANA,
    kind: "person",
    display_name: "Dana",
    owner_id: null,
    role: "member",
    capabilities: null,
    removed_at: null,
    last_seen_at: null,
  },
  [VENDOR]: {
    id: VENDOR,
    kind: "person",
    display_name: "Vendor",
    owner_id: null,
    role: "guest",
    capabilities: null,
    removed_at: null,
    last_seen_at: null,
  },
  [SCOUT]: {
    id: SCOUT,
    kind: "harness",
    display_name: "Scout",
    owner_id: ARJUN,
    role: null,
    capabilities: null,
    removed_at: null,
    last_seen_at: null,
  },
};

const as = (id: string, role: "owner" | "admin" | "member" | "guest"): Principal => ({
  kind: "person",
  participantId: id,
  workspaceId: WS,
  displayName: PEOPLE[id]?.display_name ?? id,
  via: "device_key",
  role,
});

function harness() {
  const owners = new Map<string, string>([[SCOUT, ARJUN]]);
  const appended: IncomingEvent[] = [];
  const store: EventStore = {
    async append(event) {
      appended.push(event);
      const stored: StoredEvent = {
        seq: appended.length,
        workspace_id: event.workspace_id,
        id: event.id,
        type: event.type,
        ts: event.ts,
        space_id: null,
        run_id: null,
        actor: event.actor,
        idempotency_key: (event["idempotency_key"] as string | undefined) ?? null,
        payload: { ...event, seq: appended.length },
      };
      return { event: stored, duplicate: false };
    },
    async since() {
      return { events: [], nextCursor: null };
    },
    async head() {
      return 0;
    },
    async rebuild() {
      return { replayed: 0 };
    },
    async erase() {
      throw new Error("not used here");
    },
  };
  const clock = manualClock(1_757_100_000_000);
  const transfer = createTransferHarness({
    registry: {
      async setOwner({ harnessId, ownerId }) {
        if (!owners.has(harnessId)) return false;
        owners.set(harnessId, ownerId);
        return true;
      },
    },
    store,
    readModels: {
      async participant(_ws, id) {
        const person = PEOPLE[id];
        if (person === undefined) return undefined;
        return person.kind === "harness" ? { ...person, owner_id: owners.get(id) ?? null } : person;
      },
    },
    clock,
    ids: createIdGenerator({ now: () => clock.nowMs(), randomFill: (b) => b.fill(5) }),
  });
  return { transfer, owners, appended };
}

describe("handing a harness on", () => {
  it("moves the registry and records harness.transferred, for its owner", async () => {
    const { transfer, owners, appended } = harness();
    const result = await transfer({
      principal: as(ARJUN, "owner"),
      harnessId: SCOUT,
      ownerId: DANA,
      reason: "Dana runs it now.",
    });
    expect(result.ok, JSON.stringify(result)).toBe(true);
    if (!result.ok) return;
    expect(result.value).toMatchObject({ harnessId: SCOUT, fromOwnerId: ARJUN, toOwnerId: DANA });
    expect(owners.get(SCOUT)).toBe(DANA);
    expect(appended[0]).toMatchObject({
      type: "harness.transferred",
      actor: { kind: "person", id: ARJUN },
      harness_id: SCOUT,
      from_owner_id: ARJUN,
      to_owner_id: DANA,
      reason: "Dana runs it now.",
    });
  });

  it("is an admin's too, and not a member's who does not own it", async () => {
    const { transfer } = harness();
    const byMember = await transfer({
      principal: as(DANA, "member"),
      harnessId: SCOUT,
      ownerId: DANA,
    });
    expect(byMember.ok).toBe(false);
    if (!byMember.ok) expect(byMember.error.kind).toBe("not_the_owner");
    const byAdmin = await transfer({
      principal: as(DANA, "admin"),
      harnessId: SCOUT,
      ownerId: DANA,
    });
    expect(byAdmin.ok).toBe(true);
  });

  it("goes to a person here who is not a guest, and not to who has it", async () => {
    const { transfer, appended } = harness();
    const nobody = await transfer({
      principal: as(ARJUN, "owner"),
      harnessId: SCOUT,
      ownerId: "usr_01K4ZQPX00000000000000000Z",
    });
    expect(nobody.ok).toBe(false);
    if (!nobody.ok) expect(nobody.error.kind).toBe("unknown_person");
    const toHarness = await transfer({
      principal: as(ARJUN, "owner"),
      harnessId: SCOUT,
      ownerId: SCOUT,
    });
    expect(toHarness.ok).toBe(false);
    const toGuest = await transfer({
      principal: as(ARJUN, "owner"),
      harnessId: SCOUT,
      ownerId: VENDOR,
    });
    expect(toGuest.ok).toBe(false);
    if (!toGuest.ok) expect(toGuest.error.message).toMatch(/guest/);
    const same = await transfer({
      principal: as(ARJUN, "owner"),
      harnessId: SCOUT,
      ownerId: ARJUN,
    });
    expect(same.ok).toBe(false);
    if (!same.ok) expect(same.error.message).toMatch(/owns it already/);
    const notAHarness = await transfer({
      principal: as(ARJUN, "owner"),
      harnessId: DANA,
      ownerId: ARJUN,
    });
    expect(notAHarness.ok).toBe(false);
    if (!notAHarness.ok) expect(notAHarness.error.kind).toBe("unknown_harness");
    expect(appended).toEqual([]);
  });
});
