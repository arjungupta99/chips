/**
 * Removing a harness (ADR 0078): by its owner or by somebody who runs the workspace. The registry
 * marks it, every live token is withdrawn and the sockets each holds are closed, and the log says
 * so once, naming the rooms that stop being its homes. The route's test runs the same thing
 * against a real database; this one watches the order and the counts.
 */

import { manualClock } from "@chipschat/platform";
import { createIdGenerator } from "@chipschat/protocol";
import { describe, expect, it } from "vitest";
import type { TokenView } from "../ports/harnesses.js";
import type { Principal } from "../ports/identity.js";
import type { EventStore, IncomingEvent, ParticipantView, StoredEvent } from "../ports/index.js";
import { createRemoveHarness } from "./remove-harness.js";

const WS = "ws_01K4ZQPX000000000000000001";
const ARJUN = "usr_01K4ZQPX000000000000000003";
const DANA = "usr_01K4ZQPX000000000000000009";
const SCOUT = "hrn_01K4ZQPX000000000000000004";
const HOME = "spc_01K4ZQPX000000000000000002";

const as = (id: string, role: "owner" | "admin" | "member"): Principal => ({
  kind: "person",
  participantId: id,
  workspaceId: WS,
  displayName: id,
  via: "device_key",
  role,
});

function harness() {
  const scout: { -readonly [K in keyof ParticipantView]: ParticipantView[K] } = {
    id: SCOUT,
    kind: "harness",
    display_name: "Scout",
    owner_id: ARJUN,
    role: null,
    capabilities: ["new_spaces"],
    removed_at: null,
    last_seen_at: null,
  };
  const tokens: TokenView[] = [
    { id: "tok_live1", name: "laptop", createdAt: "t", lastUsedAt: null, revokedAt: null },
    { id: "tok_live2", name: "mini", createdAt: "t", lastUsedAt: null, revokedAt: null },
    { id: "tok_old", name: "old", createdAt: "t", lastUsedAt: null, revokedAt: "before" },
  ];
  const closed: string[] = [];
  const appended: IncomingEvent[] = [];
  const store: Pick<EventStore, "append"> = {
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
  };
  const clock = manualClock(1_758_960_000_000);
  const remove = createRemoveHarness({
    registry: {
      async markRemoved({ at }) {
        if (scout.removed_at !== null) return false;
        scout.removed_at = at;
        return true;
      },
      async tokens() {
        return tokens.map((token) => ({ ...token }));
      },
      async revokeToken({ tokenId, at }) {
        const token = tokens.find((each) => each.id === tokenId);
        if (token === undefined || token.revokedAt !== null) return false;
        tokens[tokens.indexOf(token)] = { ...token, revokedAt: at };
        return true;
      },
    },
    sessions: {
      closeToken(tokenId) {
        closed.push(tokenId);
        // The laptop holds two sockets, the mini none.
        return tokenId === "tok_live1" ? 2 : 0;
      },
      closeDevice: () => 0,
      closePerson: () => 0,
      restart: () => 0,
      join: () => 0,
      askMacs: () => 0,
      macs: () => 0,
      whenMac: async () => 0,
      runState: () => 0,
      reads: () => 0,
      banners: () => 0,
      contextEdit: () => 0,
      hearingContext: () => 0,
      modelChange: () => 0,
      hearingModels: () => 0,
      heartbeatChange: () => 0,
      hearingHeartbeats: () => 0,
      windowCompact: () => 0,
      windowChange: () => 0,
      hearingWindows: () => 0,
      jobChange: () => 0,
      hearingJobs: () => 0,
    },
    store: store as EventStore,
    readModels: {
      async participant(_ws, id) {
        return id === SCOUT ? { ...scout } : undefined;
      },
      async homesOf() {
        return [HOME];
      },
    },
    clock,
    ids: createIdGenerator({ now: () => clock.nowMs(), randomFill: (b) => b.fill(6) }),
  });
  return { remove, scout, tokens, closed, appended };
}

describe("removing a harness", () => {
  it("marks it, withdraws every live token and closes their sockets, and says so once", async () => {
    const { remove, scout, tokens, closed, appended } = harness();
    const result = await remove({ principal: as(ARJUN, "owner"), harnessId: SCOUT });
    expect(result.ok, JSON.stringify(result)).toBe(true);
    if (!result.ok) return;
    expect(result.value).toMatchObject({
      harnessId: SCOUT,
      alreadyRemoved: false,
      tokensRevoked: 2,
      socketsClosed: 2,
      homes: [HOME],
    });
    expect(scout.removed_at).toBe(result.value.removedAt);
    expect(tokens.every((token) => token.revokedAt !== null)).toBe(true);
    // The token revoked before is not revoked again, and holds no socket to close.
    expect(closed).toEqual(["tok_live1", "tok_live2"]);
    expect(appended).toHaveLength(1);
    expect(appended[0]).toMatchObject({
      type: "harness.removed",
      actor: { kind: "person", id: ARJUN },
      idempotency_key: `remove-${SCOUT}`,
      harness_id: SCOUT,
      display_name: "Scout",
      homes: [HOME],
    });
    expect(result.value.eventId).toBe(appended[0]?.id);
  });

  it("answers a second removal with the first one's time, and writes nothing more", async () => {
    const { remove, appended } = harness();
    const first = await remove({ principal: as(ARJUN, "owner"), harnessId: SCOUT });
    const second = await remove({ principal: as(ARJUN, "owner"), harnessId: SCOUT });
    expect(second).toMatchObject({
      ok: true,
      value: { alreadyRemoved: true, tokensRevoked: 0, socketsClosed: 0, homes: [] },
    });
    if (!first.ok || !second.ok) return;
    expect(second.value.removedAt).toBe(first.value.removedAt);
    expect(second.value.eventId).toBeUndefined();
    expect(appended).toHaveLength(1);
  });

  it("is an admin's too, and not a member's who does not own it", async () => {
    const byDana = harness();
    expect(await byDana.remove({ principal: as(DANA, "member"), harnessId: SCOUT })).toMatchObject({
      ok: false,
      error: { kind: "not_the_owner" },
    });
    expect(byDana.scout.removed_at).toBeNull();
    expect(byDana.closed).toEqual([]);

    const byAdmin = harness();
    expect(await byAdmin.remove({ principal: as(DANA, "admin"), harnessId: SCOUT })).toMatchObject({
      ok: true,
    });
  });

  it("finds nothing to remove where there is no harness", async () => {
    const { remove } = harness();
    expect(await remove({ principal: as(ARJUN, "owner"), harnessId: DANA })).toMatchObject({
      ok: false,
      error: { kind: "unknown_harness" },
    });
  });
});
