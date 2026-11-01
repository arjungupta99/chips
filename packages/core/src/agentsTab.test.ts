/** The Agents tab (ADR 0087, Phase 5): its rows, an agent's card, and its message history. */

import { describe, expect, it } from "vitest";
import {
  agentByline,
  agentCard,
  agentHistory,
  agentLine,
  agentsTab,
  awayWords,
  guestAgentsWords,
  roomByline,
  stayFact,
  stretchDates,
  waitingWords,
} from "./agentsTab.js";
import type { ClientEvent, Directory } from "./events.js";
import { spaceById } from "./model/readers.js";
import { buildModel, type WorkspaceModel } from "./model.js";
import { addableAgents, mayFace, mayPutIn, showsAgent } from "./rooms.js";

const ARJUN = "usr_01K4ZQPX0000000000000ARJUN";
const DANA = "usr_01K4ZQPX00000000000000DANA";
const JACOBIAN = "hrn_01K4ZQPX0000000000JACOBIAN";
const OPENCLAW = "hrn_01K4ZQPX0000000000OPENCLAW";
const J = "agt_01K4ZQPX0000000000000000J";
const CHESS = "agt_01K4ZQPX000000000000CHESS";
const SHOPPING = "agt_01K4ZQPX0000000000SHOPPING";
const HELLO = "agt_01K4ZQPX000000000000HELLO";
const MAIN = "agt_01K4ZQPX0000000000000MAIN";
const DIRECT = "agt_01K4ZQPX00000000000DIRECT";
const BLAND = "agt_01K4ZQPX000000000000BLAND";
const RESEARCHER = "agt_01K4ZQPX0000000000RESEARCH";
const J_ROOM = "spc_01K4ZQPX0000000000000JROOM";
const CHESS_ROOM = "spc_01K4ZQPX000000000000CHESS";
const SHOP_ROOM = "spc_01K4ZQPX00000000000000SHOP";
const HELLO_ROOM = "spc_01K4ZQPX0000000000000HELLO";
const OC_ROOM = "spc_01K4ZQPX000000000000OCROOM";
const GONE_ROOM = "spc_01K4ZQPX0000000000000GONE";

const agent = (id: string, name: string, harness: string, extra: Record<string, unknown> = {}) => ({
  id,
  kind: "agent" as const,
  harnessId: harness,
  displayName: name,
  ...extra,
});

const directory: Directory = {
  [ARJUN]: { id: ARJUN, kind: "person", displayName: "Arjun" },
  [DANA]: { id: DANA, kind: "person", displayName: "Dana" },
  [JACOBIAN]: { id: JACOBIAN, kind: "harness", displayName: "Jacobian", ownerId: ARJUN },
  [OPENCLAW]: { id: OPENCLAW, kind: "harness", displayName: "OpenClaw", ownerId: ARJUN },
  [J]: agent(J, "J", JACOBIAN, { lead: true, room: J_ROOM }),
  [CHESS]: agent(CHESS, "Chess Game", JACOBIAN, {
    archived: true,
    room: null,
    releasedFrom: CHESS_ROOM,
  }),
  [SHOPPING]: agent(SHOPPING, "Shopping", JACOBIAN, { room: SHOP_ROOM }),
  [HELLO]: agent(HELLO, "Hello", JACOBIAN, { room: HELLO_ROOM }),
  [MAIN]: agent(MAIN, "OpenClaw", OPENCLAW, { room: HELLO_ROOM }),
  [DIRECT]: agent(DIRECT, "OpenClaw", OPENCLAW, { room: OC_ROOM }),
  [BLAND]: agent(BLAND, "Bland Pricing", JACOBIAN, { room: null, held: 1 }),
  [RESEARCHER]: agent(RESEARCHER, "Researcher", JACOBIAN, {
    archived: true,
    room: null,
    releasedFrom: GONE_ROOM,
  }),
};

let seq = 0;
function event(type: string, fields: Record<string, unknown>, actor = ARJUN): ClientEvent {
  seq += 1;
  const kind = actor.startsWith("usr_") ? "person" : actor.startsWith("hrn_") ? "harness" : "agent";
  return {
    seq,
    type,
    id: `evt_${seq}`,
    ts: `2026-09-${String(Math.min(28, 5 + seq)).padStart(2, "0")}T12:00:00.000Z`,
    workspace_id: "ws_1",
    actor: { kind, id: actor, ...(kind === "agent" ? { harness_id: JACOBIAN } : {}) },
    ...fields,
  };
}
const room = (id: string, title?: string) =>
  event("space.created", { space_id: id, kind: "group", ...(title ? { title } : {}) });
const member = (space: string, id: string) =>
  event("membership.added", {
    space_id: space,
    participant_id: id,
    participant_kind: id.startsWith("usr_")
      ? "person"
      : id.startsWith("hrn_")
        ? "harness"
        : "agent",
    role: "member",
  });
const say = (space: string, text: string, by = ARJUN, extra: Record<string, unknown> = {}) =>
  event("message.post", { space_id: space, text, ...extra }, by);

function workspace(then: ClientEvent[] = []): WorkspaceModel {
  seq = 0;
  return buildModel(
    [
      event("person.joined", { participant_id: ARJUN, display_name: "Arjun", role: "owner" }),
      room(J_ROOM, "J"),
      member(J_ROOM, ARJUN),
      member(J_ROOM, J),
      room(SHOP_ROOM, "Shopping"),
      member(SHOP_ROOM, ARJUN),
      member(SHOP_ROOM, SHOPPING),
      room(HELLO_ROOM, "Hello"),
      member(HELLO_ROOM, ARJUN),
      member(HELLO_ROOM, HELLO),
      member(HELLO_ROOM, MAIN),
      room(OC_ROOM),
      member(OC_ROOM, ARJUN),
      member(OC_ROOM, DIRECT),
      room(CHESS_ROOM, "Chess Game"),
      member(CHESS_ROOM, ARJUN),
      ...then,
    ],
    { selfId: ARJUN },
  );
}

describe("the tab", () => {
  it("lists the Main agent, then free agents, then by their rooms' last line, then the archived", () => {
    const model = workspace([say(SHOP_ROOM, "Sofa?"), say(HELLO_ROOM, "@Hello hi", ARJUN)]);
    const tab = agentsTab(model, directory, ARJUN);
    expect(tab.leads.map((row) => row.name)).toEqual(["J"]);
    expect(tab.agents.map((row) => row.id)).toEqual([BLAND, HELLO, MAIN, SHOPPING, DIRECT]);
    expect(tab.archived.here.map((row) => row.name)).toEqual(["Chess Game"]);
    expect(tab.archived.elsewhere.map((row) => row.name)).toEqual(["Researcher"]);
    expect(tab.harnesses.map((each) => each.displayName)).toEqual(["Jacobian", "OpenClaw"]);
    expect(tab.agents[0]).toMatchObject({ free: true, held: 1 });
  });

  it("lists one harness's agents for its page", () => {
    const tab = agentsTab(workspace(), directory, ARJUN, { harnessId: OPENCLAW });
    expect(tab.agents.map((row) => row.id).sort()).toEqual([DIRECT, MAIN].sort());
    expect(tab.leads).toEqual([]);
  });

  it("lists only some agents, in the tab's order, as search draws the ones it found", () => {
    const model = workspace([say(SHOP_ROOM, "Sofa?"), say(HELLO_ROOM, "@Hello hi", ARJUN)]);
    const only = new Set([DIRECT, CHESS, SHOPPING, BLAND, "agt_unknown"]);
    const tab = agentsTab(model, directory, ARJUN, { only });
    const whole = agentsTab(model, directory, ARJUN);
    expect(tab.agents.map((row) => row.id)).toEqual(
      whole.agents.map((row) => row.id).filter((id) => only.has(id)),
    );
    expect(tab.archived.here.map((row) => row.id)).toEqual([CHESS]);
    expect(tab.leads).toEqual([]);
  });

  it("says where each is under its name", () => {
    const model = workspace();
    const line = (id: string) => agentLine(model, directory, ARJUN, id);
    // The Main agent says where it is, as the others do: its row wears the Main tag (ADR 0145).
    expect(line(J)).toBe("Jacobian");
    expect(line(SHOPPING)).toBe("Jacobian");
    expect(line(MAIN)).toBe("OpenClaw · in Hello");
    expect(line(DIRECT)).toBe("OpenClaw · with you");
    expect(line(BLAND)).toBe("Free · Jacobian");
    expect(line(CHESS)).toBe("Jacobian");
    expect(line(RESEARCHER)).toBe("Jacobian · was in a space you're not in");
    expect(waitingWords(1)).toBe("1 waiting");
    expect(waitingWords(0)).toBeUndefined();
  });

  it("rings an agent at work in its room", () => {
    const model = workspace([
      event("run.started", { space_id: SHOP_ROOM, run_id: "run_1", goal: "Find a sofa" }, SHOPPING),
    ]);
    const shopping = agentsTab(model, directory, ARJUN).agents.find((row) => row.id === SHOPPING);
    expect(shopping?.doing).toBe("working");
    // Its card says so too, for the face there.
    expect(agentCard(model, directory, ARJUN, SHOPPING)).toMatchObject({
      now: "Working",
      doing: "working",
    });
  });
});

describe("a room the reader isn't in", () => {
  it("is not read as theirs because this client has heard its id", () => {
    // PO-4471 as the phone holds it after Arjun left: the id, named by an event about its agent,
    // with no title, and Arjun not in it.
    const SCOUT = "agt_01K4ZQPX000000000000SCOUT";
    const PO = "spc_01K4ZQPX0000000000000PO4471";
    const withScout: Directory = {
      ...directory,
      [SCOUT]: agent(SCOUT, "Scout", OPENCLAW, { room: PO }),
    };
    const model = workspace([
      event("space.created", { space_id: PO, kind: "group" }, DANA),
      member(PO, DANA),
      member(PO, SCOUT),
    ]);
    expect(model.spaces.some((space) => space.id === PO)).toBe(true);
    expect(agentLine(model, withScout, ARJUN, SCOUT)).toBe("OpenClaw · in a space you're not in");
    expect(agentCard(model, withScout, ARJUN, SCOUT).room).toEqual({
      spaceId: PO,
      name: "A space you're not in",
      readable: false,
      archived: false,
    });
    expect(agentsTab(model, withScout, ARJUN).agents.find((row) => row.id === SCOUT)?.at).toBe(
      undefined,
    );
  });
});

describe("a message history", () => {
  it("is what the agent said, what was addressed to it, and what people said to its room", () => {
    const model = workspace([
      member(CHESS_ROOM, JACOBIAN),
      say(CHESS_ROOM, "Send me a screenshot of the chess game"),
      say(CHESS_ROOM, "Screenshot captured and attached.", JACOBIAN),
      event("membership.replaced", { space_id: CHESS_ROOM, from: JACOBIAN, to: CHESS }),
      say(CHESS_ROOM, "@Hello not you", ARJUN, { addressed_to: [HELLO] }),
      say(CHESS_ROOM, "@Chess and you?", ARJUN, { addressed_to: [CHESS] }),
    ]);
    const chessRoom = model.spaces.find((each) => each.id === CHESS_ROOM);
    const joined = chessRoom?.lines[0]?.seq ?? 0;
    const history = agentHistory(model, directory, CHESS, [
      {
        readable: true,
        spaceId: CHESS_ROOM,
        fromSeq: joined - 5,
        toSeq: null,
        from: "2026-09-05T12:00:00.000Z",
        to: "2026-09-20T12:00:00.000Z",
        lines: 3,
      },
      { readable: false, from: "2026-09-25T12:00:00.000Z", to: null, lines: 2 },
    ]);
    expect(history).toHaveLength(2);
    const [chess, away] = history;
    expect(chess).toMatchObject({
      kind: "room",
      spaceId: CHESS_ROOM,
      name: "Chess Game",
      now: false,
    });
    expect(chess?.kind === "room" && chess.lines.map((line) => line.text)).toEqual([
      "Send me a screenshot of the chess game",
      "Screenshot captured and attached.",
      "@Chess and you?",
    ]);
    expect(away).toEqual({ kind: "away", from: "2026-09-25T12:00:00.000Z", to: null, count: 2 });
    expect(awayWords(2)).toBe("2 messages in a space you're not in");
    expect(awayWords(1)).toBe("1 message in a space you're not in");
  });

  it("marks the room it is in now", () => {
    const model = workspace([say(J_ROOM, "What are the store timings for west elm?")]);
    const [j] = agentHistory(model, directory, J, [
      {
        readable: true,
        spaceId: J_ROOM,
        fromSeq: 0,
        toSeq: null,
        from: "2026-09-05T12:00:00.000Z",
        to: null,
        lines: 1,
      },
    ]);
    expect(j).toMatchObject({ kind: "room", now: true });
  });

  it("reads a room this client doesn't hold as one the reader isn't in", () => {
    const [stay] = agentHistory(workspace(), directory, SHOPPING, [
      { readable: true, spaceId: GONE_ROOM, fromSeq: 1, toSeq: 9, from: "a", to: "b", lines: 4 },
    ]);
    expect(stay).toEqual({ kind: "away", from: "a", to: "b", count: 4 });
  });
});

describe("a divider's dates", () => {
  const now = new Date("2026-09-30T12:00:00").getTime();
  it("say a stretch in one month, across two, in one day, and one still going", () => {
    expect(stretchDates("2026-09-05T12:00:00", "2026-09-20T12:00:00", now)).toEqual({
      dates: "5–20 Sep",
      ongoing: false,
    });
    expect(stretchDates("2026-09-28T12:00:00", "2026-10-02T12:00:00", now).dates).toBe(
      "28 Sep – 2 Oct",
    );
    expect(stretchDates("2026-09-30T08:00:00", "2026-09-30T18:00:00", now).dates).toBe("30 Sep");
    expect(stretchDates("2026-09-05T12:00:00", null, now)).toEqual({
      dates: "5 Sep –",
      ongoing: true,
    });
    expect(stretchDates("2025-12-30T12:00:00", "2026-01-02T12:00:00", now).dates).toBe(
      "30 Dec 2025 – 2 Jan",
    );
  });
});

describe("a card's dates", () => {
  const model = workspace();
  const now = new Date("2026-10-02T12:00:00").getTime();
  const shopping = agentCard(model, directory, ARJUN, SHOPPING);
  const chess = agentCard(model, directory, ARJUN, CHESS);
  const stay = (spaceId: string, from: string, to: string | null) => ({
    readable: true,
    spaceId,
    from,
    to,
    lines: 3,
  });

  it("holds its place while the server is asked, with the word it will most likely have", () => {
    // Drawn only once the answer came, it put itself between Room and Now just after the card
    // had opened, and everything after it moved (2 October 2026).
    expect(stayFact(shopping, undefined, true, now)).toEqual({ word: "Since", dates: undefined });
    expect(stayFact(chess, undefined, true, now)).toEqual({ word: "Was there", dates: undefined });
  });

  it("fills in the dates of its last stay in the card's room, without the dash", () => {
    const stays = [
      stay(SHOP_ROOM, "2026-09-01T12:00:00", "2026-09-03T12:00:00"),
      stay(SHOP_ROOM, "2026-09-27T12:00:00", null),
    ];
    expect(stayFact(shopping, stays, false, now)).toEqual({ word: "Since", dates: "27 Sep" });
    expect(
      stayFact(chess, [stay(CHESS_ROOM, "2026-09-05T12:00:00", "2026-09-20T12:00:00")], false, now),
    ).toEqual({ word: "Was there", dates: "5–20 Sep" });
  });

  it("goes when the server knows of no stay, or could not say", () => {
    expect(stayFact(shopping, [], false, now)).toBeUndefined();
    expect(stayFact(shopping, undefined, false, now)).toBeUndefined();
  });
});

describe("an agent's card", () => {
  const model = workspace();
  it("offers Move to whoever may, and says why J and an archived agent don't move", () => {
    expect(agentCard(model, directory, ARJUN, SHOPPING)).toMatchObject({
      sub: "Jacobian",
      room: { spaceId: SHOP_ROOM, name: "Shopping", readable: true, archived: false },
      now: "Idle",
      doing: "idle",
      mayMove: true,
      note: undefined,
    });
    expect(agentCard(model, directory, ARJUN, J)).toMatchObject({
      sub: "Main agent · Jacobian",
      mayMove: false,
      note: "J lives in the Main space, so it isn't moved. People can join that space; other agents can't.",
    });
    expect(agentCard(model, directory, ARJUN, CHESS)).toMatchObject({
      sub: "Jacobian · archived",
      room: { spaceId: CHESS_ROOM, readable: true },
      now: "Archived",
      doing: "idle",
      mayMove: false,
    });
    expect(agentCard(model, directory, DANA, SHOPPING).mayMove).toBe(false);
  });

  it("holds its name, archive and delete while its changes are locked, but not its unarchive (ADR 0199)", () => {
    const open = agentCard(model, directory, ARJUN, SHOPPING);
    expect(open).toMatchObject({ locked: false, mayLock: true, mayName: true, mayKeep: true });
    const held = {
      ...directory,
      [SHOPPING]: { ...directory[SHOPPING], locked: true },
      [CHESS]: { ...directory[CHESS], locked: true },
    } as Directory;
    expect(agentCard(model, held, ARJUN, SHOPPING)).toMatchObject({
      locked: true,
      mayLock: true,
      mayName: false,
      mayKeep: false,
      mayUnarchive: false,
      // Its face, and where it is, are not locked.
      mayFace: true,
      mayMove: true,
      note: "Changes are locked. Unlock them to rename, archive or delete it.",
    });
    // Archived and locked: brought back all the same.
    expect(agentCard(model, held, ARJUN, CHESS)).toMatchObject({
      locked: true,
      mayKeep: false,
      mayUnarchive: true,
    });
    // Somebody who may not let it go is told who may, after where it stands.
    expect(agentCard(model, held, DANA, SHOPPING)).toMatchObject({
      mayLock: false,
      mayName: false,
      note: "You're not in its space. Someone in it can add you. Its changes are locked. Jacobian's owner, or an owner or admin here, can unlock them.",
    });
    // The Main agent has no switch.
    expect(agentCard(model, directory, ARJUN, J).mayLock).toBe(false);
  });

  it("carries the face chosen for it, and offers a change to anybody but a guest (ADR 0089)", () => {
    const face = { icon: "cart", ground: 4 };
    const faced = { ...directory, [SHOPPING]: { ...directory[SHOPPING], face } } as Directory;
    expect(agentCard(model, faced, ARJUN, SHOPPING)).toMatchObject({ face, mayFace: true });
    // The row on the tab wears it too, and one nobody chose for has none.
    const rows = agentsTab(model, faced, ARJUN).agents;
    expect(rows.find((row) => row.id === SHOPPING)?.face).toEqual(face);
    expect(rows.find((row) => row.id === HELLO)?.face).toBeUndefined();
    // Not kept to the harness's owner, as a move is: Dana may, and so for the Main agent.
    expect(agentCard(model, faced, DANA, SHOPPING)).toMatchObject({
      mayMove: false,
      mayFace: true,
    });
    expect(agentCard(model, directory, ARJUN, J).mayFace).toBe(true);
    const asGuest = {
      ...model,
      people: {
        ...model.people,
        [DANA]: {
          participantId: DANA,
          displayName: "Dana",
          role: "guest",
          joinedAt: "2026-09-05T00:00:00.000Z",
        },
      },
    } satisfies WorkspaceModel;
    expect(agentCard(asGuest, faced, DANA, SHOPPING).mayFace).toBe(false);
    // Its name, the same (ADR 0091).
    expect(agentCard(model, faced, DANA, SHOPPING)).toMatchObject({
      mayName: true,
      ownName: "Shopping",
      harnessName: "Jacobian",
    });
    expect(agentCard(asGuest, faced, DANA, SHOPPING).mayName).toBe(false);
    // A harness is not an agent: it has no face to choose.
    expect(mayFace(model, faced, ARJUN, JACOBIAN)).toBe(false);
  });

  it("says a free agent's words wait, and doesn't name a room the reader isn't in", () => {
    expect(agentCard(model, directory, ARJUN, BLAND)).toMatchObject({
      sub: "Jacobian · free",
      now: "Not in a space",
      held: 1,
      mayMove: true,
    });
    expect(agentCard(model, directory, ARJUN, RESEARCHER).room).toEqual({
      spaceId: GONE_ROOM,
      name: "A space you're not in",
      readable: false,
      archived: false,
    });
  });

  it("says under what waits who said it and where it goes, and leaves the foot to say no more", () => {
    // Arjun, 19 October 2026: "What is the '1 waiting' label indicate", the foot unread under the
    // card's context and buttons.
    expect(agentCard(model, directory, ARJUN, BLAND)).toMatchObject({
      heldNote:
        "Bland Pricing said this while it wasn't in a space. It's posted in the space it joins next.",
      note: undefined,
    });
    const two: Directory = {
      ...directory,
      [BLAND]: agent(BLAND, "Bland Pricing", JACOBIAN, { room: null, held: 2 }),
    };
    expect(agentCard(model, two, ARJUN, BLAND).heldNote).toBe(
      "Bland Pricing said these while it wasn't in a space. They're posted in the space it joins next.",
    );
    // Nothing waits: no line under the facts, and the foot says what would.
    const none: Directory = {
      ...directory,
      [BLAND]: agent(BLAND, "Bland Pricing", JACOBIAN, { room: null }),
    };
    expect(agentCard(model, none, ARJUN, BLAND)).toMatchObject({
      held: 0,
      heldNote: undefined,
      note: "What it says while it isn't in a space waits, and is said in the next space it's in.",
    });
    expect(agentCard(model, directory, ARJUN, SHOPPING).heldNote).toBeUndefined();
  });
});

describe("a guest's agents (ADR 0196)", () => {
  const SAM = "usr_01K4ZQPX000000000000000SAM";
  /** Dana let in as a guest of one room, and the directory as a guest is told it: that room's. */
  const asGuest = (spaceId: string, role = "guest") =>
    workspace([
      event("person.joined", {
        participant_id: DANA,
        display_name: "Dana",
        role,
        invited_by: ARJUN,
      }),
      member(spaceId, DANA),
    ]);
  const theirs = (...ids: string[]): Directory =>
    Object.fromEntries(
      [ARJUN, DANA, JACOBIAN, OPENCLAW, ...ids].map((id) => [id, directory[id]]),
    ) as Directory;

  it("names whose an agent is, in its harness's place, to a guest alone", () => {
    const seen = theirs(SHOPPING);
    expect(agentByline(asGuest(SHOP_ROOM), seen, DANA, SHOPPING)).toBe("Arjun's agent");
    expect(agentByline(asGuest(SHOP_ROOM, "member"), seen, DANA, SHOPPING)).toBe("Jacobian");
    expect(agentByline(asGuest(SHOP_ROOM), seen, ARJUN, SHOPPING)).toBe("Jacobian");
    // Whose it is unknown, its harness still.
    const ownerless = {
      ...seen,
      [JACOBIAN]: { id: JACOBIAN, kind: "harness", displayName: "Jacobian" },
    } as Directory;
    expect(agentByline(asGuest(SHOP_ROOM), ownerless, DANA, SHOPPING)).toBe("Jacobian");
  });

  it("says whose an agent is on a room's details to everybody, the harness after (ADR 0234)", () => {
    const seen = theirs(SHOPPING);
    expect(roomByline(asGuest(SHOP_ROOM, "member"), seen, DANA, SHOPPING)).toBe(
      "Arjun's agent · Jacobian",
    );
    // A guest is never shown the harness; the reader's own says its harness alone.
    expect(roomByline(asGuest(SHOP_ROOM), seen, DANA, SHOPPING)).toBe("Arjun's agent");
    expect(roomByline(asGuest(SHOP_ROOM), seen, ARJUN, SHOPPING)).toBe("Jacobian");
    // Nobody on record owns the harness: there is nobody to name.
    const ownerless = {
      ...seen,
      [JACOBIAN]: { id: JACOBIAN, kind: "harness", displayName: "Jacobian" },
    } as Directory;
    expect(roomByline(asGuest(SHOP_ROOM, "member"), ownerless, DANA, SHOPPING)).toBe("Jacobian");
    // The tab's own line is unchanged for a member: its harness.
    expect(agentLine(asGuest(SHOP_ROOM, "member"), seen, DANA, SHOPPING)).toBe("Jacobian");
  });

  it("says it on the tab's row and the card", () => {
    const model = asGuest(HELLO_ROOM);
    const seen = theirs(HELLO, MAIN);
    expect(agentLine(model, seen, DANA, HELLO)).toBe("Arjun's agent");
    expect(agentLine(model, seen, DANA, MAIN)).toBe("Arjun's agent · in Hello");
    expect(agentCard(model, seen, DANA, MAIN)).toMatchObject({
      sub: "Arjun's agent",
      harnessName: "OpenClaw",
    });
    // A member's are unchanged.
    expect(agentLine(asGuest(HELLO_ROOM, "member"), seen, DANA, MAIN)).toBe("OpenClaw · in Hello");
  });

  it("says under the tab whose they are and where they answer, to a guest alone", () => {
    const one = asGuest(SHOP_ROOM);
    const shop = theirs(SHOPPING);
    expect(guestAgentsWords(one, shop, DANA, agentsTab(one, shop, DANA))).toBe(
      "Shopping is Arjun's agent and answers in Shopping.",
    );
    const two = asGuest(HELLO_ROOM);
    const hello = theirs(HELLO, MAIN);
    expect(guestAgentsWords(two, hello, DANA, agentsTab(two, hello, DANA))).toBe(
      "They're Arjun's agents and answer in Hello.",
    );
    const sams = {
      ...hello,
      [SAM]: { id: SAM, kind: "person", displayName: "Sam" },
      [OPENCLAW]: { id: OPENCLAW, kind: "harness", displayName: "OpenClaw", ownerId: SAM },
    } as Directory;
    expect(guestAgentsWords(two, sams, DANA, agentsTab(two, sams, DANA))).toBe(
      "They're Arjun's and Sam's agents and answer in Hello.",
    );
    const member = asGuest(HELLO_ROOM, "member");
    expect(guestAgentsWords(member, hello, DANA, agentsTab(member, hello, DANA))).toBeUndefined();
    const owner = workspace();
    expect(
      guestAgentsWords(owner, directory, ARJUN, agentsTab(owner, directory, ARJUN)),
    ).toBeUndefined();
  });
});

describe("a member's agents (ADR 0034's addendum)", () => {
  const BOX = "hrn_01K4ZQPX000000000000000BOX";
  const HELPER = "agt_01K4ZQPX00000000000HELPER";
  /** Dana, a member in Shopping, with a harness of her own whose one agent is free. */
  const model = workspace([
    event("person.joined", { participant_id: DANA, display_name: "Dana", role: "member" }),
    member(SHOP_ROOM, DANA),
  ]);
  // The server names her more than she is shown: agents that were in her rooms, for their words.
  const named = {
    ...directory,
    [BOX]: { id: BOX, kind: "harness", displayName: "Dana's box", ownerId: DANA },
    [HELPER]: agent(HELPER, "Helper", BOX, { room: null }),
  } as Directory;
  const ids = (rows: readonly { id: string }[]) => rows.map((row) => row.id);

  it("lists the agents in her rooms and her own, and their harnesses, and no other", () => {
    const tab = agentsTab(model, named, DANA);
    expect(ids(tab.leads)).toEqual([]);
    expect(ids(tab.agents).sort()).toEqual([HELPER, SHOPPING].sort());
    expect(tab.archived).toEqual({ here: [], elsewhere: [] });
    expect(ids(tab.harnesses).sort()).toEqual([BOX, JACOBIAN].sort());
    expect(showsAgent(model, named, DANA, BLAND)).toBe(false);
    expect(showsAgent(model, named, DANA, HELPER)).toBe(true);
  });

  it("lists every agent to the owner, as before", () => {
    const tab = agentsTab(model, named, ARJUN);
    expect(ids(tab.agents)).toEqual(expect.arrayContaining([BLAND, HELLO, SHOPPING, HELPER]));
    expect(ids(tab.harnesses)).toEqual(expect.arrayContaining([JACOBIAN, OPENCLAW, BOX]));
  });

  it("offers her own free agent to add, and none of the owner's", () => {
    const shop = spaceById(model, SHOP_ROOM);
    if (shop === undefined) throw new Error("no Shopping");
    const offered = addableAgents(shop, named, { model, selfId: DANA });
    expect(offered.free.map((each) => each.agentId)).toEqual([HELPER]);
    expect(offered.elsewhere).toEqual([]);
    // Without a reader, as before: every free agent.
    expect(addableAgents(shop, named).free.map((each) => each.agentId)).toContain(BLAND);
  });

  it("lets her put in a room only what she would move: her own harness's (his call)", () => {
    expect(mayPutIn(model, named, DANA, HELPER)).toBe(true);
    expect(mayPutIn(model, named, DANA, BOX)).toBe(true);
    expect(mayPutIn(model, named, DANA, BLAND)).toBe(false);
    expect(mayPutIn(model, named, DANA, JACOBIAN)).toBe(false);
    expect(mayPutIn(model, named, ARJUN, HELPER)).toBe(true);
    expect(agentCard(model, named, DANA, BLAND)?.mayMove).toBe(false);
    expect(agentCard(model, named, DANA, HELPER)?.mayMove).toBe(true);
  });
});
