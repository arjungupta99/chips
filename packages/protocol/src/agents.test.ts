import { describe, expect, it } from "vitest";
import { AGENT_EVENTS, inLegacyView } from "./agents.js";
import { type ContextLine, renderLine } from "./context.js";

const JACOBIAN = "hrn_jacobian";
const view = { harnessId: JACOBIAN, own: new Set(["agt_chess", "agt_hello"]) };

describe("a harness that has not learnt agents", () => {
  it("is shown its own agents as itself, and any other agent as a harness", () => {
    const event = {
      type: "message.new",
      space_id: "spc_hello",
      actor: { kind: "agent", id: "agt_openclaw" },
      from: { participant_id: "agt_openclaw", kind: "agent", display_name: "OpenClaw" },
      addressed_to: ["agt_hello"],
      mentions: ["agt_hello"],
      for: ["agt_hello"],
      context: {
        lines: [
          {
            seq: 4,
            kind: "said",
            from: { id: "agt_chess", kind: "agent", name: "Chess Game" },
            addressed_to: ["agt_openclaw", "agt_hello", "agt_chess"],
          },
          { seq: 5, kind: "joined", from: { id: "usr_arjun", kind: "person", name: "Arjun" } },
        ],
      },
    };
    expect(inLegacyView(event, view)).toEqual({
      type: "message.new",
      space_id: "spc_hello",
      actor: { kind: "harness", id: "agt_openclaw" },
      from: { participant_id: "agt_openclaw", kind: "harness", display_name: "OpenClaw" },
      addressed_to: [JACOBIAN],
      mentions: [JACOBIAN],
      context: {
        lines: [
          {
            seq: 4,
            kind: "said",
            from: { id: JACOBIAN, kind: "harness", name: "Chess Game" },
            addressed_to: ["agt_openclaw", JACOBIAN],
          },
          { seq: 5, kind: "joined", from: { id: "usr_arjun", kind: "person", name: "Arjun" } },
        ],
      },
    });
  });

  it("is shown whom a line was for with its own agent as itself, so the plain form reads it as the taker", () => {
    const line: ContextLine = {
      seq: 4,
      at: "2026-11-13T23:16:00.000Z",
      kind: "said",
      from: { id: "usr_arjun", kind: "person", name: "Arjun" },
      text: "Both of you",
      addressed_to: ["agt_openclaw", "agt_hello"],
      to: [
        { id: "agt_openclaw", name: "OpenClaw" },
        { id: "agt_hello", name: "Hello" },
      ],
    };
    const shown = inLegacyView(line, view);
    expect(shown.to).toEqual([
      { id: "agt_openclaw", name: "OpenClaw" },
      { id: JACOBIAN, name: "Hello" },
    ]);
    // A harness that knows its agent only as itself takes the turn as itself.
    expect(renderLine(shown, { taker: JACOBIAN })).toBe("Arjun, to you and OpenClaw: Both of you");
    const alone = inLegacyView({ ...line, to: [{ id: "agt_hello", name: "Hello" }] }, view);
    expect(renderLine(alone, { taker: JACOBIAN })).toBe("Arjun: Both of you");
  });

  it("reads a membership of its agent as its own, and leaves every other word alone", () => {
    const added = {
      type: "membership.added",
      participant_id: "agt_chess",
      participant_kind: "agent",
      role: "member",
      text: "agent",
    };
    expect(inLegacyView(added, view)).toEqual({
      type: "membership.added",
      participant_id: JACOBIAN,
      participant_kind: "harness",
      role: "member",
      text: "agent",
    });
  });

  it("finds the room note for its own agent under its own id (ADR 0092)", () => {
    const room = {
      members: [
        { participant_id: "usr_arjun", kind: "person", name: "Arjun", handle: "@Arjun" },
        { participant_id: "agt_hello", kind: "agent", name: "Hello", handle: "@Hello" },
        { participant_id: "agt_openclaw", kind: "agent", name: "OpenClaw", handle: "@OpenClaw" },
      ],
      notes: { agt_hello: "In this room: …" },
    };
    expect(inLegacyView({ type: "message.new", room }, view)).toEqual({
      type: "message.new",
      room: {
        members: [
          { participant_id: "usr_arjun", kind: "person", name: "Arjun", handle: "@Arjun" },
          { participant_id: JACOBIAN, kind: "harness", name: "Hello", handle: "@Hello" },
          {
            participant_id: "agt_openclaw",
            kind: "harness",
            name: "OpenClaw",
            handle: "@OpenClaw",
          },
        ],
        notes: { [JACOBIAN]: "In this room: …" },
      },
    });
  });

  it("is never handed the events it has no words for", () => {
    expect([...AGENT_EVENTS]).toEqual([
      "agent.registered",
      "agent.updated",
      "membership.replaced",
      "agent.attached",
      "agent.released",
      "agent.fork",
      "agent.asked",
      "message.held",
    ]);
  });
});
