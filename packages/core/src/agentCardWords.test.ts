/** What an agent's card says beyond its facts (ADR 0270): the room picker's words and rooms, its history row. */

import { describe, expect, it } from "vitest";
import {
  historyRoomsWords,
  pickableRooms,
  roomPickWords,
  staysFailedWords,
} from "./agentCardWords.js";
import type { AgentStay } from "./agentsTab.js";
import type { Space } from "./model/types.js";

const space = (id: string, over: Partial<Space> = {}): Space =>
  ({ id, state: "open", kind: "group", lastActivityAt: undefined, ...over }) as unknown as Space;

describe("the room picker", () => {
  it("says what each act does to the agent", () => {
    expect(roomPickWords("put", "Kit", "")).toEqual({
      title: "Put Kit in a space",
      hint: "It's in one space at a time. What it said while in none is said there.",
    });
    expect(roomPickWords("move", "Kit", "Ops").title).toBe("Move Kit to another space");
    expect(roomPickWords("fork", "Kit", "Ops").hint).toBe("A copy joins. Kit stays in Ops.");
  });

  it("offers the open rooms the agent is not in, the latest to speak first", () => {
    const rooms = pickableRooms(
      [
        space("old", { lastActivityAt: "2026-11-01T00:00:00Z" }),
        space("new", { lastActivityAt: "2026-11-03T00:00:00Z" }),
        space("here"),
        space("main", { home: true } as Partial<Space>),
        space("chan", { kind: "channel" } as Partial<Space>),
        space("thread", { parentSpaceId: "new" } as Partial<Space>),
        space("shut", { state: "closed" }),
      ],
      "here",
    );
    expect(rooms.map((each) => each.id)).toEqual(["new", "old"]);
  });
});

describe("the Message history row", () => {
  it("counts the spaces once the server has said", () => {
    const stay = (spaceId: string) => ({ spaceId, from: "2026-11-01T00:00:00Z" }) as AgentStay;
    expect(historyRoomsWords(undefined)).toBeUndefined();
    expect(historyRoomsWords([stay("a")])).toBe("1 space");
    expect(historyRoomsWords([stay("a"), stay("b"), stay("a")])).toBe("2 spaces");
  });

  it("says plainly why the server didn't say where it has been", () => {
    expect(staysFailedWords(new Error("No route matches GET /v1/agents/x/stays"))).toBe(
      "This server is older than the app, and can't say where an agent has been yet.",
    );
    expect(staysFailedWords(undefined)).toBe("The server didn't say where it has been.");
    expect(staysFailedWords(new Error("Not yours"))).toBe("Not yours");
  });
});
