import {
  CONTEXT_BUDGET,
  CONTEXT_HEADING,
  type MessageNew,
  type MessageOverheard,
  type NoteMember,
  roomNoteFor,
} from "@chipschat/protocol";
import { describe, expect, it } from "vitest";
import { BEFORE_HEADING, heldWords, promptFor } from "./prompt.js";

const ARJUN: NoteMember = { id: "usr_arjun", kind: "person", name: "Arjun" };
const HALE: NoteMember = { id: "agt_hale", kind: "agent", name: "Hale", harness: "Claude Code" };
const KIT: NoteMember = { id: "agt_kit", kind: "agent", name: "Kit", harness: "Codex" };

const room = roomNoteFor([ARJUN, HALE, KIT], [HALE.id]);
const note = room.notes[HALE.id];

const arjun = {
  participant_id: ARJUN.id,
  kind: "person",
  display_name: "Arjun",
  role: "owner",
  workspace_role: "owner",
};
const kit = { participant_id: KIT.id, kind: "agent", display_name: "Kit", role: "member" };

function line(seq: number, from: typeof arjun | typeof kit, text: string, id: string) {
  return {
    seq,
    at: "2026-11-11T09:00:00.000Z",
    kind: "said",
    from: {
      id: from.participant_id,
      kind: from.kind,
      name: from.display_name,
      ...("workspace_role" in from ? { workspace_role: from.workspace_role } : {}),
    },
    message_id: id,
    text,
  };
}

function said(id: string, text: string, more: Record<string, unknown> = {}): MessageNew {
  return {
    type: "message.new",
    message_id: id,
    from: arjun,
    text,
    for: [HALE.id],
    room,
    ...more,
  } as unknown as MessageNew;
}

function overheard(from: typeof arjun | typeof kit, text: string, more = {}): MessageOverheard {
  return {
    type: "message.overheard",
    message_id: "msg_o",
    from,
    text,
    ...more,
  } as unknown as MessageOverheard;
}

const first = said("msg_1", "@Hale draw the board");
const second = said("msg_2", "and make it 9 by 9\nwith a border", {
  attachments: [{ filename: "board.png", mime_type: "image/png" }],
});
/** The newest: what was said since Hale last spoke has the two that waited, and Kit's line between them. */
const newest = said("msg_3", "actually skip the border", {
  context: {
    lines: [
      line(11, arjun, "@Hale draw the board", "msg_1"),
      line(12, kit, "I have the pieces", "msg_k"),
      line(13, arjun, "and make it 9 by 9 with a border", "msg_2"),
    ],
    since_seq: 10,
    truncated: false,
    before: 11,
  },
});

describe("a turn on what waited (ADR 0294)", () => {
  it("says every message that waited in full, oldest first, under the newest's note", () => {
    expect(promptFor(newest, { earlier: [first, second] })).toBe(
      [
        note,
        `${CONTEXT_HEADING}\nKit: I have the pieces`,
        "3 messages for you waited while you were working or away. They follow, oldest first. Answer them together in one reply, and where a later one changes or settles an earlier one, go by the later.",
        "Arjun (owner): @Hale draw the board",
        "Arjun (owner): and make it 9 by 9\nwith a border\n(attached: board.png, image/png)",
        "Arjun (owner): actually skip the border",
      ].join("\n\n"),
    );
  });

  it("leaves the lines since as they are for a message that waited alone", () => {
    const alone = promptFor(newest);
    expect(alone).toContain("Arjun (owner): @Hale draw the board\nKit: I have the pieces");
    expect(alone).not.toContain("waited while you were working");
    expect(promptFor(newest, { earlier: [] })).toBe(alone);
  });

  it("says no heading for the lines since when every one of them waited", () => {
    const only = said("msg_3", "actually skip the border", {
      context: {
        lines: [line(11, arjun, "@Hale draw the board", "msg_1")],
        since_seq: 10,
        truncated: false,
        before: 11,
      },
    });
    expect(promptFor(only, { earlier: [first] })).not.toContain(CONTEXT_HEADING);
  });

  it("leaves out of the lines since what the agent has had a turn on", () => {
    const text = promptFor(newest, { earlier: [second], answered: ["msg_1"] });
    expect(text).toContain(
      `${CONTEXT_HEADING}\nKit: I have the pieces\n\n2 messages for you waited`,
    );
    expect(text).not.toContain("draw the board");
  });

  it("says the message each one answers ahead of it", () => {
    const replying = said("msg_2", "this one", {
      ts: "2026-11-11T09:05:00.000Z",
      replying_to: {
        message_id: "msg_0",
        at: "2026-11-11T09:00:00.000Z",
        from: { id: HALE.id, kind: "agent", name: "Hale" },
        text: "Which board?",
      },
    });
    const text = promptFor(newest, { earlier: [replying], zone: "UTC" });
    expect(text).toContain(
      "Arjun (owner) is replying to your message from today at 9:00 AM.\nYour message:\n> Which board?\n\nArjun (owner): this one\n\nArjun (owner): actually skip the border",
    );
  });

  it("says what was said after, to others, last", () => {
    const since = [
      overheard(kit, "I drew the board already,\nit is in the project"),
      overheard(arjun, "thanks Kit", {
        attachments: [{ filename: "ok.png", mime_type: "image/png" }],
      }),
      overheard(kit, "@Hale and the pieces", { held: true }),
    ];
    const text = promptFor(newest, { earlier: [first], since });
    expect(
      text.endsWith(
        [
          "Arjun (owner): actually skip the border",
          [
            "Said in this space after those messages, to others:",
            "Kit: I drew the board already, it is in the project",
            "Arjun (owner): thanks Kit (sent ok.png)",
            "Kit: @Hale and the pieces (held by Chips until a person acts)",
          ].join("\n"),
        ].join("\n\n"),
      ),
    ).toBe(true);
    expect(promptFor(newest, { since: since.slice(0, 1) })).toContain(
      "Said in this space after that message, to others:\nKit: I drew",
    );
  });

  it("says the newest forty of what was said after", () => {
    const since = Array.from({ length: CONTEXT_BUDGET.lines + 5 }, (_, at) =>
      overheard(kit, `line ${at}`),
    );
    const text = promptFor(newest, { since });
    expect(text).not.toContain("Kit: line 4\n");
    expect(text).toContain("to others:\nKit: line 5\n");
    expect(text.endsWith(`Kit: line ${CONTEXT_BUDGET.lines + 4}`)).toBe(true);
  });
});

// Finding NR-13, 13 November 2026: one ask to each of three agents by the field's pick, the same
// but for a word. The agent asked for "echo" was handed the ask for "delta" as a line of the
// room's, with nothing saying it was another's, and answered "delta".
describe("a line said to another agent since the taker last spoke (ADR 0088)", () => {
  const forThem = (seq: number, text: string, id: string, to: readonly NoteMember[]) => ({
    ...line(seq, arjun, text, id),
    addressed_to: to.map((each) => each.id),
    to: to.map((each) => ({ id: each.id, name: each.name })),
  });
  const echo = (lines: readonly unknown[], more: Record<string, unknown> = {}) =>
    said("msg_e", "Reply with the single word echo", {
      context: { lines, since_seq: 10, truncated: false, before: 11 },
      ...more,
    });

  it("says whom it was for, and nothing more of one for the taker alone", () => {
    const text = promptFor(
      echo([
        forThem(11, "Reply with the single word delta", "msg_d", [KIT]),
        forThem(12, "Reply with the single word charlie", "msg_c", [HALE]),
        forThem(13, "Both of you, hold on", "msg_b", [KIT, HALE]),
        line(14, kit, "delta", "msg_k"),
      ]),
    );
    expect(text).toBe(
      [
        note,
        [
          CONTEXT_HEADING,
          "Arjun (owner), to Kit: Reply with the single word delta",
          "Arjun (owner): Reply with the single word charlie",
          "Arjun (owner), to you and Kit: Both of you, hold on",
          "Kit: delta",
        ].join("\n"),
        "Arjun (owner): Reply with the single word echo",
      ].join("\n\n"),
    );
  });

  it("says it by the taker the bridge names, for a message with more than one", () => {
    const lines = [forThem(11, "Reply with the single word delta", "msg_d", [KIT])];
    const both = echo(lines, { for: [HALE.id, KIT.id] });
    expect(promptFor(both, { taker: HALE.id })).toContain(
      "Arjun (owner), to Kit: Reply with the single word delta",
    );
    expect(promptFor(both, { taker: KIT.id })).toContain(
      `${CONTEXT_HEADING}\nArjun (owner): Reply with the single word delta`,
    );
  });

  it("says it of a line from before the taker joined", () => {
    const before = {
      lines: [forThem(3, "Reply with the single word delta", "msg_d", [KIT])] as never,
    };
    expect(promptFor(first, { before })).toContain(
      `${BEFORE_HEADING}\nArjun (owner), to Kit: Reply with the single word delta`,
    );
  });

  it("reads a line from a Chips that names nobody as it always has", () => {
    const old = { ...line(11, arjun, "Reply with the single word delta", "msg_d") };
    expect(promptFor(echo([{ ...old, addressed_to: [KIT.id] }]))).toContain(
      `${CONTEXT_HEADING}\nArjun (owner): Reply with the single word delta`,
    );
  });
});

describe("an agent's first turn in a room it was put in (ADR 0088)", () => {
  const before = {
    lines: [
      line(3, arjun, "we need a board", "msg_a"),
      line(4, kit, "I can draw one", "msg_b"),
      line(5, arjun, "@Hale draw the board", "msg_1"),
    ] as never,
  };

  it("is told what was said before it joined, ahead of the lines since, without its own message", () => {
    const text = promptFor(first, { before });
    expect(text).toBe(
      [
        note,
        `${BEFORE_HEADING}\nArjun (owner): we need a board\nKit: I can draw one`,
        "Arjun (owner): @Hale draw the board",
      ].join("\n\n"),
    );
    expect(promptFor(newest, { before, earlier: [first, second] })).toContain(
      `Kit: I can draw one\n\n${CONTEXT_HEADING}\nKit: I have the pieces\n\n3 messages for you waited`,
    );
  });

  it("says nothing where nothing was said before", () => {
    expect(promptFor(first, { before: { lines: [] } })).toBe(promptFor(first));
  });
});

describe("an agent whose last message Chips held (ADR 0097)", () => {
  it("is told first, as Chips's word, with how many the agents have sent", () => {
    const words = heldWords({ held: true, exchange: { count: 48, allowance: 48 } });
    expect(words).toBe(
      "Your last message in this space was held, so the agents it named do not have it yet: messages between the agents here are held (they have sent each other 48 since a person last acted) until a person acts. Until then, tell the person what is done and what is blocked, rather than asking the agents again.",
    );
    const said = {
      ...first,
      exchange: { stage: "held", note: "Chips: a person paused the agents." },
    } as MessageNew;
    const text = promptFor(said, { heldPost: { held: true, exchange: { count: 48 } } });
    expect(text.startsWith(`${words}\n\nChips: a person paused the agents.\n\n${note}`)).toBe(true);
  });

  it("is told the agents have it now, once a person has acted since", () => {
    const released =
      "Your last message in this space was held from the agents it named until a person acted. A person has now, so Chips has handed it to them: do not send it again.";
    expect(heldWords({ held: true, exchange: { count: 48 } }, true)).toBe(released);
    // A person's message restarts the count, so it says nothing of a hold, or a stage that is not one.
    expect(
      promptFor(first, { heldPost: { held: true } }).startsWith(`${released}\n\n${note}`),
    ).toBe(true);
    const nudged = {
      ...first,
      exchange: { stage: "nudge", note: "Chips: wrap up." },
    } as MessageNew;
    expect(
      promptFor(nudged, { heldPost: { held: true } }).startsWith(`${released}\n\nChips: wrap up.`),
    ).toBe(true);
  });

  it("is told without a count where a person paused the agents, and nothing for a post that went", () => {
    expect(heldWords({ held: true })).toContain("are held until a person acts.");
    expect(heldWords({})).toBeUndefined();
    expect(heldWords(undefined)).toBeUndefined();
    expect(promptFor(first, { heldPost: {} })).toBe(promptFor(first));
  });
});
