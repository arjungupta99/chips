/** What a list says and keeps while it picks rows (ADR 0181, ADR 0182). */

import { describe, expect, it } from "vitest";
import type { Directory } from "./events.js";
import type { Space } from "./model.js";
import {
  actAll,
  agentHintWords,
  agentLane,
  hintWords,
  keepLeaving,
  whyNotPicked,
  whyNotPickedAgent,
} from "./picking.js";

const row = (id: string) => ({ id });

describe("rows on their way out of the list (ADR 0181)", () => {
  it("stand where they stood until they have gone", () => {
    // b and d left the store at once; their rows fold where they were.
    const now = [row("a"), row("c"), row("e")];
    const held = [
      { item: row("d"), index: 3 },
      { item: row("b"), index: 1 },
    ];
    expect(keepLeaving(now, held).map((each) => each.id)).toEqual(["a", "b", "c", "d", "e"]);
  });

  it("are not drawn twice while the store still has them, and stand at the end past it", () => {
    expect(keepLeaving([row("a"), row("b")], [{ item: row("b"), index: 1 }])).toHaveLength(2);
    expect(keepLeaving([row("a")], [{ item: row("z"), index: 9 }]).map((each) => each.id)).toEqual([
      "a",
      "z",
    ]);
  });
});

describe("the line under the name while picking", () => {
  it("names what can't be picked, and nothing when everything can", () => {
    expect(hintWords(true, true)).toBe("Locked spaces and Main can't be picked");
    expect(hintWords(true, false)).toBe("Locked spaces can't be picked");
    expect(hintWords(false, true)).toBe("The Main space can't be picked");
    expect(hintWords(false, false)).toBeUndefined();
  });

  it("says the same of the Agents tab's rows that can't be picked (ADR 0182)", () => {
    expect(agentHintWords(true, true)).toBe("Main and others' agents can't be picked");
    expect(agentHintWords(true, false)).toBe("Main agents can't be picked");
    expect(agentHintWords(false, true)).toBe("Others' agents can't be picked");
    expect(agentHintWords(false, false)).toBeUndefined();
    // Locked ones (ADR 0199), with the others or alone.
    expect(agentHintWords(false, false, true)).toBe("Locked agents can't be picked");
    expect(agentHintWords(true, true, true)).toBe(
      "Main, locked and others' agents can't be picked",
    );
  });
});

describe("why a row can't be picked", () => {
  const space = (over: Partial<Space>) => ({ id: "s1", ...over }) as Space;

  it("says a locked room is locked first, then the Main room, then that it isn't theirs", () => {
    expect(whyNotPicked(space({ locked: true, home: true }), "Jacobian")).toBe(
      "Jacobian is locked. Unlock it in its details to archive or delete it.",
    );
    expect(whyNotPicked(space({ home: true }), "Jacobian")).toBe(
      "Jacobian is the Main space. It's always here.",
    );
    expect(whyNotPicked(space({}), "Plans")).toBe("You can't archive or delete Plans.");
  });

  it("says a Main agent is its harness's, and whose another's agent is", () => {
    const directory = {
      h1: { id: "h1", kind: "harness", displayName: "OpenClaw" },
      a1: { id: "a1", kind: "agent", displayName: "Rosa", harnessId: "h1" },
    } as unknown as Directory;
    expect(whyNotPickedAgent(directory, { id: "a1", name: "Rosa", lead: true })).toBe(
      "Rosa is its harness's Main agent: it can't be archived or deleted.",
    );
    expect(whyNotPickedAgent(directory, { id: "a1", name: "Rosa", lead: false })).toBe(
      "Only OpenClaw's owner or an admin can archive or delete Rosa.",
    );
    // Locked (ADR 0199): the way to let it go.
    const locked = { ...directory, a1: { ...directory["a1"], locked: true } } as Directory;
    expect(whyNotPickedAgent(locked, { id: "a1", name: "Rosa", lead: false })).toBe(
      "Rosa is locked. Unlock it on its card to archive or delete it.",
    );
  });
});

describe("a batch asked of the server (ADR 0182 addendum, 5 November 2026)", () => {
  /** An act that answers only when told to, saying which rows it was asked about, in order. */
  const answering = () => {
    const asked: string[] = [];
    const answers = new Map<string, { ok: () => void; no: (why: Error) => void }>();
    const act = (item: { readonly id: string }) =>
      new Promise<void>((ok, no) => {
        asked.push(item.id);
        answers.set(item.id, { ok, no });
      });
    const settle = async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    };
    return { asked, answers, act, settle };
  };

  it("asks about every row at once, not each after the last has answered", async () => {
    const { asked, answers, act, settle } = answering();
    const all = actAll([row("a"), row("b"), row("c")], act);
    await settle();
    expect(asked).toEqual(["a", "b", "c"]);
    for (const id of ["c", "a", "b"]) answers.get(id)?.ok();
    expect(await all).toEqual({ done: ["a", "b", "c"], refused: [] });
  });

  it("asks a lane's rows in turn, in the order given, while the other lanes go on", async () => {
    const { asked, answers, act, settle } = answering();
    const lanes: Record<string, string> = { a: "room", b: "b", c: "room", d: "room" };
    const all = actAll(
      [row("a"), row("b"), row("c"), row("d")],
      act,
      (item) => lanes[item.id] ?? "",
    );
    await settle();
    expect(asked).toEqual(["a", "b"]);
    answers.get("b")?.ok();
    await settle();
    expect(asked).toEqual(["a", "b"]);
    answers.get("a")?.ok();
    await settle();
    expect(asked).toEqual(["a", "b", "c"]);
    // Refused, it does not stop the one behind it.
    answers.get("c")?.no(new Error("locked"));
    await settle();
    expect(asked).toEqual(["a", "b", "c", "d"]);
    answers.get("d")?.ok();
    const { done, refused } = await all;
    expect(done).toEqual(["a", "b", "d"]);
    expect(refused.map((each) => [each.item.id, (each.error as Error).message])).toEqual([
      ["c", "locked"],
    ]);
  });

  it("says what was refused in the order given, a throw before any answer too", async () => {
    const { done, refused } = await actAll([row("a"), row("b"), row("c")], (item) => {
      if (item.id === "a") throw new Error("not yours");
      if (item.id === "c") return Promise.reject(new Error("gone"));
      return undefined;
    });
    expect(done).toEqual(["b"]);
    expect(refused.map((each) => each.item.id)).toEqual(["a", "c"]);
  });

  it("puts an agent in its room's lane, and one in no room in a lane of its own", () => {
    const directory = {
      a1: { id: "a1", kind: "agent", displayName: "Rosa", room: "s1" },
      a2: { id: "a2", kind: "agent", displayName: "Ivy", room: null },
    } as unknown as Directory;
    expect(agentLane(directory, "a1")).toBe("s1");
    expect(agentLane(directory, "a2")).toBe("a2");
    expect(agentLane(directory, "a3")).toBe("a3");
  });
});
