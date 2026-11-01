/**
 * The Search tab (ADR 0132): what typing finds, how messages are asked for, the chips, what a
 * search that cannot reach the server says, the recent searches, and where each result opens.
 * The search box that stood over Spaces had three of these tests; they live here now.
 */

import type { SearchHit, SearchInput, SearchPage, Snapshot, Space } from "@chipschat/core";
import { SEARCH_PAUSE_MS } from "@chipschat/core";
import {
  act,
  fireEvent,
  render as renderBare,
  screen,
  within,
} from "@testing-library/react-native";
import type { ReactElement } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { fakeStore } from "../testing/fixtures";
import { resetRecentSearches } from "./recent";
import { SearchScreen } from "./SearchScreen";

const IPHONE = {
  frame: { x: 0, y: 0, width: 402, height: 874 },
  insets: { top: 62, left: 0, right: 0, bottom: 34 },
};

const render = (element: ReactElement) =>
  renderBare(<SafeAreaProvider initialMetrics={IPHONE}>{element}</SafeAreaProvider>);

const mockPushed: string[] = [];
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: (to: string) => mockPushed.push(to) }),
  useNavigation: () => ({ addListener: () => () => undefined, isFocused: () => true }),
  useFocusEffect: (effect: () => void) => require("react").useEffect(effect, [effect]),
  useIsFocused: () => true,
}));

const mockSettings = new Map<string, string>();
jest.mock("../prefs", () => ({
  SETTINGS: { recentSearches: "search.recent" },
  readSetting: async (name: string) => mockSettings.get(name),
  writeSetting: async (name: string, value: string) => {
    mockSettings.set(name, value);
  },
}));

beforeEach(() => {
  mockPushed.length = 0;
  mockSettings.clear();
  resetRecentSearches();
});

const ME = "usr_me";
const KIT = "usr_kit";
const HARBOR = "hrn_harbor";
const TOUR = "agt_tour";

function space(id: string, over: Partial<Space> = {}): Space {
  return {
    id,
    kind: "room",
    members: [ME],
    roles: {},
    state: "open",
    lastEventSeq: 1,
    lastActivityAt: "2026-10-06T10:00:00.000Z",
    lines: [],
    runs: [],
    sessions: [],
    pins: [],
    glimpse: false,
    ...over,
  };
}

function state(over: Partial<Snapshot> = {}): Snapshot {
  return {
    connection: "open",
    link: "direct",
    busy: new Set<string>(),
    receipts: new Map(),
    spaceIcons: new Map(),
    readState: {},
    directory: {
      [ME]: { id: ME, kind: "person", displayName: "Arjun" },
      [KIT]: { id: KIT, kind: "person", displayName: "Kit Marlowe" },
      [HARBOR]: { id: HARBOR, kind: "harness", displayName: "Harbor", ownerId: ME },
      [TOUR]: {
        id: TOUR,
        kind: "agent",
        harnessId: HARBOR,
        displayName: "Chinatown Walking Tour",
        room: "sp_tour",
      },
    },
    model: {
      needsYou: [],
      lanes: [],
      people: {},
      spaces: [
        space("sp_tour", { title: "Chinatown Walking Tour", members: [ME, TOUR] }),
        space("sp_dinner", { title: "Chinatown dinner", members: [ME, KIT] }),
        space("sp_market", { title: "Chinatown night market" }),
        space("sp_lessons", { title: "Chinese lessons" }),
        space("sp_garage", { title: "Garage door", members: [ME, KIT] }),
      ],
    },
    ...over,
  } as unknown as Snapshot;
}

/** The directory with its agents left out, so they lend the backdrop no faces. */
const withoutAgents = (directory: Snapshot["directory"]) =>
  Object.fromEntries(Object.entries(directory).filter(([, each]) => each.kind !== "agent"));

/** A server whose answers come when the test says. */
function server() {
  const asks: { input: SearchInput; answer: (page: SearchPage) => void; fail: () => void }[] = [];
  const search = (input: SearchInput) =>
    new Promise<SearchPage>((resolve, reject) => {
      asks.push({ input, answer: resolve, fail: () => reject(new Error("offline")) });
    });
  return { asks, search };
}

const hit = (over: Partial<SearchHit> = {}): SearchHit => ({
  kind: "message",
  spaceId: "sp_dinner",
  at: "2026-10-06T10:00:00.000Z",
  snippet: "a table in \u{E000}Chinatown\u{E001} for six",
  lineId: "ln_1",
  authorId: KIT,
  ...over,
});

async function opened(snapshot = state(), search = server()) {
  const store = { ...fakeStore(snapshot), search: search.search };
  await render(<SearchScreen store={store} selfId={ME} />);
  return { store, asks: search.asks };
}

/** Type, then let the pause go by and the answers' `then` run. */
async function type(text: string, pause = SEARCH_PAUSE_MS) {
  await fireEvent.changeText(screen.getByTestId("search"), text);
  await act(async () => {
    jest.advanceTimersByTime(pause);
  });
}

async function answer(asks: ReturnType<typeof server>["asks"], at: number, page: SearchPage) {
  await act(async () => {
    asks[at]?.answer(page);
  });
}

describe("the Search tab", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it("says what it finds before anything is typed, with no searches yet", async () => {
    await opened();
    expect(screen.getByText("Spaces, agents, and anything said in them.")).toBeTruthy();
    expect(screen.queryByTestId("scope-chips")).toBeNull();
  });

  it("rolls what it finds after Find, out of VoiceOver's way (ADR 0137)", async () => {
    await opened();
    // Hidden from VoiceOver, which reads the sentence instead.
    expect(screen.queryByText("Find")).toBeNull();
    const hidden = { includeHiddenElements: true };
    expect(screen.getByText("Find", hidden)).toBeTruthy();
    expect(screen.getAllByText("spaces", hidden)).toHaveLength(2);
    expect(screen.getByText("agents", hidden)).toBeTruthy();
    expect(screen.getByText("anything said", hidden)).toBeTruthy();
  });

  it("drifts the faces of your spaces behind the empty part, round and round to eighteen", async () => {
    await opened();
    // Hidden from VoiceOver, so asked for as a hidden element.
    const hidden = { includeHiddenElements: true };
    const backdrop = screen.getByTestId("search-backdrop", hidden);
    // Seen, never read out: the rows over it already say everything there is.
    expect(backdrop.props["accessibilityElementsHidden"]).toBe(true);
    expect(backdrop.props["pointerEvents"]).toBe("none");
    await fireEvent(backdrop, "layout", {
      nativeEvent: { layout: { x: 0, y: 0, width: 402, height: 0 } },
    });
    expect(screen.getAllByTestId("backdrop-face", hidden)).toHaveLength(18);
  });

  it("drifts your agents too, with their pins at every depth, each face in a glow (ADR 0138)", async () => {
    await opened();
    const hidden = { includeHiddenElements: true };
    await fireEvent(screen.getByTestId("search-backdrop", hidden), "layout", {
      nativeEvent: { layout: { x: 0, y: 0, width: 402, height: 0 } },
    });
    // Five rooms and the tour's agent, round and round: the agent comes up in two or three places.
    const agents = screen.getAllByTestId("agent-body", hidden);
    expect(agents.length).toBeGreaterThanOrEqual(2);
    // Its pins even in the far places, where a face is under thirty-two points.
    expect(screen.getAllByTestId("agent-pins", hidden)).toHaveLength(agents.length);
    expect(screen.getAllByTestId("backdrop-glow", hidden)).toHaveLength(18);
    // Every face over its own silhouette, so where two cross the farther doesn't show through.
    const faces = screen.getAllByTestId("backdrop-face", hidden);
    expect(faces.every((face) => face.children.length === 3)).toBe(true);
  });

  it("has no backdrop with neither a space nor an agent to take faces from", async () => {
    const bare = state();
    await opened({
      ...bare,
      directory: withoutAgents(bare.directory),
      model: { ...bare.model, spaces: [] },
    } as Snapshot);
    expect(screen.queryByTestId("search-backdrop", { includeHiddenElements: true })).toBeNull();
  });

  it("takes no faces from closed spaces", async () => {
    const bare = state();
    const closed = space("sp_old", { title: "Old trip", state: "closed" });
    await opened({
      ...bare,
      directory: withoutAgents(bare.directory),
      model: { ...bare.model, spaces: [closed] },
    } as Snapshot);
    expect(screen.queryByTestId("search-backdrop", { includeHiddenElements: true })).toBeNull();
  });

  it("finds spaces and agents by name on the phone, with the typed part marked", async () => {
    await opened();
    await type("chin");
    const tour = screen.getByTestId("result-space-sp_tour");
    expect(within(tour).getByTestId("mark")).toHaveTextContent("Chin");
    const agent = screen.getByTestId(`result-agent-${TOUR}`);
    expect(within(agent).getByTestId("mark")).toHaveTextContent("Chin");
    expect(within(agent).getByText("Harbor")).toBeTruthy();
  });

  it("shows three spaces in All, then See all, which picks the Spaces chip", async () => {
    await opened();
    await type("chin");
    expect(screen.getAllByTestId(/^result-space-/)).toHaveLength(3);
    await fireEvent.press(screen.getByTestId("see-all-spaces"));
    expect(screen.getAllByTestId(/^result-space-/)).toHaveLength(4);
    expect(screen.getByRole("tab", { name: "Spaces", selected: true })).toBeTruthy();
    expect(screen.queryByTestId(`result-agent-${TOUR}`)).toBeNull();
  });

  it("asks the server nothing under two letters, and once after the pause", async () => {
    const { asks } = await opened();
    await type("c");
    expect(asks).toHaveLength(0);
    await fireEvent.changeText(screen.getByTestId("search"), "ch");
    await fireEvent.changeText(screen.getByTestId("search"), "chi");
    await type("chin", SEARCH_PAUSE_MS - 1);
    expect(asks).toHaveLength(0);
    await act(async () => {
      jest.advanceTimersByTime(1);
    });
    expect(asks.map((ask) => ask.input)).toEqual([{ text: "chin", limit: 20 }]);
  });

  it("holds places for messages until the first answer, then draws them marked", async () => {
    const { asks } = await opened();
    await type("chin");
    expect(screen.getAllByTestId("result-placeholder")).toHaveLength(2);
    await answer(asks, 0, { hits: [hit()], nextCursor: null });
    expect(screen.queryByTestId("result-placeholder")).toBeNull();
    const row = screen.getByTestId("result-message-ln_1");
    expect(within(row).getByText("Kit Marlowe")).toBeTruthy();
    expect(within(row).getByTestId("mark")).toHaveTextContent("Chinatown");
  });

  it("drops an answer for words since changed", async () => {
    const { asks } = await opened();
    await type("chin");
    await type("chinat");
    await answer(asks, 1, { hits: [hit({ lineId: "ln_new" })], nextCursor: null });
    await answer(asks, 0, { hits: [hit({ lineId: "ln_old" })], nextCursor: null });
    expect(screen.getByTestId("result-message-ln_new")).toBeTruthy();
    expect(screen.queryByTestId("result-message-ln_old")).toBeNull();
  });

  it("leaves out a hit in a room this phone no longer has", async () => {
    const { asks } = await opened();
    await type("chin");
    await answer(asks, 0, {
      hits: [hit({ spaceId: "sp_gone", lineId: "ln_gone" }), hit()],
      nextCursor: null,
    });
    expect(screen.queryByTestId("result-message-ln_gone")).toBeNull();
    expect(screen.getByTestId("result-message-ln_1")).toBeTruthy();
  });

  it("says a voice note is one, and a step is a step", async () => {
    const { asks } = await opened();
    await type("chin");
    await answer(asks, 0, {
      hits: [
        hit({ snippetFrom: "transcript", lineId: "ln_voice" }),
        hit({ kind: "receipt", lineId: undefined, runId: "run_1", stepId: "stp_1" }),
      ],
      nextCursor: null,
    });
    expect(
      within(screen.getByTestId("result-message-ln_voice")).getByText(/voice note/),
    ).toBeTruthy();
    expect(within(screen.getByTestId("result-message-stp_1")).getByText(/step in/)).toBeTruthy();
  });

  it("still finds spaces and agents with the server out of reach, and says why messages aren't", async () => {
    const { store } = await opened(state({ connection: "closed" }));
    await type("chin");
    expect(screen.getByTestId("result-space-sp_tour")).toBeTruthy();
    expect(screen.getByTestId(`result-agent-${TOUR}`)).toBeTruthy();
    const line = screen.getByTestId("search-offline");
    expect(within(line).getByText("Can't reach your server.")).toBeTruthy();
    await fireEvent.press(within(line).getByText("Try again"));
    expect(store.calls).toContainEqual({ name: "wake", args: undefined });
  });

  it("says a search that didn't go through, and asks again on Try again", async () => {
    const { asks } = await opened();
    await type("chin");
    await act(async () => {
      asks[0]?.fail();
    });
    const line = screen.getByTestId("search-failed");
    expect(within(line).getByText("The search didn't go through.")).toBeTruthy();
    await fireEvent.press(within(line).getByText("Try again"));
    expect(asks).toHaveLength(2);
  });

  it("says nothing was found, and what search looks at", async () => {
    const { asks } = await opened();
    await type("zebra crossing");
    await answer(asks, 0, { hits: [], nextCursor: null });
    expect(screen.getByText("Nothing for “zebra crossing”")).toBeTruthy();
  });
});

describe("where a result opens", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it("opens a space's room, and an agent's page", async () => {
    await opened();
    await type("chin");
    await fireEvent.press(screen.getByTestId("result-space-sp_tour"));
    await fireEvent.press(screen.getByTestId(`result-agent-${TOUR}`));
    expect(mockPushed).toEqual(["/spaces/sp_tour", `/agents/${TOUR}`]);
  });

  it("opens a message's room at its line with the words, and a step's at its run (ADR 0133)", async () => {
    const { asks } = await opened();
    await type("chin");
    await answer(asks, 0, {
      hits: [hit(), hit({ kind: "receipt", lineId: undefined, runId: "run_1", stepId: "stp_1" })],
      nextCursor: null,
    });
    await fireEvent.press(screen.getByTestId("result-message-ln_1"));
    await fireEvent.press(screen.getByTestId("result-message-stp_1"));
    expect(mockPushed).toEqual([
      "/spaces/sp_dinner?at=line%3Aln_1&words=chin",
      "/spaces/sp_dinner?at=run%3Arun_1",
    ]);
  });
});

describe("recent searches", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  /** Back to nothing typed, where the recent searches are. */
  async function cleared() {
    await type("");
  }

  it("are kept on the Search key, with the words as the field had them", async () => {
    await opened();
    await type("chin");
    await fireEvent(screen.getByTestId("search"), "submitEditing", {
      nativeEvent: { text: "chin" },
    });
    await cleared();
    expect(screen.getByTestId("recent-chin")).toBeTruthy();
    expect(JSON.parse(mockSettings.get("search.recent") ?? "[]")).toEqual(["chin"]);
  });

  it("are kept when a result is opened, newest first, and run again when tapped", async () => {
    const { asks } = await opened();
    await type("garage");
    await fireEvent.press(screen.getByTestId("result-space-sp_garage"));
    await type("chin");
    await fireEvent.press(screen.getByTestId("result-space-sp_tour"));
    await cleared();
    expect(screen.getAllByTestId(/^recent-/).map((row) => row.props["testID"])).toEqual([
      "recent-chin",
      "recent-garage",
    ]);
    await fireEvent.press(screen.getByTestId("recent-garage"));
    await act(async () => {
      jest.advanceTimersByTime(SEARCH_PAUSE_MS);
    });
    expect(screen.getByTestId("result-space-sp_garage")).toBeTruthy();
    expect(asks.at(-1)?.input.text).toBe("garage");
  });

  it("forgets one on its ×, and all on Clear", async () => {
    mockSettings.set("search.recent", JSON.stringify(["chin", "garage", "tour"]));
    await opened();
    await act(async () => undefined);
    await fireEvent.press(screen.getByLabelText("Forget garage"));
    expect(screen.queryByTestId("recent-garage")).toBeNull();
    expect(screen.getByTestId("recent-tour")).toBeTruthy();
    await fireEvent.press(screen.getByLabelText("Clear recent searches"));
    expect(screen.queryByTestId(/^recent-/)).toBeNull();
    expect(screen.getByText("Spaces, agents, and anything said in them.")).toBeTruthy();
  });
});
