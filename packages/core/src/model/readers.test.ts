/**
 * What a space is called and which spaces a list shows: the phone's, the desktop's and search's
 * one rule (moved here from the phone on 6 October 2026, when search came to need it).
 */

import { describe, expect, it } from "vitest";
import type { Directory } from "../events.js";
import { runGoing, spaceById, spaceList, spaceTitle } from "./readers.js";
import type { Line, Run, Space, WorkspaceModel } from "./types.js";

const DIRECTORY: Directory = {
  per_arjun: { id: "per_arjun", kind: "person", displayName: "Arjun" },
  per_dana: { id: "per_dana", kind: "person", displayName: "Dana Ruiz" },
  har_scout: { id: "har_scout", kind: "harness", displayName: "Scout", ownerId: "per_arjun" },
};

function space(over: Partial<Space> = {}): Space {
  return {
    id: "sp_1",
    kind: "room",
    members: [],
    roles: {},
    state: "open",
    lastEventSeq: 1,
    lines: [],
    runs: [],
    sessions: [],
    pins: [],
    glimpse: false,
    ...over,
  };
}

function line(over: Partial<Line> = {}): Line {
  return {
    id: "ln_1",
    seq: 1,
    kind: "text",
    authorId: "per_dana",
    authorKind: "person",
    text: "hello",
    ts: "2026-09-07T10:00:00.000Z",
    ...over,
  };
}

describe("what a space is called", () => {
  it("is its title when it has one", () => {
    expect(spaceTitle(space({ title: "Supplier email" }), DIRECTORY)).toBe("Supplier email");
  });

  it("is its harness when it has no title but has a run", () => {
    const withRun = space({ run: { harnessId: "har_scout" } as Space["run"] });
    expect(spaceTitle(withRun, DIRECTORY)).toBe("Scout");
  });

  it("is who is in it, otherwise — nobody has ever found a space called Untitled", () => {
    expect(spaceTitle(space({ members: ["per_arjun", "per_dana"] }), DIRECTORY)).toBe(
      "Arjun, Dana Ruiz",
    );
    expect(spaceTitle(space(), DIRECTORY)).toBe("Space");
  });

  it("says You for the one reading it, whatever they go by (ADR 0082)", () => {
    const room = space({ members: ["per_dana", "per_arjun"] });
    expect(spaceTitle(room, DIRECTORY, "per_arjun")).toBe("You, Dana Ruiz");
    expect(spaceTitle(room, DIRECTORY, "per_dana")).toBe("You, Arjun");
  });

  it("is New space for a room asked of a harness that has done nothing with it yet", () => {
    const brief = line({ authorId: "per_arjun", text: "Plan the **kitchen** remodel\nby May" });
    const asked = space({
      kind: "direct",
      askedOf: "har_scout",
      members: ["per_arjun", "har_scout"],
      lines: [brief],
    });
    expect(spaceTitle(asked, DIRECTORY)).toBe("New space");
    // Claimed without a name: the first words stand in, as plain words on one line.
    expect(spaceTitle({ ...asked, keyed: true }, DIRECTORY)).toBe(
      "Plan the kitchen remodel by May",
    );
    // Named by the harness: its name.
    expect(spaceTitle({ ...asked, keyed: true, title: "Kitchen remodel" }, DIRECTORY)).toBe(
      "Kitchen remodel",
    );
  });
});

describe("the space list", () => {
  it("puts the open before the closed, and the most recent first in each", () => {
    const model = {
      spaces: [
        space({ id: "a", lastActivityAt: "2026-09-07T09:00:00.000Z" }),
        space({ id: "b", lastActivityAt: "2026-09-07T11:00:00.000Z" }),
        space({ id: "c", state: "closed", lastActivityAt: "2026-09-07T12:00:00.000Z" }),
      ],
    } as unknown as WorkspaceModel;
    expect(spaceList(model).map((each) => each.id)).toEqual(["b", "a", "c"]);
  });

  it("leaves out a thread, which belongs to the line it grew from", () => {
    const model = {
      spaces: [space({ id: "a" }), space({ id: "t", parentSpaceId: "a" })],
    } as unknown as WorkspaceModel;
    expect(spaceList(model).map((each) => each.id)).toEqual(["a"]);
  });

  it("leaves out a glimpse, whose one card reaches the reader by push (ADR 0042)", () => {
    const model = {
      spaces: [space({ id: "a" }), space({ id: "g", glimpse: true })],
    } as unknown as WorkspaceModel;
    expect(spaceList(model).map((each) => each.id)).toEqual(["a"]);
  });
});

describe("a space by its id", () => {
  it("is the model's space with that id, or nothing", () => {
    const model = { spaces: [space({ id: "a" }), space({ id: "b" })] } as unknown as WorkspaceModel;
    expect(spaceById(model, "b")?.id).toBe("b");
    expect(spaceById(model, "z")).toBeUndefined();
  });

  it("is the first with that id, as a walk of the rooms found it", () => {
    const first = space({ id: "a", title: "First" });
    const model = {
      spaces: [first, space({ id: "a", title: "Second" })],
    } as unknown as WorkspaceModel;
    expect(spaceById(model, "a")).toBe(first);
  });

  it("is each model's own: a new model is looked up afresh", () => {
    const before = { spaces: [space({ id: "a", title: "Before" })] } as unknown as WorkspaceModel;
    expect(spaceById(before, "a")?.title).toBe("Before");
    const after = { spaces: [space({ id: "a", title: "After" })] } as unknown as WorkspaceModel;
    expect(spaceById(after, "a")?.title).toBe("After");
  });
});

describe("a run that is going", () => {
  it("is one queued, running or waiting on someone; one done, failed or stopped is over", () => {
    const going = (state: Run["state"]) => runGoing({ state } as Run);
    expect(["queued", "running", "waiting"].map((state) => going(state as Run["state"]))).toEqual([
      true,
      true,
      true,
    ]);
    expect(["done", "failed", "cancelled"].map((state) => going(state as Run["state"]))).toEqual([
      false,
      false,
      false,
    ]);
  });
});
