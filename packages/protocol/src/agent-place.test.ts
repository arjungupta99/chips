/**
 * The one-room rule, on its own (agents review, findings 5 to 8). The server's door, its store's
 * gate and the conformance fake all ask this function, so what it says is said here once.
 */

import { describe, expect, it } from "vitest";
import { type AgentPlacement, refuseAgentInto, STOPPED_BECAUSE } from "./agent-place.js";

const ROOM = "spc_01K4ZQPX000000000000000002";
const OTHER = "spc_01K4ZQPX000000000000000009";

function placing(overrides: Partial<AgentPlacement> = {}): AgentPlacement {
  return {
    agent: { id: "agt_01K4ZQPX000000000000000007", lead: false },
    room: { space_id: ROOM, state: "open", home: false },
    elsewhere: null,
    others: 0,
    replacesLead: false,
    ...overrides,
  };
}

describe("where an agent may be", () => {
  it("takes a free agent into an open room, with whoever is there", () => {
    expect(refuseAgentInto(placing())).toBeUndefined();
    expect(refuseAgentInto(placing({ others: 3 }))).toBeUndefined();
  });

  it("refuses a room that is not there", () => {
    expect(refuseAgentInto(placing({ room: null }))).toMatchObject({ kind: "unknown_space" });
  });

  it("refuses an archived room until it is unarchived", () => {
    const shut = { space_id: ROOM, state: "closed", home: false };
    expect(refuseAgentInto(placing({ room: shut }))).toMatchObject({ kind: "room_closed" });
  });

  it("refuses an agent that is in another room, open or archived, and says which", () => {
    expect(refuseAgentInto(placing({ elsewhere: OTHER }))).toEqual({
      kind: "agent_elsewhere",
      message: "that agent is in another space: move it, or pick another",
      space_id: OTHER,
    });
  });

  it("takes only the Main agent into a Main room, and no second agent", () => {
    const home = { space_id: ROOM, state: "open", home: true };
    const lead = { id: "agt_01K4ZQPX000000000000000008", lead: true };
    expect(refuseAgentInto(placing({ room: home }))).toMatchObject({ kind: "lead_room" });
    expect(refuseAgentInto(placing({ room: home, agent: lead }))).toBeUndefined();
    expect(refuseAgentInto(placing({ room: home, agent: lead, others: 1 }))).toMatchObject({
      kind: "lead_room",
    });
  });

  it("does not let the Main agent's place in its Main room be taken", () => {
    const home = { space_id: ROOM, state: "open", home: true };
    const lead = { id: "agt_01K4ZQPX000000000000000008", lead: true };
    expect(refuseAgentInto(placing({ room: home, agent: lead, replacesLead: true }))).toMatchObject(
      { kind: "lead_room", message: "the Main agent stays in its Main space" },
    );
  });

  it("says a Main room's reason before any other", () => {
    const shutHome = { space_id: ROOM, state: "closed", home: true };
    expect(refuseAgentInto(placing({ room: shutHome, elsewhere: OTHER }))).toMatchObject({
      kind: "lead_room",
    });
  });
});

describe("what a run is told when its agent leaves", () => {
  it("has words for every reason an agent leaves a room", () => {
    expect(Object.keys(STOPPED_BECAUSE).sort()).toEqual(
      ["agent_archived", "agent_deleted", "archived", "deleted", "moved", "removed"].sort(),
    );
  });
});
