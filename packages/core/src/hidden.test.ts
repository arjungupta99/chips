import { describe, expect, it } from "vitest";
import { withHidden } from "./hidden.js";
import { type Line, lastWords, type Space, type WorkspaceModel } from "./model.js";

const line = (id: string): Line => ({
  id,
  seq: Number(id.slice(4)),
  kind: "text",
  authorId: "usr_1",
  authorKind: "person",
  text: id,
  ts: "2026-10-14T18:41:00.000Z",
});

/** A model as the overlay reads it: its spaces, and nothing else. */
function model(space: Partial<Space>): WorkspaceModel {
  return {
    spaces: [
      {
        id: "spc_1",
        kind: "group",
        members: [],
        roles: {},
        lines: [line("evt_1"), line("evt_2"), line("evt_3")],
        pins: [{ lineId: "evt_2", by: "usr_1", ts: "2026-10-14T18:41:00.000Z", seq: 9 }],
        ...space,
      } as Space,
    ],
  } as unknown as WorkspaceModel;
}

describe("withHidden (ADR 0167)", () => {
  it("hands back the same model when nothing is hidden", () => {
    const plain = model({});
    expect(withHidden(plain)).toBe(plain);
  });

  it("leaves out what the log hid, and its pin", () => {
    const seen = withHidden(model({ hidden: new Set(["evt_2"]) })).spaces[0];
    expect(seen?.lines.map((each) => each.id)).toEqual(["evt_1", "evt_3"]);
    expect(seen?.pins).toEqual([]);
  });

  it("leaves the Spaces list saying the last line the reader still has", () => {
    const seen = withHidden(model({ hidden: new Set(["evt_3"]) })).spaces[0];
    if (seen === undefined) throw new Error("no space");
    expect(lastWords(seen)).toBe("evt_2");
  });

  it("lays this device's asks over the log's: a hide not yet in it, and an Undo not yet in it", () => {
    const logged = model({ hidden: new Set(["evt_2"]) });
    const asked = new Map([
      ["evt_1", { spaceId: "spc_1", hidden: true }],
      ["evt_2", { spaceId: "spc_1", hidden: false }],
    ]);
    const seen = withHidden(logged, asked).spaces[0];
    expect(seen?.lines.map((each) => each.id)).toEqual(["evt_2", "evt_3"]);
    expect(seen?.hidden).toEqual(new Set(["evt_1"]));
  });

  it("makes the same space again for the same lines left out, so an unchanged room is not drawn again", () => {
    const logged = model({ hidden: new Set(["evt_2"]) });
    expect(withHidden(logged).spaces[0]).toBe(withHidden(logged).spaces[0]);
  });

  it("carries no set on once Undo has put everything back", () => {
    const logged = model({ hidden: new Set(["evt_2"]) });
    const seen = withHidden(logged, new Map([["evt_2", { spaceId: "spc_1", hidden: false }]]));
    expect(seen.spaces[0]?.hidden).toBeUndefined();
    expect(seen.spaces[0]?.lines).toHaveLength(3);
  });
});
