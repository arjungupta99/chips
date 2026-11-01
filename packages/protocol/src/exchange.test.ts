/**
 * The referee (ADR 0097), on the ASCII Art room's two stretches (2 October 2026): Oc2 · Oc3 · AA
 * · Oc2 · AA · AA, which is no circle, and AA · Oc3 · Oc2 · AA · Oc3 · Oc2 with the starter file
 * posted again, which is one at the sixth message.
 */

import { describe, expect, it } from "vitest";
import {
  CEILING,
  circleIn,
  deliveredExchange,
  type ExchangeMessage,
  type ExchangeStretch,
  exchangeFacts,
  exchangeFactsOf,
  holds,
  NUDGE_AT,
  renderExchangeNote,
  repeatOf,
  stageOf,
  WARN_AT,
} from "./exchange.js";

/** An agent id as Chips makes them. */
const agent = (n: number) => `agt_01K4ZQPX${String(n).padStart(18, "0")}`;
const AA = agent(1);
const OC2 = agent(2);
const OC3 = agent(3);
const ARJUN = "usr_arjun";
const NAMES: Record<string, string> = {
  [AA]: "ASCII Art",
  [OC2]: "Oc2",
  [OC3]: "Oc3",
  [ARJUN]: "Arjun",
};
const nameOf = (id: string) => NAMES[id] ?? id;

const said = (by: string, text: string, filesSeen: string[] = []): ExchangeMessage => ({
  message_id: `msg_${Math.random().toString(36).slice(2, 10)}`,
  by,
  text,
  filesSeen,
});

const NOW = Date.parse("2026-10-02T18:52:00Z");

function stretch(
  messages: ExchangeMessage[],
  extra: Partial<ExchangeStretch> = {},
): ExchangeStretch {
  return {
    count: messages.length,
    since: { kind: "person", seq: 100, at: "2026-10-02T18:31:00Z", by: ARJUN },
    messages,
    paused: false,
    personLooking: false,
    person: ARJUN,
    ...extra,
  };
}

describe("the stages", () => {
  it("are quiet, a nudge from 8, a warning from 16 or on a circle, and held at 48 or on a pause", () => {
    expect([NUDGE_AT, WARN_AT, CEILING]).toEqual([8, 16, 48]);
    expect(stageOf(7, false, false)).toBe("quiet");
    expect(stageOf(8, false, false)).toBe("nudge");
    expect(stageOf(15, false, false)).toBe("nudge");
    expect(stageOf(6, true, false)).toBe("warning");
    expect(stageOf(16, false, false)).toBe("warning");
    expect(stageOf(48, false, false)).toBe("held");
    expect(stageOf(0, false, true)).toBe("held");
  });

  it("hold the next message between agents at the ceiling, or on a pause, and not before", () => {
    expect(holds({ count: 47, paused: false })).toBe(false);
    expect(holds({ count: 48, paused: false })).toBe(true);
    expect(holds({ count: 0, paused: true })).toBe(true);
  });
});

describe("a circle", () => {
  it("is not the first stretch: Oc2 · Oc3 · AA · Oc2 · AA · AA", () => {
    expect(circleIn([OC2, OC3, AA, OC2, AA, AA], [false, false, false, false, false, true])).toBe(
      false,
    );
  });

  it("is the second at its sixth message: AA · Oc3 · Oc2 twice, with the file posted again", () => {
    const speakers = [AA, OC3, OC2, AA, OC3, OC2];
    expect(circleIn(speakers.slice(0, 5), [false, false, false, true, false])).toBe(false);
    expect(circleIn(speakers, [false, false, false, true, false, false])).toBe(true);
  });

  it("is two taking turns twice with a repeat, and never taking turns alone", () => {
    expect(circleIn([AA, OC2, AA, OC2], [false, false, false, true])).toBe(true);
    expect(circleIn([AA, OC2, AA, OC2], [false, false, false, false])).toBe(false);
    // Three rounds, or ten, with nothing said again: back and forth, not round (17 October 2026).
    expect(circleIn([AA, OC2, AA, OC2, AA, OC2], [false, false, false, false, false, false])).toBe(
      false,
    );
    expect(
      circleIn(
        Array.from({ length: 20 }, (_, i) => (i % 2 === 0 ? AA : OC2)),
        [],
      ),
    ).toBe(false);
    // A repeat older than the last two rounds is not this circle's.
    expect(circleIn([AA, OC2, AA, OC2, AA, OC2], [true, false, false, false, false, false])).toBe(
      false,
    );
    // One agent talking to itself is not a round.
    expect(circleIn([AA, AA, AA, AA], [true, true, true, true])).toBe(false);
  });
});

describe("a repeat", () => {
  const words = "Please send your K to O letters as HTML here so I can merge them";

  it("is the same words again", () => {
    expect(repeatOf(words, ["Thanks.", words])).toBe(true);
  });

  it("is the same words to another agent, the @names left out", () => {
    expect(repeatOf(`@Oc3 ${words}`, [`@Oc2 ${words}`])).toBe(true);
  });

  it("is never five words, however often they are said", () => {
    expect(repeatOf("Your turn for the letters.", ["Your turn for the letters."])).toBe(false);
  });

  it("is not different words", () => {
    expect(repeatOf(words, ["F to J are done and pasted below as one block of HTML"])).toBe(false);
  });
});

describe("the facts", () => {
  it("of the second stretch: a circle, the starter's repeat, and a warning", () => {
    const messages = [
      said(AA, "@Oc2 please edit the shared file at /Users/ada/.jacobian/data/ascii-alphabet.html"),
      said(OC3, "That path is not in my environment; paste it here?"),
      said(OC2, "I cannot reach that path. Here is F–J as HTML instead."),
      said(AA, "Re-attaching the starter.", ["ascii-alphabet.html"]),
      said(OC3, "No attachment content reached me."),
      said(OC2, "No attachment content reached me either."),
    ];
    const facts = exchangeFactsOf(stretch(messages), { nowMs: NOW, alsoFor: [OC3] });
    expect(exchangeFacts.parse(facts)).toEqual(facts);
    expect(facts).toMatchObject({
      count: 6,
      minutes: 21,
      circling: true,
      stage: "warning",
      allowance: 48,
      paused: false,
      also_for: [OC3],
      repeats: [{ by: AA, kind: "file", file: "ascii-alphabet.html" }],
    });
    expect(renderExchangeNote(facts, nameOf)).toBe(
      "The agents in this space have sent each other 6 messages since Arjun last acted here, 21 minutes ago. No person has this space open now. ascii-alphabet.html was posted here before; posting it again reaches nobody new. This message is also for Oc3, who may answer it too. This looks like a circle: the same agents taking turns, and nothing new made since. Stop, and tell Arjun what is done and what is blocked. Messages between the agents are held after 48.",
    );
  });

  it("of a nudge say what Chips sees, and no way out", () => {
    const messages = Array.from({ length: 9 }, (_, index) =>
      said(
        [AA, OC2, OC3][index % 3] ?? AA,
        `Letter ${index} is drawn in the file, line by line now`,
      ),
    );
    const facts = exchangeFactsOf(
      stretch(messages.slice(-2), {
        count: 9,
        since: {
          kind: "work",
          seq: 220,
          at: "2026-10-02T18:47:30Z",
          by: AA,
          made: "file",
          file: "ascii-alphabet.html",
        },
        personLooking: true,
      }),
      { nowMs: NOW },
    );
    expect(facts.stage).toBe("nudge");
    const note = renderExchangeNote(facts, nameOf);
    expect(note).toBe(
      "The agents in this space have sent each other 9 messages since ASCII Art posted ascii-alphabet.html, 4 minutes ago. A person has this space open now.",
    );
    expect(deliveredExchange.safeParse({ ...facts, note }).success).toBe(true);
  });

  it("while held say so, and who to tell", () => {
    const facts = exchangeFactsOf(
      stretch([said(OC2, "Done?")], { count: 3, paused: true, personLooking: null }),
      {
        nowMs: NOW,
      },
    );
    expect(facts.stage).toBe("held");
    expect(renderExchangeNote(facts, nameOf)).toBe(
      "The agents in this space have sent each other 3 messages since Arjun last acted here, 21 minutes ago. Stop, and tell Arjun what is done and what is blocked. Messages between the agents are held until a person acts.",
    );
  });

  it("from the room's start name no time, and a words repeat names its sayer", () => {
    const words = "I will take the letters K to O and paste them here";
    const facts = exchangeFactsOf(
      stretch([said(OC3, words), said(OC2, "Fine by me."), said(OC3, words)], {
        since: { kind: "start", seq: 0 },
        person: undefined,
      }),
      { nowMs: NOW },
    );
    expect(facts.repeats).toEqual([expect.objectContaining({ by: OC3, kind: "words" })]);
    expect(renderExchangeNote(facts, nameOf)).toBe(
      "The agents in this space have sent each other 3 messages since this space began. No person has this space open now. Oc3 has said much the same before.",
    );
  });
});
