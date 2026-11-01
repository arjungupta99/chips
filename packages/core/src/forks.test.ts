/** Fork (ADR 0087, Phase 6), as the clients read it: who may, the room's line, and the copy's name. */

import { FORK_WAIT_MS, HARNESS_CAPABILITIES } from "@chipschat/protocol";
import { describe, expect, it } from "vitest";
import { agentCard } from "./agentsTab.js";
import type { ClientEvent, Directory } from "./events.js";
import {
  forkRoomTitle,
  forkState,
  forkWaiting,
  forkWords,
  mayFork,
  mayForkInto,
  withForkNames,
} from "./forks.js";
import { lastWords } from "./model/readers.js";
import { buildModel } from "./model.js";

const ARJUN = "usr_01K4ZQPX0000000000000ARJUN";
const DANA = "usr_01K4ZQPX00000000000000DANA";
const JACOBIAN = "hrn_01K4ZQPX0000000000JACOBIAN";
const OPENCLAW = "hrn_01K4ZQPX0000000000OPENCLAW";
const J = "agt_01K4ZQPX0000000000000000J";
const SHOPPING = "agt_01K4ZQPX0000000000SHOPPING";
const COPY = "agt_01K4ZQPX00000000000000COPY";
const CLAW = "agt_01K4ZQPX0000000000000CLAW";
const FREE = "agt_01K4ZQPX0000000000000FREE";
const SHELF = "agt_01K4ZQPX000000000000SHELF";
const SHOP_ROOM = "spc_01K4ZQPX00000000000000SHOP";
const HELLO = "spc_01K4ZQPX0000000000000HELLO";
const J_ROOM = "spc_01K4ZQPX0000000000000JROOM";

const FORKS = [HARNESS_CAPABILITIES.agents, HARNESS_CAPABILITIES.forks];
const agent = (id: string, name: string, harness: string, extra: Record<string, unknown> = {}) => ({
  id,
  kind: "agent" as const,
  harnessId: harness,
  displayName: name,
  ...extra,
});

const base: Directory = {
  [ARJUN]: { id: ARJUN, kind: "person", displayName: "Arjun" },
  [DANA]: { id: DANA, kind: "person", displayName: "Dana" },
  [JACOBIAN]: {
    id: JACOBIAN,
    kind: "harness",
    displayName: "Jacobian",
    ownerId: ARJUN,
    capabilities: FORKS,
  },
  [OPENCLAW]: { id: OPENCLAW, kind: "harness", displayName: "OpenClaw", ownerId: ARJUN },
  [J]: agent(J, "J", JACOBIAN, { lead: true, room: J_ROOM }),
  [SHOPPING]: agent(SHOPPING, "Shopping", JACOBIAN, { room: SHOP_ROOM }),
  [CLAW]: agent(CLAW, "OpenClaw", OPENCLAW, { room: SHOP_ROOM }),
  [FREE]: agent(FREE, "Bland Pricing", JACOBIAN, { room: null }),
  [SHELF]: agent(SHELF, "Chess Game", JACOBIAN, { archived: true, room: null }),
};

let seq = 0;
function event(type: string, fields: Record<string, unknown>, actor = ARJUN, ts?: string) {
  seq += 1;
  const kind = actor.startsWith("usr_") ? "person" : "harness";
  return {
    seq,
    type,
    id: `evt_${seq}`,
    ts: ts ?? new Date(Date.UTC(2026, 9, 1, 16, 0, seq)).toISOString(),
    workspace_id: "ws_1",
    actor: { kind, id: actor },
    ...fields,
  } as ClientEvent;
}

function workspace(extra: readonly ClientEvent[] = []) {
  seq = 0;
  const events: ClientEvent[] = [
    event("space.created", { space_id: SHOP_ROOM, kind: "group", title: "Shopping" }),
    event("space.created", { space_id: HELLO, kind: "group", title: "Hello" }),
    event("space.created", { space_id: J_ROOM, kind: "direct" }),
    ...extra,
  ];
  return buildModel(events, { selfId: ARJUN });
}

const ask = (agentId = SHOPPING, ts?: string) =>
  event("agent.fork", { space_id: HELLO, agent_id: agentId, by: ARJUN }, ARJUN, ts);

describe("who may fork", () => {
  it("is who may move it, for an agent in a room whose harness forks", () => {
    const model = workspace();
    expect(mayFork(model, base, ARJUN, SHOPPING)).toBe(true);
    // Not its harness's owner, and not an owner or admin of the workspace.
    expect(mayFork(model, base, DANA, SHOPPING)).toBe(false);
    // OpenClaw's bridge doesn't declare forks (rule 3.12).
    expect(mayFork(model, base, ARJUN, CLAW)).toBe(false);
    expect(mayFork(model, base, ARJUN, J)).toBe(false);
    expect(mayFork(model, base, ARJUN, FREE)).toBe(false);
    expect(mayFork(model, base, ARJUN, SHELF)).toBe(false);
  });

  it("is never into the room the agent is in, a Main room or a closed one", () => {
    const model = workspace();
    const space = (id: string) => model.spaces.find((each) => each.id === id);
    const hello = space(HELLO);
    const shop = space(SHOP_ROOM);
    if (hello === undefined || shop === undefined) throw new Error("no rooms");
    expect(mayForkInto(model, base, ARJUN, SHOPPING, hello)).toBe(true);
    expect(mayForkInto(model, base, ARJUN, SHOPPING, shop)).toBe(false);
    expect(mayForkInto(model, base, ARJUN, SHOPPING, { ...hello, home: true })).toBe(false);
    expect(mayForkInto(model, base, ARJUN, SHOPPING, { ...hello, state: "closed" })).toBe(false);
  });
});

describe("the room's line", () => {
  it("waits, then says the copy joined", () => {
    const model = workspace([
      ask(),
      event(
        "membership.added",
        {
          space_id: HELLO,
          participant_id: COPY,
          participant_kind: "agent",
          role: "member",
          fork_of: "evt_4",
        },
        JACOBIAN,
      ),
    ]);
    const hello = model.spaces.find((each) => each.id === HELLO);
    const line = hello?.lines.find((each) => each.fork !== undefined);
    if (hello === undefined || line === undefined) throw new Error("no line");
    expect(line).toMatchObject({ id: "evt_4", kind: "system", fork: { agentId: SHOPPING } });
    expect(forkState(hello, line, Date.parse(line.ts) + 1000)).toEqual({
      state: "joined",
      copyId: COPY,
    });
    const directory = withForkNames({
      ...base,
      [COPY]: agent(COPY, "Shopping", JACOBIAN, { room: HELLO, forkedFrom: SHOPPING }),
    });
    expect(forkWords(model, hello, line, directory, ARJUN, Date.parse(line.ts))).toMatchObject({
      state: "joined",
      title: "Shopping · fork joined",
      sub: "A copy of Shopping",
      copyId: COPY,
    });
  });

  it("says who asked while it waits, and that the harness didn't make it after the minute", () => {
    const model = workspace([ask()]);
    const hello = model.spaces.find((each) => each.id === HELLO);
    const line = hello?.lines.find((each) => each.fork !== undefined);
    if (hello === undefined || line === undefined) throw new Error("no line");
    const at = Date.parse(line.ts);
    expect(forkWords(model, hello, line, base, ARJUN, at + 5000)).toMatchObject({
      state: "waiting",
      title: "Forking Shopping…",
      sub: "You asked Jacobian for a copy",
    });
    expect(forkWords(model, hello, line, base, DANA, at)?.sub).toBe(
      "Arjun asked Jacobian for a copy",
    );
    expect(forkWaiting(hello, at + FORK_WAIT_MS - 1)).toBe(true);
    expect(forkWaiting(hello, at + FORK_WAIT_MS)).toBe(false);
    expect(forkWords(model, hello, line, base, ARJUN, at + FORK_WAIT_MS)).toEqual({
      state: "not_made",
      title: "Jacobian didn't make the copy",
      sub: "No copy in a minute. Shopping is as it was.",
      agentId: SHOPPING,
      retry: true,
    });
    // Asking again is the asker's, or anybody's who may fork it.
    expect(forkWords(model, hello, line, base, DANA, at + FORK_WAIT_MS)?.retry).toBe(false);
  });
});

describe("a room's line in a list", () => {
  it("says the fork by name: the agent asked for, then the copy that joined", () => {
    const asking = workspace([ask()]).spaces.find((each) => each.id === HELLO);
    if (asking === undefined) throw new Error("no room");
    expect(lastWords(asking, base)).toBe("Asked for a copy of Shopping");
    const directory = withForkNames({
      ...base,
      [COPY]: agent(COPY, "Shopping", JACOBIAN, { room: HELLO, forkedFrom: SHOPPING }),
    });
    expect(lastWords({ ...asking, forked: { [asking.lines[0]?.id ?? ""]: COPY } }, directory)).toBe(
      "Shopping · fork joined",
    );
  });
});

describe("a new room for a copy", () => {
  it("is named as its harness will name the copy: the first free · fork", () => {
    expect(forkRoomTitle(base, SHOPPING)).toBe("Shopping · fork");
    const one = {
      ...base,
      [COPY]: agent(COPY, "Shopping · fork", JACOBIAN, { forkedFrom: SHOPPING }),
    };
    expect(forkRoomTitle(one, SHOPPING)).toBe("Shopping · fork 2");
    // A copy of the copy is numbered from the same name.
    expect(forkRoomTitle(one, COPY)).toBe("Shopping · fork 2");
  });
});

describe("the copy", () => {
  it("is called Shopping · fork while its harness calls it what the original is called", () => {
    const named = withForkNames({
      ...base,
      [COPY]: agent(COPY, "Shopping", JACOBIAN, { forkedFrom: SHOPPING }),
    });
    expect(named[COPY]?.displayName).toBe("Shopping · fork");
    expect(named[SHOPPING]?.displayName).toBe("Shopping");
    const own = withForkNames({
      ...base,
      [COPY]: agent(COPY, "Shopping · fork 2", JACOBIAN, { forkedFrom: SHOPPING }),
    });
    expect(own[COPY]?.displayName).toBe("Shopping · fork 2");
  });

  it("is called a fork when Chips numbered it, its name being its original's (ADR 0091)", () => {
    const numbered = withForkNames({
      ...base,
      [COPY]: agent(COPY, "Shopping 2", JACOBIAN, { forkedFrom: SHOPPING }),
    });
    expect(numbered[COPY]?.displayName).toBe("Shopping 2 · fork");
    const ofNumbered = withForkNames({
      ...base,
      [SHOPPING]: agent(SHOPPING, "Shopping 2", JACOBIAN),
      [COPY]: agent(COPY, "Shopping 3", JACOBIAN, { forkedFrom: SHOPPING }),
    });
    expect(ofNumbered[COPY]?.displayName).toBe("Shopping 3 · fork");
    const other = withForkNames({
      ...base,
      [COPY]: agent(COPY, "Groceries 2", JACOBIAN, { forkedFrom: SHOPPING }),
    });
    expect(other[COPY]?.displayName).toBe("Groceries 2");
  });

  it("says on its card what it is a copy of, and the original's card offers Fork", () => {
    const directory = withForkNames({
      ...base,
      [COPY]: agent(COPY, "Shopping", JACOBIAN, { room: HELLO, forkedFrom: SHOPPING }),
    });
    const model = workspace();
    expect(agentCard(model, directory, ARJUN, COPY)).toMatchObject({
      name: "Shopping · fork",
      // A rename starts from what it is called, not what the screen adds (ADR 0091).
      ownName: "Shopping",
      forkedFrom: { agentId: SHOPPING, name: "Shopping" },
      mayFork: true,
    });
    expect(agentCard(model, directory, ARJUN, SHOPPING).forkedFrom).toBeUndefined();
    expect(agentCard(model, directory, ARJUN, CLAW).mayFork).toBe(false);
  });
});
