import { describe, expect, it } from "vitest";
import { faceWords } from "./faceWords";

describe("what a face wears, in words (ADR 0174)", () => {
  it("says the mark on its colour", () => {
    expect(faceWords({ icon: "cup", ground: 3 })).toBe("Cup on Teal");
    expect(faceWords({ icon: "cookie", ground: 23 })).toBe("Cookie on Navy");
  });

  it("says letters or an emoji on their colour", () => {
    expect(faceWords({ icon: "", ground: 3, letters: "AB" })).toBe("AB on Teal");
    expect(faceWords({ icon: "", ground: 23, letters: "🦊" })).toBe("🦊 on Navy");
  });

  it("says a colour chosen on its own as the colour", () => {
    expect(faceWords({ icon: "", ground: 3 })).toBe("Teal");
    expect(faceWords({ icon: "", ground: 3, letters: "" })).toBe("Teal");
  });

  it("says a mark this build does not know as the colour it is drawn as", () => {
    expect(faceWords({ icon: "hovercraft", ground: 0 })).toBe("Pink");
  });

  it("says Default when nothing is chosen", () => {
    expect(faceWords(undefined)).toBe("Default");
  });

  it("names a colour past the list by its number", () => {
    expect(faceWords({ icon: "", ground: 40 })).toBe("Colour 41");
  });
});
