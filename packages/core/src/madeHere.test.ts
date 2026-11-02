import { describe, expect, it } from "vitest";
import type { ClientEvent } from "./events.js";
import { type MadeHere, madeHereEvent, settleMadeHere, withMadeHere } from "./madeHere.js";
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

  it("give way to the server's own once the model has it", () => {
    const sent = new Map([["spc_old", made("spc_old")]]);
    const model = buildModel([ELSEWHERE], { selfId: "usr_1" });
    expect(withMadeHere(model, sent, "usr_1")).toBe(model);
    settleMadeHere(sent, model);
    expect(sent.size).toBe(0);
  });

  it("leave a model with none made here as it was", () => {
    const model = buildModel([ELSEWHERE], { selfId: "usr_1" });
    expect(withMadeHere(model, new Map(), "usr_1")).toBe(model);
  });
});
