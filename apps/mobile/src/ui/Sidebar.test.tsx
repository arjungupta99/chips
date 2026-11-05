/**
 * An iPad's tabs (ADR 0276): a capsule at the window's bottom left, and the sidebar ☰ opens out of
 * it over the list. What is worth proving: that the capsule lists the tabs with the one in front
 * chosen, and a press chooses one; that ☰ opens the sidebar, where a tab, a pinned space or a tap
 * beside it chooses and puts it back; that the spaces a person pinned are in it, in their order, and
 * open; that the workspaces are there only when there is more than one, the one in front ticked and
 * another a press away; that the gold + is beside the capsule; that the capsule folds down to ☰
 * over a narrow room at the window's edge; and that it steps aside for a bar of a screen's own.
 */

import type { Snapshot } from "@chipschat/core";
import { render, screen, userEvent } from "@testing-library/react-native";
import { useEffect } from "react";
import { Dimensions, Text } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { fakeStore, snapshot } from "../testing/fixtures";
import type { WorkspaceRow } from "../workspaces/Switcher";
import { ChromeProvider, type Foot, useChrome } from "./chrome";
import { Sidebar } from "./Sidebar";
import type { TabName } from "./tabs";

const mockSwitchTo = jest.fn();
const mockRows: { current: readonly WorkspaceRow[] } = { current: [] };

jest.mock("../store/provider", () => ({
  useChips: () => ({ switchTo: mockSwitchTo }),
  useDeferredSnapshot: (store: { getSnapshot: () => unknown }) => store.getSnapshot(),
}));
jest.mock("../workspaces/Switcher", () => ({ useWorkspaceRows: () => mockRows.current }));

const IPAD = {
  frame: { x: 0, y: 0, width: 1376, height: 1032 },
  insets: { top: 24, left: 0, right: 0, bottom: 20 },
};

/** Two rooms, both pinned: the second the newer pin, so first. */
function pinned(): Snapshot {
  const whole = snapshot();
  const room = whole.model.spaces[0];
  if (room === undefined) throw new Error("no room");
  return {
    ...whole,
    pinnedSpaces: ["sp_2", "sp_1"],
    model: {
      ...whole.model,
      spaces: [
        { ...room, title: "Supplier email" },
        { ...room, id: "sp_2", title: "Birthday dinner" },
      ],
    },
  } as Snapshot;
}

function row(deviceId: string, name: string, front: boolean, waiting = 0): WorkspaceRow {
  return {
    device: { deviceId } as WorkspaceRow["device"],
    name,
    standing: "Owner",
    waiting,
    front,
    renames: true,
  };
}

/** Whether the sidebar is out, as the window reads it. */
function Out() {
  return <Text testID="out">{useChrome().open ? "out" : "shut"}</Text>;
}

/** What the Agents tab's split says about its detail's foot. */
function Feet({ foot }: { readonly foot: Foot | undefined }) {
  const { setFoot } = useChrome();
  useEffect(() => {
    if (foot !== undefined) setFoot("agents", foot);
  }, [foot, setFoot]);
  return null;
}

function draw(
  over: {
    readonly snapshot?: Snapshot;
    readonly onChoose?: (tab: TabName) => void;
    readonly onOpenSpace?: (id: string) => void;
    readonly foot?: Foot;
    readonly aside?: boolean;
  } = {},
) {
  return render(
    <SafeAreaProvider initialMetrics={IPAD}>
      <ChromeProvider>
        <Feet foot={over.foot} />
        <Sidebar
          store={fakeStore(over.snapshot ?? snapshot())}
          selfId="per_arjun"
          tabs={["index", "agents", "search", "you"]}
          chosen="agents"
          onChoose={over.onChoose ?? (() => undefined)}
          onOpenSpace={over.onOpenSpace ?? (() => undefined)}
          plus={<Text testID="gold-plus">+</Text>}
          aside={over.aside ?? false}
        />
        <Out />
      </ChromeProvider>
    </SafeAreaProvider>,
  );
}

const open = () => userEvent.press(screen.getByRole("button", { name: "Show the sidebar" }));

describe("the capsule and the sidebar", () => {
  const jestWindow = Dimensions.get("window");
  afterEach(() => Dimensions.set({ window: jestWindow }));
  beforeEach(() => {
    Dimensions.set({ window: { width: 1376, height: 1032, scale: 2, fontScale: 1 } });
    mockSwitchTo.mockClear();
    mockRows.current = [];
  });

  it("rests as the capsule, its tabs' marks with the one in front chosen, and a press chooses one", async () => {
    const chose: TabName[] = [];
    await draw({ onChoose: (tab) => chose.push(tab) });
    expect(screen.getByTestId("out")).toHaveTextContent("shut");
    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((tab) => tab.props["testID"])).toEqual([
      "sidebar-index",
      "sidebar-agents",
      "sidebar-search",
      "sidebar-you",
    ]);
    expect(screen.getByTestId("sidebar-agents")).toBeSelected();
    expect(screen.getByTestId("sidebar-index")).not.toBeSelected();
    // Marks alone: the names are the sidebar's.
    expect(screen.queryByText("Search")).toBeNull();
    await userEvent.press(screen.getByTestId("sidebar-search"));
    expect(chose).toEqual(["search"]);
  });

  it("opens the sidebar from ☰, with the tabs' names, and a tab chooses and puts it back", async () => {
    const chose: TabName[] = [];
    await draw({ onChoose: (tab) => chose.push(tab) });
    await open();
    expect(screen.getByTestId("out")).toHaveTextContent("out");
    expect(screen.getByText("Search")).toBeTruthy();
    await userEvent.press(screen.getByTestId("sidebar-you"));
    expect(chose).toEqual(["you"]);
    expect(screen.getByTestId("out")).toHaveTextContent("shut");
  });

  it("puts the sidebar back from a tap beside it, and from ☰", async () => {
    await draw();
    await open();
    await userEvent.press(screen.getByTestId("sidebar-scrim"));
    expect(screen.getByTestId("out")).toHaveTextContent("shut");
    await open();
    await userEvent.press(screen.getByRole("button", { name: "Hide the sidebar", expanded: true }));
    expect(screen.getByTestId("out")).toHaveTextContent("shut");
  });

  it("lists the pinned spaces in the sidebar, newest pin first, and opens one", async () => {
    const opened: string[] = [];
    await draw({ snapshot: pinned(), onOpenSpace: (id) => opened.push(id) });
    expect(screen.queryByRole("header", { name: "Pinned" })).toBeNull();
    await open();
    expect(screen.getByRole("header", { name: "Pinned" })).toBeTruthy();
    const rooms = screen.getAllByTestId(/^sidebar-space-/).map((each) => each.props["testID"]);
    expect(rooms).toEqual(["sidebar-space-sp_2", "sidebar-space-sp_1"]);
    await userEvent.press(screen.getByRole("button", { name: "Open Birthday dinner" }));
    expect(opened).toEqual(["sp_2"]);
    expect(screen.getByTestId("out")).toHaveTextContent("shut");
  });

  it("has no Pinned heading with nothing pinned, and no workspaces with only the one", async () => {
    mockRows.current = [row("dev_home", "Home", true)];
    await draw();
    await open();
    expect(screen.queryByRole("header", { name: "Pinned" })).toBeNull();
    expect(screen.queryByRole("header", { name: "Workspaces" })).toBeNull();
  });

  it("lists the workspaces when there are two, the one in front ticked, and goes to another", async () => {
    mockRows.current = [row("dev_home", "Home", true), row("dev_studio", "Studio", false, 3)];
    await draw();
    await open();
    expect(screen.getByRole("header", { name: "Workspaces" })).toBeTruthy();
    expect(screen.getByTestId("sidebar-workspace-dev_home")).toBeSelected();
    expect(screen.getByTestId("sidebar-workspace-dev_studio")).toHaveTextContent("Studio3");
    await userEvent.press(screen.getByRole("button", { name: "Home, open" }));
    expect(mockSwitchTo).not.toHaveBeenCalled();
    await userEvent.press(screen.getByRole("button", { name: "Go to Studio" }));
    expect(mockSwitchTo).toHaveBeenCalledWith("dev_studio");
  });

  it("stands the capsule at the bottom left, the gold + beside it", async () => {
    await draw();
    // 1032 tall, 20 under it for the home indicator, a gap of 8, 48 tall.
    expect(screen.getByTestId("sidebar")).toHaveStyle({ left: 16, top: 1032 - 20 - 8 - 48 });
    expect(screen.getByTestId("sidebar")).toHaveStyle({ width: 233 });
    expect(screen.getByTestId("gold-plus")).toBeTruthy();
  });

  it("folds down to ☰ over a narrow room at the window's edge, and keeps its tabs over a wide one", async () => {
    const { rerender } = await draw({ foot: { atEdge: true, width: 612 } });
    expect(screen.getByTestId("sidebar")).toHaveStyle({ width: 48 });
    expect(screen.queryAllByRole("tab")).toHaveLength(0);
    expect(screen.getByRole("button", { name: "Show the sidebar" })).toBeTruthy();
    await rerender(
      <SafeAreaProvider initialMetrics={IPAD}>
        <ChromeProvider>
          <Feet foot={{ atEdge: true, width: 1032 }} />
          <Sidebar
            store={fakeStore(snapshot())}
            selfId="per_arjun"
            tabs={["index", "agents", "search", "you"]}
            chosen="agents"
            onChoose={() => undefined}
            onOpenSpace={() => undefined}
            plus={null}
            aside={false}
          />
        </ChromeProvider>
      </SafeAreaProvider>,
    );
    expect(screen.getByTestId("sidebar")).toHaveStyle({ width: 233 });
  });

  it("steps aside for a bar of a screen's own", async () => {
    await draw({ aside: true });
    expect(screen.queryByTestId("sidebar")).toBeNull();
    expect(screen.queryAllByRole("tab")).toHaveLength(0);
  });
});
