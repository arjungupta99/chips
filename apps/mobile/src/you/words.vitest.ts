/** What You says at the right of each row, and under each device (ADR 0085). */

import type { Directory, WorkspaceModel } from "@chipschat/core";
import { describe, expect, it } from "vitest";
import {
  agentsWords,
  capsWords,
  clockWords,
  guestStandingWords,
  hostOf,
  keptWords,
  pickedAsk,
  pickedWords,
  quietSub,
  quietWords,
  sectionAsk,
  seenWords,
  sizeWords,
  spaceMediaAsk,
  spaceMediaWords,
  standingWords,
} from "./words";

const NOW = Date.parse("2026-09-29T12:00:00.000Z");
const ago = (ms: number) => new Date(NOW - ms).toISOString();
const MIN = 60_000;
const DAY = 24 * 60 * MIN;

describe("seenWords", () => {
  it.each([
    [30_000, "Now"],
    [5 * MIN, "5 min ago"],
    [2.5 * 60 * MIN, "2 h ago"],
    [1.2 * DAY, "Yesterday"],
    [3 * DAY, "3 days ago"],
    [36 * DAY, "5 weeks ago"],
  ])("%d ms ago is %s", (ms, words) => {
    expect(seenWords(ago(ms), NOW)).toBe(words);
  });

  it("says nothing for a date it cannot read", () => {
    expect(seenWords("not a date", NOW)).toBe("");
  });
});

describe("the rows' values", () => {
  it("names the role and the workspace, or only the workspace while joining", () => {
    expect(standingWords("owner", "Demo")).toBe("Owner · Demo");
    expect(standingWords(undefined, "Demo")).toBe("Demo");
  });

  it("names a guest's one space and who let them in, and nothing before they have one", () => {
    const model = {
      spaces: [
        { id: "spc_old", title: "Old trip", state: "archived", members: ["usr_gus"] },
        { id: "spc_japan", title: "Japan trip", state: "open", members: ["usr_arjun", "usr_gus"] },
      ],
      people: { usr_gus: { participantId: "usr_gus", role: "guest", invitedBy: "usr_arjun" } },
    } as unknown as WorkspaceModel;
    const directory: Directory = {
      usr_arjun: { id: "usr_arjun", kind: "person", displayName: "Arjun" },
    };
    expect(guestStandingWords(model, directory, "usr_gus")).toBe(
      "Guest in Japan trip · invited by Arjun",
    );
    expect(guestStandingWords({ ...model, spaces: [] }, directory, "usr_gus")).toBeUndefined();
  });

  it("says quiet hours as their window, or Off", () => {
    expect(quietWords(undefined)).toBe("Off");
    expect(quietWords({ from: "22:00", to: "07:00", breakthrough: "decide" })).toBe(
      `${clockWords("22:00")}–${clockWords("07:00")}`,
    );
    // Said as the phone says times: twelve-hour or twenty-four, whichever it keeps.
    expect(clockWords("22:00")).toMatch(/^(10:00\s?PM|22:00)$/);
    expect(clockWords("07:05")).toMatch(/^(7:05\s?AM|0?7:05)$/);
  });

  it("says what is turned down among the agents, by name when it is one", () => {
    const agents = [
      { id: "a", name: "Kit" },
      { id: "b", name: "Lux" },
      { id: "c", name: "Scout" },
    ];
    expect(agentsWords(agents, {})).toBe("Everything");
    expect(agentsWords(agents, { a: "all" })).toBe("Everything");
    expect(agentsWords(agents, { b: "none" })).toBe("Lux muted");
    expect(agentsWords(agents, { b: "none", c: "none", a: "decide" })).toBe(
      "2 muted, Kit decisions only",
    );
  });

  it("says under Quiet hours what gets through them", () => {
    expect(quietSub(undefined)).toBe("Notifications can come at any hour");
    expect(quietSub({ from: "22:00", to: "07:00", breakthrough: "decide" })).toBe(
      "Only decisions get through",
    );
    expect(quietSub({ from: "22:00", to: "07:00", breakthrough: "none" })).toBe(
      "Nothing gets through, not even decisions",
    );
  });

  it("says a size in the unit a person reads it in", () => {
    expect(sizeWords(0)).toBe("0 KB");
    expect(sizeWords(840 * 1024)).toBe("840 KB");
    expect(sizeWords(212 * 1024 * 1024)).toBe("212 MB");
    expect(sizeWords(1.4 * 1024 * 1024 * 1024)).toBe("1.4 GB");
  });

  it("says how much Media on this phone keeps, and from how many spaces (ADR 0159)", () => {
    expect(keptWords(28, 5)).toBe("28 files from 5 spaces");
    expect(keptWords(1, 1)).toBe("1 file from 1 space");
    expect(keptWords(3, 0)).toBe("3 files");
    expect(pickedWords(3, 18 * 1024 * 1024)).toBe("3 selected · 18 MB");
  });

  it("says what a space's own Media has on this phone, and what its Delete does (ADR 0165)", () => {
    expect(spaceMediaWords(34)).toBe("On this phone · 34 photos, videos and files");
    expect(spaceMediaWords(1)).toBe("On this phone · 1 file");
    expect(spaceMediaAsk("Pomodoro Timer", 12 * 1024 * 1024)).toEqual({
      title: "Delete 12 MB from this phone?",
      message:
        "Pomodoro Timer's photos, videos and files stay in the space. They come back the next time they're opened.",
    });
  });

  it("asks before a space's files, or Other's, go, and says they only leave this phone", () => {
    const MB = 1024 * 1024;
    expect(sectionAsk("Pomodoro Timer", 7, 96 * MB)).toEqual({
      title: "Delete 96 MB from this phone?",
      message:
        "Pomodoro Timer's 7 photos, videos and files stay in the space. They come back the next time they're opened.",
    });
    expect(sectionAsk("Chess Game", 1, 2 * MB).message).toBe(
      "Chess Game's file stays in the space. It comes back the next time it's opened.",
    );
    expect(sectionAsk(undefined, 4, 9 * MB).message).toBe(
      "These 4 files aren't in a space on this phone. They come back from the server if they're opened again.",
    );
  });

  it("asks before picked files go, naming the one space they stay in", () => {
    expect(pickedAsk(3, ["Pomodoro Timer"])).toEqual({
      title: "Delete 3 files from this phone?",
      message: "They stay in Pomodoro Timer and come back the next time they're opened.",
    });
    expect(pickedAsk(1, ["Chess Game"]).message).toBe(
      "It stays in Chess Game and comes back the next time it's opened.",
    );
    expect(pickedAsk(4, ["Pomodoro Timer", "Chess Game"]).message).toBe(
      "They stay in their spaces and come back the next time they're opened.",
    );
    expect(pickedAsk(2, [])).toEqual({
      title: "Delete 2 files from this phone?",
      message: "They come back from the server if they're opened again.",
    });
  });

  it("says attachment limits as one size, or the range they run over", () => {
    const MB = 1024 * 1024;
    const none = { image: null, video: null, file: null };
    expect(capsWords(none, undefined)).toBe("Server's limit");
    expect(capsWords(none, 100 * MB)).toBe("100 MB");
    expect(capsWords({ ...none, image: 25 * MB }, 100 * MB)).toBe("25–100 MB");
    expect(capsWords({ image: 25 * MB, video: 25 * MB, file: 25 * MB }, undefined)).toBe("25 MB");
  });

  it("names a server by its host", () => {
    expect(hostOf("https://adas-mac-mini.tail2f9c1e.ts.net")).toBe(
      "adas-mac-mini.tail2f9c1e.ts.net",
    );
    expect(hostOf("http://mini.local:4431")).toBe("mini.local:4431");
    expect(hostOf(undefined)).toBe("This network");
  });
});
