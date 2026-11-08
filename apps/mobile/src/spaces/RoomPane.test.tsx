/**
 * The room in the detail half of a wide screen (ADR 0177). What is worth proving: that it is named,
 * with who is in it, and the name opens the room's sheet; that a thread is named as one with a way
 * back to the space it grew from; that a room made empty from the + opens on its Add; and that the
 * room itself is there under the name. On an iPad (ADR 0256, ADR 0276): that its details stand in
 * the third column beside it, and stay open from space to space; and that the list is put away from
 * its bar. Seen from Search, that it offers Open in Spaces in their place, its details are the sheet,
 * and it puts nothing away. And that its lines take a new width once, their words out of sight
 * (ADR 0279).
 */

import type { Snapshot } from "@chipschat/core";
import { act, fireEvent, render, screen, userEvent } from "@testing-library/react-native";
import { Dimensions, Text } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { fakeStore } from "../testing/fixtures";
import { ChromeProvider, useChrome } from "../ui/chrome";
import { commandsNow, runCommand } from "../ui/menuBar";
import { Split, THIRD } from "../ui/Split";
import { GLIDE, WORDS_IN, WORDS_OUT, WORDS_WAIT } from "./heldWidth";
import { RoomPane } from "./RoomPane";

/** What the pane asked of the route, which a router as stable as the real one records. */
const mockParams: Record<string, unknown>[] = [];
const mockRouter = {
  push: () => undefined,
  setParams: (given: Record<string, unknown>) => mockParams.push(given),
};

jest.mock("expo-router", () => ({
  useFocusEffect: (effect: () => (() => void) | undefined) =>
    require("react").useEffect(effect, [effect]),
  useIsFocused: () => true,
  useRouter: () => mockRouter,
}));

// The name's sweep is drawn on Reanimated, and the + window has nothing to hold the room under.
jest.mock("../newSpace/Naming", () => {
  const react = require("react");
  const { Text } = require("react-native");
  return {
    ArrivingTitle: ({ title }: { title: string }) => react.createElement(Text, null, title),
    Sweep: () => null,
  };
});
jest.mock("../newSpace/NewSpace", () => ({
  useUnderWindow: () => false,
  useDrawnUnderWindow: () => () => undefined,
}));

const IPAD = {
  frame: { x: 0, y: 0, width: 1194, height: 834 },
  insets: { top: 24, left: 0, right: 0, bottom: 20 },
};

function state(): Snapshot {
  const room = {
    id: "sp_1",
    kind: "room",
    title: "Supplier email",
    members: ["per_arjun", "per_dana"],
    roles: {},
    state: "open",
    lastEventSeq: 2,
    lines: [],
    runs: [],
    sessions: [],
    pins: [],
    glimpse: false,
  };
  return {
    connection: "open",
    link: "direct",
    busy: new Set<string>(),
    receipts: new Map(),
    readState: {},
    spaceIcons: new Map(),
    directory: {
      per_arjun: { id: "per_arjun", kind: "person", displayName: "Arjun" },
      per_dana: { id: "per_dana", kind: "person", displayName: "Dana Ruiz" },
    },
    model: {
      needsYou: [],
      people: {},
      lanes: [],
      spaces: [room, { ...room, id: "sp_t", parentSpaceId: "sp_1", rootLineId: "ln_1" }],
    },
  } as unknown as Snapshot;
}

function Pane(props: {
  readonly snapshot: Snapshot;
  readonly spaceId: string;
  readonly onOpen?: (id: string) => void;
  readonly add?: boolean;
  readonly preview?: () => void;
}) {
  return (
    <SafeAreaProvider initialMetrics={IPAD}>
      <RoomPane
        key={props.spaceId}
        store={fakeStore(props.snapshot)}
        spaceId={props.spaceId}
        selfId="per_arjun"
        onOpen={props.onOpen ?? (() => undefined)}
        onOpenAgent={() => undefined}
        onClose={() => undefined}
        add={props.add}
        preview={props.preview}
      />
    </SafeAreaProvider>
  );
}

describe("the room pane", () => {
  beforeEach(() => {
    mockParams.length = 0;
  });

  it("names the space with who is in it, and draws the room under the name", async () => {
    await render(<Pane snapshot={state()} spaceId="sp_1" />);
    expect(screen.getByRole("button", { name: "Supplier email, who is here" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Back" })).toBeNull();
    expect(screen.getByTestId("composer")).toBeTruthy();
  });

  it("opens the room's sheet from its name, as a phone's room does", async () => {
    await render(<Pane snapshot={state()} spaceId="sp_1" />);
    expect(screen.queryByTestId("room-sheet")).toBeNull();
    await userEvent.press(screen.getByRole("button", { name: "Supplier email, who is here" }));
    expect(screen.getByTestId("room-sheet")).toBeTruthy();
  });

  it("opens a room made empty from the + on its Add, and only the once", async () => {
    await render(<Pane snapshot={state()} spaceId="sp_1" add />);
    expect(screen.getByText("Add to Supplier email")).toBeTruthy();
    expect(mockParams).toEqual([{ add: undefined }]);
  });

  it("calls a thread a thread, and goes back to the space it grew from", async () => {
    const opened: string[] = [];
    await render(<Pane snapshot={state()} spaceId="sp_t" onOpen={(id) => opened.push(id)} />);
    expect(
      screen.getByRole("button", { name: "Thread · Supplier email, who is here" }),
    ).toBeTruthy();
    await userEvent.press(screen.getByRole("button", { name: "Back" }));
    expect(opened).toEqual(["sp_1"]);
  });
});

describe("the room pane on an iPad (ADR 0256)", () => {
  const jestWindow = Dimensions.get("window");
  afterEach(() => Dimensions.set({ window: jestWindow }));
  const on = (width: number, height: number) =>
    Dimensions.set({ window: { width, height, scale: 2, fontScale: 1 } });

  /** What stands around the panes: whether the details and the list are wanted, and the fold. */
  function Chrome() {
    const { details, listHidden } = useChrome();
    return (
      <Text testID="chrome">
        {[details && "details", listHidden && "list away"].filter(Boolean).join(", ") || "nothing"}
      </Text>
    );
  }

  const inChrome = (spaceId: string, preview?: () => void) => (
    <ChromeProvider>
      <Pane snapshot={state()} spaceId={spaceId} {...(preview === undefined ? {} : { preview })} />
      <Chrome />
    </ChromeProvider>
  );

  it("stands the details in the third column beside the room, open from space to space (ADR 0276)", async () => {
    on(1376, 1032);
    const { rerender } = await render(inChrome("sp_1"));
    expect(screen.queryByTestId("room-sheet")).toBeNull();
    await userEvent.press(screen.getByRole("button", { name: "Show details" }));
    expect(screen.getByTestId("room-sheet")).toHaveStyle({ width: THIRD });
    expect(screen.getByTestId("room-sheet").type).not.toBe("Modal");
    expect(screen.getByTestId("chrome")).toHaveTextContent("details");

    // Another space: the column stands beside it too, on its first page.
    await rerender(inChrome("sp_t"));
    expect(screen.getByTestId("room-sheet")).toHaveStyle({ width: THIRD });
    expect(screen.getByTestId("chrome")).toHaveTextContent("details");

    await userEvent.press(screen.getByRole("button", { name: "Hide details" }));
    expect(screen.queryByTestId("room-sheet")).toBeNull();
    expect(screen.getByTestId("chrome")).toHaveTextContent("nothing");
  });

  it("stands its Universe in the column beside the room, the details and it putting each other away, and its button closes it (ADR 0276)", async () => {
    on(1376, 1032);
    const snapshot = state();
    const spaces = snapshot.model.spaces as unknown as Record<string, unknown>[];
    spaces[0] = { ...spaces[0], project: { files: 2, changes: [] } };
    const store = fakeStore(snapshot);
    (store as { projectFiles: unknown }).projectFiles = async () => ({
      files: [],
      truncated: false,
    });
    await render(
      <ChromeProvider>
        <SafeAreaProvider initialMetrics={IPAD}>
          <RoomPane
            store={store}
            spaceId="sp_1"
            selfId="per_arjun"
            onOpen={() => undefined}
            onOpenAgent={() => undefined}
            onClose={() => undefined}
          />
        </SafeAreaProvider>
      </ChromeProvider>,
    );
    await userEvent.press(screen.getByTestId("room-universe-button"));
    expect(screen.getByTestId("universe-sheet")).toHaveStyle({ width: THIRD });
    expect(screen.getByTestId("universe-sheet").type).not.toBe("Modal");
    await userEvent.press(screen.getByRole("button", { name: "Show details" }));
    expect(screen.getByTestId("room-sheet")).toHaveStyle({ width: THIRD });
    expect(screen.queryByTestId("universe-sheet")).toBeNull();
    await userEvent.press(screen.getByTestId("room-universe-button"));
    expect(screen.getByTestId("universe-sheet")).toHaveStyle({ width: THIRD });
    expect(screen.queryByTestId("room-sheet")).toBeNull();
    // Its button puts it away again.
    await userEvent.press(screen.getByTestId("room-universe-button"));
    expect(screen.queryByTestId("universe-sheet")).toBeNull();
  });

  it("lays its lines out at the room's new width once, their words gone, as the details open beside it (ADR 0279)", async () => {
    jest.useFakeTimers();
    try {
      on(1376, 1032);
      await render(
        <ChromeProvider>
          <Split list={<Text>the list</Text>} detail={<Pane snapshot={state()} spaceId="sp_1" />} />
        </ChromeProvider>,
      );
      const lines = () => screen.getByTestId("room-held");
      const room = 1376 - 340;
      expect(lines()).not.toHaveStyle({ width: room });
      expect(screen.queryByTestId("room-words")).toBeNull();

      // The column sets off; the lines hold the room's width while their words go.
      await fireEvent.press(screen.getByRole("button", { name: "Show details" }));
      expect(screen.getByTestId("room-sheet")).toHaveStyle({ width: THIRD });
      expect(lines()).toHaveStyle({ width: room });
      expect(screen.getByTestId("room-words")).toBeTruthy();

      // Gone: laid out once at the room beside the details, which they glide to.
      await act(() => jest.advanceTimersByTime(WORDS_WAIT + WORDS_OUT));
      expect(lines()).toHaveStyle({ width: room - THIRD });

      // Landed: the room's own width again. Then the words are back.
      await act(() => jest.advanceTimersByTime(GLIDE + 100));
      expect(lines()).not.toHaveStyle({ width: room - THIRD });
      await act(() => jest.advanceTimersByTime(WORDS_IN));
      expect(screen.queryByTestId("room-words")).toBeNull();
      await screen.unmount();
    } finally {
      jest.useRealTimers();
    }
  });

  it("opens the sheet beside the room's name from the details button where the window has no room for a column", async () => {
    on(834, 1194);
    await render(inChrome("sp_1"));
    await userEvent.press(screen.getByRole("button", { name: "Show details" }));
    expect(screen.getByTestId("room-sheet").type).toBe("Modal");
    // A popover, with a tap off it for its way out (`Sheet`'s `from`).
    expect(screen.getByTestId("room-sheet-off", { includeHiddenElements: true })).toBeTruthy();
    expect(screen.getByTestId("chrome")).toHaveTextContent("nothing");
  });

  it("puts the list away from its bar, and brings it back", async () => {
    on(1376, 1032);
    await render(inChrome("sp_1"));
    await userEvent.press(screen.getByRole("button", { name: "Hide the list" }));
    expect(screen.getByTestId("chrome")).toHaveTextContent("list away");
    await userEvent.press(screen.getByRole("button", { name: "Show the list" }));
    expect(screen.getByTestId("chrome")).toHaveTextContent("nothing");
  });

  it("brings the list back upright by putting the details away, which stepped it aside (ADR 0276)", async () => {
    on(1032, 1376);
    await render(inChrome("sp_1"));
    await userEvent.press(screen.getByRole("button", { name: "Show details" }));
    expect(screen.getByTestId("room-sheet")).toHaveStyle({ width: THIRD });
    // No room for the list beside the room and the details: it has stepped aside, and says so.
    expect(screen.getByRole("button", { name: "Show the list" })).toBeTruthy();
    await userEvent.press(screen.getByRole("button", { name: "Show the list" }));
    expect(screen.queryByTestId("room-sheet")).toBeNull();
    expect(screen.getByTestId("chrome")).toHaveTextContent("nothing");
    // And the details step it aside again.
    await userEvent.press(screen.getByRole("button", { name: "Show details" }));
    expect(screen.getByRole("button", { name: "Show the list" })).toBeTruthy();
  });

  it("shows and hides the details and the list from the menu bar, as its bar's buttons do", async () => {
    on(1376, 1032);
    const named = (id: string) => commandsNow().find((each) => each.id === id);
    await render(inChrome("sp_1"));
    expect(named("details")).toMatchObject({ enabled: true, title: "Show Details" });
    expect(named("list")).toMatchObject({ enabled: true, title: "Hide List" });
    await act(() => runCommand("details"));
    expect(screen.getByTestId("room-sheet")).toHaveStyle({ width: THIRD });
    expect(named("details")?.title).toBe("Hide Details");
    await act(() => runCommand("list"));
    expect(screen.getByTestId("chrome")).toHaveTextContent("details, list away");
    expect(named("list")?.title).toBe("Show List");
    await act(() => runCommand("details"));
    expect(screen.queryByTestId("room-sheet")).toBeNull();
  });

  it("offers Open in Spaces seen from Search, its details the sheet, and puts nothing away", async () => {
    on(1376, 1032);
    const open = jest.fn();
    await render(inChrome("sp_1", open));
    expect(screen.queryByRole("button", { name: "Hide the list" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Show details" })).toBeNull();
    // Nor are they the menu bar's, for a room seen from a search.
    expect(commandsNow().find((each) => each.id === "details")?.enabled).toBe(false);
    await userEvent.press(screen.getByRole("button", { name: "Open in Spaces" }));
    expect(open).toHaveBeenCalledTimes(1);
    await userEvent.press(screen.getByRole("button", { name: "Supplier email, who is here" }));
    expect(screen.getByTestId("room-sheet").type).toBe("Modal");
    expect(screen.getByTestId("chrome")).toHaveTextContent("nothing");
  });
});
