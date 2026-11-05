/** What search finds without the server, and how it marks it (docs/proposals/search-plan.md §3.2). */

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { Directory } from "./events.js";
import type { Space, WorkspaceModel } from "./model/types.js";
import {
  findAgents,
  findSpaces,
  forgetSearch,
  holdsTerms,
  markedParts,
  nameMarks,
  RECENT_SEARCHES,
  rememberSearch,
  type SearchMark,
  searchIndex,
  searchTerms,
  snippetParts,
  wordMarks,
} from "./search.js";
import { SNIPPET_CLOSE as CLOSE, SNIPPET_OPEN as OPEN } from "./store.js";

const ARJUN = "usr_arjun";
const KIT = "usr_kit";
const DANA = "usr_dana";
const SCOUT = "hrn_scout";
const HARBOR = "hrn_harbor";
const LEAD = "agt_lead";
const TOUR = "agt_tour";
const PRICING = "agt_pricing";
const OLD = "agt_old";
const HELPER = "agt_helper";

const agent = (id: string, name: string, harnessId: string, extra: object = {}) => ({
  id,
  kind: "agent" as const,
  harnessId,
  displayName: name,
  ...extra,
});

const directory: Directory = {
  [ARJUN]: { id: ARJUN, kind: "person", displayName: "Arjun" },
  [KIT]: { id: KIT, kind: "person", displayName: "Kit Marlowe" },
  [DANA]: { id: DANA, kind: "person", displayName: "Dana" },
  [SCOUT]: { id: SCOUT, kind: "harness", displayName: "Scout", ownerId: ARJUN },
  [HARBOR]: { id: HARBOR, kind: "harness", displayName: "Harbor Bridge", ownerId: ARJUN },
  [LEAD]: agent(LEAD, "J", SCOUT, { lead: true, room: "spc_home" }),
  [TOUR]: agent(TOUR, "Chinatown Walking Tour", SCOUT, { room: "spc_tour" }),
  [PRICING]: agent(PRICING, "Bland Pricing", SCOUT, { room: null }),
  [OLD]: agent(OLD, "Chinese Lessons", SCOUT, { archived: true, room: null }),
  [HELPER]: agent(HELPER, "Helper", HARBOR, { room: "spc_build" }),
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

function modelOf(...spaces: Space[]): WorkspaceModel {
  return { spaces, people: {} } as unknown as WorkspaceModel;
}

const at = (hour: number) => `2026-10-06T${String(hour).padStart(2, "0")}:00:00.000Z`;

const model = modelOf(
  space("spc_home", { title: "J", members: [ARJUN, LEAD], lastActivityAt: at(9) }),
  space("spc_tour", {
    title: "Chinatown Walking Tour",
    members: [ARJUN, TOUR],
    lastActivityAt: at(8),
  }),
  space("spc_dinner", { title: "Chinatown dinner", members: [ARJUN, KIT], lastActivityAt: at(10) }),
  space("spc_kit", { members: [ARJUN, KIT], lastActivityAt: at(7) }),
  space("spc_trip", { title: "Santa Barbara trip", members: [ARJUN, KIT], lastActivityAt: at(11) }),
  space("spc_old", { title: "China notes", state: "closed", lastActivityAt: at(12) }),
  space("spc_thread", { title: "Chinatown aside", parentSpaceId: "spc_dinner" }),
  space("spc_glimpse", { title: "Chinatown ask", glimpse: true }),
  space("spc_build", { title: "Build night", members: [ARJUN, DANA, HELPER] }),
);

/** The words of a text a set of marks covers. */
const marked = (text: string, marks: readonly SearchMark[]) =>
  marks.map((mark) => text.slice(mark.start, mark.end));

describe("the words a search looks for", () => {
  it("are lower case, with accents dropped, as the server's tokenizer folds them", () => {
    expect(searchTerms("Café  CRÈME")).toEqual(["cafe", "creme"]);
    expect(searchTerms("Ünïcödé")).toEqual(["unicode"]);
  });

  it("read a handle as one word and a range as two", () => {
    expect(searchTerms("@ChinatownWalkingTour")).toEqual(["chinatownwalkingtour"]);
    expect(searchTerms("6–10")).toEqual(["6", "10"]);
  });

  it("are the first eight terms, as the server's query takes, and nothing for blank", () => {
    expect(searchTerms("a b c d e f g h i j")).toEqual(["a", "b", "c", "d", "e", "f", "g", "h"]);
    expect(searchTerms('  "" ')).toEqual([]);
    expect(searchTerms("")).toEqual([]);
  });

  it("never holds an empty word, whatever is typed", () => {
    fc.assert(
      fc.property(fc.string({ unit: "grapheme", maxLength: 40 }), (text) => {
        for (const term of searchTerms(text)) expect(term).not.toBe("");
      }),
    );
  });
});

describe("the spaces found", () => {
  const titles = (text: string) =>
    findSpaces(searchIndex(model, directory, ARJUN), searchTerms(text)).map((found) => found.title);

  it("are those with every term starting a word of their name, in the list's order", () => {
    expect(titles("chin")).toEqual(["Chinatown dinner", "Chinatown Walking Tour", "China notes"]);
    expect(titles("chin tour")).toEqual(["Chinatown Walking Tour"]);
    expect(titles("tour chin")).toEqual(["Chinatown Walking Tour"]);
    // A term starts a word; it is not found inside one.
    expect(titles("town")).toEqual([]);
  });

  it("find a name with accents from words typed without them, and the other way round", () => {
    const cafe = modelOf(space("spc_cafe", { title: "Café Ünter" }));
    expect(findSpaces(searchIndex(cafe, directory, ARJUN), searchTerms("cafe unter"))).toHaveLength(
      1,
    );
    const plain = modelOf(space("spc_plain", { title: "Cafe" }));
    expect(findSpaces(searchIndex(plain, directory, ARJUN), searchTerms("CAFÉ"))).toHaveLength(1);
  });

  it("mark the part of the name typed", () => {
    const [found] = findSpaces(searchIndex(model, directory, ARJUN), searchTerms("chin d"));
    expect(found?.title).toBe("Chinatown dinner");
    expect(marked(found?.title ?? "", found?.marks ?? [])).toEqual(["Chin", "d"]);
  });

  it("then those with someone in them so named, after every name found", () => {
    const found = findSpaces(searchIndex(model, directory, ARJUN), searchTerms("kit"));
    // "You, Kit Marlowe" is the untitled room's own name; the other two have Kit in them.
    expect(found.map((each) => each.title)).toEqual([
      "You, Kit Marlowe",
      "Santa Barbara trip",
      "Chinatown dinner",
    ]);
    expect(found[0]?.member).toBeUndefined();
    expect(found[1]?.member?.id).toBe(KIT);
    expect(marked(found[1]?.member?.name ?? "", found[1]?.member?.marks ?? [])).toEqual(["Kit"]);
  });

  it("put the closed after the open, and mark them closed", () => {
    const found = findSpaces(searchIndex(model, directory, ARJUN), searchTerms("chin"));
    expect(found.map((each) => each.closed)).toEqual([false, false, true]);
  });

  it("leave out threads and glimpses, which no list shows", () => {
    expect(titles("aside")).toEqual([]);
    expect(titles("ask")).toEqual([]);
  });

  it("are not found by the reader's own name, which every room has in it", () => {
    expect(titles("arjun")).toEqual([]);
  });

  it("are found by an agent in them too", () => {
    expect(titles("helper")).toEqual(["Build night"]);
  });

  it("are none for no terms", () => {
    expect(findSpaces(searchIndex(model, directory, ARJUN), [])).toEqual([]);
  });
});

describe("the agents found", () => {
  const names = (text: string) =>
    findAgents(searchIndex(model, directory, ARJUN), searchTerms(text)).map(
      (found) => found.row.name,
    );

  it("are those with every term starting a word of their name, marked", () => {
    expect(names("chin walk")).toEqual(["Chinatown Walking Tour"]);
    const [found] = findAgents(searchIndex(model, directory, ARJUN), searchTerms("chin walk"));
    expect(marked(found?.row.name ?? "", found?.marks ?? [])).toEqual(["Chin", "Walk"]);
  });

  it("put the archived last", () => {
    expect(names("chin")).toEqual(["Chinatown Walking Tour", "Chinese Lessons"]);
    const found = findAgents(searchIndex(model, directory, ARJUN), searchTerms("chin"));
    expect(found.map((each) => each.row.archived)).toEqual([false, true]);
  });

  it("include its harness's agents for a harness's name, after the agents so named", () => {
    expect(names("scout")).toEqual([
      "J",
      "Bland Pricing",
      "Chinatown Walking Tour",
      "Chinese Lessons",
    ]);
    expect(names("harbor br")).toEqual(["Helper"]);
    const [helper] = findAgents(searchIndex(model, directory, ARJUN), searchTerms("harb"));
    expect(helper?.byHarness).toBe(true);
    expect(helper?.row.line).toBe("Harbor Bridge · in Build night");
    expect(marked(helper?.row.line ?? "", helper?.lineMarks ?? [])).toEqual(["Harb"]);
  });

  it("carry the Agents tab's line under the name", () => {
    const lines = findAgents(searchIndex(model, directory, ARJUN), searchTerms("j bland")).map(
      (found) => found.row.line,
    );
    expect(lines).toEqual([]);
    expect(
      findAgents(searchIndex(model, directory, ARJUN), searchTerms("bland"))[0]?.row.line,
    ).toBe("Free · Scout");
    // A Main agent's line says where it is; its row wears the Main tag (ADR 0145).
    const main = findAgents(searchIndex(model, directory, ARJUN), searchTerms("j"))[0]?.row;
    expect(main?.lead).toBe(true);
    expect(main?.line).toBe("Scout");
  });

  it("leave out an agent whose harness was removed", () => {
    const gone: Directory = {
      ...directory,
      [HARBOR]: { ...directory[HARBOR], removedAt: at(1) } as Directory[string],
    };
    expect(findAgents(searchIndex(model, gone, ARJUN), searchTerms("helper"))).toEqual([]);
  });
});

describe("the index", () => {
  it("takes back what did not change, and folds what did", () => {
    const first = searchIndex(model, directory, ARJUN);
    const spaces = model.spaces.map((each) =>
      each.id === "spc_dinner" ? { ...each, title: "Dim sum" } : each,
    );
    const next = searchIndex(modelOf(...spaces), directory, ARJUN, first);
    const entryOf = (index: typeof first, id: string) =>
      index.spaces.find((entry) => entry.space.id === id);
    // The untouched rooms are the same entries; the renamed one is new, and found by its name.
    expect(entryOf(next, "spc_tour")).toBe(entryOf(first, "spc_tour"));
    expect(entryOf(next, "spc_dinner")).not.toBe(entryOf(first, "spc_dinner"));
    expect(findSpaces(next, searchTerms("dim")).map((found) => found.space.id)).toEqual([
      "spc_dinner",
    ]);
    expect(next.names.get(KIT)).toBe(first.names.get(KIT));
  });

  it("folds everything again for a new directory, and finds the new names", () => {
    const first = searchIndex(model, directory, ARJUN);
    const renamed: Directory = {
      ...directory,
      [KIT]: { id: KIT, kind: "person", displayName: "Christopher" },
    };
    const next = searchIndex(model, renamed, ARJUN, first);
    expect(next.spaces[0]).not.toBe(first.spaces[0]);
    expect(findSpaces(next, searchTerms("kit"))).toEqual([]);
    expect(findSpaces(next, searchTerms("christ")).map((found) => found.title)).toEqual([
      "You, Christopher",
      "Santa Barbara trip",
      "Chinatown dinner",
    ]);
  });

  it("finds what a fresh index finds, whatever was taken back", () => {
    fc.assert(
      fc.property(
        fc.subarray(model.spaces as Space[]),
        fc.constantFrom("chin", "kit", "t", "scout", "harb", "b"),
        (some, typed) => {
          const before = searchIndex(model, directory, ARJUN);
          const after = modelOf(...some);
          const terms = searchTerms(typed);
          const taken = searchIndex(after, directory, ARJUN, before);
          const fresh = searchIndex(after, directory, ARJUN);
          expect(findSpaces(taken, terms)).toEqual(findSpaces(fresh, terms));
          expect(findAgents(taken, terms)).toEqual(findAgents(fresh, terms));
        },
      ),
    );
  });
});

describe("the marks in a name", () => {
  it("cover what each word was typed as, the longest where two terms start it", () => {
    expect(
      marked("Chinatown Walking Tour", nameMarks("Chinatown Walking Tour", ["chin", "t"])),
    ).toEqual(["Chin", "T"]);
    expect(marked("Chinatown", nameMarks("Chinatown", ["c", "chin"]))).toEqual(["Chin"]);
  });

  it("keep an accent on the letter marked, however it is written", () => {
    const composed = "Café";
    expect(marked(composed, nameMarks(composed, ["cafe"]))).toEqual(["Café"]);
    const decomposed = "Café noir";
    expect(marked(decomposed, nameMarks(decomposed, ["cafe"]))).toEqual(["Café"]);
  });

  it("are inside the text and in order, whatever the name and the terms", () => {
    fc.assert(
      fc.property(
        fc.string({ unit: "grapheme", maxLength: 30 }),
        fc.string({ unit: "grapheme", maxLength: 10 }),
        (text, typed) => {
          const marks = nameMarks(text, searchTerms(typed));
          let from = 0;
          for (const mark of marks) {
            expect(mark.start).toBeGreaterThanOrEqual(from);
            expect(mark.end).toBeGreaterThan(mark.start);
            expect(mark.end).toBeLessThanOrEqual(text.length);
            from = mark.end;
          }
        },
      ),
    );
  });
});

describe("the marks in a message", () => {
  const text = "Chinatown tour at 6–10, then the Chin Tea House";

  it("are whole words: the last term as a prefix, the ones before it exactly", () => {
    expect(marked(text, wordMarks(text, ["chin"]))).toEqual(["Chinatown", "Chin"]);
    // "chin" before the last term is a word of its own: Chinatown isn't it.
    expect(marked(text, wordMarks(text, ["chin", "t"]))).toEqual([
      "tour",
      "then",
      "the",
      "Chin",
      "Tea",
    ]);
    expect(marked(text, wordMarks(text, ["6", "10"]))).toEqual(["6", "10"]);
  });

  it("follow case and accents as the names do", () => {
    expect(marked("CAFÉ au lait", wordMarks("CAFÉ au lait", ["cafe"]))).toEqual(["CAFÉ"]);
  });

  it("are a handle whole", () => {
    const said = "ask @ChinatownWalkingTour now";
    expect(marked(said, wordMarks(said, searchTerms("@chinatown")))).toEqual([
      "ChinatownWalkingTour",
    ]);
  });

  it("are none for no terms", () => {
    expect(wordMarks(text, [])).toEqual([]);
  });

  it("agree with what is typed: every word marked is found by the terms", () => {
    fc.assert(
      fc.property(fc.array(fc.stringMatching(/^[a-zé]{1,6}$/u), { maxLength: 6 }), (words) => {
        const said = words.join(" ");
        const terms = searchTerms(words.slice(0, 2).join(" "));
        for (const word of marked(said, wordMarks(said, terms))) {
          const folded = searchTerms(word)[0] ?? "";
          const last = terms.at(-1) ?? "";
          expect(terms.slice(0, -1).includes(folded) || folded.startsWith(last)).toBe(true);
        }
      }),
    );
  });
});

describe("whether a message holds what was searched for", () => {
  const said = "Booked. Want Theo's card sent to the family?";

  it("takes the last word as the start of one, never the inside of one", () => {
    expect(holdsTerms(said, searchTerms("fam"))).toBe(true);
    expect(holdsTerms(said, searchTerms("mi"))).toBe(false);
    expect(holdsTerms("Milo booked it", searchTerms("mi"))).toBe(true);
  });

  it("takes the earlier words whole, folded", () => {
    expect(holdsTerms(said, searchTerms("CARD fam"))).toBe(true);
    expect(holdsTerms(said, searchTerms("car fam"))).toBe(false);
    expect(holdsTerms("Café au lait", searchTerms("cafe la"))).toBe(true);
  });

  it("holds nothing for no terms", () => {
    expect(holdsTerms(said, [])).toBe(false);
  });

  it("holds whatever it marks", () => {
    fc.assert(
      fc.property(fc.array(fc.stringMatching(/^[a-zé]{1,6}$/u), { maxLength: 6 }), (words) => {
        const text = words.join(" ");
        const terms = searchTerms(words.slice(0, 2).join(" "));
        if (holdsTerms(text, terms)) expect(wordMarks(text, terms).length).toBeGreaterThan(0);
      }),
    );
  });
});

describe("a text cut at its marks", () => {
  it("is the text again, joined", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 30 }), fc.string({ maxLength: 8 }), (text, typed) => {
        const parts = markedParts(text, wordMarks(text, searchTerms(typed)));
        expect(parts.map((part) => part.text).join("")).toBe(text);
        for (const part of parts) expect(part.text).not.toBe("");
      }),
    );
  });

  it("marks what was marked", () => {
    expect(markedParts("Chinatown dinner", nameMarks("Chinatown dinner", ["chin"]))).toEqual([
      { text: "Chin", marked: true },
      { text: "atown dinner", marked: false },
    ]);
  });
});

describe("a server snippet cut at its marks", () => {
  it("is one plain piece with no marks", () => {
    expect(snippetParts("…the tour starts at six…")).toEqual([
      { text: "…the tour starts at six…", marked: false },
    ]);
  });

  it("marks what is between the marks", () => {
    expect(snippetParts(`…the ${OPEN}tour${CLOSE} starts…`)).toEqual([
      { text: "…the ", marked: false },
      { text: "tour", marked: true },
      { text: " starts…", marked: false },
    ]);
  });

  it("keeps a space between two marks, and joins two side by side", () => {
    expect(snippetParts(`${OPEN}chin${CLOSE} ${OPEN}tour${CLOSE}`)).toEqual([
      { text: "chin", marked: true },
      { text: " ", marked: false },
      { text: "tour", marked: true },
    ]);
    expect(snippetParts(`${OPEN}chin${CLOSE}${OPEN}atown${CLOSE}!`)).toEqual([
      { text: "chinatown", marked: true },
      { text: "!", marked: false },
    ]);
  });

  it("marks a word at either end", () => {
    expect(snippetParts(`${OPEN}Tour${CLOSE} at six, then ${OPEN}dinner${CLOSE}`)).toEqual([
      { text: "Tour", marked: true },
      { text: " at six, then ", marked: false },
      { text: "dinner", marked: true },
    ]);
  });

  it("runs a mark the server left open to the end, and is nothing for nothing", () => {
    expect(snippetParts(`the ${OPEN}tour`)).toEqual([
      { text: "the ", marked: false },
      { text: "tour", marked: true },
    ]);
    expect(snippetParts("")).toEqual([]);
  });

  it("loses none of the words, whatever the snippet", () => {
    fc.assert(
      fc.property(
        fc.array(fc.oneof(fc.string({ maxLength: 6 }), fc.constantFrom(OPEN, CLOSE))),
        (pieces) => {
          const snippet = pieces.join("");
          const words = snippet.replaceAll(OPEN, "").replaceAll(CLOSE, "");
          expect(
            snippetParts(snippet)
              .map((part) => part.text)
              .join(""),
          ).toBe(words);
        },
      ),
    );
  });
});

describe("recent searches", () => {
  it("put the newest first, trimmed", () => {
    expect(rememberSearch(["dinner"], "  chin   tour ")).toEqual(["chin tour", "dinner"]);
  });

  it("keep the same words once, newest spelling, whatever their case or accents", () => {
    expect(rememberSearch(["Chin", "dinner", "cafe"], "chin")).toEqual(["chin", "dinner", "cafe"]);
    expect(rememberSearch(["dinner", "cafe"], "Café")).toEqual(["Café", "dinner"]);
  });

  it("keep at most eight", () => {
    const many = Array.from({ length: 12 }, (_, index) => `search ${index}`);
    const list = many.reduce<readonly string[]>(rememberSearch, []);
    expect(list).toHaveLength(RECENT_SEARCHES);
    expect(list[0]).toBe("search 11");
  });

  it("ignore a blank search", () => {
    const list = ["dinner"];
    expect(rememberSearch(list, "   ")).toBe(list);
  });

  it("forget one, whatever its case", () => {
    expect(forgetSearch(["chin", "dinner"], "CHIN")).toEqual(["dinner"]);
  });
});
