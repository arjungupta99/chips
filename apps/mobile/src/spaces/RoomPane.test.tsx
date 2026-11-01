/**
 * The room in the detail half of a wide screen (ADR 0177). What is worth proving: that it is named,
 * with who is in it, and the name opens the room's sheet; that a thread is named as one with a way
 * back to the space it grew from; that a room made empty from the + opens on its Add; and that the
 * room itself is there under the name.
 */

import type { Snapshot } from "@chipschat/core";
import { render, screen, userEvent } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { fakeStore } from "../testing/fixtures";
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
}) {
  return (
    <SafeAreaProvider initialMetrics={IPAD}>
      <RoomPane
        store={fakeStore(props.snapshot)}
        spaceId={props.spaceId}
        selfId="per_arjun"
        onOpen={props.onOpen ?? (() => undefined)}
        onOpenAgent={() => undefined}
        onClose={() => undefined}
        add={props.add}
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
