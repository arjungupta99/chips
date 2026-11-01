/** A new agent in a room (ADR 0108), as the clients read it: who may ask, the name, the line. */

import { HARNESS_CAPABILITIES, NEW_AGENT_WAIT_MS } from "@chipschat/protocol";
import { describe, expect, it } from "vitest";
import {
  askState,
  askWaiting,
  askWords,
  handleIn,
  mayAskFromPage,
  newAgentHarnesses,
  newAgentHint,
  newAgentName,
  pageAgentHint,
  pageAgentName,
} from "./asks.js";
import type { ClientEvent, Directory } from "./events.js";
import { lastWords } from "./model/readers.js";
import { buildModel } from "./model.js";

const ARJUN = "usr_01K4ZQPX0000000000000ARJUN";
const DANA = "usr_01K4ZQPX00000000000000DANA";
const JACOBIAN = "hrn_01K4ZQPX0000000000JACOBIAN";
const OPENCLAW = "hrn_01K4ZQPX0000000000OPENCLAW";
const SCOUT = "hrn_01K4ZQPX0000000000000SCOUT";
const ART = "agt_01K4ZQPX000000000000000ART";
const J1 = "agt_01K4ZQPX00000000000000000J1";
const REVIEWER = "agt_01K4ZQPX0000000000REVIEWER";
const ROOM = "spc_01K4ZQPX0000000000000ASCII";
const HOME = "spc_01K4ZQPX00000000000000HOME";

const NEW = [HARNESS_CAPABILITIES.agents, HARNESS_CAPABILITIES.newAgents];
const agent = (id: string, name: string, harness: string, extra: Record<string, unknown> = {}) => ({
  id,
  kind: "agent" as const,
  harnessId: harness,
  displayName: name,
  ...extra,
});

const base: Directory = {
  [ARJUN]: { id: ARJUN, kind: "person", displayName: "Arjun", role: "owner" },
  [DANA]: { id: DANA, kind: "person", displayName: "Dana", role: "member" },
  [JACOBIAN]: {
    id: JACOBIAN,
    kind: "harness",
    displayName: "Jacobian",
    ownerId: ARJUN,
    capabilities: NEW,
  },
  [OPENCLAW]: {
    id: OPENCLAW,
    kind: "harness",
    displayName: "OpenClaw",
    ownerId: ARJUN,
    capabilities: NEW,
  },
  // Declares nothing new: it is not offered.
  [SCOUT]: { id: SCOUT, kind: "harness", displayName: "Scout", ownerId: ARJUN },
  [ART]: agent(ART, "ASCII Art", JACOBIAN, { room: ROOM }),
  [J1]: agent(J1, "J1", JACOBIAN, { room: ROOM }),
  [REVIEWER]: agent(REVIEWER, "Reviewer", JACOBIAN, { room: ROOM }),
  agt_01K4ZQPX000000000JACOBIAN2: agent("agt_01K4ZQPX000000000JACOBIAN2", "Jacobian", JACOBIAN),
};

let seq = 0;
function event(type: string, fields: Record<string, unknown>, actor = ARJUN, ts?: string) {
  seq += 1;
  const kind = actor.startsWith("usr_") ? "person" : "harness";
  return {
    seq,
    type,
    id: `evt_${seq}`,
    ts: ts ?? new Date(Date.UTC(2026, 9, 3, 18, 58, seq)).toISOString(),
    workspace_id: "ws_1",
    actor: { kind, id: actor },
    ...fields,
  } as ClientEvent;
}

function workspace(extra: readonly ClientEvent[] = []) {
  seq = 0;
  const events: ClientEvent[] = [
    event("space.created", { space_id: ROOM, kind: "group", title: "ASCII Art" }),
    event("space.created", { space_id: HOME, kind: "direct" }),
    ...extra,
  ];
  return buildModel(events, { selfId: ARJUN });
}

const asked = (name = "Reviewer", ts?: string) =>
  event("agent.asked", { space_id: ROOM, harness_id: JACOBIAN, name, by: ARJUN }, ARJUN, ts);
const joined = (askId: string) =>
  event(
    "membership.added",
    {
      space_id: ROOM,
      participant_id: REVIEWER,
      participant_kind: "agent",
      role: "member",
      made_for: askId,
    },
    JACOBIAN,
  );

function room(model: ReturnType<typeof workspace>, id = ROOM) {
  const found = model.spaces.find((each) => each.id === id);
  if (found === undefined) throw new Error("no space");
  return found;
}

describe("who may ask", () => {
  it("is the harness's owner, of a harness that makes new agents, in an open room", () => {
    const model = workspace();
    const art = room(model);
    expect(newAgentHarnesses(model, base, ARJUN, art).map((each) => each.id)).toEqual([
      JACOBIAN,
      OPENCLAW,
    ]);
    // Dana owns neither harness and is no owner or admin of the workspace.
    expect(newAgentHarnesses(model, base, DANA, art)).toEqual([]);
    expect(newAgentHarnesses(model, base, ARJUN, { ...art, home: true })).toEqual([]);
    expect(newAgentHarnesses(model, base, ARJUN, { ...art, state: "closed" })).toEqual([]);
    expect(newAgentHarnesses(model, base, ARJUN, { ...art, parentSpaceId: HOME })).toEqual([]);
    const removed = { ...base, [OPENCLAW]: { ...base[OPENCLAW], removedAt: "2026-10-03" } };
    expect(
      newAgentHarnesses(model, removed as Directory, ARJUN, art).map((each) => each.id),
    ).toEqual([JACOBIAN]);
  });
});

describe("the name", () => {
  it("is the harness's own, numbered past the agents and people that have it", () => {
    expect(newAgentName(base, JACOBIAN)).toBe("Jacobian 2");
    expect(newAgentName(base, OPENCLAW)).toBe("OpenClaw");
    expect(newAgentName(base, JACOBIAN, "  Checker ")).toBe("Checker");
    expect(newAgentName(base, JACOBIAN, "reviewer")).toBe("reviewer 2");
  });

  it("says who it will be, under the field", () => {
    expect(newAgentHint(base, JACOBIAN, "")).toBe("Left empty, it's Jacobian 2.");
    expect(newAgentHint(base, JACOBIAN, "Reviewer")).toBe(
      "Reviewer is taken here, so it will be Reviewer 2.",
    );
    expect(newAgentHint(base, JACOBIAN, "Checker")).toBe("What everyone here will @ it by.");
  });

  it("says why a name typed can't be had, or why Main or You moves (SEC-33)", () => {
    expect(newAgentHint(base, JACOBIAN, "Main")).toBe(
      "An agent can't be called Main or You, so it will be Main 2.",
    );
    expect(newAgentHint(base, JACOBIAN, "Che\u200bcker")).toMatch(/^A name can't have hidden/);
    expect(newAgentHint(base, JACOBIAN, "Ch\u0435cker")).toMatch(/^A name can't mix/);
    // A full-width Reviewer reads as Reviewer, which is somebody's here already.
    expect(newAgentHint(base, JACOBIAN, "\uff32eviewer")).toBe(
      "\uff32eviewer is taken here, so it will be \uff32eviewer 2.",
    );
  });
});

describe("a new agent from a harness's page (ADR 0190)", () => {
  it("is asked by an owner or admin, of a harness that makes them", () => {
    const people = (role: string) => [
      event("person.joined", { participant_id: ARJUN, display_name: "Arjun", role: "owner" }),
      event("person.joined", { participant_id: DANA, display_name: "Dana", role }),
    ];
    const model = workspace(people("member"));
    expect(mayAskFromPage(model, base, ARJUN, JACOBIAN)).toBe(true);
    // Scout makes no new agents; Dana owns no harness and runs nothing.
    expect(mayAskFromPage(model, base, ARJUN, SCOUT)).toBe(false);
    expect(mayAskFromPage(model, base, DANA, JACOBIAN)).toBe(false);
    // Her own harness's page neither: the ask opens a space, which a member may not (ADR 0196).
    const hers = { ...base, [OPENCLAW]: { ...base[OPENCLAW], ownerId: DANA } } as Directory;
    expect(mayAskFromPage(model, hers, DANA, OPENCLAW)).toBe(false);
    // An admin may, a harness of anybody's.
    expect(mayAskFromPage(workspace(people("admin")), base, DANA, JACOBIAN)).toBe(true);
  });

  it("goes by the first name offered, or what is typed, numbered where it is taken", () => {
    expect(pageAgentName(base, JACOBIAN, "", "Ivy")).toBe("Ivy");
    expect(pageAgentName(base, JACOBIAN, " Checker ", "Ivy")).toBe("Checker");
    expect(pageAgentName(base, JACOBIAN, "Reviewer", "Ivy")).toBe("Reviewer 2");
    expect(pageAgentHint(base, JACOBIAN, "", "Ivy")).toBe(
      "It starts in a space of its own, called Ivy.",
    );
    expect(pageAgentHint(base, JACOBIAN, "Reviewer", "Ivy")).toBe(
      "Reviewer is taken here, so it will be Reviewer 2.",
    );
    expect(pageAgentHint(base, JACOBIAN, "You", "Ivy")).toBe(
      "An agent can't be called Main or You, so it will be You 2.",
    );
    expect(pageAgentHint(base, JACOBIAN, "\u202eIvy", "Ivy")).toMatch(/^A name can't have hidden/);
  });
});

describe("the room's line", () => {
  it("waits, then says the agent joined, and the list says so too", () => {
    const waiting = workspace([asked()]);
    const line = room(waiting).lines.find((each) => each.newAgent !== undefined);
    if (line === undefined) throw new Error("no line");
    expect(line).toMatchObject({
      id: "evt_3",
      kind: "system",
      newAgent: { harnessId: JACOBIAN, name: "Reviewer" },
    });
    const soon = Date.parse(line.ts) + 1000;
    expect(askState(room(waiting), line, soon)).toEqual({ state: "waiting" });
    expect(askWaiting(room(waiting), soon)).toBe(true);
    expect(askWords(waiting, room(waiting), line, base, ARJUN, soon)).toMatchObject({
      state: "waiting",
      title: "Asking Jacobian for Reviewer…",
      sub: "You asked for a new agent",
    });
    expect(lastWords(room(waiting), base)).toBe("Asked Jacobian for Reviewer");

    const model = workspace([asked(), joined("evt_3")]);
    expect(askState(room(model), line, soon)).toEqual({ state: "joined", agentId: REVIEWER });
    expect(askWaiting(room(model), soon)).toBe(false);
    expect(askWords(model, room(model), line, base, DANA, soon)).toMatchObject({
      state: "joined",
      title: "Reviewer joined",
      sub: "New in Jacobian, made for this space",
      agentId: REVIEWER,
    });
    expect(lastWords(room(model), base)).toBe("Reviewer joined");
  });

  it("says the harness didn't make it after a minute, and who may ask again", () => {
    const model = workspace([asked()]);
    const line = room(model).lines.find((each) => each.newAgent !== undefined);
    if (line === undefined) throw new Error("no line");
    const late = Date.parse(line.ts) + NEW_AGENT_WAIT_MS + 1;
    expect(askWords(model, room(model), line, base, ARJUN, late)).toMatchObject({
      state: "not_made",
      title: "Jacobian didn't make Reviewer",
      sub: "No agent came in a minute. Nothing was added.",
      retry: true,
    });
    expect(askWords(model, room(model), line, base, DANA, late)?.retry).toBe(false);
    expect(askWords(model, room(model), line, base, DANA, late)?.title).toBe(
      "Jacobian didn't make Reviewer",
    );
  });
});

describe("the @ the asker's field holds", () => {
  it("is the agent's handle among the room's members", () => {
    const model = workspace([
      event("membership.added", {
        space_id: ROOM,
        participant_id: J1,
        participant_kind: "agent",
        role: "member",
      }),
      asked(),
      joined("evt_4"),
    ]);
    expect(handleIn(room(model), base, REVIEWER)).toBe("@Reviewer");
    expect(handleIn(room(model), base, ART)).toBeUndefined();
  });
});
