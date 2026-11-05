/** Who may archive or erase a room, and what the sheet that asks first says (ADR 0066, 0067). */

import { describe, expect, it } from "vitest";
import type { Directory, Participant } from "./events.js";
import { buildModel, type Space, type WorkspaceModel } from "./model.js";
import {
  agentArchiveAsking,
  agentDeleteAsking,
  agentLocked,
  agentsArchiveAsking,
  agentsDeleteAsking,
  archiveAsking,
  archiveManyAsking,
  batchOf,
  eraseAsking,
  eraseManyAsking,
  hideAct,
  listRuns,
  mayArchive,
  mayErase,
  mayHideRoom,
  mayKeepAgent,
  mayLockAgent,
  mayPick,
  mayPickAgent,
  mayPinRoom,
  mayUnarchiveAgent,
  notTakenWords,
  pinAct,
  roomGoesWith,
  SPACE_ROW_ACT_WORDS,
  spaceRowActs,
} from "./putAway.js";

const ARJUN = "usr_01K4ZQPX0000000000000ARJUN";
const DANA = "usr_01K4ZQPX00000000000000DANA";
const VENDOR = "usr_01K4ZQPX000000000000VENDOR";
const JACOBIAN = "hrn_01K4ZQPX0000000000JACOBIAN";
const PLAIN = "hrn_01K4ZQPX000000000000PLAIN";
/** Jacobian keeps its side of a room in step (`follows_rooms`); Plain declares nothing. */
const FOLLOWS = ["new_spaces", "follows_rooms"];

const directory: Directory = {
  [ARJUN]: { id: ARJUN, kind: "person", displayName: "Arjun" },
  [JACOBIAN]: { id: JACOBIAN, kind: "harness", displayName: "Jacobian", capabilities: FOLLOWS },
  [PLAIN]: { id: PLAIN, kind: "harness", displayName: "Plain", ownerId: ARJUN, capabilities: [] },
};

function workspace(roles: Record<string, "owner" | "admin" | "member" | "guest">) {
  let seq = 0;
  return Object.entries(roles).map(([id, role]) => ({
    seq: ++seq,
    type: "person.joined",
    id: `evt_${seq}`,
    ts: "2026-09-22T00:00:00.000Z",
    workspace_id: "ws_1",
    actor: { kind: "person", id },
    participant_id: id,
    display_name: id,
    role,
  }));
}

/** A room, opened by `by`, with members at their standing, and a workspace around it. */
function room(options: {
  kind?: string;
  by?: string;
  key?: string;
  /** Asked of this harness from the + (`asked_of`). */
  asked?: string;
  thread?: boolean;
  /** Named its harness's home, and then, if given, put in this state (ADR 0069). */
  home?: "open" | "closed";
  /** The harness that opened it removed from the workspace afterwards, naming it a home (ADR 0078). */
  removed?: boolean;
  members?: Record<string, "owner" | "member" | "guest">;
  standing?: Record<string, "owner" | "admin" | "member" | "guest">;
  /** Archived by Arjun, then, if `locked`, its changes locked (ADR 0156). */
  archived?: boolean;
  locked?: boolean;
}): { model: WorkspaceModel; space: Space } {
  const by = options.by ?? ARJUN;
  const events = [
    ...workspace(options.standing ?? { [ARJUN]: "owner", [DANA]: "member", [VENDOR]: "guest" }),
    {
      seq: 100,
      type: "space.created",
      id: "evt_100",
      ts: "2026-09-22T00:00:00.000Z",
      workspace_id: "ws_1",
      space_id: "spc_1",
      actor: { kind: by.startsWith("hrn_") ? "harness" : "person", id: by },
      kind: options.kind ?? "group",
      ...(options.key === undefined ? {} : { external_key: options.key }),
      ...(options.asked === undefined ? {} : { asked_of: options.asked }),
      ...(options.thread === true
        ? { parent_space_id: "spc_0", root_message_id: "msg_01K4ZQPX0000000000000000AA" }
        : {}),
    },
    ...Object.entries(options.members ?? {}).map(([id, role], index) => ({
      seq: 101 + index,
      type: "membership.added",
      id: `evt_${101 + index}`,
      ts: "2026-09-22T00:00:00.000Z",
      workspace_id: "ws_1",
      space_id: "spc_1",
      actor: { kind: "person", id: ARJUN },
      participant_id: id,
      participant_kind: id.startsWith("hrn_") ? "harness" : "person",
      role,
    })),
    ...(options.home === undefined
      ? []
      : [
          {
            seq: 200,
            type: "space.updated",
            id: "evt_200",
            ts: "2026-09-25T00:00:00.000Z",
            workspace_id: "ws_1",
            space_id: "spc_1",
            actor: { kind: "harness", id: by },
            home: true,
          },
          ...(options.home === "closed"
            ? [
                {
                  seq: 201,
                  type: "space.updated",
                  id: "evt_201",
                  ts: "2026-09-25T00:00:01.000Z",
                  workspace_id: "ws_1",
                  space_id: "spc_1",
                  actor: { kind: "harness", id: by },
                  state: "closed",
                },
              ]
            : []),
        ]),
    ...archivedAndLocked(options),
    ...(options.removed === true
      ? [
          {
            seq: 300,
            type: "harness.removed",
            id: "evt_300",
            ts: "2026-09-27T00:00:00.000Z",
            workspace_id: "ws_1",
            actor: { kind: "person", id: ARJUN },
            harness_id: by,
            display_name: by,
            homes: ["spc_1"],
          },
        ]
      : []),
  ];
  const model = buildModel(events);
  const space = model.spaces.find((each) => each.id === "spc_1") as Space;
  return { model, space };
}

/** Arjun's archive of the room, then his lock of its changes (ADR 0156), each where asked for. */
function archivedAndLocked(options: { archived?: boolean; locked?: boolean }) {
  return [
    ...(options.archived === true
      ? [
          {
            seq: 250,
            type: "space.updated",
            id: "evt_250",
            ts: "2026-09-26T00:00:00.000Z",
            workspace_id: "ws_1",
            space_id: "spc_1",
            actor: { kind: "person", id: ARJUN },
            state: "closed",
          },
        ]
      : []),
    ...(options.locked === true
      ? [
          {
            seq: 260,
            type: "space.lock_set",
            id: "evt_260",
            ts: "2026-09-26T00:00:01.000Z",
            workspace_id: "ws_1",
            space_id: "spc_1",
            actor: { kind: "person", id: ARJUN },
            locked: true,
          },
        ]
      : []),
  ];
}

describe("who may archive a room", () => {
  it("is anybody in it who is not a guest", () => {
    const { model, space } = room({ members: { [DANA]: "member", [VENDOR]: "guest" } });
    expect(mayArchive(model, space, ARJUN)).toBe(true);
    expect(mayArchive(model, space, DANA)).toBe(true);
    expect(mayArchive(model, space, VENDOR)).toBe(false);
    expect(mayArchive(model, space, "usr_01K4ZQPX00000000000NOBODY")).toBe(false);
  });
});

describe("who may hide a room from their own list (ADR 0205)", () => {
  it("is anybody in it, a guest too, and nobody else", () => {
    const { space } = room({ members: { [DANA]: "member", [VENDOR]: "guest" } });
    expect(mayHideRoom(space, ARJUN)).toBe(true);
    expect(mayHideRoom(space, DANA)).toBe(true);
    expect(mayHideRoom(space, VENDOR)).toBe(true);
    expect(mayHideRoom(space, "usr_01K4ZQPX00000000000NOBODY")).toBe(false);
  });

  it("is nobody for a harness's home or a thread, and anybody for a locked room", () => {
    expect(
      mayHideRoom(
        room({ by: JACOBIAN, home: "open", members: { [ARJUN]: "member" } }).space,
        ARJUN,
      ),
    ).toBe(false);
    expect(mayHideRoom(room({ thread: true, members: { [ARJUN]: "owner" } }).space, ARJUN)).toBe(
      false,
    );
    expect(mayHideRoom(room({ locked: true, members: { [DANA]: "member" } }).space, DANA)).toBe(
      true,
    );
  });

  it("offers Unhide on a room hidden, Hide on an open one, and nothing on one archived", () => {
    const open = room({ members: { [DANA]: "member" } }).space;
    const archived = room({ archived: true, members: { [DANA]: "member" } }).space;
    expect(hideAct(open, DANA, new Set())).toBe("hide");
    expect(hideAct(open, DANA, new Set([open.id]))).toBe("unhide");
    expect(hideAct(archived, DANA, new Set())).toBeUndefined();
    expect(hideAct(archived, DANA, new Set([archived.id]))).toBe("unhide");
  });

  it("puts a hidden room under Hidden, and an archived one under Archived, hidden or not", () => {
    const open = room({ members: { [DANA]: "member" } }).space;
    const hidden = { ...open, id: "spc_hidden" };
    const archived = { ...room({ archived: true }).space, id: "spc_archived" };
    const runs = listRuns([open, hidden, archived], new Set(["spc_hidden", "spc_archived"]));
    expect(runs.open.map((space) => space.id)).toEqual([open.id]);
    expect(runs.hidden.map((space) => space.id)).toEqual(["spc_hidden"]);
    expect(runs.closed.map((space) => space.id)).toEqual(["spc_archived"]);
    expect(listRuns([open], undefined).open).toEqual([open]);
  });
});

describe("pinning a room to the top of one's own list (ADR 0240)", () => {
  it("is anybody in it, a guest too, for a locked room and the Main room too, never a thread", () => {
    const { space } = room({ members: { [DANA]: "member", [VENDOR]: "guest" } });
    expect(mayPinRoom(space, DANA)).toBe(true);
    expect(mayPinRoom(space, VENDOR)).toBe(true);
    expect(mayPinRoom(space, "usr_01K4ZQPX00000000000NOBODY")).toBe(false);
    expect(
      mayPinRoom(room({ by: JACOBIAN, home: "open", members: { [ARJUN]: "member" } }).space, ARJUN),
    ).toBe(true);
    expect(mayPinRoom(room({ locked: true, members: { [DANA]: "member" } }).space, DANA)).toBe(
      true,
    );
    expect(mayPinRoom(room({ thread: true, members: { [ARJUN]: "owner" } }).space, ARJUN)).toBe(
      false,
    );
  });

  it("offers Pin or Unpin only on an open room, which keeps its pin while hidden or archived", () => {
    const open = room({ members: { [DANA]: "member" } }).space;
    const archived = room({ archived: true, members: { [DANA]: "member" } }).space;
    expect(pinAct(open, DANA, [], new Set())).toBe("pin");
    expect(pinAct(open, DANA, [open.id], new Set())).toBe("unpin");
    expect(pinAct(open, DANA, [open.id], new Set([open.id]))).toBeUndefined();
    expect(pinAct(archived, DANA, [archived.id], new Set())).toBeUndefined();
  });

  it("starts the open run with the pins, newest first, and leaves the rest in their order", () => {
    const base = room({ members: { [DANA]: "member" } }).space;
    const [a, b, c, d] = ["spc_a", "spc_b", "spc_c", "spc_d"].map((id) => ({ ...base, id }));
    const hidden = { ...base, id: "spc_hidden" };
    const archived = { ...room({ archived: true }).space, id: "spc_archived" };
    const runs = listRuns(
      [a, b, c, d, hidden, archived].filter((s) => s !== undefined),
      new Set(["spc_hidden"]),
      ["spc_c", "spc_hidden", "spc_archived", "spc_a"],
    );
    expect(runs.open.map((space) => space.id)).toEqual(["spc_c", "spc_a", "spc_b", "spc_d"]);
    // A pinned room hidden or archived stands in its own run, and keeps its pin for later.
    expect(runs.hidden.map((space) => space.id)).toEqual(["spc_hidden"]);
    expect(runs.closed.map((space) => space.id)).toEqual(["spc_archived"]);
  });
});

describe("who may erase a room", () => {
  it("is its owner, or an owner or admin of the workspace who is in it", () => {
    const { model, space } = room({
      by: DANA,
      members: { [ARJUN]: "member" },
      standing: { [ARJUN]: "admin", [DANA]: "member" },
    });
    // Dana opened it, so it is hers; Arjun runs the workspace.
    expect(mayErase(model, space, DANA)).toBe(true);
    expect(mayErase(model, space, ARJUN)).toBe(true);
  });

  it("is not a member who neither owns it nor runs the workspace, nor a guest", () => {
    const { model, space } = room({ members: { [DANA]: "member", [VENDOR]: "guest" } });
    expect(mayErase(model, space, DANA)).toBe(false);
    expect(mayErase(model, space, VENDOR)).toBe(false);
  });

  it("takes a room a harness opened under a key, direct or not, and not one nobody can open again", () => {
    const keyed = room({
      kind: "direct",
      by: JACOBIAN,
      key: `${JACOBIAN}:global`,
      members: { [ARJUN]: "owner" },
    });
    expect(mayErase(keyed.model, keyed.space, ARJUN)).toBe(true);
    const handed = room({ kind: "direct", by: JACOBIAN, members: { [ARJUN]: "owner" } });
    expect(mayErase(handed.model, handed.space, ARJUN)).toBe(false);
    // Archived instead, which is still anybody's in it.
    expect(mayArchive(handed.model, handed.space, ARJUN)).toBe(true);
  });

  it("takes a room asked of a harness from the +, before the harness has claimed it", () => {
    const asked = room({
      kind: "direct",
      asked: JACOBIAN,
      members: { [JACOBIAN]: "member", [DANA]: "member" },
    });
    expect(asked.space.keyed).not.toBe(true);
    expect(mayErase(asked.model, asked.space, ARJUN)).toBe(true);
    // Still the owner's, or the workspace's owner or admin: not everybody in it.
    expect(mayErase(asked.model, asked.space, DANA)).toBe(false);
  });

  it("does not take a thread, which goes with the space it grew in", () => {
    const { model, space } = room({ kind: "thread", thread: true });
    expect(mayErase(model, space, ARJUN)).toBe(false);
  });
});

describe("a home whose harness was removed (ADR 0078)", () => {
  it("is a room like any other: archived by anybody in it, erased by its owner", () => {
    const j = room({
      kind: "direct",
      by: JACOBIAN,
      key: `${JACOBIAN}:global`,
      home: "open",
      removed: true,
      members: { [ARJUN]: "owner", [JACOBIAN]: "member" },
    });
    expect(j.space.home).toBe(false);
    expect(mayArchive(j.model, j.space, ARJUN)).toBe(true);
    expect(mayErase(j.model, j.space, ARJUN)).toBe(true);
    expect(j.model.audit[0]).toMatchObject({ who: ARJUN, what: `removed ${JACOBIAN}` });
  });
});

describe("a harness's home (ADR 0069)", () => {
  it("is neither archived nor erased, by anybody, and makes no news on the list", () => {
    const j = room({
      kind: "direct",
      by: JACOBIAN,
      key: `${JACOBIAN}:global`,
      home: "open",
      members: { [ARJUN]: "owner", [JACOBIAN]: "member" },
    });
    expect(j.space.home).toBe(true);
    // The same room, not a home, is his to archive and erase: it is the home that stops him.
    const plain = room({
      kind: "direct",
      by: JACOBIAN,
      key: `${JACOBIAN}:global`,
      members: { [ARJUN]: "owner", [JACOBIAN]: "member" },
    });
    expect(mayArchive(plain.model, plain.space, ARJUN)).toBe(true);
    expect(mayErase(plain.model, plain.space, ARJUN)).toBe(true);
    expect(mayArchive(j.model, j.space, ARJUN)).toBe(false);
    expect(mayErase(j.model, j.space, ARJUN)).toBe(false);
    // Named quietly: no line in the room, and it did not come forward.
    expect(j.space.lines.some((line) => line.kind === "system")).toBe(false);
    expect(j.space.lastActivityAt).toBe("2026-09-22T00:00:00.000Z");
  });

  it("may be brought back when it was somehow put away", () => {
    const j = room({
      kind: "direct",
      by: JACOBIAN,
      key: `${JACOBIAN}:global`,
      home: "closed",
      members: { [ARJUN]: "owner", [JACOBIAN]: "member" },
    });
    expect(mayArchive(j.model, j.space, ARJUN)).toBe(true);
    expect(mayErase(j.model, j.space, ARJUN)).toBe(false);
  });
});

describe("what a Spaces row offers, on a phone's swipes and a desktop's menu", () => {
  it("lists the reader's own acts first, then what the room's people see done to it", () => {
    const open = room({ members: { [DANA]: "member", [VENDOR]: "guest" } });
    expect(spaceRowActs(open.model, open.space, ARJUN, [], new Set())).toEqual([
      "pin",
      "hide",
      "archive",
      "delete",
    ]);
    expect(spaceRowActs(open.model, open.space, ARJUN, [open.space.id], new Set())).toEqual([
      "unpin",
      "hide",
      "archive",
      "delete",
    ]);
    // Hidden, it keeps its pin for later and offers only to come back, besides its people's acts.
    expect(
      spaceRowActs(open.model, open.space, ARJUN, [open.space.id], new Set([open.space.id])),
    ).toEqual(["unhide", "archive", "delete"]);
    // A member who did not open it may archive it, and not delete it.
    expect(spaceRowActs(open.model, open.space, DANA, [], new Set())).toEqual([
      "pin",
      "hide",
      "archive",
    ]);
    // A guest may pin and hide, and neither archive nor delete.
    expect(spaceRowActs(open.model, open.space, VENDOR, [], new Set())).toEqual(["pin", "hide"]);
    expect(SPACE_ROW_ACT_WORDS.unhide).toBe("Unhide");
  });

  it("offers Unarchive on an archived room, and Locked in place of Archive and Delete", () => {
    const archived = room({ archived: true, members: { [DANA]: "member" } });
    expect(spaceRowActs(archived.model, archived.space, ARJUN, [], new Set())).toEqual([
      "unarchive",
      "delete",
    ]);
    const locked = room({ locked: true, members: { [DANA]: "member", [VENDOR]: "guest" } });
    expect(spaceRowActs(locked.model, locked.space, DANA, [], new Set())).toEqual([
      "pin",
      "hide",
      "locked",
    ]);
    // A guest may not let a lock go, so is not shown the way there.
    expect(spaceRowActs(locked.model, locked.space, VENDOR, [], new Set())).toEqual([
      "pin",
      "hide",
    ]);
  });

  it("says why a hide or a pin did not hold", () => {
    expect(notTakenWords("hide", new Error("404 no route matches"))).toBe(
      "Not hidden: this server is older than the app.",
    );
    expect(notTakenWords("pin", new Error("not in this space"))).toBe(
      "Not pinned: not in this space",
    );
    expect(notTakenWords("unpin", undefined)).toBe("Not unpinned: the server would not take it.");
  });
});

describe("a room whose changes are locked (ADR 0156)", () => {
  it("is neither archived nor erased, by anybody, until it is let go", () => {
    const open = room({ members: { [DANA]: "member" } });
    const locked = room({ members: { [DANA]: "member" }, locked: true });
    expect(locked.space.locked).toBe(true);
    expect(mayErase(open.model, open.space, ARJUN)).toBe(true);
    for (const who of [ARJUN, DANA]) {
      expect(mayArchive(locked.model, locked.space, who)).toBe(false);
      expect(mayErase(locked.model, locked.space, who)).toBe(false);
    }
  });

  it("stays open when its one agent is archived or deleted, and the sheets say so", () => {
    const THEO = "agt_01K4ZQPX00000000000000THEO";
    const withTheo: Directory = {
      ...directory,
      [THEO]: { id: THEO, kind: "agent", displayName: "Theo", harnessId: PLAIN, room: "spc_1" },
    };
    const open = room({ members: { [THEO]: "member" } });
    const locked = room({ members: { [THEO]: "member" }, locked: true });
    expect(agentArchiveAsking(open.model, withTheo, THEO).body).toContain("is archived with it");
    const archiving = agentArchiveAsking(locked.model, withTheo, THEO);
    expect(archiving.body).toContain("which stays open since its changes are locked");
    expect(archiving.note).toBe("Unarchive brings it back.");
    const deleting = agentDeleteAsking(locked.model, withTheo, ARJUN, THEO);
    // No switch to delete the room too: a locked room is not erased.
    expect(deleting.roomToo).toBeUndefined();
    expect(deleting.note).toContain("stays open: its changes are locked.");
  });

  it("may still be brought back when it was archived before it was locked", () => {
    const { model, space } = room({ archived: true, locked: true });
    expect(space.state).toBe("closed");
    expect(mayArchive(model, space, ARJUN)).toBe(true);
    expect(mayErase(model, space, ARJUN)).toBe(false);
  });
});

describe("what the sheet says", () => {
  it("names the harness that can bring a room back, and says nothing of one where none can", () => {
    const jacobian = room({ kind: "direct", by: JACOBIAN, key: `${JACOBIAN}:chess` }).space;
    expect(archiveAsking(jacobian, "Chess Game", directory)).toEqual({
      title: "Archive Chess Game?",
      body: "It moves to Archived at the foot of your list. Nothing in it is lost, and anything new still lands in it.",
      note: "It stays archived until you unarchive it, here or in Jacobian.",
      confirm: "Archive",
    });
    // Deleted there too, when it is the harness's owner deleting; put away there for its owner
    // to decide, when it is somebody else (ADR 0069).
    const owned: Directory = {
      ...directory,
      [JACOBIAN]: {
        id: JACOBIAN,
        kind: "harness",
        displayName: "Jacobian",
        ownerId: ARJUN,
        capabilities: FOLLOWS,
      },
    };
    expect(eraseAsking(jacobian, "Chess Game", owned, ARJUN).note).toBe(
      "It's deleted in Jacobian too.",
    );
    expect(eraseAsking(jacobian, "Chess Game", owned, DANA).note).toBe(
      "Jacobian archives it on its side, for its owner to delete there.",
    );

    const trip = room({}).space;
    expect(archiveAsking(trip, "Trip to Goa", directory).note).toBe(
      "It stays archived until you unarchive it.",
    );
    const erase = eraseAsking(trip, "Trip to Goa", directory, ARJUN);
    expect(erase.title).toBe("Delete Trip to Goa?");
    expect(erase.note).toBeUndefined();
    expect(erase.confirm).toBe("Delete");
  });

  it("promises nothing for a harness that has not said it keeps its side in step", () => {
    // Plain opened this room under a key, as Jacobian did its, but declares no `follows_rooms`:
    // what it does with an archive or a delete is its own business, so the sheet says what
    // happens here and nothing about there.
    const plain = room({ kind: "direct", by: PLAIN, key: `${PLAIN}:notes` }).space;
    expect(archiveAsking(plain, "Notes", directory).note).toBe(
      "It stays archived until you unarchive it.",
    );
    expect(eraseAsking(plain, "Notes", directory, ARJUN).note).toBeUndefined();
  });
});

describe("picking rooms for a batch (ADR 0181)", () => {
  it("picks what a swipe would archive or delete, and never a locked room, a home or a guest's", () => {
    const plain = room({ members: { [DANA]: "member" } });
    expect(mayPick(plain.model, plain.space, ARJUN)).toBe(true);
    // Dana may archive it but not delete it, which is still something to pick it for.
    expect(mayPick(plain.model, plain.space, DANA)).toBe(true);
    const locked = room({ locked: true });
    expect(mayPick(locked.model, locked.space, ARJUN)).toBe(false);
    // Archived before it was locked: its own swipe may bring it back, and a batch leaves it alone.
    const both = room({ archived: true, locked: true });
    expect(mayArchive(both.model, both.space, ARJUN)).toBe(true);
    expect(mayPick(both.model, both.space, ARJUN)).toBe(false);
    const home = room({
      kind: "direct",
      by: JACOBIAN,
      key: `${JACOBIAN}:global`,
      home: "open",
      members: { [ARJUN]: "owner", [JACOBIAN]: "member" },
    });
    expect(mayPick(home.model, home.space, ARJUN)).toBe(false);
    const guest = room({ members: { [VENDOR]: "guest" } });
    expect(mayPick(guest.model, guest.space, VENDOR)).toBe(false);
  });

  it("gives each button only the picked rooms it may take, in the order picked", () => {
    const { model, space } = room({});
    const direct = {
      ...room({ kind: "direct", members: { [DANA]: "member" } }).space,
      id: "spc_2",
    };
    const archived = { ...room({ archived: true }).space, id: "spc_3" };
    const locked = { ...room({ locked: true }).space, id: "spc_4" };
    const batch = batchOf(model, [space, direct, archived, locked], ARJUN);
    expect(batch.archive.map((each) => each.id)).toEqual(["spc_1", "spc_2"]);
    expect(batch.unarchive.map((each) => each.id)).toEqual(["spc_3"]);
    // A direct room nobody can open again is archived, never erased.
    expect(batch.erase.map((each) => each.id)).toEqual(["spc_1", "spc_3"]);
  });
});

describe("what the batch sheets say (ADR 0181)", () => {
  const trip = { space: room({}).space, name: "Trip to Goa" };
  const chess = {
    space: {
      ...room({ kind: "direct", by: JACOBIAN, key: `${JACOBIAN}:chess` }).space,
      id: "spc_2",
    },
    name: "Chess Game",
  };
  const dana = {
    space: { ...room({ kind: "direct", members: { [DANA]: "member" } }).space, id: "spc_3" },
    name: "Dana",
  };
  const owned: Directory = {
    ...directory,
    [JACOBIAN]: {
      id: JACOBIAN,
      kind: "harness",
      displayName: "Jacobian",
      ownerId: ARJUN,
      capabilities: FOLLOWS,
    },
  };

  it("asks about archiving several at once, and about one as its swipe does", () => {
    expect(archiveManyAsking([trip], directory)).toEqual(
      archiveAsking(trip.space, trip.name, directory),
    );
    expect(archiveManyAsking([trip, chess], directory)).toEqual({
      title: "Archive 2 spaces?",
      body: "They move to Archived at the foot of your list. Nothing in them is lost, and anything new still lands in them.",
      note: "They stay archived until you unarchive them. Jacobian archives its side too.",
      confirm: "Archive 2",
    });
  });

  it("asks about deleting several, says what their harness does, and names the picked rooms it leaves", () => {
    expect(eraseManyAsking([trip, chess], [dana], owned, ARJUN)).toEqual({
      title: "Delete 2 spaces?",
      body: "What was said in them, their files and their search entries are erased from the server, for everyone in them. This can't be undone.",
      note: "Jacobian deletes its side too. Dana stays: you can only archive that space.",
      confirm: "Delete 2",
    });
    expect(eraseManyAsking([trip, chess], [], owned, DANA).note).toBe(
      "Jacobian archives its side, for its owner to delete there.",
    );
    // One going is asked about as its swipe asks.
    expect(eraseManyAsking([chess], [], owned, ARJUN)).toEqual(
      eraseAsking(chess.space, chess.name, owned, ARJUN),
    );
    expect(eraseManyAsking([chess], [dana], owned, ARJUN)).toMatchObject({
      title: "Delete Chess Game?",
      note: "It's deleted in Jacobian too. Dana stays: you can only archive that space.",
      confirm: "Delete",
    });
  });
});

describe("picking agents on the Agents tab (ADR 0182)", () => {
  const THEO = "agt_01K4ZQPX00000000000000THEO";
  const MAYA = "agt_01K4ZQPX00000000000000MAYA";
  const NOOR = "agt_01K4ZQPX00000000000000NOOR";
  const MAIN = "agt_01K4ZQPX00000000000000MAIN";
  const FREE = "agt_01K4ZQPX00000000000000FREE";
  const agents: Directory = {
    ...directory,
    [THEO]: { id: THEO, kind: "agent", displayName: "Theo", harnessId: JACOBIAN, room: "spc_a" },
    [MAYA]: { id: MAYA, kind: "agent", displayName: "Maya", harnessId: JACOBIAN, room: "spc_b" },
    [NOOR]: { id: NOOR, kind: "agent", displayName: "Noor", harnessId: PLAIN, room: "spc_b" },
    [MAIN]: { id: MAIN, kind: "agent", displayName: "J", harnessId: JACOBIAN, lead: true },
    [FREE]: { id: FREE, kind: "agent", displayName: "Free", harnessId: JACOBIAN, room: null },
  };
  /** Room A with Theo alone; room B with Maya and Noor; B's changes locked when asked. */
  function rooms(options: { lockB?: boolean } = {}) {
    let seq = 100;
    const at = (fields: { readonly type: string } & Record<string, unknown>) => ({
      seq: ++seq,
      id: `evt_${seq}`,
      ts: "2026-10-16T00:00:00.000Z",
      workspace_id: "ws_1",
      actor: { kind: "person", id: ARJUN },
      ...fields,
    });
    const created = (space: string, title: string) =>
      at({ type: "space.created", space_id: space, kind: "group", title });
    const joins = (space: string, id: string) =>
      at({
        type: "membership.added",
        space_id: space,
        participant_id: id,
        participant_kind: "harness",
        role: "member",
      });
    return buildModel([
      ...workspace({ [ARJUN]: "owner", [DANA]: "member", [VENDOR]: "guest" }),
      created("spc_a", "Garden"),
      joins("spc_a", THEO),
      created("spc_b", "Kitchen"),
      joins("spc_b", MAYA),
      joins("spc_b", NOOR),
      ...(options.lockB === true
        ? [at({ type: "space.lock_set", space_id: "spc_b", locked: true })]
        : []),
    ]);
  }

  it("picks what a swipe would archive or delete: never a Main agent, nor for a guest", () => {
    const model = rooms();
    expect(mayPickAgent(model, agents, ARJUN, THEO)).toBe(true);
    expect(mayPickAgent(model, agents, ARJUN, MAIN)).toBe(false);
    expect(mayPickAgent(model, agents, VENDOR, THEO)).toBe(false);
  });

  it("asks about archiving several at once, and about one as its swipe does", () => {
    const model = rooms();
    expect(agentsArchiveAsking(model, agents, [THEO])).toEqual(
      agentArchiveAsking(model, agents, THEO),
    );
    const two = agentsArchiveAsking(model, agents, [THEO, MAYA]);
    expect(two.title).toBe("Archive 2 agents?");
    expect(two.confirm).toBe("Archive 2");
    // Theo leaves Garden empty; Maya leaves Noor in Kitchen.
    expect(two.body).toBe(
      "They leave their spaces and move to Archived. Garden is archived with them, since no other agent is there.",
    );
    expect(two.note).toBe(
      "Jacobian archives them too. Unarchive brings them back, and the spaces archived with them.",
    );
    // Both of Kitchen's agents: Kitchen goes with them too, unless its changes are locked.
    expect(agentsArchiveAsking(model, agents, [THEO, MAYA, NOOR]).body).toContain(
      "Garden and Kitchen are archived with them",
    );
    expect(agentsArchiveAsking(rooms({ lockB: true }), agents, [THEO, MAYA, NOOR]).body).toContain(
      " Garden is archived with them",
    );
    // Free agents have no room to leave.
    expect(agentsArchiveAsking(model, agents, [FREE, NOOR]).body).toBe(
      "They leave their spaces and move to Archived.",
    );
    expect(agentsArchiveAsking(model, agents, [FREE, FREE]).body).toBe("They move to Archived.");
    expect(agentsArchiveAsking(model, agents, [FREE, NOOR]).note).toBe(
      "Jacobian archives it too. Unarchive brings them back.",
    );
  });

  it("asks about deleting several, with one switch for the rooms they leave empty", () => {
    const model = rooms();
    expect(agentsDeleteAsking(model, agents, ARJUN, [THEO])).toEqual(
      agentDeleteAsking(model, agents, ARJUN, THEO),
    );
    const two = agentsDeleteAsking(model, agents, ARJUN, [THEO, MAYA]);
    expect(two.title).toBe("Delete 2 agents?");
    expect(two.roomsToo?.label).toBe("Delete the space \u201cGarden\u201d too");
    expect(two.roomsToo?.spaceIds).toEqual(["spc_a"]);
    // Jacobian is not Arjun's here: it puts its side away for its owner to decide.
    expect(two.note).toBe("Jacobian archives them on its side, for its owner to delete there.");
    const all = agentsDeleteAsking(model, agents, ARJUN, [THEO, MAYA, NOOR]);
    expect(all.roomsToo?.label).toBe("Delete their 2 spaces too");
    expect(all.note).toBe(
      "Jacobian archives them on its side, for its owner to delete there. Plain keeps its own copy of what was said.",
    );
    // One agent of a harness is "it".
    expect(agentsDeleteAsking(model, agents, ARJUN, [THEO, NOOR]).note).toBe(
      "Jacobian archives it on its side, for its owner to delete there. Plain keeps its own copy of what was said.",
    );
    // A locked room is not erased, and stays open.
    const locked = agentsDeleteAsking(rooms({ lockB: true }), agents, ARJUN, [THEO, MAYA, NOOR]);
    expect(locked.roomsToo?.spaceIds).toEqual(["spc_a"]);
    expect(locked.note).toContain("Kitchen stays open: its changes are locked.");
  });

  describe("an agent whose changes are locked (ADR 0199)", () => {
    /** The directory with one agent's changes locked, and archived out of its room if asked. */
    const lockedIn = (directory: Directory, id: string, archived = false): Directory => ({
      ...directory,
      [id]: {
        ...(directory[id] as Participant),
        locked: true,
        ...(archived ? { archived: true, room: null } : {}),
      },
    });
    /** Arjun owns the workspace, as the directory says, so the delete may take an agent along. */
    const owning: Directory = {
      ...agents,
      [ARJUN]: { id: ARJUN, kind: "person", displayName: "Arjun", role: "owner" },
    };

    it("is locked and let go by whoever may archive or delete it, who then may do neither", () => {
      const model = rooms();
      const held = lockedIn(agents, THEO);
      expect(agentLocked(held, THEO)).toBe(true);
      expect(agentLocked(agents, THEO)).toBe(false);
      expect(mayLockAgent(model, held, ARJUN, THEO)).toBe(true);
      expect(mayLockAgent(model, held, VENDOR, THEO)).toBe(false);
      // No switch on a Main agent: nobody archives or deletes it already.
      expect(mayLockAgent(model, agents, ARJUN, MAIN)).toBe(false);
      expect(mayKeepAgent(model, agents, ARJUN, THEO)).toBe(true);
      expect(mayKeepAgent(model, held, ARJUN, THEO)).toBe(false);
      // Never picked for a batch, as a locked room is not (ADR 0181).
      expect(mayPickAgent(model, held, ARJUN, THEO)).toBe(false);
    });

    it("is still brought back from Archived, which only puts it back", () => {
      const model = rooms();
      expect(mayUnarchiveAgent(model, lockedIn(agents, FREE, true), ARJUN, FREE)).toBe(true);
      expect(mayUnarchiveAgent(model, lockedIn(agents, FREE), ARJUN, FREE)).toBe(false);
      expect(mayUnarchiveAgent(model, lockedIn(agents, FREE, true), VENDOR, FREE)).toBe(false);
    });

    it("is not offered to go with its room, and the sheet says why it stays", () => {
      const model = rooms();
      const garden = model.spaces.find((space) => space.id === "spc_a") as Space;
      expect(eraseAsking(garden, "Garden", owning, ARJUN).agentToo?.agentId).toBe(THEO);
      const held = eraseAsking(garden, "Garden", lockedIn(owning, THEO), ARJUN);
      expect(held.agentToo).toBeUndefined();
      expect(held.note).toBe("Theo's changes are locked, so it stays, free to join another space.");
      // Deleting it with others: no switch for it, and it is freed with the rest.
      const many = eraseManyAsking(
        [{ space: garden, name: "Garden" }],
        [],
        lockedIn(owning, THEO),
        ARJUN,
      );
      expect(many.agentsToo).toBeUndefined();
      expect(many.note).toContain("Theo will be free to join another space.");
    });
  });

  it("takes a shared room with the last of its agents, since the server erases it with the one left", () => {
    expect([...roomGoesWith(agents, [MAYA, THEO, NOOR], ["spc_a", "spc_b"])].sort()).toEqual(
      [NOOR, THEO].sort(),
    );
    expect([...roomGoesWith(agents, [MAYA, THEO, NOOR], ["spc_a"])]).toEqual([THEO]);
  });
});
