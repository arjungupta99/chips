/**
 * The Search page on the Mac and the web (ADR 0132's addendum): spaces and agents found here by
 * name, messages asked of the server, the chips, the recent searches, and where each result
 * opens. What is listed is core's (`searchResults.test.ts`); this is how the page draws it and
 * what a press does.
 */

import type { Directory, SearchHit, SearchInput, SearchPage, Space, Store } from "@chipschat/core";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RECENT_KEY, resetRecentSearches } from "./recentSearches.ts";
import { Search, type SearchProps, type SearchSession, useSearchSession } from "./Search.tsx";

const ARJUN = "usr_arjun";
const KIT = "usr_kit";
const SCOUT = "hrn_scout";
const TOUR = "agt_tour";
const HELPER = "agt_helper";

const directory: Directory = {
  [ARJUN]: { id: ARJUN, kind: "person", displayName: "Arjun" },
  [KIT]: { id: KIT, kind: "person", displayName: "Kit Marlowe" },
  [SCOUT]: { id: SCOUT, kind: "harness", displayName: "Scout", ownerId: ARJUN },
  [TOUR]: {
    id: TOUR,
    kind: "agent",
    harnessId: SCOUT,
    displayName: "Chinatown Walking Tour",
    room: "spc_tour",
  },
  [HELPER]: { id: HELPER, kind: "agent", harnessId: SCOUT, displayName: "Helper", room: null },
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
    space("spc_dinner", { title: "Chinatown dinner", members: [ARJUN, KIT] }),
    space("spc_tour", { title: "Chinatown Walking Tour", members: [ARJUN, TOUR] }),
    space("spc_lunch", { title: "Chinatown lunch" }),
    space("spc_tea", { title: "Chinatown tea" }),
    space("spc_trip", { title: "Santa Barbara trip", members: [ARJUN, KIT] }),
  ],
  harnesses: {},
  needsYou: [],
  people: {},
} as unknown as SearchProps["model"];

const hit: SearchHit = {
  kind: "message",
  spaceId: "spc_dinner",
  at: "2026-10-06T10:00:00.000Z",
  snippet: "Dim sum in \u{E000}Chinatown\u{E001} at noon",
  lineId: "ln_1",
  authorId: KIT,
};

/** A server whose answers a test hands out one at a time. */
function server() {
  const asked: SearchInput[] = [];
  const answers: ((page: SearchPage) => void)[] = [];
  const failures: ((error: Error) => void)[] = [];
  const search = (input: SearchInput) =>
    new Promise<SearchPage>((resolve, reject) => {
      asked.push(input);
      answers.push(resolve);
      failures.push(reject);
    });
  const answer = async (page: SearchPage) => {
    await act(async () => answers.shift()?.(page));
    failures.shift();
  };
  const fail = async () => {
    await act(async () => failures.shift()?.(new Error("no")));
    answers.shift();
  };
  return { asked, search, answer, fail };
}

interface Drawn {
  readonly props: SearchProps;
  readonly session: SearchSession;
  readonly rerender: (over?: Partial<SearchProps>) => void;
  readonly unmount: () => void;
}

/** The page as the shell draws it, its session the shell's: kept across a remount. */
function draw(search: Store["search"], over: Partial<SearchProps> = {}): Drawn {
  let session: SearchSession | undefined;
  const store = { search } as Store;
  function Host(props: Omit<SearchProps, "session"> & { readonly shown: boolean }) {
    session = useSearchSession(store);
    return props.shown ? <Search {...props} session={session} /> : null;
  }
  const props: Omit<SearchProps, "session"> = {
    model,
    directory,
    selfId: ARJUN,
    online: true,
    spaceIcons: new Map(),
    onOpenSpace: vi.fn(),
    onOpenAgent: vi.fn(),
    onOpenHit: vi.fn(),
    onWake: vi.fn(),
    ...over,
  };
  const view = render(<Host {...props} shown />);
  return {
    props: { ...props, session: session as SearchSession },
    session: session as SearchSession,
    rerender: (more = {}) => view.rerender(<Host {...props} {...more} shown />),
    unmount: () => view.rerender(<Host {...props} shown={false} />),
  };
}

const field = () => screen.getByLabelText("Search spaces, agents and messages");
const type = (text: string) => fireEvent.change(field(), { target: { value: text } });
const marks = (element: HTMLElement) =>
  [...element.querySelectorAll("mark")].map((each) => each.textContent);

beforeEach(() => {
  vi.useFakeTimers();
  resetRecentSearches();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("the Search page", () => {
  it("says what it looks at with nothing typed, and takes the field at once", () => {
    draw(server().search);
    expect(screen.getByText("Spaces, agents, and anything said in them.")).toBeTruthy();
    expect(document.activeElement).toBe(field());
    expect(screen.queryByTestId("scope-chips")).toBeNull();
  });

  it("rolls what it finds after Find, out of a screen reader's way (ADR 0137)", () => {
    draw(server().search);
    const line = document.querySelector(".search-hint-line");
    expect(line?.getAttribute("aria-hidden")).toBe("true");
    const words = [...(line?.querySelectorAll(".search-roll span span") ?? [])];
    expect(words.map((word) => word.textContent)).toEqual([
      "spaces",
      "agents",
      "anything said",
      "spaces",
    ]);
  });

  it("drifts the faces of your spaces behind the empty page, round and round to eighteen", () => {
    draw(server().search);
    const backdrop = screen.getByTestId("search-backdrop");
    // Seen, never read out: the rows over it say everything there is.
    expect(backdrop.getAttribute("aria-hidden")).toBe("true");
    const faces = within(backdrop).getAllByTestId("backdrop-face");
    expect(faces).toHaveLength(18);
    // Each place's own pace and start, from core's table.
    expect(faces[0]?.style.getPropertyValue("--climb")).toBe("40000ms");
    expect(faces[0]?.style.getPropertyValue("--start")).toBe("0.35");
  });

  it("fades the backdrop away once something is typed, and brings it back when the field is empty", () => {
    draw(server().search);
    const faces = screen.getAllByTestId("backdrop-face").length;
    type("chin");
    // The same backdrop, the same faces, fading as the results come (ADR 0189).
    const leaving = screen.getByTestId("search-backdrop");
    expect(leaving.hasAttribute("data-leaving")).toBe(true);
    expect(within(leaving).getAllByTestId("backdrop-face")).toHaveLength(faces);
    act(() => vi.advanceTimersByTime(199));
    expect(screen.getByTestId("search-backdrop")).toBe(leaving);
    act(() => vi.advanceTimersByTime(1));
    expect(screen.queryByTestId("search-backdrop")).toBeNull();
    type("");
    expect(screen.getByTestId("search-backdrop").hasAttribute("data-leaving")).toBe(false);
  });

  it("keys each row for the motion, and grounds the rows only once something is typed", () => {
    draw(server().search);
    const list = screen.getByTestId("search-results");
    expect(list.hasAttribute("data-typed")).toBe(false);
    type("chin");
    expect(list.hasAttribute("data-typed")).toBe(true);
    const keys = [...list.querySelectorAll<HTMLElement>(":scope > li")].map(
      (row) => row.dataset["key"],
    );
    expect(keys[0]).toBe("heading:spaces");
    expect(keys.every((key) => key !== undefined && key.length > 0)).toBe(true);
  });

  it("drifts your agents too, with their pins, each face in a glow (ADR 0138)", () => {
    draw(server().search);
    const backdrop = screen.getByTestId("search-backdrop");
    const agents = backdrop.querySelectorAll('[data-kind="agent"]');
    expect(agents.length).toBeGreaterThan(0);
    for (const agent of agents)
      expect(agent.querySelector('[data-testid="agent-pins"]')).not.toBeNull();
    const glows = backdrop.querySelectorAll<HTMLElement>(".search-glow");
    expect(glows).toHaveLength(18);
    // Every face over its own silhouette, in the page's colour, so the farther never shows through.
    expect(backdrop.querySelectorAll(".search-drift-silhouette")).toHaveLength(18);
    expect(backdrop.querySelector("filter#search-silhouette")).not.toBeNull();
  });

  it("has no backdrop with neither an open space nor an agent to take faces from", () => {
    const closed = space("spc_old", { title: "Old trip", state: "closed" });
    const people = Object.fromEntries(
      Object.entries(directory).filter(([, each]) => each.kind !== "agent"),
    );
    draw(server().search, { model: { ...model, spaces: [closed] }, directory: people });
    expect(screen.queryByTestId("search-backdrop")).toBeNull();
  });

  it("finds spaces and agents by name on the first letters, with the part typed marked", () => {
    draw(server().search);
    type("chin");
    const tour = screen.getByTestId(`result-agent-${TOUR}`);
    expect(marks(tour)).toEqual(["Chin"]);
    const dinner = screen.getByTestId("result-space-spc_dinner");
    expect(marks(dinner)).toEqual(["Chin"]);
    expect(dinner.textContent).toContain("With Kit Marlowe");
    // The chips, All chosen.
    const chips = screen.getByTestId("scope-chips");
    expect(within(chips).getByRole("tab", { name: "All" }).getAttribute("aria-selected")).toBe(
      "true",
    );
  });

  it("shows three spaces in All, then all of them under the chip See all chooses", () => {
    draw(server().search);
    type("chinatown");
    expect(screen.getAllByTestId(/^result-space-/)).toHaveLength(3);
    fireEvent.click(screen.getByTestId("see-all-spaces"));
    expect(screen.getAllByTestId(/^result-space-/)).toHaveLength(4);
    expect(screen.queryByTestId(`result-agent-${TOUR}`)).toBeNull();
    expect(screen.getByRole("tab", { name: "Spaces" }).getAttribute("aria-selected")).toBe("true");
  });

  it("finds a space by who is in it, the name marked in the line under it", () => {
    draw(server().search);
    type("marl");
    const trip = screen.getByTestId("result-space-spc_trip");
    expect(trip.textContent).toContain("With Kit Marlowe");
    expect(marks(trip)).toEqual(["Marl"]);
  });

  it("asks the server for messages after a pause, holding two places the first time", async () => {
    const { asked, search, answer } = server();
    draw(search);
    type("chinatown");
    expect(asked).toEqual([]);
    expect(screen.getAllByLabelText("Searching messages")).toHaveLength(2);
    act(() => vi.advanceTimersByTime(200));
    expect(asked).toEqual([{ text: "chinatown", limit: 20 }]);
    await answer({ hits: [hit], nextCursor: null });
    const row = screen.getByTestId("search-hit");
    expect(row.textContent).toContain("Kit Marlowe in Chinatown dinner");
    expect(marks(row)).toEqual(["Chinatown"]);
    expect(screen.queryByLabelText("Searching messages")).toBeNull();
  });

  it("opens each result where it lives, and remembers the search", async () => {
    const { search, answer } = server();
    const { props } = draw(search);
    type("chinatown");
    fireEvent.click(screen.getByTestId("result-space-spc_dinner"));
    expect(props.onOpenSpace).toHaveBeenCalledWith("spc_dinner");
    fireEvent.click(screen.getByTestId(`result-agent-${TOUR}`));
    expect(props.onOpenAgent).toHaveBeenCalledWith(TOUR);
    act(() => vi.advanceTimersByTime(200));
    await answer({ hits: [hit], nextCursor: null });
    fireEvent.click(screen.getByTestId("search-hit"));
    expect(props.onOpenHit).toHaveBeenCalledWith(hit, "chinatown");
    expect(JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]")).toEqual(["chinatown"]);
  });

  it("keeps the recent searches on this computer: run one again, forget one, clear them", () => {
    localStorage.setItem(RECENT_KEY, JSON.stringify(["tea", "chinatown"]));
    resetRecentSearches();
    draw(server().search);
    expect(screen.getByRole("heading", { name: "Recent" })).toBeTruthy();
    fireEvent.click(screen.getByTestId("recent-tea"));
    expect((field() as HTMLInputElement).value).toBe("tea");
    expect(screen.getByTestId("result-space-spc_tea")).toBeTruthy();
    type("");
    fireEvent.click(screen.getByRole("button", { name: "Forget chinatown" }));
    expect(screen.queryByTestId("recent-chinatown")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Clear recent searches" }));
    expect(screen.getByText("Spaces, agents, and anything said in them.")).toBeTruthy();
    expect(localStorage.getItem(RECENT_KEY)).toBe("[]");
  });

  it("remembers a search when Enter is pressed in it", () => {
    draw(server().search);
    type("garage door");
    fireEvent.keyDown(field(), { key: "Enter" });
    expect(JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]")).toEqual(["garage door"]);
  });

  it("still finds spaces and agents with no server, and says why messages are not there", () => {
    const { asked, search } = server();
    const { props } = draw(search, { online: false });
    type("chinatown");
    expect(screen.getAllByTestId(/^result-space-/).length).toBeGreaterThan(0);
    const offline = screen.getByTestId("search-offline");
    expect(offline.textContent).toContain("Can't reach your server.");
    fireEvent.click(within(offline).getByRole("button", { name: "Try again" }));
    expect(props.onWake).toHaveBeenCalled();
    expect(asked).toEqual([]);
  });

  it("says when a search did not go through, and asks again on Try again", async () => {
    const { asked, search, fail } = server();
    draw(search);
    type("dim sum");
    act(() => vi.advanceTimersByTime(200));
    await fail();
    const failed = screen.getByTestId("search-failed");
    fireEvent.click(within(failed).getByRole("button", { name: "Try again" }));
    expect(asked).toHaveLength(2);
  });

  it("says when nothing was found, and what search looks at", async () => {
    const { search, answer } = server();
    draw(search);
    type("zebra");
    act(() => vi.advanceTimersByTime(200));
    await answer({ hits: [], nextCursor: null });
    const nothing = screen.getByTestId("search-empty");
    expect(nothing.textContent).toContain("Nothing for “zebra”");
    expect(nothing.textContent).toContain("voice notes too");
  });

  it("finds what it found again on the way back from a result", async () => {
    const { asked, search, answer } = server();
    const page = draw(search);
    type("chinatown");
    fireEvent.click(screen.getByRole("tab", { name: "Messages" }));
    act(() => vi.advanceTimersByTime(200));
    await answer({ hits: [hit], nextCursor: null });
    page.unmount();
    page.rerender();
    expect((field() as HTMLInputElement).value).toBe("chinatown");
    expect(screen.getByRole("tab", { name: "Messages" }).getAttribute("aria-selected")).toBe(
      "true",
    );
    expect(screen.getByTestId("search-hit")).toBeTruthy();
    expect(asked).toHaveLength(1);
  });

  it("asks for the next page as the list nears its end", async () => {
    let seen: ((entries: { isIntersecting: boolean }[]) => void) | undefined;
    const observe = vi.fn();
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        constructor(callback: (entries: { isIntersecting: boolean }[]) => void) {
          seen = callback;
        }
        observe = observe;
        disconnect() {}
      },
    );
    try {
      const { asked, search, answer } = server();
      draw(search);
      type("chinatown");
      act(() => vi.advanceTimersByTime(200));
      await answer({ hits: [hit], nextCursor: "c1" });
      expect(observe).toHaveBeenCalled();
      act(() => seen?.([{ isIntersecting: true }]));
      expect(asked.at(-1)).toEqual({ text: "chinatown", cursor: "c1", limit: 20 });
      expect(screen.getByText("Finding more…")).toBeTruthy();
    } finally {
      vi.stubGlobal("IntersectionObserver", undefined);
    }
  });
});
