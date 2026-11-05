/**
 * The space list. Search is a tab of its own (ADR 0132, `src/search/SearchScreen.test.tsx`), and
 * the list has no box over it.
 */

import type { Device, Snapshot, Space } from "@chipschat/core";
import {
  fireEvent,
  render as renderBare,
  screen,
  act as settle,
  userEvent,
  waitFor,
  within,
} from "@testing-library/react-native";
import type { ReactElement } from "react";
import { StyleSheet } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import * as provider from "../store/provider";
import { fakeStore } from "../testing/fixtures";
import { drawLibrary } from "../testing/picker";
import { mixHex } from "../ui/lit";
import { LIBRARY_FAMILIES } from "../ui/marks";
import { Split } from "../ui/Split";
import { avatarHueIndex } from "../ui/sourceColours";
import { ICON_GROUND_NAMES, ICON_GROUNDS, light, SPACE } from "../ui/tokens";
import { List } from "./List";
import { BAR_HEIGHT } from "./Selecting";

/**
 * The list draws a sheet when a face is being changed, and a sheet asks for the safe area, so
 * every render here gets a provider with an iPhone's metrics — as `Sheet.test.tsx` does.
 */
const IPHONE = {
  frame: { x: 0, y: 0, width: 393, height: 852 },
  insets: { top: 59, left: 0, right: 0, bottom: 34 },
};

const render = (element: ReactElement) =>
  renderBare(<SafeAreaProvider initialMetrics={IPHONE}>{element}</SafeAreaProvider>);

const pushed: string[] = [];
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: (to: string) => pushed.push(to) }),
  useFocusEffect: (effect: () => void) => require("react").useEffect(effect, [effect]),
}));

/** Who may be asked for a space, as the list sees them. */
const mockNewSpace: { harnesses: { id: string; displayName: string }[] } = { harnesses: [] };
jest.mock("../newSpace/NewSpace", () => ({
  useNewSpace: () => ({ harnesses: mockNewSpace.harnesses, open: () => undefined }),
}));

beforeEach(() => {
  pushed.length = 0;
  mockNewSpace.harnesses = [];
});

function state(): Snapshot {
  return {
    connection: "open",
    link: "direct",
    busy: new Set<string>(),
    receipts: new Map(),
    spaceIcons: new Map(),
    readState: { sp_1: 1, sp_3: 1 },
    directory: {
      per_arjun: { id: "per_arjun", kind: "person", displayName: "Arjun" },
      per_dana: { id: "per_dana", kind: "person", displayName: "Dana Ruiz" },
    },
    model: {
      needsYou: [],
      lanes: [],
      // As every model has: the switcher reads the reader's role from it.
      people: {},
      spaces: [
        {
          id: "sp_1",
          kind: "room",
          title: "Supplier email",
          members: [],
          roles: {},
          state: "open",
          lastActivityAt: "2026-09-07T11:00:00.000Z",
          lastEventSeq: 3,
          lines: [
            {
              id: "a",
              seq: 1,
              kind: "text",
              authorId: "per_dana",
              authorKind: "person",
              text: "one",
              ts: "2026-09-07T10:00:00.000Z",
            },
            {
              id: "b",
              seq: 3,
              kind: "text",
              authorId: "per_dana",
              authorKind: "person",
              text: "Shall we use Northwind?",
              ts: "2026-09-07T11:00:00.000Z",
            },
          ],
          runs: [],
          sessions: [],
          pins: [],
          glimpse: false,
        },
        {
          id: "sp_2",
          kind: "room",
          members: ["per_arjun", "per_dana"],
          roles: {},
          state: "open",
          lastActivityAt: "2026-09-07T09:00:00.000Z",
          lastEventSeq: 1,
          lines: [],
          runs: [],
          sessions: [],
          pins: [],
          glimpse: false,
        },
        {
          id: "sp_3",
          kind: "room",
          title: "Last summer's trip",
          members: [],
          roles: {},
          state: "closed",
          lastActivityAt: "2026-08-01T09:00:00.000Z",
          lastEventSeq: 1,
          lines: [
            {
              id: "c",
              seq: 1,
              kind: "text",
              authorId: "per_dana",
              authorKind: "person",
              text: "Booked **Tamar** on 121 E. Yanonali St",
              ts: "2026-08-01T09:00:00.000Z",
            },
          ],
          runs: [],
          sessions: [],
          pins: [],
          glimpse: false,
        },
      ],
    },
  } as unknown as Snapshot;
}

describe("the space list", () => {
  it("names each space and shows the last thing said in it", async () => {
    const snapshot = state();
    await render(<List store={fakeStore(snapshot)} snapshot={snapshot} />);
    expect(screen.getByText("Supplier email")).toBeTruthy();
    expect(screen.getByText("Shall we use Northwind?")).toBeTruthy();
    // An untitled space is named after who is in it.
    expect(screen.getByText("Arjun, Dana Ruiz")).toBeTruthy();
  });

  it("shows the words a message was written with, not the marks around them", async () => {
    const snapshot = state();
    await render(<List store={fakeStore(snapshot)} snapshot={snapshot} selected="sp_3" />);
    expect(screen.getByText("Booked Tamar on 121 E. Yanonali St")).toBeTruthy();
  });

  it("keeps the archived spaces behind one row that says how many, until it is pressed", async () => {
    const snapshot = state();
    await render(<List store={fakeStore(snapshot)} snapshot={snapshot} />);
    const row = screen.getByRole("button", { name: "Archived, 1" });
    expect(row).toHaveTextContent(/Archived \u00b7 1/);
    // A chevron that turns says it, since Hidden came (ADR 0205): no Show or Hide in words.
    expect(row).not.toHaveTextContent(/Show|Hide/);
    expect(row).toBeCollapsed();
    expect(screen.queryByText("Last summer's trip")).toBeNull();

    await userEvent.press(row);
    expect(screen.getByText("Last summer's trip")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Archived, 1" })).toBeExpanded();

    await userEvent.press(screen.getByRole("button", { name: "Archived, 1" }));
    expect(screen.queryByText("Last summer's trip")).toBeNull();
  });

  it("shows the archived ones when the room open beside the list is one of them", async () => {
    const snapshot = state();
    await render(<List store={fakeStore(snapshot)} snapshot={snapshot} selected="sp_3" />);
    expect(screen.getByText("Last summer's trip")).toBeTruthy();
    // And the person's word holds over that: pressed, they go.
    await userEvent.press(screen.getByRole("button", { name: "Archived, 1" }));
    expect(screen.queryByText("Last summer's trip")).toBeNull();
  });

  it("draws the room open beside the list as a tile set in from its edges, where it is a phone's band alone (ADR 0256)", async () => {
    const snapshot = state();
    await render(
      <Split
        list={<List store={fakeStore(snapshot)} snapshot={snapshot} selected="sp_1" />}
        detail={null}
      />,
    );
    const tile = screen.getByTestId("row-tile");
    expect(tile).toHaveStyle({ backgroundColor: light.surface3, left: SPACE.sm, right: SPACE.sm });
    expect(screen.getAllByTestId("row-tile")).toHaveLength(1);
    // Without a split there is no tile: the open row is the band, as it always was.
    await render(<List store={fakeStore(snapshot)} snapshot={snapshot} selected="sp_1" />);
    expect(screen.queryByTestId("row-tile")).toBeNull();
  });

  it("has no such row when nothing is archived", async () => {
    const snapshot = state();
    const open = {
      ...snapshot,
      model: { ...snapshot.model, spaces: snapshot.model.spaces.slice(0, 2) },
    } as unknown as Snapshot;
    await render(<List store={fakeStore(open)} snapshot={open} />);
    expect(screen.queryByTestId("archived-toggle")).toBeNull();
  });

  it("says a room needs a yes rather than quoting it back", async () => {
    const snapshot = state();
    const waiting = {
      ...snapshot.model.spaces[0],
      run: { harnessId: "har_scout", state: "waiting" },
    };
    const withRun = {
      ...snapshot,
      model: { ...snapshot.model, spaces: [waiting, ...snapshot.model.spaces.slice(1)] },
    } as unknown as Snapshot;
    await render(<List store={fakeStore(withRun)} snapshot={withRun} />);
    expect(screen.getByText("Needs a yes")).toBeTruthy();
    expect(screen.queryByText("Shall we use Northwind?")).toBeNull();
  });

  it("marks a room whose agents Chips paused, and says so over its last words (ADR 0097)", async () => {
    const snapshot = state();
    const first = snapshot.model.spaces[0] as Space;
    const paused = {
      ...first,
      lines: [
        ...first.lines,
        {
          id: "held_1",
          seq: 99,
          kind: "text",
          authorId: "har_scout",
          authorKind: "harness",
          text: "@Ledger one more",
          ts: "2026-10-02T19:00:00.000Z",
          addressedTo: [],
          held: true,
        },
      ],
    };
    const withHold = {
      ...snapshot,
      model: { ...snapshot.model, spaces: [paused, ...snapshot.model.spaces.slice(1)] },
    } as unknown as Snapshot;
    await render(<List store={fakeStore(withHold)} snapshot={withHold} />);
    expect(screen.getByTestId("paused")).toHaveTextContent("Paused");
    expect(screen.getByText("Chips paused the agents")).toBeTruthy();
  });

  it("says a queued turn as work, with the gear and the light round the face (ADR 0090)", async () => {
    // Jacobian edits one message as a queued turn goes, in the markup it sends to Telegram and
    // Slack as well. Read out as it arrives, the row said `💭 Working… ▸ browser · https://…`
    // (Arjun, 1 October 2026): the harness's own marks, in a Chips list.
    const snapshot = state();
    const working = {
      ...snapshot.model.spaces[0],
      lines: [
        {
          id: "d",
          seq: 4,
          kind: "text",
          authorId: "har_scout",
          authorKind: "harness",
          text: "💭 Reading the news…\n▸ local-dev__web_search · Starship Flight 14 results",
          ts: "2026-09-07T11:30:00.000Z",
        },
      ],
    };
    const busy = {
      ...snapshot,
      model: { ...snapshot.model, spaces: [working, ...snapshot.model.spaces.slice(1)] },
    } as unknown as Snapshot;
    await render(<List store={fakeStore(busy)} snapshot={busy} />);
    const row = screen.getByRole("button", { name: /Supplier email/ });
    expect(
      within(row).getByText("Reading the news · web search · Starship Flight 14 results"),
    ).toBeTruthy();
    expect(screen.queryByText(/💭/)).toBeNull();
    expect(within(row).getByTestId("working-gear")).toBeTruthy();
    expect(within(row).getByTestId("busy-ring")).toBeTruthy();
  });

  it("leaves a quiet room its own face and no gear", async () => {
    const snapshot = state();
    await render(<List store={fakeStore(snapshot)} snapshot={snapshot} />);
    expect(screen.queryByTestId("working-gear")).toBeNull();
    expect(screen.queryByTestId("busy-ring")).toBeNull();
  });

  it("puts the title's initials on a titled space, and the harness's face on one called after it", async () => {
    // Jacobian opens a titled space for each of its JSpaces. The row wears the title — an F for
    // Fact-checker — whether or not Jacobian has run there yet; the J belongs on the one row
    // that goes by Jacobian's own name (Arjun, 9 September 2026).
    const snapshot = state();
    const titled = {
      ...snapshot.model.spaces[0],
      id: "sp_4",
      kind: "direct",
      title: "Fact-checker",
      members: ["har_jacobian"],
      run: { harnessId: "har_jacobian", state: "running" },
    };
    const own = { ...titled, id: "sp_5", title: undefined, run: undefined };
    const withThem = {
      ...snapshot,
      directory: {
        ...snapshot.directory,
        har_jacobian: { id: "har_jacobian", kind: "harness", displayName: "Jacobian" },
      },
      model: { ...snapshot.model, spaces: [titled, own, ...snapshot.model.spaces] },
    } as unknown as Snapshot;
    await render(<List store={fakeStore(withThem)} snapshot={withThem} />);
    // The avatar is decoration to a screen reader, so the query has to be told to look at it.
    const seen = { includeHiddenElements: true };
    const titledRow = screen.getByLabelText("Fact-checker");
    expect(within(titledRow).getByText("F", seen)).toBeTruthy();
    expect(within(titledRow).queryByText("J", seen)).toBeNull();
    expect(within(screen.getByLabelText("Jacobian")).getByText("J", seen)).toBeTruthy();
  });

  it("tags a harness's Main room Main, in the colour its face stands on, and no other room (ADR 0145)", async () => {
    const snapshot = state();
    const main = { ...snapshot.model.spaces[0], id: "sp_main", title: "Jacobian main", home: true };
    const withMain = {
      ...snapshot,
      spaceIcons: new Map([["sp_main", { icon: "atom", ground: 13 }]]),
      model: { ...snapshot.model, spaces: [main, ...snapshot.model.spaces] },
    } as unknown as Snapshot;
    await render(<List store={fakeStore(withMain)} snapshot={withMain} />);
    const tags = screen.getAllByTestId("main-tag");
    expect(tags).toHaveLength(1);
    // Said, not only seen: the row's name carries it for a screen reader.
    const row = screen.getByLabelText("Jacobian main, Main space");
    expect(within(row).getByTestId("main-tag")).toHaveTextContent("Main");
    // Its face's own ground, mixed into the page: Jacobian's orange, as its atom stands on.
    expect(StyleSheet.flatten(tags[0]?.props["style"]).backgroundColor).toBe(
      mixHex(light.bg, ICON_GROUNDS[13], 0.16),
    );
  });

  it("tags a room somebody besides the reader reads, in violet, after Main (ADR 0234)", async () => {
    const snapshot = state();
    const [base] = snapshot.model.spaces;
    const room = (id: string, title: string, members: string[], home?: boolean) => ({
      ...base,
      id,
      title,
      members,
      ...(home === undefined ? {} : { home }),
    });
    const shared = {
      ...snapshot,
      directory: {
        ...snapshot.directory,
        hrn_hermes: {
          id: "hrn_hermes",
          kind: "harness",
          displayName: "Hermes",
          ownerId: "per_dana",
        },
        hrn_mine: {
          id: "hrn_mine",
          kind: "harness",
          displayName: "OpenClaw",
          ownerId: "per_arjun",
        },
        hrn_old: { id: "hrn_old", kind: "harness", displayName: "Old" },
        agt_theo: { id: "agt_theo", kind: "agent", displayName: "Theo", harnessId: "hrn_hermes" },
        agt_pip: { id: "agt_pip", kind: "agent", displayName: "Pip", harnessId: "hrn_mine" },
        agt_odd: { id: "agt_odd", kind: "agent", displayName: "Odd", harnessId: "hrn_old" },
      },
      model: {
        ...snapshot.model,
        spaces: [
          room("sp_japan", "Japan trip", ["per_arjun", "per_dana"]),
          room("sp_foodie", "Foodie", ["per_arjun", "agt_theo"]),
          room("sp_mine", "Sudoku mini", ["per_arjun", "agt_pip"]),
          room("sp_odd", "Old notes", ["per_arjun", "agt_odd"]),
          room("sp_home", "Hermes main", ["per_arjun", "agt_theo"], true),
        ],
      },
    } as unknown as Snapshot;
    await render(<List store={fakeStore(shared)} snapshot={shared} selfId="per_arjun" />);
    // Another person, or somebody else's agent; never the reader's own, nor an ownerless one's.
    expect(screen.getAllByTestId("shared-tag")).toHaveLength(3);
    const japan = screen.getByLabelText("Japan trip, shared");
    expect(within(japan).getByTestId("shared-tag")).toHaveTextContent("shared");
    expect(within(screen.getByLabelText("Foodie, shared")).getByTestId("shared-tag")).toBeTruthy();
    expect(within(screen.getByLabelText("Sudoku mini")).queryByTestId("shared-tag")).toBeNull();
    expect(within(screen.getByLabelText("Old notes")).queryByTestId("shared-tag")).toBeNull();
    // On a Main room it comes after Main, in the palette's violet.
    const home = screen.getByLabelText("Hermes main, Main space, shared");
    const [first, second] = within(home)
      .getAllByTestId(/^(main|shared)-tag$/)
      .map((tag) => tag.props["testID"]);
    expect([first, second]).toEqual(["main-tag", "shared-tag"]);
    const tag = within(japan).getByTestId("shared-tag");
    expect(StyleSheet.flatten(tag.props["style"]).backgroundColor).toBe(light.violetSoft);
  });

  it("counts what has not been read", async () => {
    const snapshot = state();
    await render(<List store={fakeStore(snapshot)} snapshot={snapshot} />);
    expect(screen.getByTestId("unread")).toHaveTextContent("1");
  });

  it("opens a space", async () => {
    const snapshot = state();
    await render(<List store={fakeStore(snapshot)} snapshot={snapshot} />);
    await userEvent.press(screen.getByLabelText("Supplier email"));
    expect(pushed).toEqual(["/spaces/sp_1"]);
  });

  it("opens a space beside itself when told how, and says which row is open", async () => {
    const snapshot = state();
    const opened: string[] = [];
    await render(
      <List
        store={fakeStore(snapshot)}
        snapshot={snapshot}
        selected="sp_1"
        onOpen={(id) => opened.push(id)}
      />,
    );
    const row = screen.getByLabelText("Supplier email");
    expect(row).toBeSelected();
    await userEvent.press(row);
    expect(opened).toEqual(["sp_1"]);
    expect(pushed).toEqual([]);
  });

  it("has no search box over it: search is a tab of its own (ADR 0132)", async () => {
    const snapshot = state();
    await render(<List store={fakeStore(snapshot)} snapshot={snapshot} />);
    expect(screen.queryByTestId("search")).toBeNull();
    expect(screen.queryByLabelText("Search")).toBeNull();
  });
});

describe("a workspace just switched to (ADR 0197's addendum)", () => {
  const owned = (): Snapshot => {
    const snapshot = state();
    return {
      ...snapshot,
      directory: {
        ...snapshot.directory,
        per_arjun: { id: "per_arjun", kind: "person", displayName: "Arjun", role: "owner" },
      },
    } as Snapshot;
  };
  /** The list as drawn the moment a switch hands its workspace the front. */
  function arrived(snapshot: Snapshot) {
    const real = provider.useChips;
    const store = fakeStore(snapshot);
    const device = { deviceId: "dev_primal", participantId: "per_arjun" } as Device;
    const at = Date.now();
    return jest.spyOn(provider, "useChips").mockImplementation(() => ({
      ...real(),
      paired: { device, store, files: undefined } as unknown as ReturnType<typeof real>["paired"],
      arrival: { deviceId: "dev_primal", at },
    }));
  }

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it("holds its rooms back while its setup card is undecided, for 0.6 s at most", async () => {
    jest.useFakeTimers();
    const snapshot = owned();
    arrived(snapshot);
    await render(<List store={fakeStore(snapshot)} snapshot={snapshot} />);
    // The card and the rooms rise together, so neither is drawn while the card is undecided.
    expect(screen.queryByText("Supplier email")).toBeNull();
    await settle(async () => {
      jest.advanceTimersByTime(600);
    });
    expect(screen.getByText("Supplier email")).toBeTruthy();
  });

  it("draws its rooms at once when there is no card to wait for", async () => {
    const snapshot = state();
    arrived(snapshot);
    await render(<List store={fakeStore(snapshot)} snapshot={snapshot} />);
    expect(screen.getByText("Supplier email")).toBeTruthy();
  });
});

describe("the face a person chooses for a space", () => {
  it("wears the mark they chose in place of the initials", async () => {
    const snapshot = {
      ...state(),
      spaceIcons: new Map([["sp_1", { icon: "tent", ground: 7 }]]),
    } as unknown as Snapshot;
    await render(<List store={fakeStore(snapshot)} snapshot={snapshot} />);
    const row = screen.getByLabelText("Supplier email");
    // The initials go; the row still says what it is.
    expect(within(row).queryByText("SE")).toBeNull();
    expect(within(row).getByText("Supplier email")).toBeTruthy();
  });

  it("draws the first family with the picker and the others after it (ADR 0174's addendum)", async () => {
    // Frames on the test's own clock, so none passes until the test lets it.
    jest.useFakeTimers();
    try {
      const snapshot = state();
      await render(<List store={fakeStore(snapshot)} snapshot={snapshot} />);
      await fireEvent(screen.getByLabelText("Supplier email"), "longPress");
      await screen.findByTestId("icon-sheet");
      const first = LIBRARY_FAMILIES[0]?.marks[0];
      const last = LIBRARY_FAMILIES.at(-1)?.marks.at(-1);
      // Nothing is drawn before the grid knows how wide a mark is.
      expect(screen.queryByTestId(`mark-${first}`)).toBeNull();
      await fireEvent(screen.getByTestId("icon-grid"), "layout", {
        nativeEvent: { layout: { x: 0, y: 0, width: 364, height: 600 } },
      });
      expect(screen.getByTestId(`mark-${first}`)).toBeTruthy();
      expect(screen.queryByTestId(`mark-${last}`)).toBeNull();
      // The way out is there at once, past the families still to come.
      expect(screen.getByRole("button", { name: "Use the default" })).toBeTruthy();
      await drawLibrary();
      expect(screen.getByTestId(`mark-${last}`)).toBeTruthy();
    } finally {
      jest.useRealTimers();
    }
  });

  it("offers the whole library, family by family, the new marks with the old", async () => {
    const snapshot = state();
    await render(<List store={fakeStore(snapshot)} snapshot={snapshot} />);
    fireEvent(screen.getByLabelText("Supplier email"), "longPress");
    await screen.findByTestId("icon-sheet");
    await drawLibrary();
    // An old name, and four of the new ones, one of them from People.
    for (const name of ["tent", "burger", "robot", "astronaut", "fingerprint"])
      expect(screen.getByTestId(`mark-${name}`)).toBeTruthy();
    for (const family of [
      "Snack",
      "Silicon",
      "People",
      "Work",
      "Nature",
      "Places",
      "Money",
      "Making",
      "Marks",
    ])
      expect(screen.getByRole("button", { name: family })).toBeTruthy();
  });

  it("opens the sheet on a long press, and saves the mark that is tapped", async () => {
    const snapshot = state();
    const store = fakeStore(snapshot);
    await render(<List store={store} snapshot={snapshot} />);

    expect(screen.queryByTestId("icon-sheet")).toBeNull();
    fireEvent(screen.getByLabelText("Supplier email"), "longPress");
    expect(await screen.findByTestId("icon-sheet")).toBeTruthy();
    await drawLibrary();

    await userEvent.press(screen.getByTestId("mark-tent"));
    // No colour chosen, so the mark lands on the one the room is already wearing rather than
    // on the first swatch — picking a mark should not repaint the room as a side effect.
    expect(store.calls.filter((each) => each.name === "setSpaceIcon")).toEqual([
      {
        name: "setSpaceIcon",
        args: { spaceId: "sp_1", icon: { icon: "tent", ground: avatarHueIndex("Supplier email") } },
      },
    ]);
  });

  it("saves the colour on its own, before any mark has been picked", async () => {
    // The tap that read as a broken button: the swatch ticked and nothing else moved, because
    // the strip wrote only when a mark was already chosen (Arjun, 22 September 2026).
    const snapshot = state();
    const store = fakeStore(snapshot);
    await render(<List store={store} snapshot={snapshot} />);
    fireEvent(screen.getByLabelText("Supplier email"), "longPress");
    await screen.findByTestId("icon-sheet");

    await userEvent.press(screen.getByTestId("ground-5"));
    expect(store.calls.filter((each) => each.name === "setSpaceIcon")).toEqual([
      { name: "setSpaceIcon", args: { spaceId: "sp_1", icon: { icon: "", ground: 5 } } },
    ]);
  });

  it("keeps the mark when the colour under it changes", async () => {
    const snapshot = {
      ...state(),
      spaceIcons: new Map([["sp_1", { icon: "tent", ground: 7 }]]),
    } as unknown as Snapshot;
    const store = fakeStore(snapshot);
    await render(<List store={store} snapshot={snapshot} />);
    fireEvent(screen.getByLabelText("Supplier email"), "longPress");
    await screen.findByTestId("icon-sheet");

    await userEvent.press(screen.getByTestId("ground-5"));
    expect(store.calls.at(-1)).toEqual({
      name: "setSpaceIcon",
      args: { spaceId: "sp_1", icon: { icon: "tent", ground: 5 } },
    });
  });

  it("picks the ground first, so the mark lands on the colour that was chosen", async () => {
    const snapshot = state();
    const store = fakeStore(snapshot);
    await render(<List store={store} snapshot={snapshot} />);
    fireEvent(screen.getByLabelText("Supplier email"), "longPress");
    await screen.findByTestId("icon-sheet");
    await drawLibrary();

    await userEvent.press(screen.getByTestId("ground-5"));
    await userEvent.press(screen.getByTestId("mark-rocket"));
    expect(store.calls.filter((each) => each.name === "setSpaceIcon")).toEqual([
      { name: "setSpaceIcon", args: { spaceId: "sp_1", icon: { icon: "", ground: 5 } } },
      { name: "setSpaceIcon", args: { spaceId: "sp_1", icon: { icon: "rocket", ground: 5 } } },
    ]);
  });

  it("ticks the colour the room is already wearing, not the first swatch", async () => {
    const snapshot = state();
    await render(<List store={fakeStore(snapshot)} snapshot={snapshot} />);
    fireEvent(screen.getByLabelText("Supplier email"), "longPress");
    await screen.findByTestId("icon-sheet");

    // The hue a name hashes to is also its ground index, so the sheet can say which one it is.
    const wearing = avatarHueIndex("Supplier email");
    expect(wearing).not.toBe(0);
    expect(
      screen.getByRole("radio", { name: ICON_GROUND_NAMES[wearing] ?? "", selected: true }),
    ).toBeTruthy();
    expect(screen.queryByRole("radio", { name: "Pink", selected: true })).toBeNull();
  });

  it("offers all twenty-seven colours, and saves one of the new ones", async () => {
    // Twelve until 26 September 2026, when Arjun asked for more: every one is in view at once.
    const snapshot = state();
    const store = fakeStore(snapshot);
    await render(<List store={store} snapshot={snapshot} />);
    fireEvent(screen.getByLabelText("Supplier email"), "longPress");
    await screen.findByTestId("icon-sheet");

    expect(screen.getAllByRole("radio")).toHaveLength(27);
    await userEvent.press(screen.getByRole("radio", { name: "Ink" }));
    expect(store.calls.at(-1)).toEqual({
      name: "setSpaceIcon",
      args: { spaceId: "sp_1", icon: { icon: "", ground: 26 } },
    });
    expect(screen.getByRole("radio", { name: "Ink", selected: true })).toBeTruthy();
  });

  it("says so when the server will not take the pick, instead of looking like a dead tap", async () => {
    const snapshot = state();
    const store = fakeStore(snapshot);
    // What an old server does with a route it has never heard of.
    (store as unknown as { setSpaceIcon: () => Promise<never> }).setSpaceIcon = () =>
      Promise.reject(new Error("/v1/me/space-icons/sp_1 answered 404"));
    await render(<List store={store} snapshot={snapshot} />);
    fireEvent(screen.getByLabelText("Supplier email"), "longPress");
    await screen.findByTestId("icon-sheet");
    await drawLibrary();

    await userEvent.press(screen.getByTestId("mark-tent"));
    expect(await screen.findByTestId("icon-failed")).toHaveTextContent(/older than the app/);
  });

  it("saves a letter or two typed in place of a mark, on the colour the room wears (ADR 0139)", async () => {
    // Typed on the test's own clock: a loaded machine types slower than the save waits.
    jest.useFakeTimers();
    try {
      const snapshot = state();
      const store = fakeStore(snapshot);
      await render(<List store={store} snapshot={snapshot} />);
      await fireEvent(screen.getByLabelText("Supplier email"), "longPress");
      await screen.findByTestId("icon-sheet");

      const field = screen.getByTestId("face-letters");
      // A third letter and a space do not go in: a face holds two.
      await userEvent.type(field, "S EX", { submitEditing: true });
      expect(field).toHaveDisplayValue("SE");
      expect(store.calls.filter((each) => each.name === "setSpaceIcon")).toEqual([
        {
          name: "setSpaceIcon",
          args: {
            spaceId: "sp_1",
            icon: { icon: "", ground: avatarHueIndex("Supplier email"), letters: "SE" },
          },
        },
      ]);
    } finally {
      jest.useRealTimers();
    }
  });

  it("takes an emoji as one letter, wears it as it is typed, and saves once the typing stops", async () => {
    // The clock is the test's: the save waits for the typing to stop, and a loaded machine
    // would otherwise let it land between two lines of this test.
    jest.useFakeTimers();
    try {
      const snapshot = state();
      const store = fakeStore(snapshot);
      await render(<List store={store} snapshot={snapshot} />);
      await fireEvent(screen.getByLabelText("Supplier email"), "longPress");
      const sheet = await screen.findByTestId("icon-sheet");

      await fireEvent.changeText(screen.getByTestId("face-letters"), "🦊🚀🌙");
      expect(screen.getByTestId("face-letters")).toHaveDisplayValue("🦊🚀");
      // Not saved yet, and already worn at the head of the sheet and in the field's tile.
      expect(store.calls.filter((each) => each.name === "setSpaceIcon")).toEqual([]);
      expect(
        within(sheet).getAllByText("🦊🚀", { includeHiddenElements: true }).length,
      ).toBeGreaterThanOrEqual(2);

      await settle(async () => {
        await jest.advanceTimersByTimeAsync(600);
      });
      expect(store.calls.filter((each) => each.name === "setSpaceIcon")).toEqual([
        {
          name: "setSpaceIcon",
          args: {
            spaceId: "sp_1",
            icon: { icon: "", ground: avatarHueIndex("Supplier email"), letters: "🦊🚀" },
          },
        },
      ]);
    } finally {
      jest.useRealTimers();
    }
  });

  it("keeps wearing the letters it saved until the store's face comes back with them", async () => {
    // The store hands a pick to the screen a frame or more after it takes it. The sheet let go of
    // what was typed at the save and wore the old face in between: a flicker at every pause
    // (Arjun, 9 October 2026). This store never comes back at all, so the gap is held open.
    jest.useFakeTimers();
    try {
      const snapshot = state();
      const store = fakeStore(snapshot);
      await render(<List store={store} snapshot={snapshot} />);
      await fireEvent(screen.getByLabelText("Supplier email"), "longPress");
      const sheet = await screen.findByTestId("icon-sheet");

      await fireEvent.changeText(screen.getByTestId("face-letters"), "🦊");
      await settle(async () => {
        await jest.advanceTimersByTimeAsync(600);
      });
      expect(store.calls.filter((each) => each.name === "setSpaceIcon")).toHaveLength(1);
      // Saved, and still worn at the head and in the tile, not the initials it had before.
      expect(
        within(sheet).getAllByText("🦊", { includeHiddenElements: true }).length,
      ).toBeGreaterThanOrEqual(2);
    } finally {
      jest.useRealTimers();
    }
  });

  it("wears a mark the moment it is tapped, before the store has it", async () => {
    const snapshot = state();
    await render(<List store={fakeStore(snapshot)} snapshot={snapshot} />);
    fireEvent(screen.getByLabelText("Supplier email"), "longPress");
    await screen.findByTestId("icon-sheet");
    await drawLibrary();

    await fireEvent.changeText(screen.getByTestId("face-letters"), "AB");
    await fireEvent.press(screen.getByTestId("mark-rocket"));
    expect(screen.getByTestId("mark-rocket")).toBeSelected();
  });

  it("drops letters typed and not yet saved when a mark is tapped instead", async () => {
    // The mark is tapped before the typing has settled, which the test's own clock holds it to.
    jest.useFakeTimers();
    try {
      const snapshot = state();
      const store = fakeStore(snapshot);
      await render(<List store={store} snapshot={snapshot} />);
      await fireEvent(screen.getByLabelText("Supplier email"), "longPress");
      await screen.findByTestId("icon-sheet");
      await drawLibrary();

      await fireEvent.changeText(screen.getByTestId("face-letters"), "AB");
      await fireEvent.press(screen.getByTestId("mark-rocket"));
      await fireEvent(screen.getByTestId("face-letters"), "blur");
      await settle(async () => {
        await jest.advanceTimersByTimeAsync(600);
      });
      expect(store.calls.filter((each) => each.name === "setSpaceIcon")).toEqual([
        {
          name: "setSpaceIcon",
          args: {
            spaceId: "sp_1",
            icon: { icon: "rocket", ground: avatarHueIndex("Supplier email") },
          },
        },
      ]);
      expect(screen.getByTestId("face-letters")).toHaveDisplayValue("");
    } finally {
      jest.useRealTimers();
    }
  });

  it("lets go of the mark it wears the moment letters are typed over it", async () => {
    jest.useFakeTimers();
    try {
      const snapshot = {
        ...state(),
        spaceIcons: new Map([["sp_1", { icon: "rocket", ground: 7 }]]),
      } as unknown as Snapshot;
      await render(<List store={fakeStore(snapshot)} snapshot={snapshot} />);
      await fireEvent(screen.getByLabelText("Supplier email"), "longPress");
      await screen.findByTestId("icon-sheet");
      await drawLibrary();
      expect(screen.getByTestId("mark-rocket")).toBeSelected();

      await fireEvent.changeText(screen.getByTestId("face-letters"), "SE");
      expect(screen.getByTestId("mark-rocket")).not.toBeSelected();
    } finally {
      jest.useRealTimers();
    }
  });

  it("keeps the letters when the colour under them changes, and draws them in the row", async () => {
    const snapshot = {
      ...state(),
      spaceIcons: new Map([["sp_1", { icon: "", ground: 7, letters: "🦊" }]]),
    } as unknown as Snapshot;
    const store = fakeStore(snapshot);
    await render(<List store={store} snapshot={snapshot} />);
    // The face is decorative in its row, which says the name: seen, not read out.
    const row = screen.getByLabelText("Supplier email");
    expect(within(row).getByText("🦊", { includeHiddenElements: true })).toBeTruthy();
    expect(within(row).queryByText("SE", { includeHiddenElements: true })).toBeNull();
    fireEvent(row, "longPress");
    await screen.findByTestId("icon-sheet");
    expect(screen.getByTestId("face-letters")).toHaveDisplayValue("🦊");

    await userEvent.press(screen.getByTestId("ground-5"));
    expect(store.calls.at(-1)).toEqual({
      name: "setSpaceIcon",
      args: { spaceId: "sp_1", icon: { icon: "", ground: 5, letters: "🦊" } },
    });
  });

  it("gives the room its colour back when the letters are cleared", async () => {
    const snapshot = {
      ...state(),
      spaceIcons: new Map([["sp_1", { icon: "", ground: 7, letters: "SE" }]]),
    } as unknown as Snapshot;
    const store = fakeStore(snapshot);
    await render(<List store={store} snapshot={snapshot} />);
    fireEvent(screen.getByLabelText("Supplier email"), "longPress");
    await screen.findByTestId("icon-sheet");

    await userEvent.press(screen.getByTestId("face-letters-clear"));
    await userEvent.press(screen.getByTestId("icon-sheet-close"));
    expect(store.calls.at(-1)).toEqual({
      name: "setSpaceIcon",
      args: { spaceId: "sp_1", icon: { icon: "", ground: 7 } },
    });
  });

  it("puts the face back to the default", async () => {
    const snapshot = {
      ...state(),
      spaceIcons: new Map([["sp_1", { icon: "tent", ground: 7 }]]),
    } as unknown as Snapshot;
    const store = fakeStore(snapshot);
    await render(<List store={store} snapshot={snapshot} />);
    fireEvent(screen.getByLabelText("Supplier email"), "longPress");
    await screen.findByTestId("icon-sheet");

    await userEvent.press(screen.getByLabelText("Use the default"));
    expect(store.calls.at(-1)).toEqual({
      name: "setSpaceIcon",
      args: { spaceId: "sp_1", icon: undefined },
    });
  });
});

describe("pushing a row aside (ADR 0066, ADR 0067)", () => {
  /**
   * Arjun owns the workspace and every room here; Dana is a member of the first. The swipe is a
   * plain view under Jest (`jest.setup.js`), so what it uncovers is reached the way a screen
   * reader reaches it, through the row's own actions — the same acts, the same sheet after.
   */
  function owned(): Snapshot {
    const snapshot = state();
    const roles = { per_arjun: "owner", per_dana: "member" };
    return {
      ...snapshot,
      model: {
        ...snapshot.model,
        people: {
          per_arjun: { id: "per_arjun", role: "owner" },
          per_dana: { id: "per_dana", role: "member" },
        },
        spaces: snapshot.model.spaces.map((space) => ({ ...space, roles })),
      },
    } as unknown as Snapshot;
  }

  const act = (label: string, actionName: string) =>
    fireEvent(screen.getByLabelText(label), "accessibilityAction", { nativeEvent: { actionName } });

  it("offers Archive and Delete to the room's owner, and nothing to a list that does not say who is reading", async () => {
    const snapshot = owned();
    const { rerender } = await render(
      <List store={fakeStore(snapshot)} snapshot={snapshot} selfId="per_arjun" />,
    );
    const names = (label: string) =>
      (screen.getByLabelText(label).props["accessibilityActions"] as { name: string }[]).map(
        (each) => each.name,
      );
    expect(names("Supplier email")).toEqual(["changeIcon", "archive", "delete"]);

    await rerender(
      <SafeAreaProvider initialMetrics={IPHONE}>
        <List store={fakeStore(snapshot)} snapshot={snapshot} selfId="per_dana" />
      </SafeAreaProvider>,
    );
    // Dana is in it but does not own it: she may put it away, not erase it.
    expect(names("Supplier email")).toEqual(["changeIcon", "archive"]);

    await rerender(
      <SafeAreaProvider initialMetrics={IPHONE}>
        <List store={fakeStore(snapshot)} snapshot={snapshot} />
      </SafeAreaProvider>,
    );
    expect(names("Supplier email")).toEqual(["changeIcon"]);
  });

  it("asks before archiving, names the room, and archives it when told to", async () => {
    const snapshot = owned();
    const store = fakeStore(snapshot);
    await render(<List store={store} snapshot={snapshot} selfId="per_arjun" />);

    act("Supplier email", "archive");

    const sheet = await screen.findByTestId("confirm-sheet");
    expect(within(sheet).getByText("Archive Supplier email?")).toBeTruthy();
    expect(within(sheet).getByText("Shall we use Northwind?")).toBeTruthy();
    expect(store.calls.filter((call) => call.name === "updateSpace")).toEqual([]);

    await userEvent.press(within(sheet).getByRole("button", { name: "Archive" }));
    expect(store.calls.filter((call) => call.name === "updateSpace")).toEqual([
      { name: "updateSpace", args: { spaceId: "sp_1", state: "closed" } },
    ]);
  });

  it("does nothing when the sheet is cancelled", async () => {
    const snapshot = owned();
    const store = fakeStore(snapshot);
    await render(<List store={store} snapshot={snapshot} selfId="per_arjun" />);

    act("Supplier email", "delete");
    const sheet = await screen.findByTestId("confirm-sheet");
    await userEvent.press(within(sheet).getByRole("button", { name: "Cancel" }));

    expect(store.calls.filter((call) => /Space$/.test(call.name))).toEqual([]);
  });

  it("asks before deleting, and deletes it from the server when told to", async () => {
    const snapshot = owned();
    const erased: string[] = [];
    const store = Object.assign(fakeStore(snapshot), {
      eraseSpace: async (spaceId: string) => {
        erased.push(spaceId);
      },
    });
    await render(<List store={store} snapshot={snapshot} selfId="per_arjun" />);

    act("Supplier email", "delete");
    const sheet = await screen.findByTestId("confirm-sheet");
    expect(within(sheet).getByText("Delete Supplier email?")).toBeTruthy();
    expect(within(sheet).getByText(/can't be undone/)).toBeTruthy();

    await userEvent.press(within(sheet).getByRole("button", { name: "Delete" }));
    expect(erased).toEqual(["sp_1"]);
  });

  it("keeps the sheet up with the server's reason when it will not delete", async () => {
    const snapshot = owned();
    const store = Object.assign(fakeStore(snapshot), {
      eraseSpace: async () => {
        throw new Error("No route matches that.");
      },
    });
    await render(<List store={store} snapshot={snapshot} selfId="per_arjun" />);

    act("Supplier email", "delete");
    const sheet = await screen.findByTestId("confirm-sheet");
    await userEvent.press(within(sheet).getByRole("button", { name: "Delete" }));

    expect(await screen.findByTestId("confirm-failed")).toHaveTextContent(
      "Not deleted: this server is older than the app, and cannot delete a space yet.",
    );
    expect(screen.getByTestId("confirm-sheet")).toBeTruthy();
  });

  /** The same rooms, each locked (ADR 0156), with Arjun and Dana in them: each is shared (ADR 0234). */
  function locked(): Snapshot {
    const snapshot = owned();
    return {
      ...snapshot,
      model: {
        ...snapshot.model,
        spaces: snapshot.model.spaces.map((space) => ({
          ...space,
          members: ["per_arjun", "per_dana"],
          locked: true,
        })),
      },
    } as unknown as Snapshot;
  }
  const names = (label: string) =>
    (screen.getByLabelText(label).props["accessibilityActions"] as { name: string }[]).map(
      (each) => each.name,
    );

  it("slides a locked room on Locked alone, and an archived one on Unarchive and Locked (ADR 0156)", async () => {
    const snapshot = locked();
    await render(
      <List store={fakeStore(snapshot)} snapshot={snapshot} selfId="per_arjun" selected="sp_3" />,
    );
    // Pin and Hide are the reader's own, so a lock leaves them be (ADRs 0240, 0205); an archived
    // room has neither.
    expect(names("Supplier email, shared")).toEqual(["changeIcon", "pin", "hide", "locked"]);
    expect(names("Last summer's trip, shared")).toEqual(["changeIcon", "unarchive", "locked"]);
  });

  it("opens a locked room from Locked with its sheet up, asking nothing (ADR 0156)", async () => {
    const snapshot = locked();
    const store = fakeStore(snapshot);
    await render(<List store={store} snapshot={snapshot} selfId="per_arjun" />);

    await act("Supplier email, shared", "locked");

    expect(pushed).toEqual(["/spaces/sp_1?sheet=1"]);
    expect(screen.queryByTestId("confirm-sheet")).toBeNull();
    expect(store.calls.filter((call) => /Space$/.test(call.name))).toEqual([]);
  });

  it("opens a locked room beside the list from Locked, where there is no sheet to put up", async () => {
    const snapshot = locked();
    const opened: string[] = [];
    await render(
      <List
        store={fakeStore(snapshot)}
        snapshot={snapshot}
        selfId="per_arjun"
        onOpen={(id) => opened.push(id)}
      />,
    );

    await act("Supplier email, shared", "locked");

    expect(opened).toEqual(["sp_1"]);
    expect(pushed).toEqual([]);
  });

  /** The room as the store has it once the act has gone through. */
  function with1(change: Partial<Space>, from: Snapshot = owned()): Snapshot {
    return {
      ...from,
      model: {
        ...from.model,
        spaces: from.model.spaces.map((space) =>
          space.id === "sp_1" ? { ...space, ...change } : space,
        ),
      },
    } as Snapshot;
  }

  it("keeps an archived room where it stood until the sheet has sunk, then lets it go (ADR 0205's addendum)", async () => {
    const snapshot = owned();
    const store = fakeStore(snapshot);
    const view = await render(<List store={store} snapshot={snapshot} selfId="per_arjun" />);

    act("Supplier email", "archive");
    const sheet = await screen.findByTestId("confirm-sheet");
    await userEvent.press(within(sheet).getByRole("button", { name: "Archive" }));
    const archived = with1({ state: "closed" });
    await view.rerender(
      <SafeAreaProvider initialMetrics={IPHONE}>
        <List store={store} snapshot={archived} selfId="per_arjun" />
      </SafeAreaProvider>,
    );

    // Still drawn where it stood, open, while the sheet sinks.
    expect(screen.getByLabelText("Supplier email")).toBeTruthy();
    await waitFor(() => expect(screen.queryByLabelText("Supplier email")).toBeNull());
    expect(screen.getByRole("button", { name: "Archived, 2" })).toBeTruthy();
  });

  it("lets a deleted room go once it has gone off the list", async () => {
    const snapshot = owned();
    const store = fakeStore(snapshot);
    const view = await render(<List store={store} snapshot={snapshot} selfId="per_arjun" />);
    const gone = {
      ...snapshot,
      model: {
        ...snapshot.model,
        spaces: snapshot.model.spaces.filter((space) => space.id !== "sp_1"),
      },
    } as Snapshot;
    await view.rerender(
      <SafeAreaProvider initialMetrics={IPHONE}>
        <List store={store} snapshot={gone} selfId="per_arjun" />
      </SafeAreaProvider>,
    );
    await waitFor(() => expect(screen.queryByLabelText("Supplier email")).toBeNull());
  });

  it("brings an archived room back at once, without asking", async () => {
    const snapshot = owned();
    const store = fakeStore(snapshot);
    await render(<List store={store} snapshot={snapshot} selfId="per_arjun" selected="sp_3" />);

    act("Last summer's trip", "unarchive");

    expect(screen.queryByTestId("confirm-sheet")).toBeNull();
    expect(store.calls.filter((call) => call.name === "updateSpace")).toEqual([
      { name: "updateSpace", args: { spaceId: "sp_3", state: "open" } },
    ]);
  });
});

describe("hiding a room from your own list (ADR 0205)", () => {
  /**
   * Arjun owns the workspace; he and Dana are in the first room, which he may hide, and every row is
   * named shared for it (ADR 0234).
   */
  function shared(hidden: readonly string[] = []): Snapshot {
    const snapshot = state();
    const roles = { per_arjun: "owner", per_dana: "member" };
    return {
      ...snapshot,
      hiddenSpaces: new Set(hidden),
      model: {
        ...snapshot.model,
        people: {
          per_arjun: { id: "per_arjun", role: "owner" },
          per_dana: { id: "per_dana", role: "member" },
        },
        spaces: snapshot.model.spaces.map((space) => ({
          ...space,
          members: ["per_arjun", "per_dana"],
          roles,
        })),
      },
    } as unknown as Snapshot;
  }
  const act = (label: string, actionName: string) =>
    fireEvent(screen.getByLabelText(label), "accessibilityAction", { nativeEvent: { actionName } });
  const names = (label: string) =>
    (screen.getByLabelText(label).props["accessibilityActions"] as { name: string }[]).map(
      (each) => each.name,
    );

  it("offers Hide on the row pushed right, after Pin, before what its left offers", async () => {
    const snapshot = shared();
    await render(<List store={fakeStore(snapshot)} snapshot={snapshot} selfId="per_arjun" />);
    expect(names("Supplier email, shared")).toEqual([
      "changeIcon",
      "pin",
      "hide",
      "archive",
      "delete",
    ]);
  });

  it("hides at once, asking nothing", async () => {
    const snapshot = shared();
    const store = fakeStore(snapshot);
    await render(<List store={store} snapshot={snapshot} selfId="per_arjun" />);

    await act("Supplier email, shared", "hide");

    expect(screen.queryByTestId("confirm-sheet")).toBeNull();
    expect(store.calls.filter((call) => call.name === "setSpaceHidden")).toEqual([
      { name: "setSpaceHidden", args: { spaceId: "sp_1", hidden: true } },
    ]);
  });

  it("keeps a hidden room behind its own heading, over Archived, quiet when shown", async () => {
    const snapshot = shared(["sp_1"]);
    const store = fakeStore(snapshot);
    await render(<List store={store} snapshot={snapshot} selfId="per_arjun" />);
    expect(screen.queryByText("Supplier email")).toBeNull();
    const headings = [screen.getByTestId("hidden-toggle"), screen.getByTestId("archived-toggle")];
    expect(headings.map((each) => each.props["accessibilityLabel"])).toEqual([
      "Hidden, 1",
      "Archived, 1",
    ]);

    await userEvent.press(screen.getByRole("button", { name: "Hidden, 1" }));

    expect(screen.getByLabelText("Supplier email, shared, hidden")).toBeTruthy();
    expect(screen.getByTestId("hidden-mark")).toBeTruthy();
    // Its unread is kept, in grey where an open room's is gold.
    const count = StyleSheet.flatten(screen.getByTestId("unread").props["style"]);
    expect(count.backgroundColor).toBe(light.surface3);
    // Pushed right, it offers Unhide, at once.
    expect(names("Supplier email, shared, hidden")).toEqual([
      "changeIcon",
      "unhide",
      "archive",
      "delete",
    ]);
    await act("Supplier email, shared, hidden", "unhide");
    expect(store.calls.filter((call) => call.name === "setSpaceHidden")).toEqual([
      { name: "setSpaceHidden", args: { spaceId: "sp_1", hidden: false } },
    ]);
  });

  it("shows the hidden ones when the room open beside the list is one of them", async () => {
    const snapshot = shared(["sp_1"]);
    await render(
      <List store={fakeStore(snapshot)} snapshot={snapshot} selfId="per_arjun" selected="sp_1" />,
    );
    expect(screen.getByLabelText("Supplier email, shared, hidden")).toBeTruthy();
  });

  it("offers no Hide on an archived room, and Unhide on one hidden before it was archived", async () => {
    const snapshot = shared(["sp_3"]);
    await render(
      <List store={fakeStore(snapshot)} snapshot={snapshot} selfId="per_arjun" selected="sp_3" />,
    );
    // Archived wins: it stands under Archived, and there is no Hidden heading.
    expect(screen.queryByTestId("hidden-toggle")).toBeNull();
    expect(names("Last summer's trip, shared, hidden")).toEqual([
      "changeIcon",
      "unhide",
      "unarchive",
      "delete",
    ]);
  });

  it("says why a hide did not hold", async () => {
    const snapshot = shared();
    const store = Object.assign(fakeStore(snapshot), {
      setSpaceHidden: async () => {
        throw new Error("No route matches that.");
      },
    });
    await render(<List store={store} snapshot={snapshot} selfId="per_arjun" />);

    await act("Supplier email, shared", "hide");

    expect(await screen.findByText("Not hidden: this server is older than the app.")).toBeTruthy();
  });
});

describe("pinning a room to the top of your own list (ADR 0240)", () => {
  /** Arjun owns the workspace; he and Dana are in every room, so each is shared (ADR 0234). */
  function pinning(pinned: readonly string[] = [], hidden: readonly string[] = []): Snapshot {
    const snapshot = state();
    const roles = { per_arjun: "owner", per_dana: "member" };
    return {
      ...snapshot,
      pinnedSpaces: pinned,
      hiddenSpaces: new Set(hidden),
      model: {
        ...snapshot.model,
        people: {
          per_arjun: { id: "per_arjun", role: "owner" },
          per_dana: { id: "per_dana", role: "member" },
        },
        spaces: snapshot.model.spaces.map((space) => ({
          ...space,
          members: ["per_arjun", "per_dana"],
          roles,
        })),
      },
    } as unknown as Snapshot;
  }
  const act = (label: string, actionName: string) =>
    fireEvent(screen.getByLabelText(label), "accessibilityAction", { nativeEvent: { actionName } });
  const names = (label: string) =>
    (screen.getByLabelText(label).props["accessibilityActions"] as { name: string }[]).map(
      (each) => each.name,
    );
  /** The open rooms, top to bottom, by the swipe each row stands on. */
  const order = () =>
    screen.getAllByTestId(/^swipe-sp_/).map((row) => String(row.props["testID"]).slice(6));
  const pins = (store: ReturnType<typeof fakeStore>) =>
    store.calls.filter((call) => call.name === "setSpacePinned");

  afterEach(() => {
    jest.useRealTimers();
  });

  it("pins at once, asking nothing, a beat after the row starts home", async () => {
    jest.useFakeTimers();
    const snapshot = pinning();
    const store = fakeStore(snapshot);
    await render(<List store={store} snapshot={snapshot} selfId="per_arjun" />);

    await act("Supplier email, shared", "pin");

    expect(screen.queryByTestId("confirm-sheet")).toBeNull();
    // The rows are armed to glide first; the pin is asked once they are.
    expect(pins(store)).toEqual([]);
    await settle(async () => {
      jest.advanceTimersByTime(200);
    });
    expect(pins(store)).toEqual([
      { name: "setSpacePinned", args: { spaceId: "sp_1", pinned: true } },
    ]);
  });

  it("stands the pinned rooms first, the newest pin on top, each with a pin before its time", async () => {
    // sp_1 was busier last, so it would stand first; pinned, sp_2 stands over it.
    const snapshot = pinning(["sp_2"]);
    const store = fakeStore(snapshot);
    await render(<List store={store} snapshot={snapshot} selfId="per_arjun" />);
    expect(order()).toEqual(["sp_2", "sp_1"]);
    expect(screen.getAllByTestId("pinned-mark")).toHaveLength(1);
    expect(names("Supplier email, shared")).toEqual([
      "changeIcon",
      "pin",
      "hide",
      "archive",
      "delete",
    ]);
  });

  it("offers Unpin on a pinned row, which lets it go back to its place", async () => {
    jest.useFakeTimers();
    const snapshot = pinning(["sp_1"]);
    const store = fakeStore(snapshot);
    await render(<List store={store} snapshot={snapshot} selfId="per_arjun" />);
    expect(names("Supplier email, shared")).toEqual([
      "changeIcon",
      "unpin",
      "hide",
      "archive",
      "delete",
    ]);

    await act("Supplier email, shared", "unpin");
    await settle(async () => {
      jest.advanceTimersByTime(200);
    });

    expect(pins(store)).toEqual([
      { name: "setSpacePinned", args: { spaceId: "sp_1", pinned: false } },
    ]);
  });

  it("offers no Pin on a hidden room, and draws no pin on it, though it keeps its pin", async () => {
    const snapshot = pinning(["sp_1"], ["sp_1"]);
    await render(
      <List store={fakeStore(snapshot)} snapshot={snapshot} selfId="per_arjun" selected="sp_1" />,
    );
    expect(names("Supplier email, shared, hidden")).toEqual([
      "changeIcon",
      "unhide",
      "archive",
      "delete",
    ]);
    expect(screen.queryByTestId("pinned-mark")).toBeNull();
  });

  it("says why a pin did not hold", async () => {
    jest.useFakeTimers();
    const snapshot = pinning();
    const store = Object.assign(fakeStore(snapshot), {
      setSpacePinned: async () => {
        throw new Error("No route matches that.");
      },
    });
    await render(<List store={store} snapshot={snapshot} selfId="per_arjun" />);

    await act("Supplier email, shared", "pin");
    await settle(async () => {
      jest.advanceTimersByTime(200);
    });

    expect(await screen.findByText("Not pinned: this server is older than the app.")).toBeTruthy();
  });
});

describe("picking rows to archive or delete together (ADR 0181)", () => {
  /**
   * Arjun owns the workspace and every room, as above, with two more rooms: one whose changes are
   * locked (ADR 0156) and Jacobian's Main room (ADR 0069). Dana is in each, so each is shared (ADR
   * 0234). The motion is plain views under Jest
   * (`jest.setup.js`): a row says whether it is picked as a checkbox, and a fold lands at once.
   */
  function rooms(change: (space: Space) => Space = (space) => space): Snapshot {
    const snapshot = state();
    const roles = { per_arjun: "owner", per_dana: "member" };
    const base = snapshot.model.spaces[0] as Space;
    const extra = [
      { ...base, id: "sp_4", title: "Trip to India", locked: true, lines: [] },
      { ...base, id: "sp_5", title: "Jacobian main", home: true, lines: [] },
    ];
    return {
      ...snapshot,
      model: {
        ...snapshot.model,
        people: {
          per_arjun: { id: "per_arjun", role: "owner" },
          per_dana: { id: "per_dana", role: "member" },
        },
        spaces: [...snapshot.model.spaces, ...extra].map((space) =>
          change({ ...space, roles, members: ["per_arjun", "per_dana"] } as unknown as Space),
        ),
      },
    } as unknown as Snapshot;
  }

  const press = (name: string) => userEvent.press(screen.getByRole("button", { name }));
  const pick = (name: RegExp | string) => userEvent.press(screen.getByRole("checkbox", { name }));

  it("turns each row into a checkbox from Select, counts what each act would take, and back on Done", async () => {
    const snapshot = rooms();
    await render(<List store={fakeStore(snapshot)} snapshot={snapshot} selfId="per_arjun" />);

    await press("Select");
    expect(screen.getByText("Select spaces")).toBeTruthy();
    // The list keeps room under its last row for the bar, opened as the bar rises (`PickRoom`).
    expect(StyleSheet.flatten(screen.getByTestId("pick-room").props["style"])).toEqual({
      height: BAR_HEIGHT + SPACE.xxl,
      marginTop: -SPACE.md,
    });
    expect(screen.getByRole("checkbox", { name: "Supplier email, shared" })).not.toBeChecked();
    expect(screen.queryByRole("button", { name: "Supplier email, shared" })).toBeNull();

    await pick("Supplier email, shared");
    expect(screen.getByRole("checkbox", { name: "Supplier email, shared" })).toBeChecked();
    expect(screen.getByText("1 selected")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Archive 1" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Delete 1" })).toBeTruthy();

    await press("Done");
    expect(screen.getByRole("button", { name: "Supplier email, shared" })).toBeTruthy();
    expect(screen.queryByTestId("pick-bar")).toBeNull();
    expect(screen.queryByTestId("pick-room")).toBeNull();
  });

  it("draws again only the row picked, and for a word about one room only that room's row", async () => {
    const motion = jest.requireMock<{ PickRow: (props: unknown) => unknown }>("./SelectMotion");
    const drawn = jest.spyOn(motion, "PickRow");
    const titles = () =>
      drawn.mock.calls.map(
        ([props]) =>
          (props as { children: { props: { space: Space } }[] }).children[0]?.props.space.title,
      );
    const snapshot = rooms();
    const view = await render(
      <List store={fakeStore(snapshot)} snapshot={snapshot} selfId="per_arjun" />,
    );
    await press("Select");

    drawn.mockClear();
    await pick("Supplier email, shared");
    expect(titles()).toEqual(["Supplier email"]);

    // Somebody renamed one room: the store's new snapshot keeps every other room as it was.
    drawn.mockClear();
    const renamed = {
      ...snapshot,
      model: {
        ...snapshot.model,
        spaces: snapshot.model.spaces.map((space) =>
          space.id === "sp_4" ? { ...space, title: "Trip to Goa" } : space,
        ),
      },
    } as Snapshot;
    await view.rerender(
      <SafeAreaProvider initialMetrics={IPHONE}>
        <List store={fakeStore(renamed)} snapshot={renamed} selfId="per_arjun" />
      </SafeAreaProvider>,
    );
    expect(titles()).toEqual(["Trip to Goa"]);
    drawn.mockRestore();
  });

  it("can't pick a locked room or the Main room, and says why when one is pressed", async () => {
    const snapshot = rooms();
    await render(<List store={fakeStore(snapshot)} snapshot={snapshot} selfId="per_arjun" />);
    await press("Select");
    expect(screen.getByText("Locked spaces and Main can't be picked")).toBeTruthy();

    await pick("Trip to India, shared, locked");
    expect(
      screen.getByRole("checkbox", { name: "Trip to India, shared, locked" }),
    ).not.toBeChecked();
    expect(screen.getByTestId("pick-note")).toHaveTextContent(
      "Trip to India is locked. Unlock it in its details to archive or delete it.",
    );

    await pick("Jacobian main, Main space, shared, can't be picked");
    expect(screen.getByTestId("pick-note")).toHaveTextContent(
      "Jacobian main is the Main space. It's always here.",
    );
    expect(screen.queryByText(/selected$/)).toBeNull();
  });

  it("picks every row it can from Select all, and lets them all go again", async () => {
    const snapshot = rooms();
    await render(<List store={fakeStore(snapshot)} snapshot={snapshot} selfId="per_arjun" />);
    await press("Select");

    await press("Select all");
    // The two open rooms; not the locked one, not the Main room, not the archived one out of sight.
    expect(screen.getByText("2 selected")).toBeTruthy();
    await press("Deselect all");
    expect(screen.getByText("Select spaces")).toBeTruthy();
  });

  it("archives the picked rooms after asking once, and stops picking", async () => {
    const snapshot = rooms();
    const store = fakeStore(snapshot);
    await render(<List store={store} snapshot={snapshot} selfId="per_arjun" />);
    await press("Select");
    await pick("Supplier email, shared");
    await pick("You, Dana Ruiz, shared");

    await press("Archive 2");
    const sheet = await screen.findByTestId("confirm-sheet");
    expect(within(sheet).getByText("Archive 2 spaces?")).toBeTruthy();
    expect(within(sheet).getByText("Supplier email and You, Dana Ruiz")).toBeTruthy();
    expect(store.calls.filter((call) => call.name === "updateSpace")).toEqual([]);

    await userEvent.press(within(sheet).getByRole("button", { name: "Archive 2" }));
    expect(store.calls.filter((call) => call.name === "updateSpace")).toEqual([
      { name: "updateSpace", args: { spaceId: "sp_1", state: "closed" } },
      { name: "updateSpace", args: { spaceId: "sp_2", state: "closed" } },
    ]);
    expect(screen.getByRole("button", { name: "Select" })).toBeTruthy();
  });

  it("deletes what it may, room by room, and names a picked room it can only archive", async () => {
    // The untitled room is Arjun and Dana's own: nobody can open it again, so it is only archived.
    const snapshot = rooms((space) =>
      space.id === "sp_2" ? ({ ...space, kind: "direct" } as Space) : space,
    );
    const erased: { spaceId: string; options: unknown }[] = [];
    const store = Object.assign(fakeStore(snapshot), {
      eraseSpace: async (spaceId: string, options: unknown) => {
        erased.push({ spaceId, options });
      },
    });
    await render(<List store={store} snapshot={snapshot} selfId="per_arjun" />);
    await press("Select");
    await pick("Supplier email, shared");
    await pick("You, Dana Ruiz, shared");
    expect(screen.getByRole("button", { name: "Archive 2" })).toBeTruthy();

    await press("Delete 1");
    const sheet = await screen.findByTestId("confirm-sheet");
    expect(within(sheet).getByText("Delete Supplier email?")).toBeTruthy();
    expect(
      within(sheet).getByText("You, Dana Ruiz stays: you can only archive that space."),
    ).toBeTruthy();

    await userEvent.press(within(sheet).getByRole("button", { name: "Delete" }));
    expect(erased).toEqual([{ spaceId: "sp_1", options: { deleteAgent: false } }]);
    expect(screen.getByRole("button", { name: "Select" })).toBeTruthy();
  });

  it("keeps the sheet up with the rooms the server would not delete, and why", async () => {
    const snapshot = rooms();
    const erased: string[] = [];
    const store = Object.assign(fakeStore(snapshot), {
      eraseSpace: async (spaceId: string) => {
        if (spaceId === "sp_2") throw new Error("No route matches that.");
        erased.push(spaceId);
      },
    });
    await render(<List store={store} snapshot={snapshot} selfId="per_arjun" />);
    await press("Select");
    await pick("Supplier email, shared");
    await pick("You, Dana Ruiz, shared");

    await press("Delete 2");
    const sheet = await screen.findByTestId("confirm-sheet");
    expect(within(sheet).getByText("Delete 2 spaces?")).toBeTruthy();
    await userEvent.press(within(sheet).getByRole("button", { name: "Delete 2" }));

    expect(erased).toEqual(["sp_1"]);
    expect(await screen.findByTestId("confirm-failed")).toHaveTextContent(
      "1 deleted. You, Dana Ruiz was not deleted: this server is older than the app, and cannot delete a space yet.",
    );
    // Asked again, it is about the one that is left.
    expect(
      within(screen.getByTestId("confirm-sheet")).getByText("Delete You, Dana Ruiz?"),
    ).toBeTruthy();
  });

  it("holds a deleted room where it stood under the pinned rooms until it goes (ADR 0181's addendum)", async () => {
    const snapshot = { ...rooms(), pinnedSpaces: ["sp_2"] } as Snapshot;
    const store = Object.assign(fakeStore(snapshot), { eraseSpace: async () => undefined });
    const view = await render(<List store={store} snapshot={snapshot} selfId="per_arjun" />);
    const order = () =>
      screen.getAllByTestId(/^swipe-sp_/).map((row) => String(row.props["testID"]).slice(6));
    const stood = order();
    expect(stood.slice(0, 2)).toEqual(["sp_2", "sp_1"]);

    await press("Select");
    await pick("Supplier email, shared");
    await press("Delete 1");
    const sheet = await screen.findByTestId("confirm-sheet");
    await userEvent.press(within(sheet).getByRole("button", { name: "Delete" }));
    const gone = {
      ...snapshot,
      model: {
        ...snapshot.model,
        spaces: snapshot.model.spaces.filter((space) => space.id !== "sp_1"),
      },
    } as Snapshot;
    await view.rerender(
      <SafeAreaProvider initialMetrics={IPHONE}>
        <List store={store} snapshot={gone} selfId="per_arjun" />
      </SafeAreaProvider>,
    );

    // Gone from the store, it is still drawn where it stood, under the pin, not where the store
    // had it before the pins were put first.
    expect(order()).toEqual(stood);
    await waitFor(() => expect(order()).toEqual(stood.filter((id) => id !== "sp_1")));
  });

  it("brings picked archived rooms back at once, as their swipe does", async () => {
    const snapshot = rooms();
    const store = fakeStore(snapshot);
    await render(<List store={store} snapshot={snapshot} selfId="per_arjun" />);
    await press("Archived, 1");
    await press("Select");
    await pick("Last summer's trip, shared");

    await press("Unarchive 1");
    expect(screen.queryByTestId("confirm-sheet")).toBeNull();
    expect(store.calls.filter((call) => call.name === "updateSpace")).toEqual([
      { name: "updateSpace", args: { spaceId: "sp_3", state: "open" } },
    ]);
  });

  it("reads every room from Read all, locked, Main and archived ones too, and stops picking", async () => {
    const said = {
      id: "z",
      seq: 9,
      kind: "text",
      authorId: "per_dana",
      authorKind: "person",
      text: "Anyone?",
      ts: "2026-09-07T12:00:00.000Z",
    };
    // Nothing read: Supplier email and the archived trip have lines, and so do these two now.
    const snapshot = {
      ...rooms((space) =>
        space.id === "sp_4" || space.id === "sp_5" ? ({ ...space, lines: [said] } as Space) : space,
      ),
      readState: {},
    } as Snapshot;
    const store = fakeStore(snapshot);
    await render(<List store={store} snapshot={snapshot} selfId="per_arjun" />);
    await press("Select");
    expect(screen.getByRole("button", { name: "Archive" })).toBeDisabled();

    await press("Read all");
    const read = store.calls.filter((call) => call.name === "markSpacesRead");
    expect(read.map((call) => [...(call.args as string[])].sort())).toEqual([
      ["sp_1", "sp_3", "sp_4", "sp_5"],
    ]);
    expect(screen.getByRole("button", { name: "Select" })).toBeTruthy();
    expect(screen.queryByTestId("pick-bar")).toBeNull();
  });

  it("reads only the picked rooms once some are picked, and counts those with anything unread", async () => {
    const snapshot = rooms();
    const store = fakeStore(snapshot);
    await render(<List store={store} snapshot={snapshot} selfId="per_arjun" />);
    await press("Select");
    await pick("You, Dana Ruiz, shared");
    // Nothing unread in it: Read waits, greyed.
    expect(screen.getByRole("button", { name: "Read" })).toBeDisabled();

    await pick("Supplier email, shared");
    await press("Read 1");
    expect(store.calls.filter((call) => call.name === "markSpacesRead")).toEqual([
      { name: "markSpacesRead", args: ["sp_1"] },
    ]);
  });

  it("keeps Read all on the bar, greyed, when nothing is unread", async () => {
    const snapshot = { ...rooms(), readState: { sp_1: 3, sp_3: 1 } } as Snapshot;
    await render(<List store={fakeStore(snapshot)} snapshot={snapshot} selfId="per_arjun" />);
    await press("Select");
    expect(screen.getByRole("button", { name: "Read all" })).toBeDisabled();
  });

  it("offers no Select to a list that does not say who is reading", async () => {
    const snapshot = rooms();
    await render(<List store={fakeStore(snapshot)} snapshot={snapshot} />);
    expect(screen.queryByRole("button", { name: "Select" })).toBeNull();
  });
});

describe("a list with no rooms to show (ADR 0131)", () => {
  /** The snapshot with no rooms in it, and whatever else is said of the moment. */
  function empty(more: Partial<Snapshot>): Snapshot {
    const snapshot = state();
    return {
      ...snapshot,
      model: { ...snapshot.model, spaces: [] },
      ...more,
    } as unknown as Snapshot;
  }

  it("says nothing at all while the cache is still being read", async () => {
    const snapshot = empty({ connection: "connecting", readingCache: true });
    await render(<List store={fakeStore(snapshot)} snapshot={snapshot} />);
    expect(screen.queryByText(/No spaces yet/)).toBeNull();
    expect(screen.queryByText("Reaching your server")).toBeNull();
  });

  it("says the server is being reached, and which, rather than that there are no rooms", async () => {
    const snapshot = empty({ connection: "connecting" });
    await render(<List store={fakeStore(snapshot)} snapshot={snapshot} server="100.64.0.7:4431" />);
    expect(screen.getByText("Reaching your server")).toBeTruthy();
    expect(screen.getByText("100.64.0.7:4431")).toBeTruthy();
    expect(screen.queryByText(/No spaces yet/)).toBeNull();
  });

  /** Fake timers for one test: with no room kept, trouble is said after four seconds of it. */
  async function patiently(test: () => Promise<void>): Promise<void> {
    jest.useFakeTimers();
    try {
      await test();
    } finally {
      jest.useRealTimers();
    }
  }
  const waitOut = () =>
    settle(async () => {
      jest.advanceTimersByTime(4000);
    });

  it("is patient with a launch's blip, then says why the server cannot be reached and tries again", () =>
    patiently(async () => {
      // His iPhone through the relay (14 October 2026): a socket closing and opening again in a
      // second or two at launch is not "Can't reach your server"; it is the server being reached.
      const snapshot = empty({ connection: "closed", awaiting: 4 });
      const store = fakeStore(snapshot);
      await render(<List store={store} snapshot={snapshot} />);
      expect(screen.getByText("Reaching your server")).toBeTruthy();
      expect(screen.queryByText("Can't reach your server")).toBeNull();
      await waitOut();
      expect(screen.getByText("Can't reach your server")).toBeTruthy();
      fireEvent.press(screen.getByLabelText("Try again"));
      expect(store.calls.filter((call) => call.name === "wake")).toHaveLength(1);
    }));

  it("times its patience from the first trouble, not from each try", () =>
    patiently(async () => {
      const closed = empty({ connection: "closed" });
      const view = await render(<List store={fakeStore(closed)} snapshot={closed} />);
      await settle(async () => {
        jest.advanceTimersByTime(2500);
      });
      // The socket tries again and closes again: the wait goes on from where it was.
      const trying = empty({ connection: "connecting" });
      await view.rerender(
        <SafeAreaProvider initialMetrics={IPHONE}>
          <List store={fakeStore(trying)} snapshot={trying} />
        </SafeAreaProvider>,
      );
      await view.rerender(
        <SafeAreaProvider initialMetrics={IPHONE}>
          <List store={fakeStore(closed)} snapshot={closed} />
        </SafeAreaProvider>,
      );
      expect(screen.getByText("Reaching your server")).toBeTruthy();
      await settle(async () => {
        jest.advanceTimersByTime(1500);
      });
      expect(screen.getByText("Can't reach your server")).toBeTruthy();
    }));

  it("says at once what waiting cannot change", () =>
    patiently(async () => {
      // A key the workspace no longer knows does not come back by itself.
      const snapshot = empty({ connection: "rejected" });
      await render(<List store={fakeStore(snapshot)} snapshot={snapshot} />);
      expect(screen.getByText("This phone isn't paired anymore")).toBeTruthy();
    }));

  it("welcomes somebody let in by an invite: who, as what, and what comes next (JR-4)", async () => {
    const joined = (role: "member" | "guest") =>
      ({
        ...empty({ connection: "open", awaiting: 0 }),
        directory: {
          per_arjun: { id: "per_arjun", kind: "person", displayName: "Arjun" },
          per_dana: { id: "per_dana", kind: "person", displayName: "Dana" },
        },
        model: {
          ...state().model,
          spaces: [],
          people: {
            per_arjun: {
              participantId: "per_arjun",
              displayName: "Arjun",
              role: "owner",
              joinedAt: "t0",
            },
            per_dana: {
              participantId: "per_dana",
              displayName: "Dana",
              role,
              joinedAt: "t1",
              invitedBy: "per_arjun",
            },
          },
        },
      }) as unknown as Snapshot;
    const member = joined("member");
    await render(<List store={fakeStore(member)} snapshot={member} selfId="per_dana" />);
    expect(screen.getByTestId("no-rooms-welcome")).toBeTruthy();
    expect(screen.getByText(/Arjun invited you as a member\./)).toBeTruthy();
    // A member is added to spaces: an owner or an admin opens them (ADR 0196).
    expect(screen.queryByLabelText("Create a space")).toBeNull();
    expect(screen.queryByText(/No spaces yet/)).toBeNull();
  });

  it("offers a guest let in by an invite no space of their own (JR-4)", async () => {
    const joined = (role: "member" | "guest") =>
      ({
        ...empty({ connection: "open", awaiting: 0 }),
        directory: {
          per_arjun: { id: "per_arjun", kind: "person", displayName: "Arjun" },
          per_dana: { id: "per_dana", kind: "person", displayName: "Dana" },
        },
        model: {
          ...state().model,
          spaces: [],
          people: {
            per_arjun: {
              participantId: "per_arjun",
              displayName: "Arjun",
              role: "owner",
              joinedAt: "t0",
            },
            per_dana: {
              participantId: "per_dana",
              displayName: "Dana",
              role,
              joinedAt: "t1",
              invitedBy: "per_arjun",
            },
          },
        },
      }) as unknown as Snapshot;
    const guest = joined("guest");
    await render(<List store={fakeStore(guest)} snapshot={guest} selfId="per_dana" />);
    expect(screen.getByText(/Arjun invited you as a guest\./)).toBeTruthy();
    expect(screen.queryByLabelText("Create a space")).toBeNull();
  });

  it("says under a guest's one space why it's their only one, and nothing to anybody else (ADR 0196)", async () => {
    const base = state();
    const trip = {
      ...base.model.spaces[0],
      title: "Japan trip",
      members: ["per_arjun", "per_dana"],
    };
    const as = (role: "member" | "guest") =>
      ({
        ...base,
        model: {
          ...base.model,
          spaces: [trip],
          people: {
            per_arjun: {
              participantId: "per_arjun",
              displayName: "Arjun",
              role: "owner",
              joinedAt: "t0",
            },
            per_dana: {
              participantId: "per_dana",
              displayName: "Dana",
              role,
              joinedAt: "t1",
              invitedBy: "per_arjun",
            },
          },
        },
      }) as unknown as Snapshot;
    const guest = as("guest");
    const { unmount } = await render(
      <List store={fakeStore(guest)} snapshot={guest} selfId="per_dana" />,
    );
    expect(screen.getByTestId("spaces-guest-note")).toHaveTextContent(
      "You're Arjun's guest in Japan trip, so it's your one space here.",
    );
    await unmount();
    const member = as("member");
    for (const selfId of ["per_dana", "per_arjun"]) {
      const shown = await render(
        <List store={fakeStore(member)} snapshot={member} selfId={selfId} />,
      );
      expect(screen.getByText("Japan trip")).toBeTruthy();
      expect(screen.queryByTestId("spaces-guest-note")).toBeNull();
      await shown.unmount();
    }
  });

  it("offers to pair again when the workspace no longer knows this phone", async () => {
    const snapshot = empty({ connection: "rejected" });
    await render(<List store={fakeStore(snapshot)} snapshot={snapshot} />);
    expect(screen.getByText("This phone isn't paired anymore")).toBeTruthy();
    await userEvent.press(screen.getByLabelText("Pair again"));
    expect(pushed).toEqual(["/pair"]);
  });

  it("says its person was removed, in place of the rooms it still holds, and offers no pairing (ADR 0160)", async () => {
    const snapshot = { ...state(), connection: "removed" } as Snapshot;
    await render(<List store={fakeStore(snapshot)} snapshot={snapshot} />);
    expect(screen.getByTestId("no-rooms-removed")).toBeTruthy();
    expect(screen.getByText("You're no longer in this workspace")).toBeTruthy();
    expect(screen.getByText(/To come back, ask for a new invite\./)).toBeTruthy();
    expect(screen.getByLabelText("OK")).toBeTruthy();
    expect(screen.queryByLabelText("Pair again")).toBeNull();
    expect(screen.queryByText("Supplier email")).toBeNull();
  });

  it("holds places for the rooms a hello listed while they come in", async () => {
    const snapshot = empty({ connection: "open", awaiting: 3 });
    await render(<List store={fakeStore(snapshot)} snapshot={snapshot} />);
    expect(screen.getByLabelText("Loading your spaces")).toBeTruthy();
    expect(screen.queryByText(/No spaces yet/)).toBeNull();
  });

  it("says there are none only once the server has, and offers to make one", async () => {
    mockNewSpace.harnesses = [
      { id: "hrn_j", displayName: "Jacobian" },
      { id: "hrn_oc", displayName: "OpenClaw" },
    ];
    const snapshot = empty({ connection: "open", awaiting: 0 });
    await render(<List store={fakeStore(snapshot)} snapshot={snapshot} />);
    expect(screen.getByText("No spaces yet")).toBeTruthy();
    expect(screen.getByText("Jacobian and OpenClaw can start one")).toBeTruthy();
    // Pressed, it opens the + window out of itself, measured where it stands: a measure Jest's
    // views never answer, so what is asked here is that the button is the one offered.
    expect(screen.getByLabelText("Create a space")).toBeTruthy();
    expect(screen.queryByLabelText("See agents")).toBeNull();
  });

  it("offers to make one with nobody to ask too: it is made empty (ADR 0148)", async () => {
    const snapshot = empty({ connection: "open", awaiting: 0 });
    await render(<List store={fakeStore(snapshot)} snapshot={snapshot} />);
    expect(screen.getByLabelText("Create a space")).toBeTruthy();
    expect(screen.queryByText(/can start one/)).toBeNull();
    expect(screen.queryByLabelText("See agents")).toBeNull();
  });
});
