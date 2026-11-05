import { describe, expect, it } from "vitest";
import type { NeedsYouItem, Run, Space } from "./model.js";
import {
  aheadOf,
  attention,
  furthest,
  hasUnread,
  markRead,
  markSpacesRead,
  readMark,
  totalUnread,
  unreadCount,
} from "./read-state.js";

function space(id: string, seqs: number[]): Space {
  return {
    id,
    kind: "group",
    members: [],
    roles: {},
    state: "open",
    runs: [],
    sessions: [],
    pins: [],
    glimpse: false,
    lastEventSeq: Math.max(0, ...seqs),
    lines: seqs.map((seq) => ({
      id: `m${seq}`,
      seq,
      kind: "text" as const,
      authorId: "usr_1",
      authorKind: "person" as const,
      text: `line ${seq}`,
      ts: "2026-09-02T14:00:00.000Z",
    })),
  };
}

describe("read state", () => {
  it("marks a room to its last line, or past a run that has ended", () => {
    const run = (state: Run["state"], lastSeq: number): Run =>
      ({
        runId: "run_1",
        state,
        lastSeq,
        approvals: [],
        questions: [],
        steps: [],
      }) as unknown as Run;
    const quiet = { ...space("spc_1", [1, 2]), lastEventSeq: 4 };
    // A step logged, a status said, a question asked: the space's last event moves on, and a
    // glance at the room has read none of it.
    expect(readMark({ ...quiet, runs: [run("running", 4)] })).toBe(2);
    expect(readMark({ ...quiet, runs: [run("waiting", 4)] })).toBe(2);
    // A run ending is read by being here, even when its completion drew no line of its own.
    expect(readMark({ ...quiet, runs: [run("done", 4)] })).toBe(4);
    expect(readMark({ ...quiet, runs: [run("failed", 4)] })).toBe(4);
    // A line the server has not confirmed carries a placeholder, not a place to mark.
    const sending = {
      id: "m9",
      seq: Number.MAX_SAFE_INTEGER,
      kind: "text" as const,
      authorId: "usr_1",
      authorKind: "person" as const,
      text: "sending",
      ts: "2026-09-02T14:00:00.000Z",
      pending: true,
    };
    expect(readMark({ ...quiet, lines: [...quiet.lines, sending] })).toBe(2);
  });

  it("counts the lines after where a space was last read", () => {
    const conv = space("spc_1", [1, 2, 3, 4]);
    expect(unreadCount(conv, {})).toBe(4);
    expect(unreadCount(conv, { spc_1: 2 })).toBe(2);
    expect(unreadCount(conv, { spc_1: 4 })).toBe(0);
    expect(hasUnread(conv, { spc_1: 4 })).toBe(false);
  });

  it("does not count an optimistic line the server has not confirmed", () => {
    const conv: Space = {
      ...space("spc_1", [1]),
      lines: [
        {
          id: "m1",
          seq: 1,
          kind: "text",
          authorId: "usr_1",
          authorKind: "person",
          text: "a",
          ts: "t",
        },
        {
          id: "p",
          seq: 9e15,
          kind: "text",
          authorId: "usr_1",
          authorKind: "person",
          text: "b",
          ts: "t",
          pending: true,
        },
      ],
    };
    expect(unreadCount(conv, { spc_1: 1 })).toBe(0);
  });

  it("counts what is unread behind a pending line", () => {
    const base = space("spc_1", [1, 2, 3]);
    const conv: Space = {
      ...base,
      lines: [
        ...base.lines,
        {
          id: "p",
          seq: Number.MAX_SAFE_INTEGER,
          kind: "text",
          authorId: "usr_1",
          authorKind: "person",
          text: "mine, unsent",
          ts: "t",
          pending: true,
        },
      ],
    };
    expect(unreadCount(conv, { spc_1: 1 })).toBe(2);
  });

  it("totals across spaces", () => {
    const spaces = [space("a", [1, 2]), space("b", [1, 2, 3])];
    expect(totalUnread(spaces, { a: 1 })).toBe(1 + 3);
  });

  it("only ever moves forward", () => {
    let state = markRead({}, "spc_1", 4);
    expect(state).toEqual({ spc_1: 4 });
    state = markRead(state, "spc_1", 2);
    expect(state).toEqual({ spc_1: 4 });
    state = markRead(state, "spc_1", 6);
    expect(state).toEqual({ spc_1: 6 });
  });

  it("returns the same object when nothing changes, so a store can skip a render", () => {
    const state = { spc_1: 4 };
    expect(markRead(state, "spc_1", 3)).toBe(state);
  });

  it("reads many spaces as far as opening each would, and only forward (Read all)", () => {
    const spaces = [space("a", [1, 2]), space("b", [1, 2, 3]), space("c", [4])];
    const read = markSpacesRead({ a: 1, c: 9 }, spaces);
    expect(read).toEqual({ a: 2, b: 3, c: 9 });
    expect(totalUnread(spaces, read)).toBe(0);
    expect(markSpacesRead(read, spaces)).toBe(read);
  });
});

describe("attention", () => {
  const item = (
    kind: NeedsYouItem["kind"],
    tier: NeedsYouItem["tier"],
    seq: number,
  ): NeedsYouItem => ({
    kind,
    tier,
    id: `${kind}-${seq}`,
    spaceId: "spc_1",
    harnessId: "hrn_1",
    title: kind,
    seq,
  });

  it("keeps everything to decide, and what is to review or FYI only until read", () => {
    const items = [
      item("approval", "decide", 2),
      item("summary", "review", 5),
      item("checkpoint", "fyi", 9),
    ];
    expect(attention(items, {}).map((i) => i.id)).toEqual([
      "approval-2",
      "summary-5",
      "checkpoint-9",
    ]);
    expect(attention(items, { spc_1: 5 }).map((i) => i.id)).toEqual(["approval-2", "checkpoint-9"]);
    expect(attention(items, { spc_1: 9 }).map((i) => i.id)).toEqual(["approval-2"]);
  });
});

describe("the person's marks and this device's (ADR 0262)", () => {
  it("takes the further of two for each room, and the same map back when nothing moves", () => {
    const mine = { spc_1: 4, spc_2: 2 };
    expect(furthest(mine, { spc_1: 3, spc_2: 5, spc_3: 1 })).toEqual({
      spc_1: 4,
      spc_2: 5,
      spc_3: 1,
    });
    expect(furthest(mine, { spc_1: 4, spc_2: 1 })).toBe(mine);
  });

  it("owes the server the marks further than it has, for the rooms asked about", () => {
    const mine = { spc_1: 4, spc_2: 2, spc_left: 9 };
    expect(aheadOf(mine, { spc_1: 3, spc_2: 2 }, ["spc_1", "spc_2", "spc_9"])).toEqual({
      spc_1: 4,
    });
  });
});
