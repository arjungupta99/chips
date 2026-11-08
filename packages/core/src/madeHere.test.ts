import { describe, expect, it } from "vitest";
import type { ClientEvent } from "./events.js";
import {
  heardMadeHere,
  type MadeHere,
  madeHereEvent,
  settleMadeHere,
  withMadeHere,
} from "./madeHere.js";
import { buildModel } from "./model.js";

const SENDER = { workspaceId: "ws_1", participantId: "usr_1" };
const AT = "2026-11-01T22:17:18.000Z";

function made(spaceId: string): MadeHere {
  const key = `space-${spaceId}`;
  return {
    key,
    sent: [],
    events: [
      madeHereEvent(
        {
          type: "space.created",
          space_id: spaceId,
          kind: "group",
          asked_of: "hrn_2",
          also_asked_of: ["hrn_3"],
          title: "Dude chat",
          idempotency_key: key,
        },
        SENDER,
        AT,
        1,
      ),
      madeHereEvent(
        {
          type: "membership.added",
          space_id: spaceId,
          participant_id: "hrn_2",
          participant_kind: "harness",
          role: "member",
          agent_name: "Luis",
          idempotency_key: "add-1",
        },
        SENDER,
        AT,
        2,
      ),
    ],
  };
}

const ELSEWHERE: ClientEvent = {
  seq: 7,
  type: "space.created",
  id: "evt_7",
  ts: "2026-11-01T09:00:00.000Z",
  workspace_id: "ws_1",
  space_id: "spc_old",
  actor: { kind: "person", id: "usr_1" },
  kind: "group",
  title: "Cc check",
};

/** The server's own `membership.added`, as it sends it back. */
function joined(seq: number, spaceId: string, participantId: string): ClientEvent {
  return {
    seq,
    type: "membership.added",
    id: `evt_${seq}`,
    ts: "2026-11-01T09:00:01.000Z",
    workspace_id: "ws_1",
    space_id: spaceId,
    actor: { kind: "person", id: "usr_1" },
    participant_id: participantId,
    participant_kind: "harness",
    role: "member",
    idempotency_key: "add-1",
  };
}

describe("spaces made here, before the server sends them back (ADR 0149's third addendum)", () => {
  it("are drawn from what was sent: its name, its owner, who was asked, newest first", () => {
    const model = withMadeHere(
      buildModel([ELSEWHERE], { selfId: "usr_1" }),
      new Map([["spc_new", made("spc_new")]]),
      "usr_1",
    );
    expect(model.spaces.map((space) => space.id)).toEqual(["spc_new", "spc_old"]);
    const [space] = model.spaces;
    expect(space?.title).toBe("Dude chat");
    expect(space?.askedOf).toBe("hrn_2");
    expect(space?.members).toEqual(["usr_1", "hrn_2"]);
    expect(space?.lastActivityAt).toBe(AT);
  });

  it("are the same object each time they are drawn, so a screen need not draw them again", () => {
    const sent = new Map([["spc_new", made("spc_new")]]);
    const model = buildModel([ELSEWHERE], { selfId: "usr_1" });
    expect(withMadeHere(model, sent, "usr_1").spaces[0]).toBe(
      withMadeHere(model, sent, "usr_1").spaces[0],
    );
  });

  it("give way to the server's own once it has everybody sent into it", () => {
    const sent = new Map([["spc_old", made("spc_old")]]);
    const model = buildModel([ELSEWHERE, joined(8, "spc_old", "hrn_2")], { selfId: "usr_1" });
    expect(withMadeHere(model, sent, "usr_1")).toBe(model);
    settleMadeHere(sent, model);
    expect(sent.size).toBe(0);
  });

  it("draw who was sent in over the server's own until the server sends them back too", () => {
    const sent = new Map([["spc_old", made("spc_old")]]);
    // The server has sent the space back, and not yet the harness asked into it.
    const model = buildModel([ELSEWHERE], { selfId: "usr_1" });
    expect(settleMadeHere(sent, model)).toBe(false);
    const drawn = withMadeHere(model, sent, "usr_1");
    const [space] = drawn.spaces;
    expect(drawn.spaces).toHaveLength(1);
    expect(space?.members).toEqual(["usr_1", "hrn_2"]);
    expect(space?.roles["hrn_2"]).toBe("member");
    expect(space?.held?.["hrn_2"]).toBe("Luis");
    expect(withMadeHere(model, sent, "usr_1").spaces[0]).toBe(space);

    expect(heardMadeHere(sent, ["add-1"])).toBe(true);
    expect(settleMadeHere(sent, model)).toBe(true);
    expect(sent.size).toBe(0);
  });

  it("stop waiting for one the server turned away, or sent back and took out again", () => {
    const sent = new Map([["spc_old", made("spc_old")]]);
    const model = buildModel([ELSEWHERE], { selfId: "usr_1" });
    heardMadeHere(sent, ["add-1"]);
    expect(withMadeHere(model, sent, "usr_1").spaces[0]?.members).toEqual(["usr_1"]);
  });

  it("are not drawn again once the server sent the space back and it went", () => {
    const sent = new Map([["spc_new", made("spc_new")]]);
    heardMadeHere(sent, ["space-spc_new"]);
    const model = buildModel([ELSEWHERE], { selfId: "usr_1" });
    expect(settleMadeHere(sent, model)).toBe(true);
    expect(withMadeHere(model, sent, "usr_1")).toBe(model);
  });

  it("hear only their own keys, each once", () => {
    const sent = new Map([["spc_new", made("spc_new")]]);
    expect(heardMadeHere(sent, ["msg-1"])).toBe(false);
    expect(heardMadeHere(sent, ["add-1"])).toBe(true);
    expect(heardMadeHere(sent, ["add-1"])).toBe(false);
    expect(sent.get("spc_new")?.heard).toEqual(["add-1"]);
  });

  it("leave a model with none made here as it was", () => {
    const model = buildModel([ELSEWHERE], { selfId: "usr_1" });
    expect(withMadeHere(model, new Map(), "usr_1")).toBe(model);
  });
});
