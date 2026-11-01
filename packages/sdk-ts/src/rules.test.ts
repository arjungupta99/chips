import {
  type MessageNew,
  type NoteMember,
  type ProjectFacts,
  renderProjectAsks,
  roomNoteFor,
} from "@chipschat/protocol";
import { describe, expect, it } from "vitest";
import { promptFor, rulesFor } from "./prompt.js";
import { SessionRules } from "./rules.js";
import { sendingFiles } from "./sending.js";

const ARJUN: NoteMember = { id: "usr_arjun", kind: "person", name: "Arjun" };
const HALE: NoteMember = { id: "agt_hale", kind: "agent", name: "Hale", harness: "Claude Code" };
const KIT: NoteMember = { id: "agt_kit", kind: "agent", name: "Kit", harness: "Codex" };

const project: ProjectFacts = {
  folder: "/agents/hale/room",
  files: 3,
  changed: [],
  by: [],
  clashes: [],
  clashedWith: [],
  keys: [],
  markdown: false,
};

const room = roomNoteFor([ARJUN, HALE, KIT], [HALE.id]);
const message = {
  from: { display_name: "Arjun" },
  text: "Build a game",
  for: [HALE.id],
  room,
} as unknown as MessageNew;

describe("the rules a turn carries (ADR 0250)", () => {
  it("are the room's rules, the project's asks and how a file is sent, as the turn says them", () => {
    expect(rulesFor(message, { sendsFiles: true, project })).toBe(
      [
        room.rules?.[HALE.id],
        renderProjectAsks(project, { othersInRoom: true }),
        sendingFiles({ project: true }),
      ].join("\n\n"),
    );
    expect(rulesFor(message)).toBe(room.rules?.[HALE.id]);
  });

  it("are left out of a turn whose session holds them, and the facts stay", () => {
    const options = { sendsFiles: true, project };
    const whole = promptFor(message, options);
    const held = promptFor(message, { ...options, rulesHeld: true });
    for (const rule of ["answer NO_REPLY", "leave git to Chips", "MEDIA:<path>"]) {
      expect(whole).toContain(rule);
      expect(held).not.toContain(rule);
    }
    expect(held).toBe(
      [
        "In this space: Arjun (person, @Arjun), Kit (Codex agent, @Kit), and you, Hale (Claude Code agent, @Hale).",
        "The space's project is a git repository. Your copy is /agents/hale/room (3 files), brought up to date just now.",
        "Arjun: Build a game",
      ].join("\n\n"),
    );
  });

  it("are all of the note from a Chips that sent none apart, with the project's asks and files left out", () => {
    const { rules: _, ...older } = room;
    const before = { ...message, room: older } as unknown as MessageNew;
    const held = promptFor(before, { project, rulesHeld: true });
    expect(held).toContain("answer NO_REPLY");
    expect(held).not.toContain("leave git to Chips");
  });
});

describe("which rules a session holds (ADR 0250)", () => {
  const rules = rulesFor(message, { sendsFiles: true, project });

  it("are none until it is told them, and then those, word for word", () => {
    const sessions = new SessionRules();
    expect(sessions.holds("s1", rules)).toBe(false);
    sessions.told("s1", rules);
    expect(sessions.holds("s1", rules)).toBe(true);
    expect(sessions.holds("s2", rules)).toBe(false);
    expect(sessions.holds("s1", rulesFor(message, { sendsFiles: true }))).toBe(false);
  });

  it("are forgotten when it compacts, and there is nothing to hold where there are none", () => {
    const sessions = new SessionRules();
    sessions.told("s1", rules);
    sessions.forget("s1");
    expect(sessions.holds("s1", rules)).toBe(false);
    expect(sessions.holds("s1", "")).toBe(true);
  });
});
