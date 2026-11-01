import { describe, expect, it } from "vitest";
import type { Directory } from "./events.js";
import { refusalWords } from "./refusalWords.js";

const ARJUN: Directory = {
  usr_01M1QS7VXYY26ADKHEF7TNZ7WZ: {
    id: "usr_01M1QS7VXYY26ADKHEF7TNZ7WZ",
    kind: "person",
    displayName: "Arjun",
  },
};

describe("why the server turned something away", () => {
  it("says the server's reason without the event's name, as a sentence", () => {
    expect(refusalWords("question.answered was refused: the run has ended as done", {})).toBe(
      "Not sent: the run has ended as done.",
    );
  });

  it("names whoever answered first, rather than their id", () => {
    expect(
      refusalWords(
        "that question was already answered by usr_01M1QS7VXYY26ADKHEF7TNZ7WZ; the first answer wins",
        ARJUN,
      ),
    ).toBe("Not sent: that question was already answered by Arjun; the first answer wins.");
  });

  it("says a refused Not right? the same way (PM-4)", () => {
    expect(refusalWords("that message was taken back, and takes nothing more", {})).toBe(
      "Not sent: that message was taken back, and takes nothing more.",
    );
  });
});
