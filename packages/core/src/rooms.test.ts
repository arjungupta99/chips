/** One room per agent, as a room reads it (ADR 0087): who is here, who left, who may be added. */

import { describe, expect, it } from "vitest";
import { agentDoing } from "./agentsTab.js";
import type { ClientEvent, Directory } from "./events.js";
import { buildModel, type Space, type WorkspaceModel } from "./model.js";
import { archiveAsking, archiveManyAsking, eraseAsking, eraseManyAsking } from "./putAway.js";
import {
  addableAgents,
  awaitsAgents,
  leadOf,
  mayChooseLead,
  mayLock,
  mayMove,
  mayRemove,
  mayRemoveMember,
  mayRename,
  maySeeSpend,
  maySetSpend,
  noAgentNotice,
  roomAgents,
  roomName,
  spaceSubtitle,
  waitingIn,
  waitingRoomWords,
  whoIsHere,
  whyNotAdd,
  workspaceOwnerName,
} from "./rooms.js";

const ARJUN = "usr_01K4ZQPX0000000000000ARJUN";
const DANA = "usr_01K4ZQPX00000000000000DANA";
const JACOBIAN = "hrn_01K4ZQPX0000000000JACOBIAN";
const SHOPPING = "agt_01K4ZQPX0000000000SHOPPING";
const HELLO = "agt_01K4ZQPX000000000000HELLO";
const GARAGE = "agt_01K4ZQPX00000000000GARAGE";
const J = "agt_01K4ZQPX0000000000000000J";
const OLD = "agt_01K4ZQPX0000000000000OLD";
const ROOM = "spc_01K4ZQPX0000000000000ROOM";
const OTHER = "spc_01K4ZQPX000000000000OTHER";

const directory: Directory = {
  [ARJUN]: { id: ARJUN, kind: "person", displayName: "Arjun" },
  [DANA]: { id: DANA, kind: "person", displayName: "Dana" },
  [JACOBIAN]: {
    id: JACOBIAN,
    kind: "harness",
    displayName: "Jacobian",
    ownerId: ARJUN,
    capabilities: ["new_spaces", "follows_rooms", "agents"],
  },
  [SHOPPING]: {
    id: SHOPPING,
    kind: "agent",
    harnessId: JACOBIAN,
    displayName: "Shopping",
    room: OTHER,
  },
  [HELLO]: { id: HELLO, kind: "agent", harnessId: JACOBIAN, displayName: "Hello", room: ROOM },
  [GARAGE]: { id: GARAGE, kind: "agent", harnessId: JACOBIAN, displayName: "Garage", room: null },
  [J]: { id: J, kind: "agent", harnessId: JACOBIAN, displayName: "J", lead: true, room: "spc_j" },
  [OLD]: {
    id: OLD,
    kind: "agent",
    harnessId: JACOBIAN,
    displayName: "Old",
    archived: true,
    room: null,
  },
};

let seq = 0;
function event(type: string, fields: Record<string, unknown>, actor = ARJUN): ClientEvent {
  seq += 1;
  return {
    seq,
    type,
    id: `evt_${seq}`,
    ts: "2026-09-30T00:00:00.000Z",
    workspace_id: "ws_1",
    actor: { kind: actor.startsWith("usr_") ? "person" : "system", id: actor },
    ...fields,
  };
}

/** The workspace, its two rooms, and then what the test says, in that order. */
function built(then: () => ClientEvent[]): { model: WorkspaceModel; space: Space } {
  const base = [
    event("person.joined", { participant_id: ARJUN, display_name: "Arjun", role: "owner" }),
    event("person.joined", { participant_id: DANA, display_name: "Dana", role: "member" }),
    event("space.created", { space_id: OTHER, kind: "group", title: "Hello" }),
    event("space.created", { space_id: ROOM, kind: "group", title: "Shopping" }),
  ];
  const model = buildModel([...base, ...then()], { selfId: ARJUN });
  const space = model.spaces.find((each) => each.id === ROOM);
  if (space === undefined) throw new Error("no space");
  return { model, space };
}

const added = (agent: string, extra: Record<string, unknown> = {}) =>
  event("membership.added", {
    space_id: ROOM,
    participant_id: agent,
    participant_kind: "agent",
    role: "member",
    ...extra,
  });

describe("a room's agents", () => {
  it("says where an agent that moved away went, and the room says it has none", () => {
    const { model, space } = built(() => [
      added(SHOPPING),
      event("membership.removed", {
        space_id: ROOM,
        participant_id: SHOPPING,
        removed_by: ARJUN,
        reason: "moved",
        moved_to: OTHER,
      }),
    ]);
    expect(roomAgents(space, directory).here).toEqual([]);
    expect(space.lines.at(-1)).toMatchObject({
      kind: "system",
      authorId: SHOPPING,
      text: "moved to Hello",
    });
    expect(noAgentNotice(model, space, directory)).toEqual({
      title: "No agent in this space",
      body: "Shopping is in Hello. Messages here reach people only.",
      moveBack: SHOPPING,
    });
  });

  it("offers Move back for an agent that left and is in no room now", () => {
    const { model, space } = built(() => [
      added(GARAGE),
      event("membership.removed", {
        space_id: ROOM,
        participant_id: GARAGE,
        removed_by: ARJUN,
        reason: "moved",
        moved_to: OTHER,
      }),
    ]);
    expect(noAgentNotice(model, space, directory)).toEqual({
      title: "No agent in this space",
      body: "Garage isn't in a space now. Messages here reach people only.",
      moveBack: GARAGE,
    });
  });

  it("lists an agent an archive took out that went elsewhere, and forgets one that came back", () => {
    const { space } = built(() => [
      added(SHOPPING),
      added(HELLO),
      event("membership.removed", { space_id: ROOM, participant_id: SHOPPING, reason: "archived" }),
      event("membership.removed", { space_id: ROOM, participant_id: HELLO, reason: "archived" }),
      added(HELLO),
    ]);
    const agents = roomAgents(space, directory);
    expect(agents.here).toEqual([HELLO]);
    expect(agents.elsewhere).toEqual([{ agentId: SHOPPING, spaceId: OTHER }]);
    expect(agents.gone).toBeUndefined();
  });

  it("names an untitled room by the agents in it, as the list does", () => {
    const { model } = built(() => [
      event("space.created", { space_id: "spc_01K4ZQPX00000000000000DIRECT", kind: "direct" }),
      event("membership.added", {
        space_id: "spc_01K4ZQPX00000000000000DIRECT",
        participant_id: HELLO,
        participant_kind: "agent",
        role: "member",
      }),
    ]);
    expect(roomName(model, "spc_01K4ZQPX00000000000000DIRECT", directory)).toBe("Hello");
    expect(roomName(model, "spc_01K4ZQPX00000000000000DIRECT")).toBe("another space");
    expect(roomName(model, OTHER, directory)).toBe("Hello");
  });

  it("says a room moved into where the agent came from", () => {
    const { space } = built(() => [added(SHOPPING, { moved_from: OTHER })]);
    expect(space.lines.at(-1)).toMatchObject({ authorId: SHOPPING, text: "moved here from Hello" });
  });

  it("offers the free agents and the busy ones, never the Main agent or an archived one", () => {
    const { space } = built(() => [added(HELLO)]);
    const offered = addableAgents(space, directory);
    expect(offered.free.map((each) => each.name)).toEqual(["Garage"]);
    expect(offered.elsewhere.map((each) => [each.name, each.harness, each.room])).toEqual([
      ["Shopping", "Jacobian", OTHER],
    ]);
  });

  it("offers nothing but people in a Main room, whose lead it names", () => {
    const { space } = built(() => [
      added(J),
      event("space.updated", { space_id: ROOM, home: true }, JACOBIAN),
    ]);
    expect(addableAgents(space, directory)).toEqual({ free: [], elsewhere: [] });
    expect(leadOf(space, directory)).toBe(J);
  });

  it("offers no agent to an archived room, and says why an add would be refused", () => {
    const { space } = built(() => [
      added(HELLO),
      event("space.updated", { space_id: ROOM, state: "closed" }, ARJUN),
    ]);
    expect(addableAgents(space, directory)).toEqual({ free: [], elsewhere: [] });
    expect(whyNotAdd(space, directory, GARAGE)).toBe("This space is archived. Unarchive it first.");
    const open = built(() => [added(HELLO)]).space;
    expect(whyNotAdd(open, directory, GARAGE)).toBeUndefined();
    expect(whyNotAdd(open, directory, J)).toBe("J is a Main agent, and stays in its Main space.");
    expect(whyNotAdd(open, directory, OLD)).toBe(
      "Old is archived. Unarchive it first, from Agents.",
    );
    expect(whyNotAdd(open, directory, DANA)).toBeUndefined();
  });

  it("does not offer to take the Main agent out of its Main room", () => {
    const { space } = built(() => [
      added(J),
      event("space.updated", { space_id: ROOM, home: true }, JACOBIAN),
    ]);
    expect(mayRemove(space, directory, J)).toBe(false);
    expect(mayRemove(space, directory, DANA)).toBe(true);
    const plain = built(() => [added(HELLO)]).space;
    expect(mayRemove(plain, directory, HELLO)).toBe(true);
  });

  it("lets the harness's owner or an admin move an agent, and nobody the Main agent", () => {
    const { model } = built(() => []);
    expect(mayMove(model, directory, ARJUN, SHOPPING)).toBe(true);
    expect(mayMove(model, directory, DANA, SHOPPING)).toBe(false);
    expect(mayMove(model, directory, ARJUN, J)).toBe(false);
  });
});

describe("what the header and the sheet say of a room (ADR 0151)", () => {
  it("says who is here under the sheet's name, the reader as you", () => {
    expect(whoIsHere(built(() => []).space, directory)).toBe("No agents and you");
    expect(whoIsHere(built(() => [added(HELLO)]).space, directory)).toBe("1 agent and you");
    const crowd = built(() => [
      added(HELLO),
      added(GARAGE),
      event("membership.added", {
        space_id: ROOM,
        participant_id: DANA,
        participant_kind: "person",
        role: "member",
      }),
    ]).space;
    expect(whoIsHere(crowd, directory)).toBe("2 agents and 2 people");
  });

  it("names who does the work under the room's name, and nothing where the name says it", () => {
    expect(spaceSubtitle(built(() => [added(HELLO)]).space, directory)).toBe("Hello");
    // Shopping's room is called Shopping: its name has said it.
    expect(spaceSubtitle(built(() => [added(SHOPPING)]).space, directory)).toBeUndefined();
    expect(spaceSubtitle(built(() => []).space, directory)).toBeUndefined();
  });
});

describe("taking an agent out of a room (ADR 0111)", () => {
  const withDana = (role: string) =>
    built(() => [
      added(HELLO),
      event("membership.added", {
        space_id: ROOM,
        participant_id: DANA,
        participant_kind: "person",
        role,
      }),
    ]);
  const removed = (by?: string) =>
    event("membership.removed", {
      space_id: ROOM,
      participant_id: HELLO,
      reason: "removed",
      ...(by === undefined ? {} : { removed_by: by }),
    });

  it("lets the room's owner take an agent out, and a member nobody", () => {
    const { model, space } = withDana("member");
    expect(mayRemoveMember(space, directory, ARJUN, HELLO, model)).toBe(true);
    expect(mayRemoveMember(space, directory, ARJUN, DANA, model)).toBe(true);
    expect(mayRemoveMember(space, directory, DANA, HELLO, model)).toBe(false);
    // Not themselves, which is leaving; and nobody who is not in the room.
    expect(mayRemoveMember(space, directory, ARJUN, ARJUN, model)).toBe(false);
    expect(mayRemoveMember(space, directory, ARJUN, GARAGE, model)).toBe(false);
  });

  it("lets a workspace admin in the room take one out, but not as a guest", () => {
    const { model, space } = withDana("member");
    const dana = model.people[DANA];
    if (dana === undefined) throw new Error("no Dana");
    const admin: WorkspaceModel = {
      ...model,
      people: { ...model.people, [DANA]: { ...dana, role: "admin" } },
    };
    expect(mayRemoveMember(space, directory, DANA, HELLO, admin)).toBe(true);
    // But never an owner of the workspace, whom an owner alone takes out (JR-23); Arjun may take
    // the admin out.
    expect(mayRemoveMember(space, directory, DANA, ARJUN, admin)).toBe(false);
    expect(mayRemoveMember(space, directory, ARJUN, DANA, admin)).toBe(true);
    // Without the workspace to hand, only the room's owner.
    expect(mayRemoveMember(space, directory, DANA, HELLO)).toBe(false);
    const guest = withDana("guest").space;
    expect(mayRemoveMember(guest, directory, DANA, HELLO, admin)).toBe(false);
  });

  it("never offers the Main agent out of its Main room", () => {
    const { model, space } = built(() => [
      added(J),
      event("space.updated", { space_id: ROOM, home: true }, JACOBIAN),
    ]);
    expect(mayRemoveMember(space, directory, ARJUN, J, model)).toBe(false);
  });

  it("says in the room who took it out, and the notice says so too", () => {
    const { model, space } = built(() => [added(HELLO), removed(ARJUN)]);
    expect(space.lines.at(-1)).toMatchObject({
      kind: "system",
      authorId: HELLO,
      text: "was removed by Arjun",
    });
    // Free now, as the directory has it once the removal is in.
    const free: Directory = {
      ...directory,
      [HELLO]: { id: HELLO, kind: "agent", harnessId: JACOBIAN, displayName: "Hello", room: null },
    };
    expect(noAgentNotice(model, space, free)).toEqual({
      title: "No agent in this space",
      body: "Hello was removed by Arjun. Messages here reach people only.",
      moveBack: HELLO,
    });
  });

  it("says nothing for an agent nobody took out, as an upgrade's release", () => {
    const { space } = built(() => [added(HELLO), removed()]);
    expect(space.lines.some((line) => line.text.includes("removed"))).toBe(false);
  });
});

describe("who sets a job's spend and chooses the lead (ADR 0196)", () => {
  const withDana = (role: string) =>
    built(() => [
      added(HELLO),
      event("membership.added", {
        space_id: ROOM,
        participant_id: DANA,
        participant_kind: "person",
        role,
      }),
    ]);

  it("lets only the workspace's owner set what a job may spend, and anybody but a guest see it", () => {
    const { space, model } = withDana("member");
    expect(maySetSpend(space, model, ARJUN)).toBe(true);
    expect(maySetSpend(space, model, DANA)).toBe(false);
    expect(maySeeSpend(space, model, DANA)).toBe(true);
    const guest = withDana("guest");
    expect(maySeeSpend(guest.space, guest.model, DANA)).toBe(false);
    expect(maySetSpend(guest.space, guest.model, DANA)).toBe(false);
  });

  it("lets anybody in the room but a guest choose the lead", () => {
    const member = withDana("member");
    expect(mayChooseLead(member.space, member.model, DANA)).toBe(true);
    expect(mayChooseLead(member.space, member.model, ARJUN)).toBe(true);
    const guest = withDana("guest");
    expect(mayChooseLead(guest.space, guest.model, DANA)).toBe(false);
  });

  it("names the workspace's owner, who sets it", () => {
    const { model } = withDana("member");
    expect(workspaceOwnerName(model, directory)).toBe("Arjun");
  });
});

describe("renaming a room (ADR 0112)", () => {
  const withDana = (role: string) =>
    built(() => [
      added(HELLO),
      event("membership.added", {
        space_id: ROOM,
        participant_id: DANA,
        participant_kind: "person",
        role,
      }),
    ]).space;

  it("lets anybody in the room rename it but a guest, as the server does", () => {
    expect(mayRename(withDana("member"), ARJUN)).toBe(true);
    expect(mayRename(withDana("member"), DANA)).toBe(true);
    expect(mayRename(withDana("guest"), DANA)).toBe(false);
    // Nobody who is not in the room.
    expect(mayRename(built(() => [added(HELLO)]).space, DANA)).toBe(false);
  });

  it("lets nobody rename it while its changes are locked, and anybody but a guest lock them (ADR 0156)", () => {
    const lock = (locked: boolean) => event("space.lock_set", { space_id: ROOM, locked });
    const lockedRoom = built(() => [added(HELLO), lock(true)]);
    const locked = lockedRoom.space;
    expect(locked.locked).toBe(true);
    expect(mayRename(locked, ARJUN)).toBe(false);
    // The lock is still his to let go, and what a job may spend is still his to set.
    expect(mayLock(locked, ARJUN)).toBe(true);
    expect(maySetSpend(locked, lockedRoom.model, ARJUN)).toBe(true);
    expect(mayLock(withDana("guest"), DANA)).toBe(false);
    const again = built(() => [added(HELLO), lock(true), lock(false)]).space;
    expect(again.locked).toBeUndefined();
    expect(mayRename(again, ARJUN)).toBe(true);
    expect(locked.lines.at(-1)).toMatchObject({
      kind: "system",
      authorId: ARJUN,
      text: "locked changes to the space",
    });
    expect(again.lines.at(-1)?.text).toBe("unlocked changes to the space");
  });

  it("says in the room who renamed it", () => {
    const { space } = built(() => [
      added(HELLO),
      event("space.updated", { space_id: ROOM, title: "Kitchen" }),
    ]);
    expect(space.title).toBe("Kitchen");
    expect(space.lines.at(-1)).toMatchObject({
      kind: "system",
      authorId: ARJUN,
      text: "renamed this space to Kitchen",
    });
  });
});

describe("the sheets that ask first", () => {
  it("names the reply an archive stops and the agents it frees", () => {
    const { space } = built(() => [
      added(HELLO),
      added(SHOPPING),
      event("run.started", { space_id: ROOM, run_id: "run_1", goal: "Answer" }, SHOPPING),
    ]);
    const asking = archiveAsking(space, "Shopping", directory);
    expect(asking.body).toBe(
      "Shopping's reply will be stopped. Hello and Shopping will be free to join another space. Nothing said here is lost.",
    );
    expect(asking.note).toBe(
      "Unarchive brings them back, unless they're in another space by then.",
    );
  });

  it("promises to stop only a reply that is going now, not one left behind (finding 12)", () => {
    // Shopping's older run never ended; its newest is done. Nothing of Shopping's is going.
    const { space, model } = built(() => [
      added(HELLO),
      added(SHOPPING),
      event("run.started", { space_id: ROOM, run_id: "run_1", goal: "Left behind" }, SHOPPING),
      event("run.started", { space_id: ROOM, run_id: "run_2", goal: "Answer" }, SHOPPING),
      event("run.completed", { space_id: ROOM, run_id: "run_2", summary: "Done." }, SHOPPING),
    ]);
    expect(archiveAsking(space, "Shopping", directory).body).not.toContain("will be stopped");
    expect(agentDoing(model, SHOPPING, ROOM)).toBe("idle");
  });

  it("does not offer to delete an agent in a harness that is somebody else's (finding 4)", () => {
    const { space } = built(() => [added(HELLO)]);
    // Dana may delete the room, and owns neither Jacobian nor the workspace.
    const asking = eraseAsking(space, "Shopping", directory, DANA);
    expect(asking.agentToo).toBeUndefined();
    expect(asking.note).toBe("Hello will be free to join another space.");
  });

  it("offers to delete a room's one agent in its harness too", () => {
    const { space } = built(() => [added(HELLO)]);
    expect(eraseAsking(space, "Shopping", directory, ARJUN).agentToo).toEqual({
      agentId: HELLO,
      label: "Delete Hello in Jacobian too",
      on: "It's deleted in Jacobian as well.",
      off: "Hello stays in Jacobian, free to join another space.",
    });
    const two = built(() => [added(HELLO), added(SHOPPING)]).space;
    const asking = eraseAsking(two, "Shopping", directory, ARJUN);
    expect(asking.agentToo).toBeUndefined();
    expect(asking.note).toBe("Hello and Shopping will be free to join another space.");
  });
});

describe("the sheets that ask about several rooms at once (ADR 0181)", () => {
  it("stops the replies going in them and frees their agents", () => {
    const shopping = built(() => [
      added(HELLO),
      added(SHOPPING),
      event("run.started", { space_id: ROOM, run_id: "run_1", goal: "Answer" }, SHOPPING),
    ]).space;
    const hello = { ...built(() => []).space, id: OTHER, title: "Hello" };
    const asking = archiveManyAsking(
      [
        { space: shopping, name: "Shopping" },
        { space: hello, name: "Hello" },
      ],
      directory,
    );
    expect(asking.body).toBe(
      "They move to Archived at the foot of your list. Shopping's reply will be stopped. Their agents will be free to join another space, and nothing said in them is lost.",
    );
    expect(asking.note).toBe(
      "Unarchive brings the agents back, unless they're in another space by then.",
    );
  });

  it("offers one switch for the lone agents of the rooms it deletes, and frees the rest", () => {
    const one = built(() => [added(HELLO)]).space;
    const other = { ...one, id: OTHER, members: [GARAGE] };
    const both = built(() => [added(HELLO), added(SHOPPING)]).space;
    const many = eraseManyAsking(
      [
        { space: one, name: "Shopping" },
        { space: other, name: "Garage" },
        { space: { ...both, id: "spc_3" }, name: "Both" },
      ],
      [],
      directory,
      ARJUN,
    );
    expect(many.agentsToo).toEqual({
      label: "Delete their 2 agents too",
      on: "They're deleted in Jacobian as well.",
      off: "They stay in Jacobian, free to join another space.",
      spaceIds: [ROOM, OTHER],
    });
    expect(many.note).toBe("Hello and Shopping will be free to join another space.");
    // One room with a lone agent among several is worded as that room's own switch.
    const single = eraseManyAsking(
      [
        { space: one, name: "Shopping" },
        { space: { ...both, id: "spc_3" }, name: "Both" },
      ],
      [],
      directory,
      ARJUN,
    );
    expect(single.agentsToo).toEqual({
      label: "Delete Hello in Jacobian too",
      on: "It's deleted in Jacobian as well.",
      off: "Hello stays in Jacobian, free to join another space.",
      spaceIds: [ROOM],
    });
    // Dana owns neither Jacobian nor the workspace: no switch, and the agents are freed.
    expect(
      eraseManyAsking([{ space: one, name: "Shopping" }], [], directory, DANA).agentsToo,
    ).toBeUndefined();
  });
});

describe("a room made empty, to be filled before it starts (ADR 0148)", () => {
  const said = (text: string) => event("message.post", { space_id: ROOM, text });

  it("waits for agents while nobody but people is in it and nothing has been said", () => {
    const { space } = built(() => []);
    expect(awaitsAgents(space, directory)).toBe(true);
    expect(waitingIn(space, directory)).toEqual([]);
    expect(awaitsAgents(built(() => [said("Anyone?")]).space, directory)).toBe(false);
  });

  it("has its agents wait once they are in it, until somebody says something (ADR 0149)", () => {
    const { space } = built(() => [added(GARAGE)]);
    expect(awaitsAgents(space, directory)).toBe(false);
    expect(waitingIn(space, directory)).toEqual([GARAGE]);
    expect(waitingIn(built(() => [added(GARAGE), added(HELLO)]).space, directory)).toEqual([
      GARAGE,
      HELLO,
    ]);
    expect(
      waitingIn(built(() => [added(GARAGE), said("Plan the garage")]).space, directory),
    ).toEqual([]);
  });

  it("names who waits, a few by name and the rest by count", () => {
    expect(waitingRoomWords([])).toBe("");
    expect(waitingRoomWords(["Jacobian"])).toBe(
      "Jacobian is here and waits for your first message.",
    );
    expect(waitingRoomWords(["Jacobian", "OpenClaw"])).toBe(
      "Jacobian and OpenClaw are here and wait for your first message.",
    );
    expect(waitingRoomWords(["Kit", "Lux", "Atlas"])).toBe(
      "Kit, Lux and Atlas are here and wait for your first message.",
    );
    expect(waitingRoomWords(["Kit", "Lux", "Atlas", "Scout"])).toBe(
      "Kit, Lux and 2 more are here and wait for your first message.",
    );
  });

  it("leaves a room an agent has left to the notice that says so", () => {
    const { space } = built(() => [
      added(GARAGE),
      event("membership.removed", {
        space_id: ROOM,
        participant_id: GARAGE,
        removed_by: ARJUN,
        reason: "removed",
      }),
    ]);
    expect(awaitsAgents(space, directory)).toBe(false);
    expect(waitingIn(space, directory)).toEqual([]);
  });

  it("says nothing of an archived room", () => {
    const { space } = built(() => [
      added(GARAGE),
      event("space.updated", { space_id: ROOM, state: "closed" }),
    ]);
    expect(awaitsAgents(space, directory)).toBe(false);
    expect(waitingIn(space, directory)).toEqual([]);
  });
});
