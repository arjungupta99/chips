import { describe, expect, it } from "vitest";
import {
  FOLDER_ON_MAC_WORDS,
  folderCameWords,
  folderClashWords,
  folderHeadWords,
  folderKeysWords,
  folderMakesWords,
  folderOnMacWords,
  folderOpenedFromWords,
  folderSentWords,
  folderSinceWords,
  folderStanding,
  folderTroubleWords,
  folderWaitingWords,
} from "./yourFolder.js";

const at = {
  ok: true as const,
  folder: "/u/Chips/Projects/Sudoku mini",
  shown: "~/Chips/Projects/Sudoku mini",
};

describe("Your folder's card (ADR 0224)", () => {
  it("says where the folder stands", () => {
    expect(folderStanding({ ...at, made: false })).toBe("none");
    expect(folderHeadWords({ ...at, made: true, changed: [] })).toBe("Up to date");
    // The room couldn't be reached, so nobody knows it is up to date.
    expect(folderHeadWords({ ...at, made: true, changed: [], trouble: "timed out" })).toBe(
      "Couldn't check",
    );
    const two = [
      { path: "style.css", added: 6, removed: 2 },
      { path: "index.html", added: 1, removed: 1 },
    ];
    expect(folderHeadWords({ ...at, made: true, changed: two })).toBe("You changed 2 files");
    expect(folderHeadWords({ ...at, made: true, changed: two, clashes: ["style.css"] })).toBe(
      "Not sent yet",
    );
  });

  it("says what Open folder on Mac does, whether a Mac heard it, and where an ask came from (ADR 0225)", () => {
    expect(FOLDER_ON_MAC_WORDS).toBe("Opens the project's folder in Finder on your Mac.");
    expect(folderOnMacWords({ macs: 1 })).toBe("Sent to your Mac. Finder opens the folder there.");
    expect(folderOnMacWords({ macs: 0 })).toBe(
      "Chips for Mac isn't open, so nothing opened. Open Chips on your Mac and press again.",
    );
    // The server opened Chips for Mac first (ADR 0227's second addendum), and it came, or not yet.
    expect(folderOnMacWords({ macs: 1, opened_app: true })).toBe(
      "Chips for Mac wasn't open, so Chips opened it. Finder opens the folder there.",
    );
    expect(folderOnMacWords({ macs: 0, opened_app: true })).toBe(
      "Chips for Mac is starting on your Mac but hasn't connected yet, so nothing opened. Press again in a moment.",
    );
    const now = Date.parse("2026-10-23T22:05:20.000Z");
    expect(folderOpenedFromWords("iPhone", "2026-10-23T22:05:00.000Z", now)).toBe(
      "Opened from your iPhone just now.",
    );
  });

  it("says what Open folder makes, what came in, and what waits", () => {
    expect(folderMakesWords("~/Chips/Projects/Sudoku mini")).toBe(
      "Makes a copy of the project at ~/Chips/Projects/Sudoku mini and opens it in Finder. While you haven't changed anything in it, Chips keeps it up to date.",
    );
    const now = Date.parse("2026-10-23T12:02:00.000Z");
    expect(folderCameWords(["Wynn"], ["src/board.js"], "2026-10-23T12:00:00.000Z", now)).toBe(
      "Wynn's change to src/board.js came in 2 min ago.",
    );
    expect(folderSinceWords(["Wynn"], ["src/game.js"])).toBe(
      "Wynn has changed src/game.js since. It comes into your folder when you send yours. Until then, nothing in your folder changes.",
    );
    expect(folderSinceWords(["Wynn", "Hazel"], ["a", "b", "c", "d"])).toMatch(
      /^Wynn and Hazel have changed 4 files since\./,
    );
  });

  it("says a clash, what waits with it, a key, a send, and trouble", () => {
    expect(folderClashWords("style.css", ["Hazel"])).toEqual({
      title: "style.css clashed with Hazel's change",
      body: "Hazel changed the same lines before yours reached the space. Both are in the file now: keep what you both meant, take the marks out, and send again.",
    });
    expect(folderClashWords("a.txt", []).title).toBe("a.txt clashed with another change");
    expect(folderWaitingWords(["index.html"])).toBe(
      "Your change to index.html is waiting with it. Nothing of yours is lost, and nothing goes to the space until the marks are out.",
    );
    expect(folderKeysWords([{ path: "config.js", what: "an Anthropic key" }])).toBe(
      "config.js looks like it holds an Anthropic key, so nothing was sent. Take it out and send again.",
    );
    expect(folderSentWords(["style.css", "index.html"])).toBe(
      "Your change to style.css and index.html is in the space.",
    );
    expect(folderTroubleWords("Could not resolve host: mini.local")).toBe(
      "Chips couldn't reach the space's project: Could not resolve host: mini.local.",
    );
  });
});
