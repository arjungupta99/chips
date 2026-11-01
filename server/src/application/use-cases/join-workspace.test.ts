/**
 * The one way a person enters a workspace (ADR 0034): the registry row, then `person.joined`
 * with their role — an owner when the workspace has none, a member otherwise, or the role an
 * invite carried.
 */

import { manualClock } from "@chipschat/platform";
import { createIdGenerator } from "@chipschat/protocol";
import { describe, expect, it } from "vitest";
import type { EventStore, IncomingEvent, ParticipantView, StoredEvent } from "../ports/index.js";
import type { NewPerson } from "../ports/people.js";
import { cleanDisplayName, createJoinWorkspace } from "./join-workspace.js";

const WS = "ws_01K4ZQPX000000000000000001";

function harness(owners = 0, everyone: readonly ParticipantView[] = []) {
  const people: NewPerson[] = [];
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
  const join = createJoinWorkspace({
    people: {
      async addPerson(person) {
        people.push(person);
      },
    },
    store,
    readModels: { ownerCount: async () => owners, participantsIn: async () => [...everyone] },
    clock,
    ids: createIdGenerator({ now: () => clock.nowMs(), randomFill: (b) => b.fill(2) }),
  });
  return { join, people, appended };
}

describe("joining a workspace", () => {
  it("makes the first person its owner: a registry row, then person.joined", async () => {
    const { join, people, appended } = harness(0);
    const joined = await join({ workspaceId: WS, displayName: "  Arjun  Gupta " });
    expect(joined.ok).toBe(true);
    if (!joined.ok) return;
    expect(joined.value).toMatchObject({ displayName: "Arjun Gupta", role: "owner" });
    expect(joined.value.participantId).toMatch(/^usr_/);

    expect(people).toEqual([
      {
        id: joined.value.participantId,
        workspaceId: WS,
        displayName: "Arjun Gupta",
        createdAt: joined.value.joinedAt,
      },
    ]);
    expect(appended).toHaveLength(1);
    expect(appended[0]).toMatchObject({
      type: "person.joined",
      workspace_id: WS,
      actor: { kind: "person", id: joined.value.participantId },
      idempotency_key: `joined-${joined.value.participantId}`,
      participant_id: joined.value.participantId,
      display_name: "Arjun Gupta",
      role: "owner",
    });
    expect(appended[0]).not.toHaveProperty("invite_id");
  });

  it("makes everyone after that a member, unless an invite said otherwise", async () => {
    const { join, appended } = harness(1);
    const member = await join({ workspaceId: WS, displayName: "Dana" });
    expect(member.ok && member.value.role).toBe("member");

    const invited = await join({
      workspaceId: WS,
      displayName: "Priya",
      role: "admin",
      invite: {
        inviteId: "inv_01K4ZQPX0000000000000000D1",
        invitedBy: "usr_01K4ZQPX000000000000000003",
      },
    });
    expect(invited.ok && invited.value.role).toBe("admin");
    expect(appended[1]).toMatchObject({
      role: "admin",
      invite_id: "inv_01K4ZQPX0000000000000000D1",
      invited_by: "usr_01K4ZQPX000000000000000003",
    });
  });

  it("refuses a name that is nothing, or a paragraph", async () => {
    const { join, people } = harness(1);
    expect((await join({ workspaceId: WS, displayName: "   " })).ok).toBe(false);
    expect((await join({ workspaceId: WS, displayName: "x".repeat(121) })).ok).toBe(false);
    expect(people).toEqual([]);
    expect(cleanDisplayName(" Dana ")).toBe("Dana");
    expect(cleanDisplayName("")).toBeUndefined();
  });

  it("refuses a hidden character and mixed letters, and says why (SEC-33)", async () => {
    const { join, people } = harness(1);
    const hidden = await join({ workspaceId: WS, displayName: "Pri\u200bya" });
    expect(hidden).toEqual({
      ok: false,
      error: { kind: "invalid", message: expect.stringMatching(/^A name can't have hidden/) },
    });
    const mixed = await join({ workspaceId: WS, displayName: "\u0420riya" });
    expect(mixed).toEqual({
      ok: false,
      error: { kind: "invalid", message: expect.stringMatching(/^A name can't mix/) },
    });
    expect(people).toEqual([]);
  });

  it("refuses a name somebody here goes by, case and spaces aside, and writes nothing (JR-1)", async () => {
    const priya = {
      id: "usr_01K4ZQPX000000000000000009",
      kind: "person",
      display_name: "Priya Nair",
      removed_at: null,
    } as ParticipantView;
    const { join, people, appended } = harness(1, [priya]);
    expect(await join({ workspaceId: WS, displayName: " priya  nair" })).toEqual({
      ok: false,
      error: { kind: "taken", message: "Somebody here goes by Priya Nair already." },
    });
    expect(people).toEqual([]);
    expect(appended).toEqual([]);
  });
});
