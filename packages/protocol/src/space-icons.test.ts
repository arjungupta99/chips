import { describe, expect, it } from "vitest";
import {
  faceLetters,
  lettersIn,
  lettersScale,
  parseSpaceIcon,
  SPACE_ICON_GROUNDS,
} from "./space-icons.js";

describe("the face a person chooses for a space", () => {
  it("takes a mark from the library on one of the grounds", () => {
    expect(parseSpaceIcon({ icon: "rocket", ground: 5 })).toEqual({
      ok: true,
      value: { icon: "rocket", ground: 5 },
    });
  });

  it("takes a colour on its own, which is what picking a ground first writes", () => {
    // Requiring a mark made the picker's colour strip a button that did nothing until one had
    // been chosen (Arjun, 22 September 2026). An empty mark is the initials on the ground.
    expect(parseSpaceIcon({ icon: "", ground: 3 })).toEqual({
      ok: true,
      value: { icon: "", ground: 3 },
    });
  });

  it("still says no to a mark that is not a name in the library", () => {
    expect(parseSpaceIcon({ icon: "roc ket", ground: 0 }).ok).toBe(false);
    expect(parseSpaceIcon({ icon: "rocket-2", ground: 0 }).ok).toBe(false);
    expect(parseSpaceIcon({ icon: "a".repeat(41), ground: 0 }).ok).toBe(false);
  });

  it("takes the last of the twenty-seven grounds (26 September 2026)", () => {
    expect(SPACE_ICON_GROUNDS).toBe(27);
    expect(parseSpaceIcon({ icon: "tent", ground: 26 }).ok).toBe(true);
  });

  it("says no to a ground no client has", () => {
    expect(parseSpaceIcon({ icon: "rocket", ground: SPACE_ICON_GROUNDS }).ok).toBe(false);
    expect(parseSpaceIcon({ icon: "rocket", ground: -1 }).ok).toBe(false);
    expect(parseSpaceIcon({ icon: "rocket", ground: 1.5 }).ok).toBe(false);
  });
});

describe("a face of letters (ADR 0139)", () => {
  it("takes one or two letters, or an emoji or two, on a ground", () => {
    for (const letters of ["AB", "X", "ab", "🦊", "🦊🚀", "A🚀", "é", "Ж"]) {
      expect(parseSpaceIcon({ icon: "", ground: 2, letters })).toEqual({
        ok: true,
        value: { icon: "", ground: 2, letters },
      });
    }
  });

  it("counts a letter as a reader sees it, however many code points it is", () => {
    // A family, a skin tone, a flag, a keycap, a flag of tags, a heart on fire, a decomposed é.
    const one = ["👨‍👩‍👧", "👍🏽", "🇮🇳", "1️⃣", "🏴󠁧󠁢󠁥󠁮󠁧󠁿", "❤️‍🔥", "e\u0301", "कि"];
    for (const letter of one) expect(lettersIn(letter)).toEqual([letter]);
    expect(lettersIn("🇮🇳🇺🇸")).toEqual(["🇮🇳", "🇺🇸"]);
    expect(parseSpaceIcon({ icon: "", ground: 0, letters: "👨‍👩‍👧🧑🏽‍💻" }).ok).toBe(true);
  });

  it("says no to three letters, to spaces, and to nothing", () => {
    expect(parseSpaceIcon({ icon: "", ground: 0, letters: "ABC" }).ok).toBe(false);
    expect(parseSpaceIcon({ icon: "", ground: 0, letters: "A B" }).ok).toBe(false);
    expect(parseSpaceIcon({ icon: "", ground: 0, letters: " A" }).ok).toBe(false);
    expect(parseSpaceIcon({ icon: "", ground: 0, letters: "" }).ok).toBe(false);
    expect(parseSpaceIcon({ icon: "", ground: 0, letters: "A\n" }).ok).toBe(false);
    expect(parseSpaceIcon({ icon: "", ground: 0, letters: "🦊🦊🦊" }).ok).toBe(false);
  });

  it("keeps what a field may hold as it is typed: no spaces, and the first two", () => {
    expect(faceLetters("a b c")).toBe("ab");
    expect(faceLetters(" X ")).toBe("X");
    expect(faceLetters("🦊🚀🌙")).toBe("🦊🚀");
    expect(faceLetters("👨‍👩‍👧A")).toBe("👨‍👩‍👧A");
    expect(faceLetters("")).toBe("");
  });

  it("is what a face without letters always was", () => {
    expect(parseSpaceIcon({ icon: "rocket", ground: 5 })).toEqual({
      ok: true,
      value: { icon: "rocket", ground: 5 },
    });
  });
});

describe("how large a face's letters are drawn (ADR 0139)", () => {
  it("draws letters at the initials' size", () => {
    for (const letters of ["AB", "X", "ab", "Ж"]) expect(lettersScale(letters)).toBe(1);
  });

  it("draws one emoji a little larger, as one capital fills a face", () => {
    expect(lettersScale("🦊")).toBe(1.25);
    expect(lettersScale("👨‍👩‍👧")).toBe(1.25);
    expect(lettersScale("🇮🇳")).toBe(1.25);
  });

  it("draws two emoji, an emoji and a letter, or two wide characters smaller, to fit", () => {
    expect(lettersScale("🦊🚀")).toBeCloseTo(0.71, 2);
    expect(lettersScale("A🚀")).toBeCloseTo(0.89, 2);
    expect(lettersScale("漢字")).toBeCloseTo(0.85, 2);
    expect(lettersScale("🦊🚀")).toBeLessThan(lettersScale("A🚀"));
  });
});
