/**
 * Going in circles (ADR 0097 and its addendum of 17 October 2026), on whole conversations.
 *
 * Arjun's words: "It is totally possible 2+ agents are working on a complex task and need to go
 * back and forth", and Chips must not tell them to stop "for no reason". So each conversation
 * below that does real work is read at every message, from its first to its last, and must never
 * be called a circle; each that goes round is read the same way and must be called one, at the
 * message where it first goes round and not before.
 *
 * The facts are worked out as the server works them out (`exchangeFactsOf`), from the agents'
 * words and the files they post, so what is tested is what an agent's turn would be told.
 */

import { describe, expect, it } from "vitest";
import {
  type ExchangeMessage,
  type ExchangeStretch,
  exchangeFactsOf,
  repeatOf,
  WARN_AT,
} from "./exchange.js";

const agent = (n: number) => `agt_01K4ZQPX${String(n).padStart(18, "0")}`;
const LEAD = agent(1);
const OC2 = agent(2);
const OC3 = agent(3);
const OC4 = agent(4);
const ARJUN = "usr_arjun";

/** One message between agents: who said it, its words, and the files it carried already here. */
type Said = readonly [by: string, text: string, filesSeen?: readonly string[]];

let ids = 0;
const message = ([by, text, filesSeen = []]: Said): ExchangeMessage => {
  ids += 1;
  return { message_id: `msg_${String(ids).padStart(26, "0")}`, by, text, filesSeen };
};

const NOW = Date.parse("2026-10-17T12:00:00Z");

function factsAt(conversation: readonly Said[], upto: number) {
  const messages = conversation.slice(0, upto).map(message);
  const stretch: ExchangeStretch = {
    count: messages.length,
    since: { kind: "person", seq: 1, at: "2026-10-17T11:30:00Z", by: ARJUN },
    messages,
    paused: false,
    personLooking: null,
    person: ARJUN,
  };
  return exchangeFactsOf(stretch, { nowMs: NOW });
}

/** The messages (counted from 1) at which the conversation is called a circle. */
function circledAt(conversation: readonly Said[]): number[] {
  const at: number[] = [];
  for (let upto = 1; upto <= conversation.length; upto += 1) {
    if (factsAt(conversation, upto).circling) at.push(upto);
  }
  return at;
}

/** Each message's stage, from the first. */
function stagesOf(conversation: readonly Said[]) {
  return conversation.map((_, index) => factsAt(conversation, index + 1).stage);
}

// ——— Work that goes back and forth, and is never a circle ———

/** Two agents chasing a bug, each message moving it on. */
const DEBUGGING: Said[] = [
  [OC2, "@Oc3 the parser fails on nested quotes. I think the lexer drops the escape character."],
  [OC3, "@Oc2 agreed, the escape is read twice: once in readString and again in the main loop."],
  [OC2, "@Oc3 reading it once in readString fixed nested quotes, but unicode escapes broke."],
  [OC3, "@Oc2 then the backslash u case needs its own branch before the generic escape branch."],
  [OC2, "@Oc3 added the branch. Unicode passes now; surrogate pairs come out as two characters."],
  [OC3, "@Oc2 combine the pair when the high half is followed by a low half, else keep it as is."],
  [OC2, "@Oc3 done, and the round trip test passes. The fuzzer found a crash on an empty object."],
  [OC3, "@Oc2 that crash is the trailing comma check reading past the end. Guard on length first."],
  [OC2, "@Oc3 guarded. Fuzzer ran ten minutes clean. Should we also cover deeply nested arrays?"],
  [OC3, "@Oc2 yes, recursion depth is unbounded today. Cap it at five hundred and raise an error."],
  [OC2, "@Oc3 capped with a clear error message. Benchmarks are within two percent of before."],
  [OC3, "@Oc2 good. Last thing: the error positions are off by one on lines after a tab."],
  [OC2, "@Oc3 columns counted tabs as one; they now advance to the next multiple of eight."],
  [OC3, "@Oc2 checked against the editor, the positions line up. I think the parser is done."],
];

/** A writer and a checker going through a report, the hand-offs in the same words each time. */
const SECTION_BY_SECTION: Said[] = Array.from({ length: 16 }, (_, i) => {
  const section = Math.floor(i / 2) + 1;
  return i % 2 === 0
    ? ([
        OC2,
        `@Oc3 Done with section ${section} of the report, the totals now match the ledger. Over to you for section ${section + 1}.`,
      ] as const)
    : ([
        OC3,
        `@Oc2 Section ${section} checks out against the ledger, no changes needed. Send section ${section + 1} when it is ready.`,
      ] as const);
});

/** Three agents in a fixed order, a pipeline, each batch reported in the same words. */
const PIPELINE: Said[] = Array.from({ length: 15 }, (_, i) => {
  const batch = Math.floor(i / 3) + 1;
  const rows = 400 + batch * 13;
  return (
    [
      [
        LEAD,
        `@Oc2 batch ${batch} extracted: ${rows} rows from orders_2026_0${batch}.csv, ${batch} rows skipped for bad dates.`,
      ],
      [
        OC2,
        `@Oc3 batch ${batch} transformed: ${rows - batch} rows normalised to the ledger schema, currencies converted at the month end rate.`,
      ],
      [
        OC3,
        `@Lead batch ${batch} loaded: ${rows - batch} rows in, totals ${batch * 1811}.55 match the source. Send batch ${batch + 1}.`,
      ],
    ] as const
  )[i % 3] as Said;
});

/** A lead giving out letters to three helpers in turn, in the same long words each time. */
const LETTERS: Said[] = [
  ["F", "J", OC2, "Oc2"],
  ["K", "O", OC3, "Oc3"],
  ["P", "T", OC4, "Oc4"],
  ["U", "Z", OC2, "Oc2"],
].flatMap(([from, to, helper, handle]) => [
  [
    LEAD,
    `@${handle} please take ${from} to ${to}: seven lines of ASCII art per letter, in the same style as A to E, and paste them into the shared page when you are done.`,
  ] as Said,
  [
    helper as string,
    `@Lead ${from} to ${to} are in the shared page, seven lines each, same style.`,
  ] as Said,
]);

/** Three agents taking the same turns over and over, each with something new. */
const ROUND_TABLE: Said[] = [
  [LEAD, "@Oc2 can you draft the outline for the launch post? Three sections, short."],
  [OC2, "@Oc3 outline: why we built it, what it does, how to try it. Can you write the intro?"],
  [OC3, "@Lead intro written, about ninety words, leading with the problem people told us about."],
  [LEAD, "@Oc2 the intro works. Now the middle: the three features, one paragraph each."],
  [OC2, "@Oc3 middle drafted around rooms, agents and approvals. Can you check the tone?"],
  [OC3, "@Lead tone is fine, I cut two adjectives and one exclamation mark from approvals."],
  [LEAD, "@Oc2 good. Last part: how to try it, with the install command and a link to the docs."],
  [OC2, "@Oc3 install section done with the brew command. Can you read the whole post once more?"],
  [OC3, "@Lead read it through: 412 words, no repeats, links checked. It is ready for Arjun."],
  [LEAD, "@Oc2 thanks. Make a shorter version for the changelog, under sixty words."],
  [OC2, "@Oc3 changelog version is fifty four words. Does it still say what changed?"],
  [OC3, "@Lead it does, and I moved the install line to the end where people look for it."],
];

/** A question and an answer, numbered, as an agent interviews another. */
const INTERVIEW: Said[] = Array.from({ length: 14 }, (_, i) => {
  const n = Math.floor(i / 2) + 1;
  const subjects = [
    "invoices once they are paid",
    "payslips after someone leaves",
    "signed contracts",
    "expense receipts",
    "bank statements",
    "supplier quotes",
    "board minutes",
  ];
  const answers = ["seven", "six", "twelve", "five", "eight", "two", "forever, there are only"];
  return i % 2 === 0
    ? ([OC2, `@Oc3 Question ${n}: how long do we keep ${subjects[n - 1]}?`] as const)
    : ([
        OC3,
        `@Oc2 Answer ${n}: ${answers[n - 1]} years, per section 4.${n} of the retention policy.`,
      ] as const);
});

/** A reviewer and an author, by line and by commit. */
const CODE_REVIEW: Said[] = [
  [OC3, "@Oc2 line 42: rename x to count, it holds the number of retries not a coordinate."],
  [OC2, "@Oc3 renamed on line 42 and in its two callers, pushed as commit 3f9a2c1."],
  [OC3, "@Oc2 line 57: the timeout should come from config rather than being 30 inline."],
  [OC2, "@Oc3 moved the timeout to config with 30 as its default, pushed as commit 8be41d0."],
  [OC3, "@Oc2 line 88: this catch swallows the error. Log it with the request id before retrying."],
  [OC2, "@Oc3 logging the error with the request id now, pushed as commit c07d5e2."],
  [
    OC3,
    "@Oc2 line 103: the retry loop never backs off. Double the wait each time, up to 8 seconds.",
  ],
  [OC2, "@Oc3 backing off by doubling up to 8 seconds, pushed as commit 19aa6f4."],
  [OC3, "@Oc2 all four look right. Approving from my side."],
];

/** Short thanks between real messages, said again and again. */
const THANKS: Said[] = [
  [OC2, "@Oc3 the March figures are in the sheet, rows 2 to 40, with sources in column F."],
  [OC3, "@Oc2 Thanks, on it."],
  [OC2, "@Oc3 April is in too, rows 41 to 77. Two vendors changed name, noted in column G."],
  [OC3, "@Oc2 Thanks, on it."],
  [OC2, "@Oc3 May is the last month, rows 78 to 119. That is everything Arjun asked for."],
  [OC3, "@Oc2 Thanks, on it."],
  [OC2, "@Oc3 the totals row sums all three months; it matches the bank to the cent."],
  [OC3, "@Oc2 Thanks, on it."],
];

/** A reviewer posting the file under discussion each time, with new comments on it. */
const REVIEW_WITH_THE_FILE: Said[] = [
  [
    OC3,
    "@Oc2 first pass on the report: the summary is too long and buries the main number.",
    ["report.md"],
  ],
  [OC2, "@Oc3 shortened the summary to three sentences and put the total first."],
  [OC3, "@Oc2 better. The chart in section two has no units on its axis.", ["report.md"]],
  [OC2, "@Oc3 added pounds to the axis and a source line under the chart."],
  [
    OC3,
    "@Oc2 section three quotes last year's rate; the new one is in the appendix.",
    ["report.md"],
  ],
  [OC2, "@Oc3 swapped in this year's rate and checked the two sums that depend on it."],
  [OC3, "@Oc2 good. Only the title is left: it still says draft.", ["report.md"]],
  [OC2, "@Oc3 title fixed. I will post the finished version for Arjun."],
];

/** Every message signed off the same long way, each with something new before it. */
const SIGNED_OFF: Said[] = Array.from({ length: 10 }, (_, i) => {
  const news = [
    "Imported the January bank export",
    "Matched 214 of 220 January payments",
    "The six unmatched are card refunds",
    "Refunds now matched to their purchases",
    "February export imported, 198 lines",
    "February matched apart from one fee",
    "The fee is the bank's monthly charge",
    "Booked the fee to bank charges",
    "Both months reconcile to the statement",
    "Wrote the summary for Arjun",
  ];
  const to = i % 2 === 0 ? "@Oc3" : "@Oc2";
  return [
    i % 2 === 0 ? OC2 : OC3,
    `${to} ${news[i]}. Let me know if anything else is needed from my side, happy to help with the next part.`,
  ] as const;
});

/** Each message quoting the brief first, then the news. */
const QUOTING_THE_BRIEF: Said[] = Array.from({ length: 8 }, (_, i) => {
  const news = [
    "A to E are drawn, seven lines each",
    "F to J are drawn and match the style",
    "K to O are drawn; O needed a wider bowl",
    "P to T are drawn and pasted below O",
    "U to Z are drawn; the page is complete",
    "Checked every letter renders in Safari",
    "Checked Chrome and Firefox as well",
    "Wrote a one line note for Arjun",
  ];
  return [
    i % 2 === 0 ? OC2 : OC3,
    `${i % 2 === 0 ? "@Oc3" : "@Oc2"} Brief: an alphabet page in ASCII art, five letters each, one shared HTML file. ${news[i]}.`,
  ] as const;
});

const AT_WORK: Record<string, readonly Said[]> = {
  "two agents chasing a bug": DEBUGGING,
  "a writer and a checker, section by section in the same words": SECTION_BY_SECTION,
  "three agents in a fixed order, batch by batch in the same words": PIPELINE,
  "a lead giving out letters to three helpers in the same words": LETTERS,
  "three agents taking the same turns, each time with something new": ROUND_TABLE,
  "a numbered interview": INTERVIEW,
  "a code review by line and commit": CODE_REVIEW,
  "the same short thanks between real messages": THANKS,
  "a reviewer posting the file under discussion with new comments": REVIEW_WITH_THE_FILE,
  "every message signed off the same long way": SIGNED_OFF,
  "every message quoting the brief first": QUOTING_THE_BRIEF,
};

describe("agents at work are never going in circles", () => {
  for (const [name, conversation] of Object.entries(AT_WORK)) {
    it(`${name}: at no message (${conversation.length} of them)`, () => {
      expect(circledAt(conversation)).toEqual([]);
    });
  }

  it("and are warned only at the stop, however long they go back and forth", () => {
    // Every conversation above, end to end, as one long stretch of 104 messages.
    const long = Object.values(AT_WORK).flat();
    expect(long.length).toBeGreaterThan(WARN_AT * 6);
    expect(circledAt(long)).toEqual([]);
    const stages = stagesOf(long);
    expect(stages.indexOf("warning")).toBe(WARN_AT - 1);
    expect(stages.slice(0, WARN_AT - 1)).not.toContain("warning");
  });

  it("with no words said again, even when two take turns many times", () => {
    for (const conversation of Object.values(AT_WORK)) {
      const facts = factsAt(conversation, conversation.length);
      // A thanks under six words, or a file posted again with new words, is no repeat of words.
      expect(facts.repeats.filter((each) => each.kind === "words")).toEqual([]);
    }
  });
});

// ——— Agents going round, which is a circle ———

/** Asking each other to check the same thing again. */
const CHECK_AGAIN: Said[] = [
  [OC2, "@Oc3 can you check that F to J render correctly in the shared file?"],
  [OC3, "@Oc2 they look fine to me, can you check K to O in the shared file?"],
  [OC2, "@Oc3 can you check that F to J render correctly in the shared file again?"],
  [OC3, "@Oc2 F to J look fine to me, can you check K to O in the shared file?"],
];

/** Each waiting on the other. */
const WAITING: Said[] = [
  [OC2, "@Oc3 I am waiting for your K to O letters before I can merge the page."],
  [OC3, "@Oc2 I am waiting for your merged page before I can start on K to O."],
  [OC2, "@Oc3 still waiting for your K to O letters before I can merge the page."],
  [OC3, "@Oc2 still waiting for your merged page before I can start on K to O."],
];

/** The same file handed back and forth with nothing said. */
const SAME_FILE: Said[] = [
  [OC2, "@Oc3 here is the page.", ["alphabet.html"]],
  [OC3, "@Oc2 back to you.", ["alphabet.html"]],
  [OC2, "@Oc3 here it is again.", ["alphabet.html"]],
  [OC3, "@Oc2 over to you.", ["alphabet.html"]],
];

/** Three in a fixed order, one asking again for what it asked before. */
const TRIO_ASKING_AGAIN: Said[] = [
  [LEAD, "@Oc2 please send your F to J letters as HTML here so I can merge them."],
  [OC2, "@Oc3 I sent mine to the shared page, can you add yours after them?"],
  [OC3, "@Lead mine are in the shared page under F to J, ready for you to merge."],
  [LEAD, "@Oc2 please send your F to J letters as HTML here so I can merge them."],
  [OC2, "@Oc3 they are in the shared page already, could you tell the lead that?"],
  [OC3, "@Lead both sets are in the shared page, you can merge from there now."],
];

/** The same apology, nearly word for word. */
const SORRY: Said[] = [
  [OC2, "@Oc3 sorry, I still cannot open the shared page from here, can you paste it inline?"],
  [OC3, "@Oc2 the page is too long to paste inline, can you open the link I sent before?"],
  [
    OC2,
    "@Oc3 sorry, I still cannot open the shared page from here, can you paste it inline please?",
  ],
  [OC3, "@Oc2 it is too long to paste inline, can you open the link I sent before?"],
];

const GOING_ROUND: Record<string, readonly [conversation: readonly Said[], first: number]> = {
  // Two rounds of two is four messages, and of three six: the soonest a circle can be.
  "asking each other to check the same thing again": [CHECK_AGAIN, 4],
  "each waiting on the other": [WAITING, 4],
  "the same file handed back and forth with nothing said": [SAME_FILE, 4],
  "three in a fixed order, one asking again": [TRIO_ASKING_AGAIN, 6],
  "the same apology, nearly word for word": [SORRY, 4],
};

describe("agents going round are told so", () => {
  for (const [name, [conversation, first]] of Object.entries(GOING_ROUND)) {
    it(`${name}: from message ${first}`, () => {
      const at = circledAt(conversation);
      expect(at[0]).toBe(first);
      expect(stagesOf(conversation)[first - 1]).toBe("warning");
    });
  }

  it("and not at all while each says something new, however long the two of them take turns", () => {
    // ADR 0097 also called three rounds of two, or of three, a circle with no repeat at all. It no
    // longer is: going back and forth is not going round.
    const pair: Said[] = Array.from({ length: 12 }, (_, i) =>
      i % 2 === 0
        ? [OC2, `@Oc3 here is part ${i + 1} of the migration, the ${i + 1}th table copied over.`]
        : [OC3, `@Oc2 part ${i} verified: row counts and checksums match for that table.`],
    );
    const trio: Said[] = Array.from({ length: 12 }, (_, i) => [
      [LEAD, OC2, OC3][i % 3] as string,
      `@next step ${i + 1} of the plan is done; step ${i + 2} is yours.`,
    ]);
    expect(circledAt(pair)).toEqual([]);
    expect(circledAt(trio)).toEqual([]);
  });
});

// ——— What a repeat is ———

describe("a repeat", () => {
  it("is the same words with the same particulars: numbers, ids and lettered ranges", () => {
    expect(
      repeatOf("@Oc3 can you check that F to J render correctly in the shared file again?", [
        "@Oc3 can you check that F to J render correctly in the shared file?",
      ]),
    ).toBe(true);
  });

  it("is not the same words about another section, batch, commit or range", () => {
    const pairs: [string, string][] = [
      [
        "Done with section 3 of the report, the totals now match the ledger. Over to you for section 4.",
        "Done with section 2 of the report, the totals now match the ledger. Over to you for section 3.",
      ],
      [
        "batch 4 loaded: 451 rows in, totals 7244.55 match the source. Send batch 5.",
        "batch 3 loaded: 438 rows in, totals 5433.55 match the source. Send batch 4.",
      ],
      [
        "backing off by doubling up to 8 seconds, pushed as commit 19aa6f4.",
        "logging the error with the request id now, pushed as commit c07d5e2.",
      ],
      [
        "please take K to O: seven lines of ASCII art per letter, in the same style as A to E, and paste them into the shared page when you are done.",
        "please take F to J: seven lines of ASCII art per letter, in the same style as A to E, and paste them into the shared page when you are done.",
      ],
    ];
    for (const [now, before] of pairs) expect(repeatOf(now, [before])).toBe(false);
  });

  it("is still the same words when only the small words around them change", () => {
    expect(
      repeatOf("Still waiting on your K to O letters before I can merge them into the page.", [
        "Still waiting for your K to O letters before I can merge them into the page.",
      ]),
    ).toBe(true);
  });

  it("is never a short thanks, however often", () => {
    expect(repeatOf("@Oc2 Thanks, on it.", ["@Oc2 Thanks, on it.", "@Oc2 Thanks, on it."])).toBe(
      false,
    );
  });
});
