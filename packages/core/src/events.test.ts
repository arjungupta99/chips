/**
 * The two things every screen asks of a participant id: what to call it, and whether to draw a
 * person or a harness. Both have to answer for an id the directory has never heard of — a lane's
 * trail names whoever handled the work, which can be somebody this client has no row for yet.
 */

import { describe, expect, it } from "vitest";
import {
  actorKind,
  addableTo,
  belongsTo,
  type Directory,
  faceKind,
  faceOf,
  guestElsewhere,
  harnessOf,
  isAgent,
  isRemoved,
  membersName,
  nameOf,
  neverConnected,
  newSpaceHarnesses,
  type Participant,
  participantKind,
  takesAutonomy,
  takesNewSpaces,
  workspaceHarnesses,
} from "./events.js";

const DIRECTORY: Directory = {
  hrn_scout: { id: "hrn_scout", kind: "harness", displayName: "Scout" },
  usr_arjun: { id: "usr_arjun", kind: "person", displayName: "Arjun" },
};

describe("a participant id", () => {
  it("is called what the directory calls it, and otherwise shortened to stay recognisable", () => {
    expect(nameOf(DIRECTORY, "hrn_scout")).toBe("Scout");
    expect(nameOf(DIRECTORY, "hrn_01K4ZQPX000000000000000004")).toBe("hrn_…04");
    expect(nameOf(DIRECTORY, "short")).toBe("short");
  });

  it("is a person or a harness, by the prefix when the directory has no row for it", () => {
    expect(participantKind(DIRECTORY, "usr_arjun")).toBe("person");
    expect(participantKind(DIRECTORY, "hrn_scout")).toBe("harness");
    expect(participantKind(DIRECTORY, "hrn_01K4ZQPX000000000000000004")).toBe("harness");
    expect(participantKind(DIRECTORY, "usr_nobody")).toBe("person");
  });

  it("is drawn as a harness when it is a kind this build has never heard of (ADR 0088)", () => {
    // A server with agents (ADR 0087) names a kind, and ids, that this build predates.
    const newer = {
      ...DIRECTORY,
      agt_tree: { id: "agt_tree", kind: "agent", displayName: "Tree" },
    } as unknown as Directory;
    expect(participantKind(newer, "agt_tree")).toBe("harness");
    expect(participantKind(DIRECTORY, "agt_01K4ZQPX000000000000000004")).toBe("harness");
    expect(participantKind(newer, "usr_arjun")).toBe("person");
    expect(actorKind({ kind: "agent" })).toBe("harness");
    expect(actorKind({ kind: "person" })).toBe("person");
    expect(actorKind({ kind: "system" })).toBe("system");
  });

  it("has an agent's face, a harness's or a person's, and the face a person chose for an agent", () => {
    const withAgents: Directory = {
      ...DIRECTORY,
      agt_shop: {
        id: "agt_shop",
        kind: "agent",
        displayName: "Shopping",
        harnessId: "hrn_scout",
        face: { icon: "cart", ground: 4 },
      },
      agt_plain: { id: "agt_plain", kind: "agent", displayName: "Plain", harnessId: "hrn_scout" },
    };
    expect(faceKind(withAgents, "agt_shop")).toBe("agent");
    expect(faceKind(withAgents, "hrn_scout")).toBe("harness");
    expect(faceKind(withAgents, "usr_arjun")).toBe("person");
    // An agent the directory has no row for yet is still drawn as one, by its id.
    expect(faceKind(DIRECTORY, "agt_01K4ZQPX000000000000000004")).toBe("agent");
    expect(faceKind(DIRECTORY, "hrn_01K4ZQPX000000000000000004")).toBe("harness");
    expect(faceOf(withAgents, "agt_shop")).toEqual({ icon: "cart", ground: 4 });
    expect(faceOf(withAgents, "agt_plain")).toBeUndefined();
    expect(faceOf(withAgents, "agt_nobody")).toBeUndefined();
  });

  it("takes the dial only when its manifest says so (ADR 0046)", () => {
    const declared: Directory = {
      ...DIRECTORY,
      hrn_ledger: {
        id: "hrn_ledger",
        kind: "harness",
        displayName: "Ledger",
        capabilities: ["ledger.read", "autonomy"],
      },
      hrn_tools: { id: "hrn_tools", kind: "harness", displayName: "Tools", capabilities: ["x"] },
    };
    expect(takesAutonomy(declared, "hrn_ledger")).toBe(true);
    // Tools named and not the dial: a manifest that says what it can do, and that is not it.
    expect(takesAutonomy(declared, "hrn_tools")).toBe(false);
    // Nothing declared, as Jacobian's is; and a harness the directory has never heard of.
    expect(takesAutonomy(declared, "hrn_scout")).toBe(false);
    expect(takesAutonomy(declared, "hrn_nobody")).toBe(false);
  });

  it("is asked for a new space only when its manifest says it takes one", () => {
    const declared: Directory = {
      ...DIRECTORY,
      hrn_jacobian: {
        id: "hrn_jacobian",
        kind: "harness",
        displayName: "Jacobian",
        capabilities: ["new_spaces"],
      },
      hrn_claw: {
        id: "hrn_claw",
        kind: "harness",
        displayName: "Claw",
        capabilities: ["autonomy", "new_spaces"],
      },
      hrn_ledger: { id: "hrn_ledger", kind: "harness", displayName: "Ledger", capabilities: [] },
      // A person has no manifest, whatever a stray row says.
      usr_odd: { id: "usr_odd", kind: "person", displayName: "Odd", capabilities: ["new_spaces"] },
    };
    expect(takesNewSpaces(declared, "hrn_jacobian")).toBe(true);
    expect(takesNewSpaces(declared, "hrn_ledger")).toBe(false);
    expect(takesNewSpaces(declared, "hrn_scout")).toBe(false);
    expect(takesNewSpaces(declared, "hrn_nobody")).toBe(false);
    // By name, so the window can say who it is asking, and a picker lists them in order.
    expect(newSpaceHarnesses(declared).map((each) => each.id)).toEqual([
      "hrn_claw",
      "hrn_jacobian",
    ]);
    // Nobody who takes one, and there is nothing to offer.
    expect(newSpaceHarnesses(DIRECTORY)).toEqual([]);
  });
});

describe("an untitled room's name (ADR 0082)", () => {
  it("says You for the person reading, first, and the rest by name", () => {
    expect(membersName(["hrn_scout", "usr_arjun"], DIRECTORY, "usr_arjun")).toBe("You, Scout");
  });

  it("names everybody when nobody is reading, and says Space for nobody", () => {
    expect(membersName(["usr_arjun", "hrn_scout"], DIRECTORY)).toBe("Arjun, Scout");
    expect(membersName([], DIRECTORY, "usr_arjun")).toBe("Space");
  });

  it("is You alone in a room of one", () => {
    expect(membersName(["usr_arjun"], DIRECTORY, "usr_arjun")).toBe("You");
  });
});

describe("a harness removed from the workspace (ADR 0078)", () => {
  const removed: Directory = {
    ...DIRECTORY,
    hrn_claw: {
      id: "hrn_claw",
      kind: "harness",
      displayName: "Claw",
      capabilities: ["new_spaces"],
      removedAt: "2026-09-27T10:00:00.000Z",
    },
    hrn_tree: {
      id: "hrn_tree",
      kind: "harness",
      displayName: "Tree",
      capabilities: ["new_spaces"],
    },
  };

  it("keeps its name for what it said", () => {
    expect(nameOf(removed, "hrn_claw")).toBe("Claw");
    expect(isRemoved(removed, "hrn_claw")).toBe(true);
    expect(isRemoved(removed, "hrn_tree")).toBe(false);
    expect(isRemoved(removed, "hrn_nobody")).toBe(false);
  });

  it("is on no list a person picks from: Harnesses, the +, every room's Add", () => {
    expect(workspaceHarnesses(removed).map((each) => each.id)).toEqual(["hrn_scout", "hrn_tree"]);
    expect(newSpaceHarnesses(removed).map((each) => each.id)).toEqual(["hrn_tree"]);
    expect(addableTo(removed, ["usr_arjun"]).map((each) => each.id)).toEqual([
      "hrn_scout",
      "hrn_tree",
    ]);
  });
});

describe("a guest, who is in one space at most (ADR 0034, finding PP-2)", () => {
  const people: Directory = {
    usr_arjun: { id: "usr_arjun", kind: "person", displayName: "Arjun", role: "owner" },
    usr_priya: {
      id: "usr_priya",
      kind: "person",
      displayName: "Priya",
      role: "guest",
      guestOf: "spc_other",
    },
    usr_vendor: {
      id: "usr_vendor",
      kind: "person",
      displayName: "Vendor",
      role: "guest",
      guestOf: null,
    },
    usr_dana: { id: "usr_dana", kind: "person", displayName: "Dana", role: "member" },
  };

  it("is offered while in no space, and not once in one", () => {
    expect(guestElsewhere(people, "usr_priya")).toBe(true);
    expect(guestElsewhere(people, "usr_vendor")).toBe(false);
    expect(guestElsewhere(people, "usr_dana")).toBe(false);
    expect(guestElsewhere(people, "usr_nobody")).toBe(false);
    expect(addableTo(people, ["usr_arjun"]).map((each) => each.id)).toEqual([
      "usr_vendor",
      "usr_dana",
    ]);
  });
});

describe("a harness that has never connected (the OpenClaw test, finding 18)", () => {
  const never = (id: string, displayName: string) =>
    ({ id, kind: "harness", displayName, lastSeenAt: null }) as const;
  const room: Directory = {
    ...DIRECTORY,
    hrn_claw: never("hrn_claw", "OpenClaw"),
    hrn_echo: never("hrn_echo", "Echo"),
    hrn_ink: never("hrn_ink", "Ink"),
    hrn_seen: {
      id: "hrn_seen",
      kind: "harness",
      displayName: "Seen",
      lastSeenAt: "2026-09-27T10:00:00.000Z",
    },
    hrn_gone: { ...never("hrn_gone", "Gone"), removedAt: "2026-09-27T10:00:00.000Z" },
  };

  it("is one the server says none of its tokens was ever used for", () => {
    expect(neverConnected(room, "hrn_claw")).toBe(true);
    expect(neverConnected(room, "hrn_seen")).toBe(false);
    // A server older than the field says nothing either way, and nothing is claimed of it.
    expect(neverConnected(room, "hrn_scout")).toBe(false);
    expect(neverConnected(room, "usr_arjun")).toBe(false);
    expect(neverConnected(room, "hrn_nobody")).toBe(false);
  });
});

describe("agents (ADR 0087)", () => {
  const directory: Directory = {
    usr_arjun: { id: "usr_arjun", kind: "person", displayName: "Arjun" },
    hrn_jacobian: {
      id: "hrn_jacobian",
      kind: "harness",
      displayName: "Jacobian",
      capabilities: ["autonomy", "follows_rooms"],
    },
    agt_chess: {
      id: "agt_chess",
      kind: "agent",
      displayName: "Chess Game",
      harnessId: "hrn_jacobian",
    },
    hrn_scout: { id: "hrn_scout", kind: "harness", displayName: "Scout" },
  };

  it("are in rooms as agents, as a harness from before them still is", () => {
    expect(isAgent(directory, "agt_chess")).toBe(true);
    expect(isAgent(directory, "hrn_scout")).toBe(true);
    expect(isAgent(directory, "usr_arjun")).toBe(false);
    // One the directory has not caught up with, by its prefix.
    expect(isAgent(directory, "agt_unheard")).toBe(true);
  });

  it("answer for their harness's capabilities", () => {
    expect(harnessOf(directory, "agt_chess")).toBe("hrn_jacobian");
    expect(harnessOf(directory, "hrn_scout")).toBe("hrn_scout");
    expect(takesAutonomy(directory, "agt_chess")).toBe(true);
  });

  it("belong to their harness's owner, said to anybody but the owner (ADR 0196)", () => {
    const owned: Directory = {
      ...directory,
      hrn_jacobian: { ...(directory["hrn_jacobian"] as Participant), ownerId: "usr_arjun" },
    };
    expect(belongsTo(owned, "agt_chess", "usr_priya")).toBe("Arjun");
    expect(belongsTo(owned, "hrn_jacobian", "usr_priya")).toBe("Arjun");
    expect(belongsTo(owned, "agt_chess", "usr_arjun")).toBeUndefined();
    // A harness nobody is said to own.
    expect(belongsTo(owned, "hrn_scout", "usr_priya")).toBeUndefined();
  });

  it("are not offered on their own, and nor is a harness already here as one", () => {
    const offered = addableTo(directory, ["usr_arjun", "agt_chess"]).map((each) => each.id);
    expect(offered).toEqual(["hrn_scout"]);
  });
});
