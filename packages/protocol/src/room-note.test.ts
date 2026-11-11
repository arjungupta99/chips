import { describe, expect, it } from "vitest";
import { CEILING } from "./exchange.js";
import {
  FILE_WORDS,
  type NoteMember,
  noteHandle,
  noteWithoutRules,
  REACH_A_PERSON_WORDS,
  RUNNING_WORDS,
  renderRoomNote,
  roomNote,
  roomNoteFor,
  roomRules,
  severalAsked,
  toEveryAgent,
  UNIVERSE_WORDS,
  yoursWithoutAt,
} from "./room-note.js";

const ARJUN: NoteMember = { id: "usr_arjun", kind: "person", name: "Arjun" };
const HELLO: NoteMember = { id: "agt_hello", kind: "agent", name: "Hello" };
const ONE: NoteMember = { id: "agt_one", kind: "agent", name: "OpenClaw" };
const TWO: NoteMember = { id: "agt_two", kind: "agent", name: "OpenClaw 2" };
const J: NoteMember = { id: "agt_j", kind: "agent", name: "J" };

describe("the handle a member is reached by", () => {
  it("is the whole name without spaces, in its own case", () => {
    const room = [ARJUN, HELLO, ONE, TWO];
    expect(noteHandle(TWO, room)).toBe("@OpenClaw2");
    expect(noteHandle(ONE, room)).toBe("@OpenClaw");
  });

  it("is the first word where the whole name is no handle, and nothing for one letter", () => {
    const scout: NoteMember = { id: "agt_scout", kind: "agent", name: "Scout · mini" };
    expect(noteHandle(scout, [scout, ARJUN])).toBe("@Scout");
    expect(noteHandle(J, [J, ARJUN])).toBeUndefined();
  });
});

describe("the room note", () => {
  it("lists the room with handles, the taker last as you, and says what an @ does", () => {
    const room = roomNoteFor([ARJUN, HELLO, ONE, TWO], [TWO.id]);
    expect(room.notes[TWO.id]).toBe(
      "In this space: Arjun (person, @Arjun), Hello (agent, @Hello), OpenClaw (agent, @OpenClaw), and you, OpenClaw 2 (@OpenClaw2). Everyone here reads what you write; only those you @-mention act on it. To hand work to an agent or ask it something, @-mention it. When you need a person to do or decide something, @-mention them. That is what reaches their phone. Don't @ them for updates. If a message asks nothing of you now, as when it names a step that is yours later, answer NO_REPLY and nothing else: the space shows nothing, and nobody needs to hear that you are ready or waiting. To get a file from the person's computer, ask them to attach it to a message here. Don't try to read their Desktop, Documents or Downloads: macOS can block that, and the read can hang.",
    );
    expect(roomNote.safeParse(room).success).toBe(true);
    expect(room.members.map((member) => member.handle)).toEqual([
      "@Arjun",
      "@Hello",
      "@OpenClaw",
      "@OpenClaw2",
    ]);
  });

  it("is one per taker, each the other's view", () => {
    const room = roomNoteFor([ARJUN, ONE, TWO], [ONE.id, TWO.id]);
    expect(Object.keys(room.notes)).toEqual([ONE.id, TWO.id]);
    expect(room.notes[ONE.id]).toContain(
      "OpenClaw 2 (agent, @OpenClaw2), and you, OpenClaw (@OpenClaw).",
    );
    expect(room.notes[TWO.id]).toContain(
      "OpenClaw (agent, @OpenClaw), and you, OpenClaw 2 (@OpenClaw2).",
    );
  });

  // Every turn it said the hold, a leftover of the four-message guard; the warning says it when
  // it matters, with the workspace's own numbers (ADR 0187).
  it("leaves the referee's numbers to its warning", () => {
    const note = renderRoomNote(roomNoteFor([ARJUN, HELLO, ONE], []).members, ONE.id);
    expect(note).not.toContain("messages between agents");
    expect(note).not.toContain(String(CEILING));
  });

  it("stops at who reads it when no other agent is here", () => {
    const room = roomNoteFor([ARJUN, HELLO], [HELLO.id]);
    expect(room.notes[HELLO.id]).toBe(
      "In this space: Arjun (person, @Arjun), and you, Hello (@Hello). Everyone here reads what you write. To get a file from the person's computer, ask them to attach it to a message here. Don't try to read their Desktop, Documents or Downloads: macOS can block that, and the read can hang.",
    );
  });

  // 2 November 2026: asked where a report was, an agent sent Arjun to "the space's file list".
  it("says where people open the space's project once it has one (ADR 0227)", () => {
    const project = true;
    const alone = roomNoteFor(
      [ARJUN, HELLO],
      [HELLO.id],
      undefined,
      {},
      undefined,
      undefined,
      project,
    );
    expect(alone.notes[HELLO.id]).toBe(
      `In this space: Arjun (person, @Arjun), and you, Hello (@Hello). Everyone here reads what you write. ${FILE_WORDS} ${UNIVERSE_WORDS} ${RUNNING_WORDS}`,
    );
    expect(alone.rules?.[HELLO.id]).toBe(
      `Everyone here reads what you write. ${FILE_WORDS} ${UNIVERSE_WORDS} ${RUNNING_WORDS}`,
    );
    const shared = roomNoteFor(
      [ARJUN, ONE, TWO],
      [TWO.id],
      undefined,
      {},
      undefined,
      undefined,
      project,
    );
    expect(shared.rules?.[TWO.id]).toContain(`${FILE_WORDS} ${UNIVERSE_WORDS} ${RUNNING_WORDS}`);
    expect(noteWithoutRules(shared, TWO.id)).not.toContain("Universe");
    expect(roomNoteFor([ARJUN, HELLO], [HELLO.id]).notes[HELLO.id]).not.toContain("Universe");
  });

  it("says how to reach a person beside other agents, and how to get a file everywhere (ADR 0287)", () => {
    const shared = roomNoteFor([ARJUN, ONE, TWO], [TWO.id]);
    expect(shared.rules?.[TWO.id]).toContain(REACH_A_PERSON_WORDS);
    expect(shared.rules?.[TWO.id]).toContain(FILE_WORDS);
    const alone = roomNoteFor([ARJUN, HELLO], [HELLO.id]);
    expect(alone.rules?.[HELLO.id]).not.toContain(REACH_A_PERSON_WORDS);
    expect(alone.rules?.[HELLO.id]).toContain(FILE_WORDS);
  });

  it("says what a page and a running program can do only where there is a project (ADR 0287)", () => {
    expect(roomNoteFor([ARJUN, HELLO], [HELLO.id]).notes[HELLO.id]).not.toContain("Run again");
    expect(roomRules(roomNoteFor([ARJUN, HELLO], [HELLO.id]).members, HELLO.id, true)).toContain(
      "press Run again",
    );
  });

  it("lists a member no handle reaches without one", () => {
    const room = roomNoteFor([ARJUN, J, HELLO], [HELLO.id]);
    expect(room.notes[HELLO.id]).toContain("J (agent), and you, Hello (@Hello).");
  });

  it("says which harness each agent runs on, the taker's own too (ADR 0101)", () => {
    // The ASCII Art room, 3 October 2026: "Jacobian is the lead", and nobody was called Jacobian.
    const art: NoteMember = {
      id: "agt_art",
      kind: "agent",
      name: "ASCII Art",
      harness: "Jacobian",
    };
    const o1: NoteMember = { id: "agt_o1", kind: "agent", name: "O1", harness: "OpenClaw" };
    const o2: NoteMember = { id: "agt_o2", kind: "agent", name: "O2", harness: "OpenClaw" };
    const room = roomNoteFor([ARJUN, art, o1, o2], [o2.id]);
    expect(room.notes[o2.id]).toContain(
      "In this space: Arjun (person, @Arjun), ASCII Art (Jacobian agent, @ASCIIArt), O1 (OpenClaw agent, @O1), and you, O2 (OpenClaw agent, @O2).",
    );
    expect(room.members.find((member) => member.name === "O1")?.harness).toBe("OpenClaw");
    expect(roomNote.safeParse(room).success).toBe(true);
  });

  it("leaves out a harness an agent is named as, and a person's", () => {
    const own: NoteMember = { id: "agt_oc", kind: "agent", name: "OpenClaw", harness: "OpenClaw" };
    const room = roomNoteFor([{ ...ARJUN, harness: "OpenClaw" }, own, TWO], [TWO.id]);
    expect(room.notes[TWO.id]).toContain(
      "Arjun (person, @Arjun), OpenClaw (agent, @OpenClaw), and you, OpenClaw 2 (@OpenClaw2).",
    );
    expect(room.members.every((member) => member.harness === undefined)).toBe(true);
  });
});

describe("the room note with a lead (ADR 0104)", () => {
  // The fifth ASCII Art room, 3 October 2026: three agents and Arjun, ASCII Art leading.
  const art: NoteMember = {
    id: "agt_art",
    kind: "agent",
    name: "ASCII Art",
    harness: "Jacobian",
    lead: true,
  };
  const j1: NoteMember = { id: "agt_j1", kind: "agent", name: "J1", harness: "Jacobian" };
  const o1: NoteMember = { id: "agt_o1", kind: "agent", name: "O1", harness: "OpenClaw" };
  const o2: NoteMember = { id: "agt_o2", kind: "agent", name: "O2", harness: "OpenClaw" };
  const room = [ARJUN, art, j1, o1, o2];
  const now = {
    working: [{ participant_id: o1.id, minutes: 2, step: "Editing ascii-alphabet.html" }],
    idle: [
      { participant_id: art.id, minutes: 2 },
      { participant_id: j1.id, minutes: 3 },
    ],
  };

  it("says who leads, who is working, and how long the others have been without a turn", () => {
    const note = roomNoteFor(room, [o2.id], now);
    expect(note.notes[o2.id]).toBe(
      "In this space: Arjun (person, @Arjun), ASCII Art (Jacobian agent, @ASCIIArt), J1 (Jacobian agent, @J1), O1 (OpenClaw agent, @O1), and you, O2 (OpenClaw agent, @O2). ASCII Art leads here: it hands out the work, and what is nobody's turn goes to it. Working now: O1, 2 minutes in (last step: Editing ascii-alphabet.html). Not working: ASCII Art for 2 minutes, J1 for 3 minutes. Everyone here reads what you write; only those you @-mention act on it. To hand work to an agent or ask it something, @-mention it. When you need a person to do or decide something, @-mention them. That is what reaches their phone. Don't @ them for updates. If a message asks nothing of you now, as when it names a step that is yours later, answer NO_REPLY and nothing else: the space shows nothing, and nobody needs to hear that you are ready or waiting. To get a file from the person's computer, ask them to attach it to a message here. Don't try to read their Desktop, Documents or Downloads: macOS can block that, and the read can hang.",
    );
    expect(note.members.find((member) => member.name === "ASCII Art")?.lead).toBe(true);
    expect(note.working).toEqual(now.working);
    expect(roomNote.safeParse(note).success).toBe(true);
  });

  it("tells the lead it leads, and leaves the taker out of who is working", () => {
    const note = roomNoteFor(room, [art.id], {
      working: [{ participant_id: art.id, minutes: 0 }],
      idle: [{ participant_id: j1.id, minutes: 1 }],
    });
    expect(note.notes[art.id]).toContain(
      "You lead here: you hand out the work, and what is nobody's turn comes to you. A step one agent has handed to another needs no word from you until it comes back to you. Working now: nobody else. Not working: J1 for 1 minute.",
    );
  });

  it("tells each taker it may pass, and only the lead that a hand-off needs nothing from it (ADR 0109)", () => {
    const note = roomNoteFor(room, [art.id, o2.id], now);
    for (const id of [art.id, o2.id]) {
      expect(note.notes[id]).toContain(
        "If a message asks nothing of you now, as when it names a step that is yours later, answer NO_REPLY and nothing else",
      );
    }
    expect(note.notes[art.id]).toContain(
      "A step one agent has handed to another needs no word from you",
    );
    expect(note.notes[o2.id]).not.toContain("A step one agent has handed");
  });

  it("says nothing of a lead or of work in a room with neither", () => {
    const note = roomNoteFor([ARJUN, j1, o1], [o1.id]);
    expect(note.notes[o1.id]).not.toContain("lead");
    expect(note.notes[o1.id]).not.toContain("Working now");
    expect(note.working).toBeUndefined();
  });

  it("hands the lead what was nobody's turn, first, with who said it and who to tell", () => {
    const note = roomNoteFor(room, [art.id], now, {
      [art.id]: { nobodys: { saidBy: "J1", tell: "Arjun" } },
    });
    expect(note.notes[art.id]).toMatch(
      /^Nobody has this turn: J1 said it with no @, and nobody in the space has worked since\. It comes to you as the lead: hand the next step on with an @, or, if the work is done or stuck, tell Arjun\. In this space:/,
    );
  });

  it("tells one that is not the lead that a message with no @ for it is its, first", () => {
    const note = roomNoteFor(room, [o2.id], now, { [o2.id]: { yours: { saidBy: "Arjun" } } });
    expect(note.notes[o2.id]).toMatch(
      /^Arjun sent this message to you without an @: it is yours to answer\. In this space:/,
    );
  });

  it("tells each agent that a message for every agent is in every agent's hands, first (ADR 0249)", () => {
    const toAll = { toAll: { saidBy: "Arjun" } };
    const note = roomNoteFor(room, [o2.id, art.id], now, { [o2.id]: toAll, [art.id]: toAll });
    for (const id of [o2.id, art.id]) {
      expect(note.notes[id]).toMatch(
        /^Arjun sent this message to every agent here, so each of you has it: answer it yourself, and don't pass it on with an @\. In this space:/,
      );
    }
  });

  it("says nothing of an @ where no other agent is there to take the turn", () => {
    const note = roomNoteFor([ARJUN, o2], [o2.id], undefined, {
      [o2.id]: { yours: { saidBy: "Arjun" }, toAll: { saidBy: "Arjun" } },
    });
    expect(note.notes[o2.id]).toMatch(/^In this space:/);
    expect(note.notes[o2.id]).not.toContain("without an @");
    expect(note.notes[o2.id]).not.toContain("every agent");
  });

  it("tells a newcomer when it joined and to work from the room's files", () => {
    const j2: NoteMember = { id: "agt_j2", kind: "agent", name: "J2", harness: "Jacobian" };
    const note = roomNoteFor([...room, j2], [j2.id], now, {
      [j2.id]: { joined: { minutes: 1, by: "Arjun", files: true } },
    });
    expect(note.notes[j2.id]).toMatch(
      /^You joined this space 1 minute ago, added by Arjun\. The space's files listed with this turn are its current versions: work from them, not from a copy you made in another space\. In this space:/,
    );
    const bare = roomNoteFor([...room, j2], [j2.id], undefined, {
      [j2.id]: { joined: { minutes: 0, files: false } },
    });
    expect(bare.notes[j2.id]).toMatch(/^You joined this space just now\. In this space:/);
  });

  it("tells the others who joined since they last spoke, never themselves", () => {
    const j2: NoteMember = { id: "agt_j2", kind: "agent", name: "J2", harness: "Jacobian" };
    const note = roomNoteFor([...room, j2], [art.id], now, {
      [art.id]: {
        newcomers: [{ id: j2.id, by: "Arjun" }, { id: art.id, by: "Arjun" }, { id: "agt_gone" }],
      },
    });
    expect(note.notes[art.id]).toMatch(
      /^New since your last turn: J2 \(Jacobian agent, @J2\), added by Arjun\. In this space:/,
    );
  });
});

describe("the room note when the turn's lines were cut (ADR 0105)", () => {
  const j1: NoteMember = { id: "agt_j1", kind: "agent", name: "J1", harness: "Jacobian" };
  const o1: NoteMember = { id: "agt_o1", kind: "agent", name: "O1", harness: "OpenClaw" };

  it("says how many of the lines since its last turn came, and that older ones did not", () => {
    const note = roomNoteFor([ARJUN, j1, o1], [j1.id], undefined, {
      [j1.id]: { cut: { shown: 20 } },
    });
    expect(note.notes[j1.id]).toMatch(
      /^Only the newest 20 lines of what was said here since your last turn come with this one: older lines were left out\. In this space:/,
    );
    const one = roomNoteFor([ARJUN, j1], [j1.id], undefined, { [j1.id]: { cut: { shown: 1 } } });
    expect(one.notes[j1.id]).toMatch(
      /^Only the newest line of what was said here since your last turn comes with this one: older lines were left out\. In this space:/,
    );
  });

  it("says nothing of it when nothing was left out", () => {
    const note = roomNoteFor([ARJUN, j1, o1], [j1.id], undefined, { [j1.id]: {} });
    expect(note.notes[j1.id]).not.toContain("left out");
  });
});

describe("the rules a room note ends with (ADR 0250)", () => {
  const spend = { ceiling_usd: 3, spent_usd: 1.2, since_seq: 40, uncounted_runs: 0 };

  it("are carried apart for each taker, and each note ends with its own", () => {
    const room = roomNoteFor(
      [ARJUN, HELLO, ONE, TWO],
      [ONE.id, TWO.id],
      undefined,
      undefined,
      spend,
    );
    for (const id of [ONE.id, TWO.id]) {
      const rules = room.rules?.[id] ?? "";
      expect(rules).toMatch(/^Everyone here reads what you write; only those you @-mention act/);
      expect(rules).toContain("answer NO_REPLY and nothing else");
      expect(room.notes[id]?.endsWith(` ${rules}`)).toBe(true);
    }
    expect(roomNote.safeParse(room).success).toBe(true);
  });

  it("are only that everyone reads what it writes where no other agent is there", () => {
    const room = roomNoteFor([ARJUN, J], [J.id]);
    expect(room.rules?.[J.id]).toBe(`Everyone here reads what you write. ${FILE_WORDS}`);
    expect(roomRules(room.members, J.id)).toBe(`Everyone here reads what you write. ${FILE_WORDS}`);
  });

  it("leave the facts when taken off: the news, who is here, who works, and the spend", () => {
    const room = roomNoteFor(
      [ARJUN, HELLO, ONE],
      [ONE.id],
      undefined,
      {
        [ONE.id]: { toAll: { saidBy: "Arjun" } },
      },
      spend,
    );
    expect(noteWithoutRules(room, ONE.id)).toBe(
      "Arjun sent this message to every agent here, so each of you has it: answer it yourself, and don't pass it on with an @. In this space: Arjun (person, @Arjun), Hello (agent, @Hello), and you, OpenClaw (@OpenClaw). This job has spent $1.20 of the $3.00 this space allows a job; at $3.00 Chips holds the agents until a person acts.",
    );
  });

  it("leave the whole note from a Chips that sent none, and nothing for a taker with no note", () => {
    const room = roomNoteFor([ARJUN, HELLO, ONE], [ONE.id]);
    const { rules: _, ...older } = room;
    expect(noteWithoutRules(older, ONE.id)).toBe(room.notes[ONE.id]);
    expect(noteWithoutRules(room, HELLO.id)).toBeUndefined();
    expect(noteWithoutRules(undefined, ONE.id)).toBeUndefined();
  });
});

describe("the room note's spend line (ADR 0117)", () => {
  const spend = { ceiling_usd: 3, spent_usd: 1.2, since_seq: 40, uncounted_runs: 0 };

  it("comes just before the rules in a room of agents (ADR 0250)", () => {
    const note = roomNoteFor([ARJUN, HELLO, ONE], [ONE.id], undefined, undefined, spend).notes[
      ONE.id
    ];
    expect(note).toContain(
      "This job has spent $1.20 of the $3.00 this space allows a job; at $3.00 Chips holds the agents until a person acts. Everyone here reads what you write; only those you @-mention act on it.",
    );
  });

  it("is there too in a room with no other agent", () => {
    const note = renderRoomNote(
      roomNoteFor([ARJUN, J], [J.id]).members,
      J.id,
      undefined,
      undefined,
      {
        ...spend,
        spent_usd: 0.04,
        ceiling_usd: 10,
      },
    );
    expect(note).toBe(
      "In this space: Arjun (person, @Arjun), and you, J. This job has spent $0.04 of the $10.00 this space allows a job; at $10.00 Chips holds the agents until a person acts. Everyone here reads what you write. To get a file from the person's computer, ask them to attach it to a message here. Don't try to read their Desktop, Documents or Downloads: macOS can block that, and the read can hang.",
    );
  });

  it("says how many runs reported no cost", () => {
    const one = roomNoteFor([ARJUN, J], [J.id], undefined, undefined, {
      ...spend,
      uncounted_runs: 1,
    });
    expect(one.notes[J.id]).toContain("1 run here reported no cost and is not counted.");
    const two = roomNoteFor([ARJUN, J], [J.id], undefined, undefined, {
      ...spend,
      uncounted_runs: 2,
    });
    expect(two.notes[J.id]).toContain("2 runs here reported no cost and are not counted.");
  });

  it("is not there when Chips did not say", () => {
    expect(roomNoteFor([ARJUN, J], [J.id]).notes[J.id]).not.toContain("This job");
  });
});

describe("each person's time (ADR 0157)", () => {
  const here: NoteMember = { ...ARJUN, timeZone: "America/Los_Angeles" };
  const priya: NoteMember = {
    id: "usr_priya",
    kind: "person",
    name: "Priya",
    timeZone: "Asia/Kolkata",
  };
  const at = "2026-10-13T16:12:30.500Z";

  it("follows the room's line, with the date, the clock and the offset to write it with", () => {
    const note = roomNoteFor([here, J], [J.id], undefined, undefined, undefined, at);
    expect(note.notes[J.id]).toBe(
      "In this space: Arjun (person, @Arjun), and you, J. Arjun's time now: 9:12 am, Tuesday 13 October 2026 (2026-10-13T09:12-07:00, America/Los_Angeles). Everyone here reads what you write. To get a file from the person's computer, ask them to attach it to a message here. Don't try to read their Desktop, Documents or Downloads: macOS can block that, and the read can hang.",
    );
    expect(note.members[0]?.time_zone).toBe("America/Los_Angeles");
    expect(roomNote.safeParse(note).success).toBe(true);
  });

  it("names each person in one line, half-hour offsets and all", () => {
    const note = roomNoteFor([here, priya, J], [J.id], undefined, undefined, undefined, at);
    expect(note.notes[J.id]).toContain(
      "The time now for each person: Arjun, 9:12 am, Tuesday 13 October 2026 (2026-10-13T09:12-07:00, America/Los_Angeles); Priya, 9:42 pm, Tuesday 13 October 2026 (2026-10-13T21:42+05:30, Asia/Kolkata).",
    );
  });

  it("reads the offset at the instant, across a change of clocks", () => {
    const after = roomNoteFor(
      [here, J],
      [J.id],
      undefined,
      undefined,
      undefined,
      "2026-11-02T00:05:00Z",
    );
    expect(after.notes[J.id]).toContain(
      "4:05 pm, Sunday 1 November 2026 (2026-11-01T16:05-08:00, America/Los_Angeles)",
    );
    const noon = roomNoteFor(
      [{ ...ARJUN, timeZone: "UTC" }, J],
      [J.id],
      undefined,
      undefined,
      undefined,
      "2026-10-13T12:00:00Z",
    );
    expect(noon.notes[J.id]).toContain(
      "12:00 pm, Tuesday 13 October 2026 (2026-10-13T12:00+00:00, UTC)",
    );
  });

  it("says nothing of a person with no zone, a zone it can't read, or with no instant", () => {
    const none = roomNoteFor([ARJUN, J], [J.id], undefined, undefined, undefined, at);
    expect(none.notes[J.id]).not.toContain("time now");
    const unread = roomNoteFor(
      [{ ...ARJUN, timeZone: "Mars/Olympus" }, J],
      [J.id],
      undefined,
      undefined,
      undefined,
      at,
    );
    expect(unread.notes[J.id]).not.toContain("time now");
    expect(roomNoteFor([here, J], [J.id]).notes[J.id]).not.toContain("time now");
  });

  it("gives an agent no zone, even when one is known", () => {
    const zoned: NoteMember = { ...J, timeZone: "Europe/London" };
    const note = roomNoteFor([ARJUN, zoned], [zoned.id], undefined, undefined, undefined, at);
    expect(note.members[1]?.time_zone).toBeUndefined();
  });
});

describe("a message for an agent with no @ for it (ADR 0104 addendum)", () => {
  const nova = "agt_nova";
  const tomas = "agt_tomas";

  it("is one chosen in the composer, answering its words, or written on to it", () => {
    expect(yoursWithoutAt({ text: "Say hello", to: [nova], addressed_to: [nova] }, nova)).toBe(
      true,
    );
    expect(yoursWithoutAt({ text: "And now?", addressed_to: [nova, tomas] }, tomas)).toBe(true);
  });

  it("is not one that @-mentions it, one for every agent, one for others, or one from before", () => {
    const named = { text: "@Nova hello", mentions: [nova], addressed_to: [nova] };
    expect(yoursWithoutAt(named, nova)).toBe(false);
    const everyone = { text: "Hello all", addressed_to: [nova, tomas], addressed_to_all: true };
    expect(yoursWithoutAt(everyone, nova)).toBe(false);
    expect(yoursWithoutAt({ text: "Tomas?", addressed_to: [tomas] }, nova)).toBe(false);
    expect(yoursWithoutAt({ text: "Before ADR 0081" }, nova)).toBe(false);
  });
});

describe("a message for every agent (ADR 0249)", () => {
  it("is one whose sender chose All, and no other", () => {
    const nova = "agt_nova";
    expect(toEveryAgent({ text: "Hello all", addressed_to: [nova], addressed_to_all: true })).toBe(
      true,
    );
    expect(toEveryAgent({ text: "@Nova hello", mentions: [nova], addressed_to: [nova] })).toBe(
      false,
    );
    expect(toEveryAgent({ text: "Before ADR 0081" })).toBe(false);
  });
});

describe("a person's message for several agents (ADR 0287)", () => {
  const SANJAY: NoteMember = {
    id: "agt_sanjay",
    kind: "agent",
    name: "Sanjay",
    harness: "Claude Code",
    lead: true,
  };
  const MUSA: NoteMember = { id: "agt_musa", kind: "agent", name: "Musa", harness: "Codex" };
  const VICTOR: NoteMember = { id: "agt_victor", kind: "agent", name: "Victor", harness: "Hermes" };
  const IVAN: NoteMember = { id: "agt_ivan", kind: "agent", name: "Ivan", harness: "Jacobian" };
  const room = [ARJUN, IVAN, MUSA, SANJAY, VICTOR];
  const unled = [ARJUN, IVAN, MUSA, { ...SANJAY, lead: false }, VICTOR];
  const to = (...ids: string[]) => ({ addressed_to: ids });
  const noteOf = (members: readonly NoteMember[], payload: Record<string, unknown>, id: string) => {
    const several = severalAsked(payload, members);
    return (
      roomNoteFor(
        members,
        [id],
        undefined,
        several === undefined ? {} : { [id]: { several: { saidBy: "Arjun", ...several } } },
      ).notes[id] ?? ""
    );
  };

  it("is everyone it named, in its order, with the lead to organise", () => {
    expect(severalAsked(to(VICTOR.id, SANJAY.id, MUSA.id), room)).toEqual({
      asked: [VICTOR.id, SANJAY.id, MUSA.id],
      organiser: SANJAY.id,
    });
  });

  it("falls to the first it named where the lead wasn't asked, so nobody waits on no one", () => {
    expect(severalAsked(to(VICTOR.id, MUSA.id), room)?.organiser).toBe(VICTOR.id);
  });

  it("falls to the first it named in a room with no lead", () => {
    expect(severalAsked(to(VICTOR.id, IVAN.id), unled)?.organiser).toBe(VICTOR.id);
  });

  it("is every agent, by name, for one sent to all, and the lead still organises", () => {
    const payload = { addressed_to: [], addressed_to_all: true };
    expect(severalAsked(payload, room)).toEqual({
      asked: [IVAN.id, MUSA.id, SANJAY.id, VICTOR.id],
      organiser: SANJAY.id,
    });
    expect(severalAsked(payload, unled)?.organiser).toBe(IVAN.id);
  });

  it("tells every taker the same organiser, whichever of them it is told to", () => {
    const payload = to(VICTOR.id, MUSA.id, IVAN.id);
    expect(severalAsked(payload, room)).toEqual(severalAsked(payload, [...room].reverse()));
  });

  it("is nothing for one agent, or for a person named beside one", () => {
    expect(severalAsked(to(MUSA.id), room)).toBeUndefined();
    expect(severalAsked(to(MUSA.id, ARJUN.id), room)).toBeUndefined();
    expect(severalAsked({}, room)).toBeUndefined();
  });

  it("counts an agent named twice once", () => {
    expect(severalAsked(to(MUSA.id, MUSA.id), room)).toBeUndefined();
  });

  it("reads a harness asked before its agent took its place as that agent", () => {
    const current = (id: string) => (id === "hrn_codex" ? MUSA.id : id);
    expect(severalAsked(to("hrn_codex", IVAN.id), room, current)?.asked).toEqual([
      MUSA.id,
      IVAN.id,
    ]);
  });

  it("tells one who isn't organising to answer a question, do its part, or wait", () => {
    expect(noteOf(room, to(SANJAY.id, MUSA.id, VICTOR.id, IVAN.id), MUSA.id)).toMatch(
      /^Arjun sent this to you, Sanjay, Victor and Ivan too, so each of you already has it: don't pass it on with an @\. Give your own answer to a question without waiting for the others\. If it says who does what, do your part\. If one thing is to be made and it doesn't say who does what, Sanjay says who does what: answer NO_REPLY and wait for that\. In this space:/,
    );
  });

  it("tells the organiser to say who does what", () => {
    expect(noteOf(room, to(SANJAY.id, MUSA.id), SANJAY.id)).toMatch(
      /^Arjun sent this to you and Musa too, so each of you already has it: don't pass it on with an @\. Give your own answer to a question without waiting for the others\. If it says who does what, do your part\. If one thing is to be made and it doesn't say who does what, you say who does what, with an @ for each, before anyone starts\. In this space:/,
    );
  });

  it("says one thing, not that the message is the taker's alone or every agent's", () => {
    const several = severalAsked(to(SANJAY.id, MUSA.id), room);
    const news = {
      yours: { saidBy: "Arjun" },
      toAll: { saidBy: "Arjun" },
      ...(several === undefined ? {} : { several: { saidBy: "Arjun", ...several } }),
    };
    const note = roomNoteFor(room, [MUSA.id], undefined, { [MUSA.id]: news }).notes[MUSA.id];
    expect(note).not.toContain("it is yours to answer");
    expect(note).not.toContain("every agent here");
    expect(note).toContain("Sanjay says who does what");
  });

  it("says nothing to one the message isn't for", () => {
    const several = severalAsked(to(SANJAY.id, MUSA.id), room);
    const note = roomNoteFor(room, [IVAN.id], undefined, {
      ...(several === undefined ? {} : { [IVAN.id]: { several: { saidBy: "Arjun", ...several } } }),
    }).notes[IVAN.id];
    expect(note).toMatch(/^In this space:/);
  });
});

describe("what a turn is told of work another agent did not pick up (ADR 0291)", () => {
  const WYNN: NoteMember = { id: "agt_wynn", kind: "agent", name: "Wynn", lead: true };
  const HAZEL: NoteMember = { id: "agt_hazel", kind: "agent", name: "Hazel" };
  const OTTO: NoteMember = { id: "agt_otto", kind: "agent", name: "Ottoline" };
  const team = [ARJUN, WYNN, HAZEL, OTTO];
  const noteFor = (
    you: string,
    news: Parameters<typeof renderRoomNote>[3],
    now?: Parameters<typeof renderRoomNote>[2],
  ) =>
    roomNoteFor(team, [you], now, news === undefined ? undefined : { [you]: news }).notes[you] ??
    "";

  it("tells the agent that said it, when its own message comes back", () => {
    expect(
      noteFor(WYNN.id, {
        unpicked: {
          by: "Hazel",
          why: "offline",
          minutes: 3,
          yours: true,
          lead: true,
          tell: "Arjun",
        },
      }),
    ).toMatch(
      /^Hazel hasn't picked up this message of yours, sent 3 minutes ago: its harness is offline\. Do the work yourself, hand it to another agent with an @, or tell Arjun it is waiting on Hazel\. Write Hazel's name without an @ until it is back: an @ for it now only waits\. In this space:/,
    );
  });

  it("tells the lead whose message it is, and that it comes to it as the lead", () => {
    expect(
      noteFor(WYNN.id, {
        unpicked: { by: "Ottoline", why: "silent", minutes: 1, saidBy: "Hazel", lead: true },
      }),
    ).toMatch(
      /^Ottoline hasn't picked up this message from Hazel, sent 1 minute ago: nothing has been heard from it\. It comes to you as the lead: do the work yourself, hand it to another agent with an @, or tell the people here it is waiting on Ottoline\. In this space:/,
    );
  });

  it("says why in the harness's words, or the run's, with no second full stop", () => {
    const why = (unpicked: { why: "trouble" | "failed"; reason?: string }) =>
      noteFor(HAZEL.id, { unpicked: { by: "Wynn", minutes: 0, yours: true, ...unpicked } });
    expect(why({ why: "trouble", reason: "Can't reach its gateway." })).toContain(
      "sent just now: its harness says: Can't reach its gateway. Do the work yourself",
    );
    expect(why({ why: "trouble" })).toContain(
      "its harness says something is wrong on its side. Do",
    );
    expect(why({ why: "failed", reason: "Codex stopped (exited 1)" })).toContain(
      "its turn failed: Codex stopped (exited 1). Do",
    );
    expect(why({ why: "failed" })).toContain("its turn failed. Do");
    // Away, an @ for it only waits; after a turn that failed, an @ is how to ask again.
    expect(why({ why: "trouble" })).toContain("Write Wynn's name without an @ until it is back");
    expect(why({ why: "failed" })).not.toContain("without an @");
  });

  it("says a message reaches its taker late, before who is here", () => {
    expect(noteFor(HAZEL.id, { late: { minutes: 42 } })).toMatch(
      /^This was said 42 minutes ago and reaches you only now: read what was said since before you act on it\. In this space:/,
    );
  });

  it("names who can't answer after who is working, and never the taker", () => {
    const now = {
      working: [],
      idle: [],
      away: [
        { participant_id: HAZEL.id, why: "offline" as const, minutes: 12 },
        {
          participant_id: OTTO.id,
          why: "trouble" as const,
          reason: "Can't reach its gateway",
          minutes: 2,
        },
      ],
    };
    expect(noteFor(WYNN.id, undefined, now)).toContain(
      "Working now: nobody else. Can't answer now: Hazel (offline for 12 minutes); Ottoline (its harness says: Can't reach its gateway). Work you hand them waits until they are back.",
    );
    expect(noteFor(HAZEL.id, undefined, now)).toContain(
      "Can't answer now: Ottoline (its harness says: Can't reach its gateway). Work you hand it waits until it is back.",
    );
    const wire = roomNoteFor(team, [WYNN.id], now);
    expect(roomNote.parse(wire).away).toHaveLength(2);
    expect(roomNoteFor(team, [WYNN.id], { working: [], idle: [] }).away).toBeUndefined();
  });
});
