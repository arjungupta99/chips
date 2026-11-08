/**
 * An iPad's tabs (ADR 0276 and its addendum of 5 November 2026): a bar at the window's bottom left,
 * across the foot of the list, with the gold + at its end. What is worth proving: that the bar lists
 * the tabs with the one in front chosen, and a press chooses one, with no ☰ and no sidebar; that it
 * runs across the list's foot, 16 in from each side, and its middle, the gold +'s, is level with a
 * room's composer field; that over a narrow room at the window's edge it folds down to the tab in
 * front, which opens the four out again, and a tab, the one in front or a tap beside folds them
 * back; and that it steps aside for a bar of a screen's own.
 */

import { act, render, screen, userEvent } from "@testing-library/react-native";
import { useEffect } from "react";
import { Dimensions, Text } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { quietFoot } from "../spaces/Composer";
import { FIELD } from "../spaces/fieldShape";
import { ChromeProvider, type Foot, useChrome } from "./chrome";
import { PadBar } from "./PadBar";
import type { TabName } from "./tabs";
import { SPACE } from "./tokens";

const IPAD = {
  frame: { x: 0, y: 0, width: 1376, height: 1032 },
  insets: { top: 24, left: 0, right: 0, bottom: 20 },
};

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
    readonly onChoose?: (tab: TabName) => void;
    readonly foot?: Foot;
    readonly aside?: boolean;
  } = {},
) {
  return render(
    <SafeAreaProvider initialMetrics={IPAD}>
      <ChromeProvider>
        <Feet foot={over.foot} />
        <PadBar
          tabs={["index", "agents", "search", "you"]}
          chosen="agents"
          onChoose={over.onChoose ?? (() => undefined)}
          plus={<Text testID="gold-plus">+</Text>}
          aside={over.aside ?? false}
        />
      </ChromeProvider>
    </SafeAreaProvider>,
  );
}

/** Where the gold + stands: the view that holds it. */
function plusFrame() {
  const holder = screen.getByTestId("gold-plus").parent;
  if (holder === null) throw new Error("the + stands nowhere");
  return holder;
}

/** A narrow room at the window's edge, under the bar: upright, with a third column open. */
const NARROW: Foot = { atEdge: true, width: 612, lead: 0 };

describe("the bar", () => {
  const jestWindow = Dimensions.get("window");
  // Still drawn here, so the window changes inside `act`.
  afterEach(() => act(() => Dimensions.set({ window: jestWindow })));
  beforeEach(() => {
    Dimensions.set({ window: { width: 1376, height: 1032, scale: 2, fontScale: 1 } });
  });

  it("lists the tabs' marks with the one in front chosen, and a press chooses one", async () => {
    const chose: TabName[] = [];
    await draw({ onChoose: (tab) => chose.push(tab) });
    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((tab) => tab.props["testID"])).toEqual([
      "pad-bar-index",
      "pad-bar-agents",
      "pad-bar-search",
      "pad-bar-you",
    ]);
    expect(screen.getByTestId("pad-bar-agents")).toBeSelected();
    expect(screen.getByTestId("pad-bar-index")).not.toBeSelected();
    // Marks alone, and nothing else to open.
    expect(screen.queryByText("Search")).toBeNull();
    expect(screen.queryByRole("button", { name: /sidebar/i })).toBeNull();
    await userEvent.press(screen.getByTestId("pad-bar-search"));
    expect(chose).toEqual(["search"]);
  });

  it("runs across the list's foot, 16 in from each side, the gold + at its end", async () => {
    await draw();
    // The list is 340: 16 in, the bar, 10, the + 56 across, 16 in.
    expect(screen.getByTestId("pad-bar")).toHaveStyle({ left: 16, width: 242, height: 56 });
    expect(plusFrame()).toHaveStyle({ left: 16 + 242 + 10 });
    // Each tab its quarter of the bar inside its 4 points.
    expect(screen.getByTestId("pad-bar-index").parent?.parent).toHaveStyle({
      left: 20,
      width: (242 - 8) / 4,
    });
  });

  it("stands its middle, and the gold +'s, level with a room's composer field", async () => {
    await draw();
    // The composer's empty foot over a 20-point home indicator, and its field's middle in it.
    const field = 1032 - quietFoot(20) + SPACE.md + FIELD / 2;
    expect(screen.getByTestId("pad-bar")).toHaveStyle({ top: field - 28 });
    expect(plusFrame()).toHaveStyle({ top: field - 28 });
  });

  it("is as wide over a 300-point list as that list lets it be", async () => {
    // An 11-inch iPad upright.
    Dimensions.set({ window: { width: 820, height: 1180, scale: 2, fontScale: 1 } });
    await draw();
    expect(screen.getByTestId("pad-bar")).toHaveStyle({ width: 300 - 32 - 10 - 56 });
  });

  it("folds down to the tab in front over a narrow room at the window's edge", async () => {
    await draw({ foot: NARROW });
    expect(screen.getByTestId("pad-bar")).toHaveStyle({ width: 56 });
    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((tab) => tab.props["testID"])).toEqual(["pad-bar-agents"]);
    expect(screen.getByTestId("pad-bar-agents")).toHaveProp("accessibilityState", {
      selected: true,
      expanded: false,
    });
    expect(plusFrame()).toHaveStyle({ left: 16 + 56 + 10 });
  });

  it("opens the four out from the tab in front, and a tab chooses and folds them back", async () => {
    const chose: TabName[] = [];
    await draw({ foot: NARROW, onChoose: (tab) => chose.push(tab) });
    await userEvent.press(screen.getByTestId("pad-bar-agents"));
    expect(chose).toEqual([]);
    expect(screen.getByTestId("pad-bar")).toHaveStyle({ width: 242 });
    expect(screen.getAllByRole("tab")).toHaveLength(4);
    expect(screen.getByTestId("pad-bar-agents")).toHaveProp("accessibilityState", {
      selected: true,
      expanded: true,
    });
    await userEvent.press(screen.getByTestId("pad-bar-you"));
    expect(chose).toEqual(["you"]);
    expect(screen.getByTestId("pad-bar")).toHaveStyle({ width: 56 });
  });

  it("folds the four back from a tap beside them, and from the tab in front", async () => {
    await draw({ foot: NARROW });
    await userEvent.press(screen.getByTestId("pad-bar-agents"));
    await userEvent.press(screen.getByTestId("pad-bar-beside"));
    expect(screen.getByTestId("pad-bar")).toHaveStyle({ width: 56 });
    expect(screen.queryByTestId("pad-bar-beside")).toBeNull();
    await userEvent.press(screen.getByTestId("pad-bar-agents"));
    await userEvent.press(screen.getByTestId("pad-bar-agents"));
    expect(screen.getByTestId("pad-bar")).toHaveStyle({ width: 56 });
  });

  it("stays whole over a wide room at the window's edge", async () => {
    await draw({ foot: { atEdge: true, width: 1032, lead: 0 } });
    expect(screen.getByTestId("pad-bar")).toHaveStyle({ width: 242 });
    expect(screen.getAllByRole("tab")).toHaveLength(4);
  });

  it("steps aside for a bar of a screen's own", async () => {
    await draw({ aside: true });
    expect(screen.queryByTestId("pad-bar")).toBeNull();
    expect(screen.queryAllByRole("tab")).toHaveLength(0);
  });
});
