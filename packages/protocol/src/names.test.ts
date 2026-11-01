import { describe, expect, it } from "vitest";
import {
  clashKey,
  freeAgentName,
  HIDDEN_CHARACTER_WORDS,
  isFormOf,
  MAX_NAME,
  MIXED_LETTERS_WORDS,
  nameProblem,
  notAnAgentName,
  withoutHidden,
} from "./names.js";

const taken = (...names: string[]) => new Set(names.map(clashKey));

describe("two names clash", () => {
  it("when they are one @-name, case and spaces aside", () => {
    expect(clashKey("Open Claw")).toBe(clashKey("openclaw"));
    expect(clashKey("  OpenClaw ")).toBe("openclaw");
    expect(clashKey("OpenClaw 2")).not.toBe(clashKey("OpenClaw"));
  });

  it("when one reads as the other, whatever its characters are (SEC-33)", () => {
    // A Cyrillic А, a Greek Α, Cyrillic letters throughout, full-width and bold mathematical ones.
    expect(clashKey("\u0410rjun")).toBe(clashKey("Arjun"));
    expect(clashKey("\u0391rjun")).toBe(clashKey("Arjun"));
    expect(clashKey("\u0410\u0455\u0430")).toBe(clashKey("Asa"));
    expect(clashKey("\uff21rjun")).toBe(clashKey("Arjun"));
    expect(clashKey("\u{1d400}rjun")).toBe(clashKey("Arjun"));
    // A zero-width space, a right-to-left mark, a soft hyphen and an emoji's variation selector.
    expect(clashKey("Ar\u200bjun")).toBe(clashKey("Arjun"));
    expect(clashKey("\u200fArjun")).toBe(clashKey("Arjun"));
    expect(clashKey("Ar\u00adjun")).toBe(clashKey("Arjun"));
    expect(clashKey("Rose \u2764\ufe0f")).toBe(clashKey("Rose \u2764"));
  });

  it("not when the names are different words in another alphabet", () => {
    expect(clashKey("\u041d\u0430\u0442\u0430\u0448\u0430")).not.toBe(clashKey("Natasha"));
    expect(clashKey("\u0414\u0438\u043c\u0430")).not.toBe(clashKey("Dima"));
  });
});

describe("a name a person types (SEC-33)", () => {
  it("is had as it is in any one alphabet, with emoji, and with a space between alphabets", () => {
    for (const name of [
      "Arjun",
      "Fran\u00e7oise",
      "\u041d\u0430\u0442\u0430\u0448\u0430",
      "\u039d\u03af\u03ba\u03bf\u03c2",
      "\u5c0f\u660e",
      "Priya \u{1f469}\u200d\u{1f4bb}",
      "\u0645\u06cc\u200c\u062e\u0648\u0627\u0647\u0645",
      "\u0915\u094d\u200d\u0937",
      "Priya \u0418\u0432\u0430\u043d\u043e\u0432\u0430",
      "Milo \u00b7 fork",
    ]) {
      expect(nameProblem(name), name).toBeUndefined();
    }
  });

  it("is refused with a hidden character: zero-width, text direction, a blank letter", () => {
    for (const name of [
      "Ar\u200bjun",
      "Ar\u200djun",
      "\u200cArjun",
      "Arjun\u200d",
      "\u202eArjun",
      "Arjun\u2066x\u2069",
      "\u200fArjun",
      "Ar\u00adjun",
      "\ufeffArjun",
      "\u3164",
      "Arjun\u2800",
      "Ar\u034fjun",
      "\u{1f469}\u200d\u200d\u{1f4bb}",
    ]) {
      expect(nameProblem(name), JSON.stringify(name)).toBe(HIDDEN_CHARACTER_WORDS);
    }
  });

  it("is refused where one word mixes Latin, Cyrillic and Greek letters", () => {
    expect(nameProblem("\u0410rjun")).toBe(MIXED_LETTERS_WORDS);
    expect(nameProblem("Arj\u03c5n")).toBe(MIXED_LETTERS_WORDS);
    expect(nameProblem("Dana \u0410rjun")).toBe(MIXED_LETTERS_WORDS);
  });
});

describe("a name a harness or a device gives itself (SEC-33)", () => {
  it("loses what nobody sees and keeps what makes an emoji or shapes a word", () => {
    expect(withoutHidden("Ar\u200bjun\u202e")).toBe("Arjun");
    expect(withoutHidden("Coder \u{1f469}\u200d\u{1f4bb}")).toBe("Coder \u{1f469}\u200d\u{1f4bb}");
    expect(withoutHidden("\u200dScout")).toBe("Scout");
  });
});

describe("Main and You", () => {
  it("are no agent's name, however they are written", () => {
    expect(notAnAgentName("Main")).toBe(true);
    expect(notAnAgentName(" you ")).toBe(true);
    expect(notAnAgentName("M\u0430in")).toBe(true);
    expect(notAnAgentName("Main 2")).toBe(false);
    expect(notAnAgentName("Mainframe")).toBe(false);
  });

  it("number an agent that asks for one, as a name somebody has does", () => {
    expect(freeAgentName("Main", taken())).toBe("Main 2");
    expect(freeAgentName("You", taken("You 2"))).toBe("You 3");
    expect(freeAgentName("Scout", taken(), "Main")).toBe("Scout");
  });
});

describe("a form of a name", () => {
  it("is the name, or the name numbered from 2", () => {
    expect(isFormOf("OpenClaw", "OpenClaw")).toBe(true);
    expect(isFormOf("Open Claw", "openclaw")).toBe(true);
    expect(isFormOf("OpenClaw 2", "OpenClaw")).toBe(true);
    expect(isFormOf("OpenClaw 17", "OpenClaw")).toBe(true);
  });

  it("is not another name that starts the same", () => {
    expect(isFormOf("OpenClaw 1", "OpenClaw")).toBe(false);
    expect(isFormOf("OpenClaw 23", "OpenClaw 2")).toBe(false);
    expect(isFormOf("OpenClawed", "OpenClaw")).toBe(false);
    expect(isFormOf("Chess Game 2", "Chess")).toBe(false);
  });
});

describe("the name an agent is given", () => {
  it("is the one it asked for when nobody has it", () => {
    expect(freeAgentName("OpenClaw", taken("Hello"))).toBe("OpenClaw");
  });

  it("is numbered from 2 when somebody has it, case and spaces aside", () => {
    expect(freeAgentName("OpenClaw", taken("openclaw"))).toBe("OpenClaw 2");
    expect(freeAgentName("OpenClaw", taken("Open Claw", "OpenClaw 2"))).toBe("OpenClaw 3");
  });

  it("takes the smallest number free", () => {
    expect(freeAgentName("OpenClaw", taken("OpenClaw", "OpenClaw 3"))).toBe("OpenClaw 2");
  });

  it("numbers a numbered name in its family, never twice", () => {
    expect(freeAgentName("OpenClaw 2", taken("OpenClaw", "OpenClaw 2"))).toBe("OpenClaw 3");
  });

  it("keeps a number that is part of a name of its own", () => {
    expect(freeAgentName("India trip 2026", taken("India trip 2026"))).toBe("India trip 2026 2");
    expect(freeAgentName("India trip 2026", taken())).toBe("India trip 2026");
  });

  it("keeps the name it has when that is the name asked for, or a number of it", () => {
    // OpenClaw 2 was archived: OpenClaw 3 keeps its number.
    expect(freeAgentName("OpenClaw", taken("OpenClaw"), "OpenClaw 3")).toBe("OpenClaw 3");
    expect(freeAgentName("OpenClaw", taken(), "OpenClaw 2")).toBe("OpenClaw 2");
    expect(freeAgentName("OpenClaw 2", taken("OpenClaw"), "OpenClaw 3")).toBe("OpenClaw 3");
  });

  it("gives up the name it has when that is another's now, or another name was asked for", () => {
    expect(freeAgentName("OpenClaw", taken("OpenClaw", "OpenClaw 2"), "OpenClaw 2")).toBe(
      "OpenClaw 3",
    );
    expect(freeAgentName("Kit", taken("OpenClaw"), "OpenClaw 2")).toBe("Kit");
  });

  it("is never longer than a name may be", () => {
    const long = "x".repeat(MAX_NAME);
    const name = freeAgentName(long, taken(long));
    expect(name.length).toBe(MAX_NAME);
    expect(name.endsWith(" 2")).toBe(true);
  });
});
