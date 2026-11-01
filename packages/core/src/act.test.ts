/**
 * `act` is what the composer's line does. It was the web app's until WP6 needed it on the
 * phone as well; these tests came with the move, because until then it was only ever exercised
 * through the web shell's own tests and the phone's composer has no such shell.
 *
 * The store is a recorder: `act` is pure over the interface, so what it did is the list of
 * calls it made, and what it refused is the sentence it returned.
 */

import { describe, expect, it } from "vitest";
import { type ActContext, act } from "./act.js";
import type { Command } from "./commands.js";
import type { Directory, Participant } from "./events.js";
import type { Line, MessageRoute, Run, Space } from "./model/index.js";
import type { Store } from "./store.js";

interface Recorder {
  readonly store: Store;
  readonly calls: { name: string; args: unknown }[];
}

/** A store that records rather than sends. Every method `act` may reach for is on it. */
function recorder(): Recorder {
  const calls: { name: string; args: unknown }[] = [];
  const record =
    (name: string) =>
    (args: unknown): void => {
      calls.push({ name, args });
    };
  const store = {
    send: record("send"),
    leaveSpace: record("leaveSpace"),
    updateSpace: record("updateSpace"),
    addMember: record("addMember"),
    removeMember: record("removeMember"),
    sendFeedback: record("sendFeedback"),
    steerRun: record("steerRun"),
    pauseRun: record("pauseRun"),
    resumeRun: record("resumeRun"),
    stopRun: record("stopRun"),
  } as unknown as Store;
  return { store, calls };
}

function line(over: Partial<Line> = {}): Line {
  return {
    id: "ln_1",
    seq: 1,
    kind: "text",
    authorId: "har_scout",
    authorKind: "harness",
    text: "Emailed dana@northwind.com.",
    ts: "2026-09-07T10:00:00.000Z",
    ...over,
  };
}

function space(over: Partial<Space> = {}): Space {
  return {
    id: "sp_1",
    kind: "room",
    members: ["per_arjun", "har_scout"],
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

function run(over: Partial<Run> = {}): Run {
  return {
    runId: "run_1",
    spaceId: "sp_1",
    harnessId: "har_scout",
    goal: "Email the supplier",
    state: "running",
    lastSeq: 0,
    paused: false,
    steps: [],
    approvals: [],
    questions: [],
    ...over,
  };
}

const DIRECTORY: Directory = {
  per_arjun: { id: "per_arjun", kind: "person", displayName: "Arjun" },
  per_dana: { id: "per_dana", kind: "person", displayName: "Dana Ruiz" },
  har_scout: { id: "har_scout", kind: "harness", displayName: "Scout" },
};

function context(over: Partial<ActContext> = {}): ActContext {
  const { store } = recorder();
  return {
    store,
    spaceId: "sp_1",
    run: undefined,
    space: space(),
    directory: DIRECTORY,
    ...over,
  };
}

describe("a message", () => {
  it("is sent", () => {
    const { store, calls } = recorder();
    const said = act({ kind: "message", text: "ship it" }, context({ store }));
    expect(said).toBeUndefined();
    expect(calls).toEqual([{ name: "send", args: { spaceId: "sp_1", text: "ship it" } }]);
  });

  it("carries its files", () => {
    const { store, calls } = recorder();
    const attachment = {
      id: "at_1",
      filename: "plan.pdf",
      mimeType: "application/pdf",
      byteSize: 12,
    } as const;
    act({ kind: "message", text: "here" }, context({ store }), [attachment]);
    expect(calls[0]?.args).toMatchObject({ attachments: [attachment] });
  });

  it("names the pinned visit, and only when it is pinned", () => {
    const session = { sessionRef: "ses_9" };
    const live = { how: "live", pinned: true, session } as unknown as MessageRoute;
    const loose = { how: "live", pinned: false, session } as unknown as MessageRoute;
    const pinned = recorder();
    act({ kind: "message", text: "x" }, context({ store: pinned.store, route: live }));
    expect(pinned.calls[0]?.args).toMatchObject({ sessionRef: "ses_9" });
    const free = recorder();
    act({ kind: "message", text: "x" }, context({ store: free.store, route: loose }));
    expect(free.calls[0]?.args).not.toHaveProperty("sessionRef");
  });

  it("carries the capsule's aim: to on the wire, and who it said on the line (ADR 0081)", () => {
    const pair = space({ members: ["per_arjun", "har_scout", "har_tree"] });
    const directory: Directory = {
      ...DIRECTORY,
      har_tree: { id: "har_tree", kind: "harness", displayName: "Tree" },
    };
    const aimed = (aim: ActContext["aim"]) => {
      const { store, calls } = recorder();
      act({ kind: "message", text: "x" }, context({ store, space: pair, directory, aim }));
      return calls[0]?.args;
    };
    expect(aimed({ ids: ["har_tree"], by: "pick" })).toMatchObject({
      to: ["har_tree"],
      addressedTo: ["har_tree"],
    });
    expect(aimed({ ids: ["har_scout", "har_tree"], by: "default", all: true })).toMatchObject({
      to: "all",
      addressedTo: ["har_scout", "har_tree"],
    });
    // A person picked goes on the wire, and the line names them apart from its agents (ADR 0204).
    const toPerson = aimed({ ids: ["har_tree", "per_dana"], by: "pick" });
    expect(toPerson).toMatchObject({
      to: ["har_tree", "per_dana"],
      addressedTo: ["har_tree"],
      addressedPeople: ["per_dana"],
    });
    // Everyone is its agents, and pushes nobody new: the line names no person.
    const toAll = aimed({ ids: ["har_scout", "har_tree", "per_dana"], by: "pick", all: true });
    expect(toAll).toMatchObject({ to: "all", addressedTo: ["har_scout", "har_tree"] });
    expect(toAll).not.toHaveProperty("addressedPeople");
    // An @ decides for itself: no to, and the line says where it goes.
    const byAt = aimed({ ids: ["har_scout"], by: "at" });
    expect(byAt).not.toHaveProperty("to");
    expect(byAt).toMatchObject({ addressedTo: ["har_scout"] });
    expect(aimed(undefined)).not.toHaveProperty("addressedTo");
  });

  it("carries the line it replies to, with no to when the reply decides (ADR 0219)", () => {
    const { store, calls } = recorder();
    act(
      { kind: "message", text: "Make it 8" },
      context({ store, replyTo: "evt_1", aim: { ids: ["har_scout"], by: "reply" } }),
    );
    expect(calls[0]?.args).toMatchObject({ replyTo: "evt_1", addressedTo: ["har_scout"] });
    expect(calls[0]?.args).not.toHaveProperty("to");
  });

  it("stops when the visit it was pinned to has gone", () => {
    const { store, calls } = recorder();
    const gone = { how: "gone" } as unknown as MessageRoute;
    const said = act({ kind: "message", text: "x" }, context({ store, route: gone }));
    expect(said).toMatch(/session you pinned has gone/);
    expect(calls).toEqual([]);
  });
});

describe("a command", () => {
  it("refuses to carry files", () => {
    const { store, calls } = recorder();
    const attachment = {
      id: "at_1",
      filename: "plan.pdf",
      mimeType: "application/pdf",
      byteSize: 12,
    } as const;
    const said = act({ kind: "pause" }, context({ store }), [attachment]);
    expect(said).toMatch(/Files go with a message/);
    expect(calls).toEqual([]);
  });

  it("says so when it is not one", () => {
    const unknown: Command = { kind: "unknown", name: "frobnicate", hint: "Try /help." };
    expect(act(unknown, context())).toBe("/frobnicate is not a command here. Try /help.");
  });

  it("leaves a space with nothing going on", () => {
    const { store, calls } = recorder();
    expect(act({ kind: "leave" }, context({ store }))).toBeUndefined();
    expect(calls).toEqual([{ name: "leaveSpace", args: { spaceId: "sp_1" } }]);
  });
});

describe("a command about the room", () => {
  it("retitles it", () => {
    const { store, calls } = recorder();
    act({ kind: "title", title: "Supplier email" }, context({ store }));
    expect(calls).toEqual([
      { name: "updateSpace", args: { spaceId: "sp_1", title: "Supplier email" } },
    ]);
  });

  it("closes an open one and refuses a closed one", () => {
    const { store, calls } = recorder();
    expect(act({ kind: "close" }, context({ store }))).toBeUndefined();
    expect(calls[0]).toEqual({ name: "updateSpace", args: { spaceId: "sp_1", state: "closed" } });
    const shut = context({ space: space({ state: "closed" }) });
    expect(act({ kind: "close" }, shut)).toBe("This space is already archived.");
  });

  it("reopens a closed one and refuses an open one", () => {
    const { store, calls } = recorder();
    const shut = context({ store, space: space({ state: "closed" }) });
    expect(act({ kind: "reopen" }, shut)).toBeUndefined();
    expect(calls[0]).toEqual({ name: "updateSpace", args: { spaceId: "sp_1", state: "open" } });
    expect(act({ kind: "reopen" }, context())).toBe("This space is not archived.");
  });

  it("neither retitles nor archives one whose changes are locked, and still brings one back (ADR 0156)", () => {
    const { store, calls } = recorder();
    const locked = context({ store, space: space({ locked: true }) });
    const words = "This space's changes are locked. Unlock them in its sheet first.";
    expect(act({ kind: "title", title: "Supplier email" }, locked)).toBe(words);
    expect(act({ kind: "close" }, locked)).toBe(words);
    expect(calls).toEqual([]);
    const shut = context({ store, space: space({ state: "closed", locked: true }) });
    expect(act({ kind: "reopen" }, shut)).toBeUndefined();
    expect(calls).toEqual([{ name: "updateSpace", args: { spaceId: "sp_1", state: "open" } }]);
  });

  it("adds somebody by the name a person typed", () => {
    const { store, calls } = recorder();
    expect(act({ kind: "add", who: "Dana Ruiz" }, context({ store }))).toBeUndefined();
    expect(calls).toEqual([
      { name: "addMember", args: { spaceId: "sp_1", participantId: "per_dana", kind: "person" } },
    ]);
  });

  it("will not add a harness that was removed from the workspace (ADR 0078)", () => {
    const { store, calls } = recorder();
    const directory: Directory = {
      ...DIRECTORY,
      har_scout: { ...(DIRECTORY["har_scout"] as Participant), removedAt: "2026-09-27T10:00:00Z" },
    };
    const elsewhere = space({ members: ["per_arjun"] });
    expect(
      act({ kind: "add", who: "Scout" }, context({ store, directory, space: elsewhere })),
    ).toBe("Scout was removed from the workspace.");
    expect(calls).toEqual([]);
  });

  it("will not add a person who is no longer in the workspace, however they went (ADR 0243)", () => {
    const { store, calls } = recorder();
    const directory: Directory = {
      ...DIRECTORY,
      per_dana: { ...(DIRECTORY["per_dana"] as Participant), removedAt: "2026-10-29T10:00:00Z" },
    };
    const elsewhere = space({ members: ["per_arjun"] });
    expect(
      act({ kind: "add", who: "Dana Ruiz" }, context({ store, directory, space: elsewhere })),
    ).toBe("Dana Ruiz is no longer in the workspace.");
    expect(calls).toEqual([]);
  });

  it("refuses a name the directory does not hold", () => {
    expect(act({ kind: "add", who: "Nobody" }, context())).toBe(
      "Nobody called Nobody is in your directory.",
    );
  });

  it("will not add somebody already here, nor remove somebody who is not", () => {
    const here = context({ space: space({ members: ["per_dana"] }) });
    expect(act({ kind: "add", who: "dana ruiz" }, here)).toBe(
      "Dana Ruiz is already in this space.",
    );
    expect(act({ kind: "remove", who: "Dana" }, context())).toBe("Dana Ruiz is not in this space.");
  });

  /** Agents review, findings 9 and 13: `/add` and `/remove` say the door's rule, and send nothing. */
  it("says why an agent cannot be added, rather than sending what the door turns away", () => {
    const { store, calls } = recorder();
    const directory: Directory = {
      ...DIRECTORY,
      agt_lead: {
        id: "agt_lead",
        kind: "agent",
        displayName: "Lead",
        harnessId: "har_scout",
        lead: true,
      },
      agt_busy: {
        id: "agt_busy",
        kind: "agent",
        displayName: "Busy",
        harnessId: "har_scout",
        room: "sp_9",
      },
      agt_free: {
        id: "agt_free",
        kind: "agent",
        displayName: "Free",
        harnessId: "har_scout",
        room: null,
      },
    };
    const here = context({ store, directory });
    expect(act({ kind: "add", who: "Lead" }, here)).toBe(
      "Lead is a Main agent, and stays in its Main space.",
    );
    expect(act({ kind: "add", who: "Busy" }, here)).toBe(
      "Busy is in another space. Move it here from this space's members.",
    );
    const shut = context({ store, directory, space: space({ state: "closed" }) });
    expect(act({ kind: "add", who: "Free" }, shut)).toBe(
      "This space is archived. Unarchive it first.",
    );
    expect(calls).toEqual([]);
    expect(act({ kind: "add", who: "Free" }, here)).toBeUndefined();
    expect(calls.map((call) => call.name)).toEqual(["addMember"]);
  });

  it("does not take the Main agent out of its Main room", () => {
    const { store, calls } = recorder();
    const directory: Directory = {
      ...DIRECTORY,
      agt_lead: {
        id: "agt_lead",
        kind: "agent",
        displayName: "Lead",
        harnessId: "har_scout",
        lead: true,
      },
    };
    const home = context({ store, directory, space: space({ members: ["agt_lead"], home: true }) });
    expect(act({ kind: "remove", who: "Lead" }, home)).toBe(
      "Lead is the Main agent here, and stays in its Main space.",
    );
    expect(calls).toEqual([]);
  });

  it("removes somebody who is", () => {
    const { store, calls } = recorder();
    const here = context({ store, space: space({ members: ["per_dana"] }) });
    expect(act({ kind: "remove", who: "Dana Ruiz" }, here)).toBeUndefined();
    expect(calls).toEqual([
      { name: "removeMember", args: { spaceId: "sp_1", participantId: "per_dana" } },
    ]);
  });
});

describe("what went wrong", () => {
  it("goes to the last thing a harness said", () => {
    const { store, calls } = recorder();
    const lines = [line({ id: "ln_1" }), line({ id: "ln_2" }), line({ authorKind: "person" })];
    const said = act(
      { kind: "wrong", text: "wrong address" },
      context({ store, space: space({ lines }) }),
    );
    expect(said).toBeUndefined();
    expect(calls).toEqual([
      {
        name: "sendFeedback",
        args: { spaceId: "sp_1", lineId: "ln_2", kind: "correction", text: "wrong address" },
      },
    ]);
  });

  it("says so when no harness has spoken here", () => {
    const lines = [line({ authorKind: "person", authorId: "per_arjun" })];
    expect(act({ kind: "wrong", text: "no" }, context({ space: space({ lines }) }))).toBe(
      "No harness has said anything here to be wrong about.",
    );
  });
});

describe("a command about the run", () => {
  it("says there is none when nothing is going", () => {
    expect(act({ kind: "steer", mode: "steer", text: "left" }, context())).toBe(
      "There is no run going to steer.",
    );
  });

  it("says there is none when the last one ended", () => {
    for (const state of ["done", "failed", "cancelled"] as const) {
      const over = context({ run: run({ state }) });
      expect(act({ kind: "pause" }, over)).toBe("There is no run going to pause.");
    }
  });

  it("steers the one that is", () => {
    const { store, calls } = recorder();
    const going = context({ store, run: run() });
    expect(
      act({ kind: "steer", mode: "steer", text: "use the other address" }, going),
    ).toBeUndefined();
    expect(calls).toEqual([
      {
        name: "steerRun",
        args: { spaceId: "sp_1", runId: "run_1", mode: "steer", text: "use the other address" },
      },
    ]);
  });

  it("pauses, and will not pause twice", () => {
    const { store, calls } = recorder();
    expect(act({ kind: "pause" }, context({ store, run: run() }))).toBeUndefined();
    expect(calls).toEqual([{ name: "pauseRun", args: { spaceId: "sp_1", runId: "run_1" } }]);
    expect(act({ kind: "pause" }, context({ run: run({ paused: true }) }))).toBe(
      "The run is already paused.",
    );
  });

  it("resumes, and will not resume one that is going", () => {
    const { store, calls } = recorder();
    const held = context({ store, run: run({ paused: true }) });
    expect(act({ kind: "resume" }, held)).toBeUndefined();
    expect(calls).toEqual([{ name: "resumeRun", args: { spaceId: "sp_1", runId: "run_1" } }]);
    expect(act({ kind: "resume" }, context({ run: run() }))).toBe("The run is not paused.");
  });

  it("stops it, with the reason when there is one", () => {
    const bare = recorder();
    act({ kind: "stop" }, context({ store: bare.store, run: run() }));
    expect(bare.calls[0]).toEqual({ name: "stopRun", args: { spaceId: "sp_1", runId: "run_1" } });
    const given = recorder();
    act({ kind: "stop", reason: "wrong supplier" }, context({ store: given.store, run: run() }));
    expect(given.calls[0]?.args).toMatchObject({ reason: "wrong supplier" });
  });
});
