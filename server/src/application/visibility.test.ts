import { describe, expect, it } from "vitest";
import type { StoredEvent } from "./ports/event-store.js";
import { canSee, namesApprover, namesViewer, opensFor, type Viewer } from "./visibility.js";

function event(overrides: Partial<StoredEvent> = {}): StoredEvent {
  return {
    seq: 1,
    workspace_id: "ws_1",
    id: "evt_1",
    type: "message.post",
    ts: "2026-09-02T14:00:00.000Z",
    space_id: "spc_1",
    run_id: null,
    actor: { kind: "person", id: "usr_2" },
    idempotency_key: null,
    payload: {},
    ...overrides,
  };
}

const VIEWER: Viewer = { participantId: "usr_1", memberSpaces: new Set(["spc_1"]) };

describe("canSee", () => {
  it("shows a member their space's events", () => {
    expect(canSee(event({ space_id: "spc_1" }), VIEWER)).toBe(true);
  });

  it("hides a space the viewer is not in", () => {
    expect(canSee(event({ space_id: "spc_9" }), VIEWER)).toBe(false);
  });

  it("shows everyone the workspace-wide events that belong to no space", () => {
    expect(canSee(event({ space_id: null, type: "budget.warning" }), VIEWER)).toBe(true);
  });

  it("keeps what an agent said in no room to its own harness (ADR 0087)", () => {
    const held = event({ space_id: null, type: "message.held", payload: { agent_id: "agt_1" } });
    expect(canSee(held, VIEWER)).toBe(false);
    expect(canSee(held, { participantId: "hrn_2", memberSpaces: new Set() })).toBe(false);
    expect(
      canSee(held, { participantId: "hrn_1", memberSpaces: new Set(), alsoIs: new Set(["agt_1"]) }),
    ).toBe(true);
  });

  it("shows a viewer the event that adds them, before they are a member", () => {
    const stranger: Viewer = { participantId: "usr_1", memberSpaces: new Set() };
    const join = event({
      space_id: "spc_5",
      type: "membership.added",
      payload: { participant_id: "usr_1" },
    });
    expect(canSee(join, stranger)).toBe(true);
  });

  it("keeps a message deleted for oneself, and its Undo, to the person who did it (ADR 0167)", () => {
    for (const type of ["message.hidden", "message.shown"]) {
      const hidden = event({ type, actor: { kind: "person", id: "usr_2" } });
      // Usr_2's own devices are told; usr_1 is in the room and is not, and nor is a harness.
      expect(canSee(hidden, { participantId: "usr_2", memberSpaces: new Set(["spc_1"]) })).toBe(
        true,
      );
      expect(canSee(hidden, VIEWER)).toBe(false);
      expect(
        canSee(hidden, {
          participantId: "hrn_1",
          memberSpaces: new Set(["spc_1"]),
          alsoIs: new Set(["agt_1"]),
        }),
      ).toBe(false);
    }
  });

  it("does not show a viewer someone else being added to a space they are not in", () => {
    const stranger: Viewer = { participantId: "usr_1", memberSpaces: new Set() };
    const join = event({
      space_id: "spc_5",
      type: "membership.added",
      payload: { participant_id: "usr_2" },
    });
    expect(canSee(join, stranger)).toBe(false);
  });
});

describe("namesViewer", () => {
  it("is true only when the event's participant is the viewer", () => {
    expect(namesViewer(event({ payload: { participant_id: "usr_1" } }), "usr_1")).toBe(true);
    expect(namesViewer(event({ payload: { participant_id: "usr_2" } }), "usr_1")).toBe(false);
  });
});

describe("an agent made or changed (agents review, finding 3)", () => {
  const registered = event({
    space_id: null,
    type: "agent.registered",
    actor: { kind: "harness", id: "hrn_1" },
    payload: { agent_id: "agt_1", harness_id: "hrn_1", key: "custody-plan", name: "Custody plan" },
  });
  const renamed = event({
    space_id: null,
    type: "agent.updated",
    actor: { kind: "harness", id: "hrn_1" },
    payload: { agent_id: "agt_1", name: "Plan" },
  });

  it("is not everybody's, though it names no space", () => {
    const guest: Viewer = { participantId: "usr_9", memberSpaces: new Set(["spc_1"]) };
    const otherHarness: Viewer = { participantId: "hrn_2", memberSpaces: new Set() };
    for (const each of [registered, renamed]) {
      expect(canSee(each, guest)).toBe(false);
      expect(canSee(each, otherHarness)).toBe(false);
    }
  });

  it("is its harness's, by the harness named or by the agents it answers to", () => {
    const own: Viewer = { participantId: "hrn_1", memberSpaces: new Set() };
    expect(canSee(registered, own)).toBe(true);
    // A rename names the agent alone: the harness is known by the agents it speaks for.
    expect(canSee(renamed, own)).toBe(false);
    expect(canSee(renamed, { ...own, alsoIs: new Set(["agt_1"]) })).toBe(true);
  });

  it("is anybody's who is told every agent, and not a member's for being told every person", () => {
    const owner: Viewer = {
      participantId: "usr_1",
      memberSpaces: new Set(),
      seesDirectory: true,
      seesAgents: true,
    };
    expect(canSee(registered, owner)).toBe(true);
    expect(canSee(renamed, owner)).toBe(true);
    // A member is told who every person is, and the agents in their rooms, which the caller asks
    // (his call of 19 October 2026).
    const member: Viewer = { participantId: "usr_2", memberSpaces: new Set(), seesDirectory: true };
    expect(canSee(registered, member)).toBe(false);
    expect(canSee(renamed, member)).toBe(false);
  });

  it("tells a person's face to the people who see who everybody is, never a harness (ADR 0139)", () => {
    const faced = event({
      space_id: null,
      type: "person.face_set",
      payload: { participant_id: "usr_2", face: { icon: "", ground: 1, letters: "DK" } },
    });
    expect(
      canSee(faced, { participantId: "usr_1", memberSpaces: new Set(), seesDirectory: true }),
    ).toBe(true);
    expect(canSee(faced, { participantId: "hrn_1", memberSpaces: new Set(["spc_1"]) })).toBe(false);
    expect(canSee(faced, { participantId: "usr_9", memberSpaces: new Set(["spc_1"]) })).toBe(false);
  });

  it("tells an agent's lock to the people told every agent, never its harness (ADR 0199)", () => {
    const locked = event({
      space_id: null,
      type: "agent.lock_set",
      payload: { agent_id: "agt_1", locked: true },
    });
    expect(
      canSee(locked, { participantId: "usr_1", memberSpaces: new Set(), seesAgents: true }),
    ).toBe(true);
    // A member reads it the next time they read who is who.
    expect(
      canSee(locked, { participantId: "usr_2", memberSpaces: new Set(), seesDirectory: true }),
    ).toBe(false);
    // Not the harness that speaks as it, nor a guest in its room.
    expect(
      canSee(locked, {
        participantId: "hrn_1",
        alsoIs: new Set(["agt_1"]),
        memberSpaces: new Set(["spc_1"]),
      }),
    ).toBe(false);
    expect(canSee(locked, { participantId: "usr_9", memberSpaces: new Set(["spc_1"]) })).toBe(
      false,
    );
  });

  it("leaves every other event with no space to everybody", () => {
    const anyone: Viewer = { participantId: "usr_9", memberSpaces: new Set() };
    const erased = event({ space_id: null, type: "space.erased", payload: { erased: ["spc_1"] } });
    expect(canSee(erased, anyone)).toBe(true);
  });
});

describe("opensFor", () => {
  it("shows a viewer the space they opened, before any membership event", () => {
    const stranger: Viewer = { participantId: "usr_1", memberSpaces: new Set() };
    const opened = event({
      space_id: "spc_7",
      type: "space.created",
      actor: { kind: "person", id: "usr_1" },
    });
    expect(opensFor(opened, "usr_1")).toBe(true);
    expect(canSee(opened, stranger)).toBe(true);
  });

  it("shows a viewer a space a harness opened for them (ADR 0024)", () => {
    // A worktree becomes a space without anybody asking. Before this the person was not sent
    // the event that names it, so the space arrived from its membership onwards and showed in
    // the sidebar as a list of who was in it rather than as `repo · branch`.
    const stranger: Viewer = { participantId: "usr_1", memberSpaces: new Set() };
    const opened = event({
      space_id: "spc_7",
      type: "space.created",
      actor: { kind: "harness", id: "hrn_1" },
      payload: { kind: "direct", title: "Chips · main", opened_for: "usr_1" },
    });
    expect(opensFor(opened, "usr_1")).toBe(true);
    expect(canSee(opened, stranger)).toBe(true);
    // And not to anybody else it was not opened for.
    expect(opensFor(opened, "usr_2")).toBe(false);
  });

  it("shows a harness asked beside another the room, as the first asked is shown it", () => {
    // Agents review, finding 17: asked second from the +, it was sent nothing until its next
    // hello, so it never learnt the room was asked of it.
    const asked = event({
      space_id: "spc_7",
      type: "space.created",
      actor: { kind: "person", id: "usr_1" },
      payload: { kind: "group", asked_of: "hrn_1", also_asked_of: ["hrn_2", "hrn_3"] },
    });
    for (const harness of ["hrn_1", "hrn_2", "hrn_3"]) {
      expect(canSee(asked, { participantId: harness, memberSpaces: new Set() })).toBe(true);
    }
    expect(canSee(asked, { participantId: "hrn_4", memberSpaces: new Set() })).toBe(false);
  });

  it("shows a harness the room a person asked it for, before it is added to it", () => {
    // The event that opens the room comes before the membership that adds the harness, and it
    // is the one that says the room is the harness's to claim.
    const outside: Viewer = { participantId: "hrn_1", memberSpaces: new Set() };
    const asked = event({
      space_id: "spc_7",
      type: "space.created",
      actor: { kind: "person", id: "usr_1" },
      payload: { kind: "direct", asked_of: "hrn_1" },
    });
    expect(opensFor(asked, "hrn_1")).toBe(true);
    expect(canSee(asked, outside)).toBe(true);
    // Another harness in the workspace is not sent it.
    expect(canSee(asked, { participantId: "hrn_2", memberSpaces: new Set() })).toBe(false);
  });

  it("does not show a viewer a space somebody else opened", () => {
    const stranger: Viewer = { participantId: "usr_1", memberSpaces: new Set() };
    const opened = event({
      space_id: "spc_7",
      type: "space.created",
      actor: { kind: "person", id: "usr_2" },
    });
    expect(opensFor(opened, "usr_1")).toBe(false);
    expect(canSee(opened, stranger)).toBe(false);
  });
});

describe("namesApprover (M5.5)", () => {
  it("shows a viewer an approval that names them, wherever it is, and no other", () => {
    const outside = { space_id: "spc_9", type: "approval.request" };
    expect(canSee(event({ ...outside, payload: { approvers: ["usr_1"] } }), VIEWER)).toBe(true);
    expect(canSee(event({ ...outside, payload: { approvers: ["usr_2"] } }), VIEWER)).toBe(false);
    expect(canSee(event({ ...outside, payload: {} }), VIEWER)).toBe(false);
    const handedOn = event({
      ...outside,
      type: "approval.routed",
      payload: { approvers: ["usr_1"] },
    });
    expect(namesApprover(handedOn, "usr_1")).toBe(true);
    expect(
      namesApprover(event({ type: "message.post", payload: { approvers: ["usr_1"] } }), "usr_1"),
    ).toBe(false);
  });

  it("shows them what came of it too, so the card they were sent cools (ADR 0042)", () => {
    const outside = { space_id: "spc_9", payload: { approvers: ["usr_1"] } };
    for (const type of ["approval.resolved", "approval.executed"]) {
      expect(canSee(event({ ...outside, type }), VIEWER), type).toBe(true);
      expect(
        canSee(event({ ...outside, type, payload: { approvers: ["usr_2"] } }), VIEWER),
        type,
      ).toBe(false);
      // Nothing else of that room reaches them: the ask and its answer, and no more.
      expect(canSee(event({ ...outside, type, payload: {} }), VIEWER), type).toBe(false);
    }
    expect(canSee(event({ ...outside, type: "message.post" }), VIEWER)).toBe(false);
    expect(canSee(event({ ...outside, type: "run.completed" }), VIEWER)).toBe(false);
  });
});
