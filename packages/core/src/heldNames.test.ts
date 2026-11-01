import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { ClientEvent, Directory } from "./events.js";
import { harnessUnder, heldNamesFor, roomDirectory } from "./heldNames.js";
import { buildModel, roomHandles, type Space } from "./model.js";
import { waitingIn, waitingRoomWords } from "./rooms.js";

const FIXTURES = fileURLToPath(new URL("../../protocol/fixtures/", import.meta.url));

function fixture(type: string, seq: number, overrides: Record<string, unknown> = {}): ClientEvent {
  return { ...JSON.parse(readFileSync(`${FIXTURES}${type}.json`, "utf8")), seq, ...overrides };
}

const ARJUN = "usr_01K4ZQPX000000000000000003";
const JACOBIAN = "hrn_01K4ZQPX00000000000000JACO";
const OPENCLAW = "hrn_01K4ZQPX00000000000000OPEN";
const MILO = "agt_01K4ZQPX00000000000000MILO";

const DIRECTORY: Directory = {
  [ARJUN]: { id: ARJUN, kind: "person", displayName: "Arjun" },
  [JACOBIAN]: { id: JACOBIAN, kind: "harness", displayName: "Jacobian" },
  [OPENCLAW]: { id: OPENCLAW, kind: "harness", displayName: "OpenClaw" },
};

/** "Test space", asked of Jacobian and OpenClaw from the +, holding Milo and Theo for them. */
function asked(): ClientEvent[] {
  return [
    fixture("space.created", 1, {
      title: "Test space",
      kind: "group",
      asked_of: JACOBIAN,
      also_asked_of: [OPENCLAW],
    }),
    fixture("membership.added", 2, {
      participant_id: JACOBIAN,
      participant_kind: "harness",
      agent_name: "Milo",
    }),
    fixture("membership.added", 3, {
      participant_id: OPENCLAW,
      participant_kind: "harness",
      agent_name: "Theo",
    }),
  ];
}

const spaceOf = (events: ClientEvent[]) => buildModel(events).spaces[0] as Space;

describe("a room asked from the + holds first names for its agents (ADR 0150)", () => {
  it("keeps each, by harness, until its agent takes the harness's place", () => {
    expect(spaceOf(asked()).held).toEqual({ [JACOBIAN]: "Milo", [OPENCLAW]: "Theo" });
    const replaced = fixture("membership.replaced", 4, { from: JACOBIAN, to: MILO });
    expect(spaceOf([...asked(), replaced]).held).toEqual({ [OPENCLAW]: "Theo" });
    const out = fixture("membership.removed", 5, { participant_id: OPENCLAW });
    expect(spaceOf([...asked(), replaced, out]).held).toBeUndefined();
  });

  it("calls each waiting harness by its held name in the room, and by its own everywhere else", () => {
    const space = spaceOf(asked());
    const room = roomDirectory(space, DIRECTORY);
    expect(room[JACOBIAN]).toMatchObject({ displayName: "Milo", harnessName: "Jacobian" });
    expect(DIRECTORY[JACOBIAN]?.displayName).toBe("Jacobian");
    expect(waitingRoomWords(waitingIn(space, room).map((id) => room[id]?.displayName ?? ""))).toBe(
      "Milo and Theo are here and wait for your first message.",
    );
    // @Milo reaches it, as @Jacobian does.
    expect(roomHandles(space, room)).toMatchObject({ [JACOBIAN]: "@Milo", [OPENCLAW]: "@Theo" });
    // The same overlay for the same room and directory, and none for a room that holds nothing.
    expect(roomDirectory(space, DIRECTORY)).toBe(room);
    expect(roomDirectory(spaceOf(asked().slice(0, 1)), DIRECTORY)).toBe(DIRECTORY);
  });

  it("says the harness under a name that does not say it", () => {
    const room = roomDirectory(spaceOf(asked()), DIRECTORY);
    expect(harnessUnder(room, JACOBIAN)).toBe("Jacobian");
    const agents: Directory = {
      ...DIRECTORY,
      [MILO]: { id: MILO, kind: "agent", harnessId: JACOBIAN, displayName: "Milo" },
      agt_3: { id: "agt_3", kind: "agent", harnessId: OPENCLAW, displayName: "OpenClaw 3" },
    };
    expect(harnessUnder(agents, MILO)).toBe("Jacobian");
    expect(harnessUnder(agents, "agt_3")).toBeUndefined();
    expect(harnessUnder(agents, ARJUN)).toBeUndefined();
  });
});

describe("the names a device proposes for a new room", () => {
  const first = () => 0;

  it("are nobody's, a room's held names counted, and a letter apart from each other and the person", () => {
    const taken: Directory = {
      ...DIRECTORY,
      agt_a: { id: "agt_a", kind: "agent", harnessId: JACOBIAN, displayName: "Basil" },
      agt_b: {
        id: "agt_b",
        kind: "agent",
        harnessId: JACOBIAN,
        displayName: "Beau",
        archived: true,
      },
    };
    const names = heldNamesFor([JACOBIAN, OPENCLAW], taken, [spaceOf(asked())], ["Arjun"], first);
    // A is the person's letter, so B first: Basil is an active agent's, Beau an archived one's.
    expect(names).toEqual({ [JACOBIAN]: "Beau", [OPENCLAW]: "Cai" });
    const again = heldNamesFor([JACOBIAN], taken, [spaceOf(asked())], [], () => 0.5);
    expect(["Milo", "Theo", "Basil"]).not.toContain(again[JACOBIAN]);
  });
});
