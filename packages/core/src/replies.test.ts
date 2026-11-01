import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { messageIdOf } from "@chipschat/protocol";
import { describe, expect, it } from "vitest";
import type { ClientEvent, Directory } from "./events.js";
import type { Line, Space } from "./model/types.js";
import { buildModel } from "./model.js";
import {
  backToReplyWords,
  mayReply,
  repliesTo,
  repliesWords,
  replyCard,
  replyDay,
} from "./replies.js";

const FIXTURES = fileURLToPath(new URL("../../protocol/fixtures/", import.meta.url));

function fixture(type: string, seq: number, overrides: Record<string, unknown> = {}): ClientEvent {
  return { ...JSON.parse(readFileSync(`${FIXTURES}${type}.json`, "utf8")), seq, ...overrides };
}

const ARJUN = "usr_01K4ZQPX000000000000000003";
const JACOBIAN = "hrn_01K4ZQPX000000000000000004";
const directory: Directory = {
  [ARJUN]: { id: ARJUN, kind: "person", displayName: "Arjun" },
  [JACOBIAN]: { id: JACOBIAN, kind: "harness", displayName: "Jacobian" },
} as unknown as Directory;

const eventId = (seq: number) => `evt_01K4ZQPX${String(seq).padStart(18, "0")}`;

/** A message said at `seq`, by Arjun unless said otherwise, replying to the one at `to`. */
function said(seq: number, text: string, more: { to?: number; by?: string; ts?: string } = {}) {
  return fixture("message.post", seq, {
    id: eventId(seq),
    text,
    actor: { kind: more.by === JACOBIAN ? "harness" : "person", id: more.by ?? ARJUN },
    run_id: undefined,
    ...(more.ts === undefined ? {} : { ts: more.ts }),
    ...(more.to === undefined ? {} : { reply_to: messageIdOf(eventId(more.to)) }),
  });
}

const opened = [fixture("space.created", 1), fixture("membership.added", 2)];

function room(events: readonly ClientEvent[]): Space {
  return buildModel([...opened, ...events]).spaces[0] as Space;
}

const lineAt = (space: Space, seq: number) =>
  space.lines.find((line) => line.id === eventId(seq)) as Line;

describe("replies in the fold (ADR 0219)", () => {
  it("knows the line a reply answers, and the message the replies to it, oldest first", () => {
    const space = room([
      said(10, "Held for 6 at 7:30.", { by: JACOBIAN }),
      said(11, "Make it 8 people", { to: 10 }),
      said(12, "Order the chocolate one"),
      said(13, "And a window table", { to: 10 }),
    ]);
    expect(lineAt(space, 11).replyTo).toBe(eventId(10));
    expect(lineAt(space, 10).repliedBy).toEqual([eventId(11), eventId(13)]);
    expect(lineAt(space, 12).repliedBy).toBeUndefined();
  });

  it("finds a line's replies when it arrives after them, as a history read backwards brings it", () => {
    const space = room([
      said(13, "And a window table", { to: 10 }),
      said(11, "Make it 8 people", { to: 10 }),
      said(10, "Held for 6 at 7:30.", { by: JACOBIAN }),
    ]);
    expect(lineAt(space, 10).repliedBy).toEqual([eventId(11), eventId(13)]);
  });

  it("forgets a reply taken back, and the mark with the last", () => {
    const deleted = (seq: number, of: number) =>
      fixture("message.deleted", seq, {
        message_id: messageIdOf(eventId(of)),
        actor: { kind: "person", id: ARJUN },
      });
    const one = room([
      said(10, "Held"),
      said(11, "Make it 8", { to: 10 }),
      said(12, "And 9", { to: 10 }),
      deleted(13, 11),
    ]);
    expect(lineAt(one, 10).repliedBy).toEqual([eventId(12)]);
    const none = room([said(10, "Held"), said(11, "Make it 8", { to: 10 }), deleted(12, 11)]);
    expect(lineAt(none, 10).repliedBy).toBeUndefined();
  });
});

describe("the card a reply carries (ADR 0219)", () => {
  const now = new Date(2026, 9, 22, 11, 0).getTime();
  const local = (day: number, hour = 14) => new Date(2026, 9, day, hour, 14).toISOString();

  it("quotes who said it, when, and its words as plain words", () => {
    const space = room([
      said(10, "Held for **6** at 7:30.\n\nThey need a card.", { by: JACOBIAN, ts: local(20) }),
      said(11, "Make it 8 people", { to: 10 }),
    ]);
    expect(replyCard(space, lineAt(space, 11), directory, now)).toEqual({
      lineId: eventId(10),
      state: "shown",
      authorId: JACOBIAN,
      name: "Jacobian",
      day: "Tuesday",
      words: "Held for 6 at 7:30. They need a card.",
    });
    expect(replyCard(space, lineAt(space, 10), directory, now)).toBeUndefined();
  });

  it("names what a message of files alone holds", () => {
    const space = room([said(10, "", { ts: local(22, 9) }), said(11, "Nice", { to: 10 })]);
    const photo = {
      ...lineAt(space, 10),
      attachments: [{ id: "att_1", filename: "a.jpg", mimeType: "image/jpeg", byteSize: 1 }],
    };
    const voice = {
      ...lineAt(space, 10),
      attachments: [
        {
          id: "att_2",
          filename: "voice-note-1022-0900.m4a",
          mimeType: "audio/mp4",
          byteSize: 1,
          durationMs: 12_000,
        },
      ],
    };
    const doc = {
      ...lineAt(space, 10),
      attachments: [
        { id: "att_3", filename: "menu.pdf", mimeType: "application/pdf", byteSize: 1 },
      ],
    };
    const reply = lineAt(space, 11);
    const card = (quoted: Line) => replyCard({ lines: [quoted, reply] }, reply, directory, now);
    expect(card(photo)).toMatchObject({ day: "", words: "Photo", holds: { kind: "photo" } });
    expect(card(voice)).toMatchObject({ words: "Voice note, 0:12", holds: { kind: "voice" } });
    expect(card(doc)).toMatchObject({
      words: "menu.pdf",
      holds: { kind: "file", words: "menu.pdf" },
    });
  });

  it("says a message taken back, deleted for the reader, or not on this device, and quotes none", () => {
    const deleted = fixture("message.deleted", 12, {
      message_id: messageIdOf(eventId(10)),
      actor: { kind: "person", id: ARJUN },
    });
    const space = room([
      said(10, "Held", { by: JACOBIAN }),
      said(11, "Make it 8", { to: 10 }),
      deleted,
    ]);
    const reply = lineAt(space, 11);
    expect(replyCard(space, reply, directory, now)).toMatchObject({
      state: "deleted",
      name: "Jacobian",
      words: "Deleted message",
    });
    expect(replyCard({ ...space, hidden: new Set([eventId(10)]) }, reply, directory, now)).toEqual({
      lineId: eventId(10),
      state: "deletedForMe",
      name: "",
      day: "",
      words: "A message you deleted",
    });
    expect(replyCard({ lines: [reply] }, reply, directory, now)).toMatchObject({
      state: "missing",
      words: "Earlier message",
    });
  });

  it("tells the day: none today, Yesterday, a weekday within the week, else the date", () => {
    expect(replyDay(local(22, 9), now)).toBe("");
    expect(replyDay(local(21, 23), now)).toBe("Yesterday");
    expect(replyDay(local(16), now)).toBe("Friday");
    expect(replyDay(local(15), now)).toBe("15 Oct");
    expect(replyDay("not a time", now)).toBe("");
  });

  it("counts the replies the reader has, and says so", () => {
    const line = { repliedBy: ["a", "b", "c"] };
    expect(repliesTo({}, line)).toEqual(["a", "b", "c"]);
    expect(repliesTo({ hidden: new Set(["b"]) }, line)).toEqual(["a", "c"]);
    expect(repliesWords(1)).toBe("1 reply");
    expect(repliesWords(3)).toBe("3 replies");
    expect(backToReplyWords(true)).toBe("Back to your reply");
    expect(backToReplyWords(false)).toBe("Back to the reply");
  });
});

describe("what can be replied to (ADR 0219)", () => {
  const said = { kind: "text", authorKind: "person", text: "Hold it" } as const;
  it("is a message with words or files, said by a person or an agent", () => {
    expect(mayReply(said)).toBe(true);
    expect(mayReply({ ...said, authorKind: "harness" })).toBe(true);
    const photo = { id: "att_1", filename: "a.jpg", mimeType: "image/jpeg", byteSize: 1 };
    expect(mayReply({ ...said, text: "", attachments: [photo] })).toBe(true);
  });

  it("is an agent's answer that also closed its run, but not a summary that is only the run's", () => {
    const answer = { ...said, authorKind: "harness", kind: "summary" } as const;
    expect(mayReply({ ...answer, folded: true })).toBe(true);
    expect(mayReply(answer)).toBe(false);
  });

  it("is not a system line, a message taken back, one still on its way, or one with nothing in it", () => {
    expect(mayReply({ ...said, authorKind: "system" })).toBe(false);
    expect(mayReply({ ...said, deleted: true })).toBe(false);
    expect(mayReply({ ...said, pending: true })).toBe(false);
    expect(mayReply({ ...said, text: " " })).toBe(false);
    expect(mayReply({ ...said, kind: "run" } as unknown as typeof said)).toBe(false);
  });
});
