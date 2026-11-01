import { describe, expect, it } from "vitest";
import type { WorkspaceModel } from "./model.js";
import { type PendingMessage, withPending } from "./pending.js";

const MODEL: WorkspaceModel = {
  spaces: [
    {
      id: "spc_1",
      kind: "group",
      members: ["usr_1"],
      roles: { usr_1: "owner" },
      state: "open",
      lastEventSeq: 2,
      runs: [],
      sessions: [],
      pins: [],
      glimpse: false,
      lines: [
        {
          id: "m1",
          seq: 1,
          kind: "text",
          authorId: "usr_1",
          authorKind: "person",
          text: "real",
          ts: "t",
        },
      ],
    },
  ],
  fleet: [],
  needsYou: [],
  lanes: [],
  harnesses: {},
  audit: [],
  connections: {},
  attachmentCaps: { image: null, video: null, file: null },
  exchangeLimits: { stop: 16, hold: 48, circles: true },
  takenOut: {},
  people: {},
};

const PENDING: PendingMessage = {
  key: "msg-1",
  spaceId: "spc_1",
  authorId: "usr_1",
  text: "on its way",
  ts: "2026-09-02T14:00:00.000Z",
};

describe("withPending", () => {
  it("returns the model untouched when nothing is pending", () => {
    expect(withPending(MODEL, [])).toBe(MODEL);
  });

  it("adds a pending line after the real ones, marked pending", () => {
    const model = withPending(MODEL, [PENDING]);
    const lines = model.spaces[0]?.lines ?? [];
    expect(lines).toHaveLength(2);
    expect(lines.at(-1)).toMatchObject({ text: "on its way", pending: true });
    expect(lines.at(-1)?.seq).toBe(Number.MAX_SAFE_INTEGER);
  });

  it("draws who the composer said a message goes to, until Chips says (ADR 0081)", () => {
    const model = withPending(MODEL, [{ ...PENDING, addressedTo: ["hrn_1"] }]);
    expect(model.spaces[0]?.lines.at(-1)).toMatchObject({ addressedTo: ["hrn_1"] });
    expect(withPending(MODEL, [PENDING]).spaces[0]?.lines.at(-1)).not.toHaveProperty("addressedTo");
    const everyone = withPending(MODEL, [
      { ...PENDING, addressedTo: ["hrn_1"], addressedToAll: true },
    ]);
    expect(everyone.spaces[0]?.lines.at(-1)).toMatchObject({
      addressedTo: ["hrn_1"],
      addressedToAll: true,
    });
  });

  it("keeps a refused message on screen, with the reason", () => {
    const model = withPending(MODEL, [{ ...PENDING, failed: "not a member" }]);
    expect(model.spaces[0]?.lines.at(-1)).toMatchObject({
      pending: true,
      failed: "not a member",
    });
  });

  it("ignores a pending message for a space that is not in the model", () => {
    const model = withPending(MODEL, [{ ...PENDING, spaceId: "spc_gone" }]);
    expect(model.spaces[0]?.lines).toHaveLength(1);
  });
});

describe("a pending message with files", () => {
  it("carries them on its line, so the grid shows before the server answers", () => {
    const space = {
      id: "spc_1",
      lines: [],
    } as unknown as WorkspaceModel["spaces"][number];
    const model = {
      spaces: [space],
      fleet: [],
      needsYou: [],
      harnesses: {},
      audit: [],
    } as unknown as WorkspaceModel;
    const attachments = [{ id: "att_1", filename: "a.png", mimeType: "image/png", byteSize: 1 }];
    const shown = withPending(model, [
      { key: "k", spaceId: "spc_1", authorId: "usr_1", text: "", ts: "t", attachments },
    ]);
    expect(shown.spaces[0]?.lines[0]?.attachments).toEqual(attachments);
  });
});
