import { describe, expect, it } from "vitest";
import { type AddressInput, resolveAddress, takersOf } from "./address.js";
import { CEILING } from "./exchange.js";

const ARJUN = { id: "usr_arjun", kind: "person" } as const;
const DANA = "usr_dana";
const LEDGER = "hrn_ledger";
const SCOUT = "hrn_scout";
const TREE = "hrn_tree";
const BOTH = [LEDGER, SCOUT];

function person(input: Partial<AddressInput> = {}): AddressInput {
  return { sender: ARJUN, mentioned: [], everyone: false, agents: BOTH, ...input };
}

/** The agents' talk in the room: so many messages between them since the reset, and a pause. */
const talked = (count: number, paused = false) => ({ exchange: { count, paused } });

function harness(id: string, input: Partial<AddressInput> = {}): AddressInput {
  return person({ sender: { id, kind: "harness" }, ...input });
}

describe("a person's message", () => {
  it("is for the harnesses its @s name, in the order it names them", () => {
    expect(resolveAddress(person({ mentioned: [SCOUT, LEDGER] }))).toEqual({
      addressed_to: [SCOUT, LEDGER],
    });
  });

  it("is for no harness when its @s name only people", () => {
    expect(resolveAddress(person({ mentioned: [DANA], to: [LEDGER] }))).toEqual({
      addressed_to: [],
    });
  });

  it("is for every harness when it says @all, however it was aimed", () => {
    expect(resolveAddress(person({ everyone: true, to: [LEDGER], last: [SCOUT] }))).toEqual({
      addressed_to: BOTH,
      addressed_to_all: true,
    });
  });

  it("lets an @ decide before the composer's choice, a reply or the last message", () => {
    const input = person({
      mentioned: [LEDGER],
      to: [SCOUT],
      replyAuthor: { id: SCOUT, kind: "harness" },
      last: [SCOUT],
    });
    expect(resolveAddress(input).addressed_to).toEqual([LEDGER]);
  });

  it("goes where the composer chose, kept to the members", () => {
    expect(resolveAddress(person({ to: [SCOUT, "hrn_gone"], last: [LEDGER] }))).toEqual({
      addressed_to: [SCOUT],
    });
    expect(resolveAddress(person({ to: "all", last: [LEDGER] }))).toEqual({
      addressed_to: BOTH,
      addressed_to_all: true,
    });
  });

  it("passes over a choice that names no member", () => {
    expect(resolveAddress(person({ to: ["hrn_gone"], last: [LEDGER] })).addressed_to).toEqual([
      LEDGER,
    ]);
  });

  it("lets the composer's choice decide before a reply", () => {
    const input = person({ to: [LEDGER], replyAuthor: { id: SCOUT, kind: "harness" } });
    expect(resolveAddress(input).addressed_to).toEqual([LEDGER]);
  });

  it("answering a harness is for that harness", () => {
    const input = person({ replyAuthor: { id: SCOUT, kind: "harness" }, last: [LEDGER] });
    expect(resolveAddress(input).addressed_to).toEqual([SCOUT]);
  });

  it("answering a person decides nothing", () => {
    const input = person({ replyAuthor: { id: DANA, kind: "person" }, last: [LEDGER] });
    expect(resolveAddress(input).addressed_to).toEqual([LEDGER]);
  });

  it("is for the only harness in a space with one, and not for everyone", () => {
    expect(resolveAddress(person({ agents: [LEDGER], last: [] }))).toEqual({
      addressed_to: [LEDGER],
    });
  });

  it("is for everyone in a space with no harness yet, so the harnesses that come get the next", () => {
    expect(resolveAddress(person({ agents: [] }))).toEqual({
      addressed_to: [],
      addressed_to_all: true,
    });
    expect(resolveAddress(person({ agents: BOTH, last: "all" })).addressed_to).toEqual(BOTH);
  });

  it("goes where the sender's last message here went", () => {
    expect(resolveAddress(person({ agents: [LEDGER, SCOUT, TREE], last: [TREE] }))).toEqual({
      addressed_to: [TREE],
    });
  });

  it("is for every harness before the sender's first message", () => {
    expect(resolveAddress(person())).toEqual({ addressed_to: BOTH, addressed_to_all: true });
  });

  it("stays with everyone after a message for everyone, a harness added since included", () => {
    expect(resolveAddress(person({ agents: [LEDGER, SCOUT, TREE], last: "all" }))).toEqual({
      addressed_to: [LEDGER, SCOUT, TREE],
      addressed_to_all: true,
    });
  });

  it("stays with the harnesses picked by name when another joins", () => {
    expect(resolveAddress(person({ agents: [LEDGER, SCOUT, TREE], last: BOTH }))).toEqual({
      addressed_to: BOTH,
    });
  });

  it("stays with no harness after a message that named only people", () => {
    expect(resolveAddress(person({ last: [] })).addressed_to).toEqual([]);
  });

  it("is for every harness when none the last one addressed is left", () => {
    expect(resolveAddress(person({ last: ["hrn_gone"] }))).toEqual({
      addressed_to: BOTH,
      addressed_to_all: true,
    });
    expect(resolveAddress(person({ last: ["hrn_gone", SCOUT] })).addressed_to).toEqual([SCOUT]);
  });

  it("is never held, however long the harnesses have talked", () => {
    expect(resolveAddress(person({ ...talked(99, true), mentioned: [LEDGER] }))).toEqual({
      addressed_to: [LEDGER],
    });
  });
});

describe("a message for a person (ADR 0204)", () => {
  const KAY = "usr_kay";
  const PEOPLE = [ARJUN.id, DANA, KAY];
  const among = (input: Partial<AddressInput>) => person({ people: PEOPLE, ...input });

  it("is for the people the sender picked, and no agent, in a room of one agent too", () => {
    // Foodie, 19 October 2026: "How's it going?" was for Arjun and went to the room's agent.
    expect(resolveAddress(among({ agents: [SCOUT], to: [DANA] }))).toEqual({
      addressed_to: [],
      addressed_people: [DANA],
    });
  });

  it("is for the agents and the people the sender picked together", () => {
    expect(resolveAddress(among({ to: [DANA, SCOUT, "usr_gone"] }))).toEqual({
      addressed_to: [SCOUT],
      addressed_people: [DANA],
    });
  });

  it("is for the people its @s name, which decide before a pick", () => {
    expect(resolveAddress(among({ mentioned: [KAY], to: [DANA, SCOUT] }))).toEqual({
      addressed_to: [],
      addressed_people: [KAY],
    });
    expect(resolveAddress(among({ mentioned: [KAY, LEDGER] }))).toEqual({
      addressed_to: [LEDGER],
      addressed_people: [KAY],
    });
  });

  it("names nobody for Everyone, @all, or a pick of only agents", () => {
    expect(resolveAddress(among({ to: "all" })).addressed_people).toBeUndefined();
    expect(resolveAddress(among({ everyone: true })).addressed_people).toBeUndefined();
    expect(resolveAddress(among({ to: [SCOUT] })).addressed_people).toBeUndefined();
  });

  it("never names the sender", () => {
    expect(resolveAddress(among({ agents: [SCOUT], to: [ARJUN.id] }))).toEqual({
      addressed_to: [SCOUT],
    });
  });

  it("decides before a reply to an agent", () => {
    const input = among({ to: [DANA], replyAuthor: { id: SCOUT, kind: "harness" } });
    expect(resolveAddress(input)).toEqual({ addressed_to: [], addressed_people: [DANA] });
  });

  it("reads people in `to` as nobody when the room's people are not given, as before", () => {
    expect(resolveAddress(person({ agents: [SCOUT], to: [DANA] }))).toEqual({
      addressed_to: [SCOUT],
    });
  });

  it("is never what an agent's message is for", () => {
    expect(
      resolveAddress({ ...among({ to: [DANA] }), sender: { id: LEDGER, kind: "harness" } }),
    ).toEqual({ addressed_to: [] });
  });
});

describe("a harness's message", () => {
  it("is for the harnesses its @s name, never itself", () => {
    expect(resolveAddress(harness(LEDGER, { mentioned: [SCOUT, LEDGER, DANA] }))).toEqual({
      addressed_to: [SCOUT],
    });
  });

  it("with @all is for every other harness", () => {
    const input = harness(LEDGER, { everyone: true, agents: [LEDGER, SCOUT, TREE] });
    expect(resolveAddress(input)).toEqual({ addressed_to: [SCOUT, TREE], addressed_to_all: true });
  });

  it("goes where its adapter aimed it", () => {
    expect(resolveAddress(harness(LEDGER, { to: [SCOUT] })).addressed_to).toEqual([SCOUT]);
    expect(resolveAddress(harness(LEDGER, { to: "all" })).addressed_to).toEqual([SCOUT]);
  });

  it("answering a harness is for that harness", () => {
    const input = harness(LEDGER, { replyAuthor: { id: SCOUT, kind: "harness" } });
    expect(resolveAddress(input).addressed_to).toEqual([SCOUT]);
  });

  it("is for the people otherwise, even as the only other harness or after a last message", () => {
    expect(resolveAddress(harness(LEDGER, { last: [SCOUT] }))).toEqual({ addressed_to: [] });
    expect(resolveAddress(harness(LEDGER, { agents: [LEDGER] }))).toEqual({
      addressed_to: [],
    });
    const reply = harness(LEDGER, { replyAuthor: { id: DANA, kind: "person" } });
    expect(resolveAddress(reply)).toEqual({ addressed_to: [] });
  });
});

describe("the referee's hold (ADR 0097)", () => {
  it("is at 48", () => {
    expect(CEILING).toBe(48);
  });

  it("lets every message between harnesses through up to the ceiling", () => {
    expect(resolveAddress(harness(LEDGER, { mentioned: [SCOUT], ...talked(4) }))).toEqual({
      addressed_to: [SCOUT],
    });
    expect(resolveAddress(harness(LEDGER, { mentioned: [SCOUT], ...talked(47) }))).toEqual({
      addressed_to: [SCOUT],
    });
  });

  it("holds the one after it and later, addressed to nobody, @all too", () => {
    expect(resolveAddress(harness(LEDGER, { everyone: true, ...talked(48) }))).toEqual({
      addressed_to: [],
      held: true,
    });
    expect(resolveAddress(harness(LEDGER, { mentioned: [SCOUT], ...talked(48) }))).toEqual({
      addressed_to: [],
      held: true,
    });
    expect(resolveAddress(harness(SCOUT, { to: [LEDGER], ...talked(60) }))).toEqual({
      addressed_to: [],
      held: true,
    });
  });

  it("holds from the first while a person has paused the agents", () => {
    expect(resolveAddress(harness(LEDGER, { mentioned: [SCOUT], ...talked(0, true) }))).toEqual({
      addressed_to: [],
      held: true,
    });
  });

  it("does not hold what a harness says to the people, nor anything without a count", () => {
    expect(resolveAddress(harness(LEDGER, talked(99, true)))).toEqual({ addressed_to: [] });
    expect(resolveAddress(harness(LEDGER, { mentioned: [SCOUT] }))).toEqual({
      addressed_to: [SCOUT],
    });
  });
});

describe("agents (ADR 0087)", () => {
  const CHESS = "agt_chess";
  const OPENINGS = "agt_openings";
  const agent = (id: string, input: Partial<AddressInput> = {}): AddressInput =>
    person({ sender: { id, kind: "agent" }, agents: [CHESS, OPENINGS, SCOUT], ...input });

  it("speak as a harness did: only to the agents they name, and held past the ceiling", () => {
    expect(resolveAddress(agent(CHESS, { mentioned: [OPENINGS] }))).toEqual({
      addressed_to: [OPENINGS],
    });
    expect(resolveAddress(agent(CHESS))).toEqual({ addressed_to: [] });
    expect(resolveAddress(agent(CHESS, { mentioned: [SCOUT], ...talked(CEILING) }))).toEqual({
      addressed_to: [],
      held: true,
    });
  });

  it("are answered by a reply to what they said", () => {
    const input = person({
      agents: [CHESS, OPENINGS],
      replyAuthor: { id: OPENINGS, kind: "agent" },
    });
    expect(resolveAddress(input)).toEqual({ addressed_to: [OPENINGS] });
  });

  it("are each one of `all`, two of one harness as much as one of each", () => {
    expect(resolveAddress(person({ agents: [CHESS, OPENINGS], everyone: true }))).toEqual({
      addressed_to: [CHESS, OPENINGS],
      addressed_to_all: true,
    });
  });
});

describe("who of a connection takes the turn (`for`)", () => {
  const HARNESS = "hrn_01K4ZQPX000000000000000004";
  const ALPHA = "agt_01K4ZQPX000000000000000007";
  const BETA = "agt_01K4ZQPX000000000000000008";
  const OTHERS = "agt_01K4ZQPX000000000000000009";
  const selves = new Set([HARNESS, ALPHA, BETA]);

  it("is its own among those the message is for, in the order Chips wrote them", () => {
    expect(takersOf([OTHERS, BETA, ALPHA], selves, [ALPHA, BETA])).toEqual([BETA, ALPHA]);
  });

  it("is the harness itself where the harness is the member addressed", () => {
    // A room asked of it from the +, before it claims it (agents review, finding 31).
    expect(takersOf([HARNESS], selves, [])).toEqual([HARNESS]);
  });

  it("is nobody for a message that is for somebody else", () => {
    expect(takersOf([OTHERS], selves, [ALPHA])).toEqual([]);
    expect(takersOf([], selves, [ALPHA])).toEqual([]);
  });

  it("is every one of its own in the room, for a message from before Chips said", () => {
    expect(takersOf(undefined, selves, [ALPHA, BETA])).toEqual([ALPHA, BETA]);
  });

  it("is another of its own an agent of it said the message to, never the one who said it (ADR 0101)", () => {
    // O1 hands the page to O2, both OpenClaw's: O2's turn, not O1's.
    expect(takersOf([BETA, OTHERS], selves, [], ALPHA)).toEqual([BETA]);
    expect(takersOf([ALPHA, BETA], selves, [], ALPHA)).toEqual([BETA]);
    expect(takersOf([ALPHA], selves, [], ALPHA)).toEqual([]);
    expect(takersOf([OTHERS], selves, [], ALPHA)).toEqual([]);
  });

  it("is nobody for its own words from before Chips said who a message is for", () => {
    expect(takersOf(undefined, selves, [ALPHA, BETA], ALPHA)).toEqual([]);
    expect(takersOf(undefined, selves, [ALPHA, BETA], OTHERS)).toEqual([ALPHA, BETA]);
  });
});
