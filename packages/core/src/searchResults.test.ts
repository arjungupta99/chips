/** What a Search page lists in each state, and what its rows say (ADR 0132), before anything draws them. */

import { describe, expect, it } from "vitest";
import type { Directory } from "./events.js";
import type { MessageResults } from "./messageSearch.js";
import type { Line, Space, WorkspaceModel } from "./model/types.js";
import { findSpaces, searchIndex, searchTerms } from "./search.js";
import {
  closesRun,
  hitAuthor,
  hitPlace,
  hitWords,
  type SearchFound,
  searchItems,
  spaceFoundLine,
} from "./searchResults.js";
import type { SearchHit } from "./store.js";

const ARJUN = "usr_arjun";
const KIT = "usr_kit";
const DANA = "usr_dana";
const ADA = "usr_ada";
const SCOUT = "hrn_scout";

const directory: Directory = {
  [ARJUN]: { id: ARJUN, kind: "person", displayName: "Arjun" },
  [KIT]: { id: KIT, kind: "person", displayName: "Kit Marlowe" },
  [DANA]: { id: DANA, kind: "person", displayName: "Dana" },
  [ADA]: { id: ADA, kind: "person", displayName: "Ada" },
  [SCOUT]: { id: SCOUT, kind: "harness", displayName: "Scout", ownerId: ARJUN },
};

function space(id: string, over: Partial<Space> = {}): Space {
  return {
    id,
    kind: "room",
    members: [ARJUN],
    roles: {},
    state: "open",
    lastEventSeq: 1,
    lines: [],
    runs: [],
    sessions: [],
    pins: [],
    glimpse: false,
    ...over,
  };
}

const model = {
  spaces: [
    space("sp_1", { title: "Chinatown dinner", members: [ARJUN, KIT] }),
    space("sp_thread", { title: "Aside", parentSpaceId: "sp_1" }),
    space("sp_many", { title: "Build night", members: [ARJUN, KIT, DANA, ADA] }),
    space("sp_kit", { members: [ARJUN, KIT] }),
  ],
} as unknown as WorkspaceModel;

const hit: SearchHit = {
  kind: "message",
  spaceId: "sp_1",
  at: "2026-10-06T10:00:00.000Z",
  snippet: "x",
  lineId: "ln_1",
  authorId: KIT,
};

const done = (hits: readonly SearchHit[]): MessageResults => ({
  text: "chin",
  hits,
  status: "done",
  answered: true,
  more: false,
  fetchingMore: false,
});

const found = (over: Partial<SearchFound> = {}): SearchFound => ({
  text: "chin",
  typed: true,
  scope: "all",
  spaces: [],
  agents: [],
  messages: done([hit]),
  online: true,
  model,
  recent: [],
  ...over,
});

const kinds = (each: SearchFound) => searchItems(each).map((item) => item.kind);

describe("what a Search page lists", () => {
  it("is the recent searches with nothing typed, or a line on what it finds", () => {
    expect(kinds(found({ typed: false, recent: ["chin", "tour"] }))).toEqual([
      "recents",
      "recent",
      "recent",
    ]);
    expect(kinds(found({ typed: false }))).toEqual(["hint"]);
  });

  it("shows three spaces in All and then See all, and every one under the chip", () => {
    const index = searchIndex(
      {
        spaces: ["a", "b", "c", "d"].map((id) => space(`sp_${id}`, { title: `Chin ${id}` })),
      } as unknown as WorkspaceModel,
      directory,
      ARJUN,
    );
    const spaces = findSpaces(index, searchTerms("chin"));
    expect(kinds(found({ spaces, messages: done([]) }))).toEqual([
      "heading",
      "space",
      "space",
      "space",
      "seeAll",
    ]);
    expect(kinds(found({ spaces, scope: "spaces" }))).toEqual([
      "heading",
      "space",
      "space",
      "space",
      "space",
    ]);
  });

  it("holds two places for messages only until an answer has come", () => {
    const waiting = { ...done([]), status: "waiting" as const, answered: false };
    expect(kinds(found({ messages: waiting }))).toEqual(["heading", "placeholder", "placeholder"]);
    const kept = { ...done([hit]), status: "waiting" as const };
    expect(kinds(found({ messages: kept }))).toEqual(["heading", "message"]);
  });

  it("leaves Messages out of All when the server found none, and says so under the chip", () => {
    expect(kinds(found({ messages: done([]) }))).toEqual(["nothing"]);
    expect(kinds(found({ scope: "messages", messages: done([]) }))).toEqual(["nothing"]);
  });

  it("leaves out a hit in a room this client no longer has", () => {
    expect(kinds(found({ messages: done([{ ...hit, spaceId: "sp_gone" }]) }))).toEqual(["nothing"]);
  });

  it("says messages want two letters under the chip, and nothing of it in All", () => {
    const idle = { ...done([]), status: "idle" as const, answered: false };
    expect(kinds(found({ scope: "messages", messages: idle }))).toEqual(["fewLetters"]);
    expect(kinds(found({ messages: idle }))).toEqual(["nothing"]);
  });

  it("says why there are no messages when the server can't be reached, or the ask failed", () => {
    expect(kinds(found({ online: false }))).toEqual(["heading", "offline"]);
    expect(kinds(found({ messages: { ...done([]), status: "failed" } }))).toEqual([
      "heading",
      "failed",
    ]);
  });

  it("shows the next page coming at the foot", () => {
    expect(kinds(found({ messages: { ...done([hit]), fetchingMore: true } }))).toEqual([
      "heading",
      "message",
      "fetching",
    ]);
  });
});

describe("what a result row says", () => {
  const index = searchIndex(model, directory, ARJUN);
  const text = (parts: readonly { readonly text: string }[]) =>
    parts.map((part) => part.text).join("");
  const marks = (parts: readonly { readonly text: string; readonly marked: boolean }[]) =>
    parts.filter((part) => part.marked).map((part) => part.text);

  it("names who a titled room is with, two by name, and when it spoke", () => {
    const [dinner] = findSpaces(index, searchTerms("chinatown"));
    expect(text(spaceFoundLine(dinner as never, directory, ARJUN, "8:02 PM"))).toBe(
      "With Kit Marlowe · 8:02 PM",
    );
    const [build] = findSpaces(index, searchTerms("build"));
    expect(text(spaceFoundLine(build as never, directory, ARJUN, ""))).toBe(
      "With Kit Marlowe, Dana and 1 more",
    );
  });

  it("marks the member a room was found by, and says only when for a room named after them", () => {
    const byKit = findSpaces(index, searchTerms("mar")).find((each) => each.member !== undefined);
    const line = spaceFoundLine(byKit as never, directory, ARJUN, "Mon");
    expect(text(line)).toBe("With Kit Marlowe · Mon");
    expect(marks(line)).toEqual(["Mar"]);
    const [kitRoom] = findSpaces(index, searchTerms("kit")).filter(
      (each) => each.space.id === "sp_kit",
    );
    expect(text(spaceFoundLine(kitRoom as never, directory, ARJUN, "Mon"))).toBe("Mon");
  });

  it("says You for the reader, the run's agent for a step, and Someone for neither", () => {
    const room = model.spaces[0] as Space;
    expect(hitAuthor(hit, room, directory, ARJUN)).toEqual({
      name: "Kit Marlowe",
      face: "Kit Marlowe",
      kind: "person",
    });
    expect(hitAuthor({ ...hit, authorId: ARJUN }, room, directory, ARJUN).name).toBe("You");
    const ran = { ...room, runs: [{ runId: "run_1", harnessId: SCOUT }] } as unknown as Space;
    const step: SearchHit = { ...hit, kind: "receipt", runId: "run_1", authorId: undefined };
    expect(hitAuthor(step, ran, directory, ARJUN)).toMatchObject({
      name: "Scout",
      kind: "harness",
    });
    expect(hitAuthor({ ...hit, authorId: undefined }, room, directory, ARJUN).name).toBe("Someone");
  });

  it("says where: the room, or the room a thread hangs off", () => {
    const [room, thread] = model.spaces as Space[];
    expect(hitPlace(room as Space, model, directory, ARJUN)).toBe("Chinatown dinner");
    expect(hitPlace(thread as Space, model, directory, ARJUN)).toBe("Chinatown dinner · thread");
  });
});

describe("where a hit lands", () => {
  it("takes the words searched for to a message, to be marked there (ADR 0133)", () => {
    expect(hitWords(hit, " garage door ")).toBe("garage door");
    expect(hitWords(hit, "  ")).toBeUndefined();
  });

  it("takes none to a voice note, whose words were heard, or to a step's run", () => {
    expect(hitWords({ ...hit, snippetFrom: "transcript" }, "garage")).toBeUndefined();
    expect(hitWords({ ...hit, kind: "receipt", runId: "run_1" }, "garage")).toBeUndefined();
  });

  it("is a step's run by the line that closed it", () => {
    const line = (kind: Line["kind"], runId?: string) => ({ id: "l", kind, runId }) as Line;
    expect(closesRun(line("summary", "run_1"), "run_1")).toBe(true);
    expect(closesRun(line("status", "run_1"), "run_1")).toBe(true);
    expect(closesRun(line("text", "run_1"), "run_1")).toBe(false);
    expect(closesRun(line("summary", "run_2"), "run_1")).toBe(false);
  });
});
