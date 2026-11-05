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
import {
  type Beside,
  Search,
  type SearchProps,
  type SearchSession,
  useSearchSession,
} from "./Search.tsx";

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
    expect(leaving.hasAttribute("data-resting")).toBe(false);
    act(() => vi.advanceTimersByTime(1));
    // Faded, it is kept out of sight, its faces still, and not drawn afresh to come back.
    expect(screen.getByTestId("search-backdrop")).toBe(leaving);
    expect(leaving.hasAttribute("data-resting")).toBe(true);
    expect(leaving.hasAttribute("data-leaving")).toBe(false);
    type("");
    expect(screen.getByTestId("search-backdrop")).toBe(leaving);
    expect(leaving.hasAttribute("data-leaving")).toBe(false);
    expect(leaving.hasAttribute("data-resting")).toBe(false);
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

  it("says a message was said in an archived space, and opens it to read all the same", async () => {
    const old = space("spc_old", { title: "Old trip", state: "closed", members: [ARJUN, KIT] });
    const { search, answer } = server();
    const { props } = draw(search, {
      model: { ...model, spaces: [...model.spaces, old] } as SearchProps["model"],
    });
    type("chinatown");
    act(() => vi.advanceTimersByTime(200));
    const there = { ...hit, spaceId: "spc_old", lineId: "ln_old" };
    await answer({ hits: [there, hit], nextCursor: null });
    const [archived, open] = screen.getAllByTestId("search-hit");
    expect(archived?.textContent).toContain("Archived · ");
    expect(archived?.getAttribute("aria-label")).toMatch(/in Old trip, archived$/);
    expect(open?.textContent).not.toContain("Archived");
    fireEvent.click(archived as HTMLElement);
    expect(props.onOpenHit).toHaveBeenCalledWith(there, "chinatown");
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

  it("wears the phone's clock on a recent search, and its marks on the two notices", async () => {
    localStorage.setItem(RECENT_KEY, JSON.stringify(["tea"]));
    resetRecentSearches();
    const { search, fail } = server();
    const page = draw(search, { online: false });
    expect(screen.getByTestId("recent-tea").querySelector('[data-icon="clock"]')).not.toBeNull();
    type("dim sum");
    expect(
      screen.getByTestId("search-offline").querySelector('[data-icon="offline"]'),
    ).not.toBeNull();
    page.rerender({ online: true });
    act(() => vi.advanceTimersByTime(200));
    await fail();
    expect(screen.getByTestId("search-failed").querySelector('[data-icon="alert"]')).not.toBeNull();
  });
});

describe("the Search page from the keys (ADR 0263)", () => {
  const lit = () => document.querySelector<HTMLElement>(".search-item[data-lit]");
  const press = (key: string) => fireEvent.keyDown(field(), { key });

  it("lights the results in turn while the field keeps the keys, and Enter opens the one lit", () => {
    const { props } = draw(server().search);
    type("chinatown");
    expect(lit()).toBeNull();
    press("ArrowDown");
    expect(lit()?.dataset["key"]).toBe("space:spc_dinner");
    const button = screen.getByTestId("result-space-spc_dinner");
    expect(field().getAttribute("aria-activedescendant")).toBe(button.id);
    expect(document.activeElement).toBe(field());
    press("ArrowDown");
    press("ArrowDown");
    press("ArrowDown");
    // The three spaces All shows, then their See all.
    expect(lit()?.dataset["key"]).toBe("all:spaces");
    press("ArrowUp");
    press("Enter");
    expect(props.onOpenSpace).toHaveBeenCalledTimes(1);
    expect(JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]")).toEqual(["chinatown"]);
  });

  it("gives the keys back to the words on ↑ from the first, and stops at the last on ↓", () => {
    draw(server().search, { online: false });
    type("santa");
    press("ArrowDown");
    expect(lit()?.dataset["key"]).toBe("space:spc_trip");
    press("ArrowDown");
    press("ArrowDown");
    expect(lit()?.dataset["key"]).toBe("space:spc_trip");
    press("ArrowUp");
    expect(lit()).toBeNull();
    expect(field().hasAttribute("aria-activedescendant")).toBe(false);
  });

  it("runs a recent search lit by the arrows", () => {
    localStorage.setItem(RECENT_KEY, JSON.stringify(["tea", "chinatown"]));
    resetRecentSearches();
    draw(server().search);
    press("ArrowDown");
    press("ArrowDown");
    press("Enter");
    expect((field() as HTMLInputElement).value).toBe("chinatown");
    // A new search lights nothing until ↓ again.
    expect(lit()).toBeNull();
  });

  it("puts the light out as the pointer moves over the list", () => {
    draw(server().search);
    type("chinatown");
    press("ArrowDown");
    fireEvent.mouseMove(screen.getByTestId("search-results"));
    expect(lit()).toBeNull();
  });

  it("empties the field on Esc, and lets Esc by when there is nothing to empty", () => {
    draw(server().search);
    type("chinatown");
    press("ArrowDown");
    const emptied = fireEvent.keyDown(field(), { key: "Escape" });
    expect(emptied).toBe(false);
    expect((field() as HTMLInputElement).value).toBe("");
    expect(lit()).toBeNull();
    expect(fireEvent.keyDown(field(), { key: "Escape" })).toBe(true);
  });

  it("is one stop for Tab across the chips, ← and → choosing the one beside", () => {
    draw(server().search);
    type("chinatown");
    const tabs = within(screen.getByTestId("scope-chips")).getAllByRole("tab");
    expect(tabs.map((tab) => tab.tabIndex)).toEqual([0, -1, -1, -1]);
    tabs[0]?.focus();
    fireEvent.keyDown(tabs[0] as HTMLElement, { key: "ArrowRight" });
    const spaces = screen.getByRole("tab", { name: "Spaces" });
    expect(spaces.getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(spaces);
    fireEvent.keyDown(spaces, { key: "ArrowLeft" });
    fireEvent.keyDown(screen.getByRole("tab", { name: "All" }), { key: "ArrowLeft" });
    expect(screen.getByRole("tab", { name: "Messages" }).getAttribute("aria-selected")).toBe(
      "true",
    );
  });
});

describe("the Search page's pages of messages", () => {
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

describe("the Search page beside what it opens, on a wide window (ADR 0269)", () => {
  const wide = (matches: boolean) =>
    vi.stubGlobal("matchMedia", () => ({
      matches,
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
  const besides = (opened?: Beside) => {
    const onOpen = vi.fn();
    return { onOpen, props: { beside: { opened, onOpen, pane: <p>the room</p> } } };
  };

  it("drifts the faces beside the results before anything is opened, and says where to look once typed", () => {
    wide(true);
    const { props } = besides();
    draw(server().search, props);
    const pane = screen.getByTestId("search-pane");
    expect(within(pane).getByTestId("search-backdrop")).toBeTruthy();
    // Under the field, no faces: they are the pane's.
    expect(screen.getAllByTestId("search-backdrop")).toHaveLength(1);
    type("chin");
    expect(within(pane).getByTestId("search-nothing-open").textContent).toBe(
      "Nothing openChoose a result on the left.",
    );
  });

  it("opens a result beside the results on a press, and its own page on a double click", () => {
    wide(true);
    const { onOpen, props } = besides();
    const page = draw(server().search, props);
    type("chinatown");
    fireEvent.click(screen.getByTestId("result-space-spc_dinner"));
    expect(onOpen).toHaveBeenCalledWith({
      kind: "space",
      key: "space:spc_dinner",
      spaceId: "spc_dinner",
    });
    expect(page.props.onOpenSpace).not.toHaveBeenCalled();
    fireEvent.doubleClick(screen.getByTestId(`result-agent-${TOUR}`));
    expect(page.props.onOpenAgent).toHaveBeenCalledWith(TOUR);
  });

  it("opens beside what the arrows light, and Enter takes it to its own page", () => {
    wide(true);
    const { onOpen, props } = besides();
    const page = draw(server().search, props);
    type("chinatown");
    fireEvent.keyDown(field(), { key: "ArrowDown" });
    expect(onOpen).toHaveBeenLastCalledWith({
      kind: "space",
      key: "space:spc_dinner",
      spaceId: "spc_dinner",
    });
    fireEvent.keyDown(field(), { key: "Enter" });
    expect(page.props.onOpenSpace).toHaveBeenCalledWith("spc_dinner");
  });

  it("draws what is open beside the results, its row marked as open", () => {
    wide(true);
    const { props } = besides({ kind: "space", key: "space:spc_dinner", spaceId: "spc_dinner" });
    draw(server().search, props);
    type("chinatown");
    expect(within(screen.getByTestId("search-pane")).getByText("the room")).toBeTruthy();
    expect(screen.getByTestId("result-space-spc_dinner").getAttribute("aria-current")).toBe("true");
  });

  it("is one column on a narrower window, a result taking the page as before", () => {
    wide(false);
    const { onOpen, props } = besides();
    const page = draw(server().search, props);
    expect(screen.queryByTestId("search-split")).toBeNull();
    type("chinatown");
    fireEvent.click(screen.getByTestId("result-space-spc_dinner"));
    expect(onOpen).not.toHaveBeenCalled();
    expect(page.props.onOpenSpace).toHaveBeenCalledWith("spc_dinner");
  });
});

describe("the Search page changing smoothly (3 November 2026)", () => {
  /** The browser's animations, as the page asks for them: on which element, and how. */
  const animate = vi.fn(function (this: Element, _how: Keyframe[] | PropertyIndexedKeyframes) {
    return { cancel() {}, addEventListener() {}, playState: "finished", effect: null };
  });
  /** A window as wide as asked, with or without less motion asked for. */
  const windowIs = (wide: boolean, less = false) =>
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: query.includes("reduced-motion") ? less : wide,
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
  beforeEach(() => {
    animate.mockClear();
    Object.assign(HTMLElement.prototype, { animate });
  });
  afterEach(() => {
    Reflect.deleteProperty(HTMLElement.prototype, "animate");
  });

  it("says nothing was found only once the typing pauses, while the messages are still to be asked", async () => {
    const { search, answer } = server();
    draw(search);
    // One letter: names only, the messages not yet asked for, so the line waits for a pause.
    type("z");
    const list = screen.getByTestId("search-results");
    const waiting = list.querySelector<HTMLElement>('.search-item[data-kind="nothing"]');
    expect(waiting?.hasAttribute("data-hold")).toBe(true);
    type("zebra");
    act(() => vi.advanceTimersByTime(200));
    await answer({ hits: [], nextCursor: null });
    // Answered: nothing it is, at once.
    const answered = list.querySelector<HTMLElement>('.search-item[data-kind="nothing"]');
    expect(answered?.hasAttribute("data-hold")).toBe(false);
  });

  it("fades the chips where they stood as the field empties, the chosen one still chosen", () => {
    draw(server().search);
    type("chin");
    fireEvent.click(screen.getByRole("tab", { name: "Messages" }));
    type("");
    const going = document.querySelector<HTMLElement>(".search-chips[data-leaving]");
    expect(going?.getAttribute("aria-hidden")).toBe("true");
    expect(going?.hasAttribute("inert")).toBe(true);
    expect(going?.querySelector("[data-chosen]")?.textContent).toBe("Messages");
    // A copy: no tabs to reach, and none the tests find as the chips.
    expect(screen.queryByTestId("scope-chips")).toBeNull();
    expect(screen.queryAllByRole("tab")).toHaveLength(0);
    act(() => vi.advanceTimersByTime(120));
    expect(document.querySelector(".search-chips")).toBeNull();
  });

  it("brings the chips in with the first letter typed here, not as Search opens on words typed before", () => {
    const page = draw(server().search);
    type("chin");
    expect(screen.getByTestId("scope-chips").hasAttribute("data-arriving")).toBe(true);
    page.unmount();
    page.rerender();
    expect(screen.getByTestId("scope-chips").hasAttribute("data-arriving")).toBe(false);
    type("");
    type("ch");
    expect(screen.getByTestId("scope-chips").hasAttribute("data-arriving")).toBe(true);
  });

  it("scrolls to the row the arrows light, at once with less motion asked for", () => {
    const scrolled = vi.fn();
    Object.assign(Element.prototype, { scrollIntoView: scrolled });
    windowIs(false);
    draw(server().search);
    type("chinatown");
    fireEvent.keyDown(field(), { key: "ArrowDown" });
    expect(scrolled).toHaveBeenLastCalledWith({ block: "nearest", behavior: "smooth" });
    windowIs(false, true);
    fireEvent.keyDown(field(), { key: "ArrowDown" });
    expect(scrolled).toHaveBeenLastCalledWith({ block: "nearest", behavior: "auto" });
    Reflect.deleteProperty(Element.prototype, "scrollIntoView");
  });

  it("brings a page in beside the results as You's pages come, not another line of the same room", () => {
    windowIs(true);
    const onOpen = vi.fn();
    const beside = (opened: Beside) => ({ beside: { opened, onOpen, pane: <p>the page</p> } });
    const dinner: Beside = { kind: "space", key: "space:spc_dinner", spaceId: "spc_dinner" };
    const page = draw(server().search, beside(dinner));
    const pane = screen.getByTestId("search-pane");
    const paneMoves = () =>
      animate.mock.calls.filter((_, at) => animate.mock.contexts[at] === pane).map(([how]) => how);
    // Search opened on what was open: it is simply there.
    expect(paneMoves()).toHaveLength(0);
    page.rerender(beside({ ...dinner, key: "message:line:l1", hit }));
    expect(paneMoves()).toHaveLength(0);
    page.rerender(beside({ kind: "agent", key: `agent:${TOUR}`, agentId: TOUR }));
    expect(paneMoves()).toEqual([{ opacity: [0, 1], transform: ["translateX(8px)", "none"] }]);
    // With less motion asked for, it only fades up.
    windowIs(true, true);
    page.rerender(beside(dinner));
    expect(paneMoves().at(-1)).toEqual({ opacity: [0, 1] });
    expect(paneMoves()).toHaveLength(2);
  });
});
