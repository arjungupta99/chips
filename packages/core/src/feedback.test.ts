import { describe, expect, it } from "vitest";
import type { ClientEvent, Directory } from "./events.js";
import { FEEDBACK_SHOWN, feedbackAgent, feedbackLink, feedbackWithWords } from "./feedback.js";
import { buildModel } from "./model.js";

const ARJUN = "usr_01K4ZQPX0000000000000ARJUN";
const DANA = "usr_01K4ZQPX00000000000000DANA";
const JACOBIAN = "hrn_01K4ZQPX0000000000JACOBIAN";
const HERMES = "hrn_01K4ZQPX000000000000HERMES";
const J = "agt_01K4ZQPX0000000000000000J";
const MILO = "agt_01K4ZQPX00000000000000MILO";
const HELLO = "agt_01K4ZQPX000000000000HELLO";
const J_HOME = "spc_01K4ZQPX000000000000JHOME";
const MILO_HOME = "spc_01K4ZQPX0000000000MILOHOME";
const ROOM = "spc_01K4ZQPX0000000000000ROOM";

const directory: Directory = {
  [ARJUN]: { id: ARJUN, kind: "person", displayName: "Arjun" },
  [DANA]: { id: DANA, kind: "person", displayName: "Dana" },
  [JACOBIAN]: { id: JACOBIAN, kind: "harness", displayName: "Jacobian", ownerId: ARJUN },
  [HERMES]: { id: HERMES, kind: "harness", displayName: "Hermes", ownerId: ARJUN },
  [J]: { id: J, kind: "agent", harnessId: JACOBIAN, displayName: "J", lead: true, room: J_HOME },
  [MILO]: {
    id: MILO,
    kind: "agent",
    harnessId: HERMES,
    displayName: "Milo",
    lead: true,
    room: MILO_HOME,
  },
  [HELLO]: { id: HELLO, kind: "agent", harnessId: JACOBIAN, displayName: "Hello", room: ROOM },
};

let seq = 0;
function event(type: string, fields: Record<string, unknown>, ts: string): ClientEvent {
  seq += 1;
  return {
    seq,
    type,
    id: `evt_${seq}`,
    ts,
    workspace_id: "ws_1",
    actor: { kind: "person", id: ARJUN },
    ...fields,
  };
}

const joined = (space: string, participant: string, ts: string) =>
  event(
    "membership.added",
    {
      space_id: space,
      participant_id: participant,
      participant_kind: participant.startsWith("usr_") ? "person" : "agent",
      role: "member",
    },
    ts,
  );

/** J's Main space and Milo's, each with Arjun in it, and a room where Hello works. */
function workspace(then: () => ClientEvent[] = () => []) {
  return buildModel(
    [
      event("person.joined", { participant_id: ARJUN, display_name: "Arjun", role: "owner" }, "t0"),
      event("person.joined", { participant_id: DANA, display_name: "Dana", role: "member" }, "t0"),
      event("space.created", { space_id: J_HOME, kind: "group", title: "J" }, "t1"),
      event("space.updated", { space_id: J_HOME, home: true }, "t1"),
      joined(J_HOME, J, "t1"),
      joined(J_HOME, ARJUN, "2026-10-20T09:00:00.000Z"),
      event("space.created", { space_id: MILO_HOME, kind: "group", title: "Milo" }, "t1"),
      event("space.updated", { space_id: MILO_HOME, home: true }, "t1"),
      joined(MILO_HOME, MILO, "t1"),
      joined(MILO_HOME, ARJUN, "2026-10-25T09:00:00.000Z"),
      event("space.created", { space_id: ROOM, kind: "group", title: "Shopping" }, "t1"),
      joined(ROOM, HELLO, "t1"),
      joined(ROOM, ARJUN, "2026-10-26T09:00:00.000Z"),
      ...then(),
    ],
    { selfId: ARJUN },
  );
}

describe("the link to the form", () => {
  it("names the form and fills the version, and nothing else", () => {
    expect(feedbackLink("Chips 0.0.0 (202610261200) · b770067c · iOS 26.1")).toBe(
      "https://github.com/arjungupta99/chips/issues/new?template=feedback-prompt.yml" +
        "&version=Chips%200.0.0%20(202610261200)%20%C2%B7%20b770067c%20%C2%B7%20iOS%2026.1",
    );
  });

  it("keeps a version's & and # inside its own box", () => {
    const link = new URL(feedbackLink("Chips 0.0.0 · dev & more #1 · web"));
    expect([...link.searchParams.keys()]).toEqual(["template", "version"]);
    expect(link.searchParams.get("version")).toBe("Chips 0.0.0 · dev & more #1 · web");
    expect(link.hash).toBe("");
  });

  it("is on, now that the repository is public (Phase 4)", () => {
    expect(FEEDBACK_SHOWN).toBe(true);
  });
});

describe("the agent a prompt is written with", () => {
  it("is the Main agent whose Main space spoke last, named as the pick says it", () => {
    const found = feedbackAgent(workspace(), directory, ARJUN);
    expect(found).toEqual({ id: MILO, name: "Milo", spaceId: MILO_HOME });
    expect(feedbackWithWords(found?.name ?? "")).toBe("Write it with Milo");
  });

  it("moves to the Main space that spoke since", () => {
    const model = workspace(() => [
      event(
        "message.post",
        { space_id: J_HOME, message_id: "msg_1", text: "Morning" },
        "2026-10-26T10:00:00.000Z",
      ),
    ]);
    expect(feedbackAgent(model, directory, ARJUN)?.id).toBe(J);
  });

  it("is never one in a Main space this person isn't in", () => {
    expect(feedbackAgent(workspace(), directory, DANA)).toBeUndefined();
  });

  it("is none when the Main agents are archived or their harness was removed", () => {
    const gone: Directory = {
      ...directory,
      [J]: { ...directory[J], archived: true } as Directory[string],
      [HERMES]: {
        ...directory[HERMES],
        removedAt: "2026-10-26T00:00:00.000Z",
      } as Directory[string],
    };
    expect(feedbackAgent(workspace(), gone, ARJUN)).toBeUndefined();
  });
});
