/**
 * The iPhone Duo's column and fold (ADR 0256, the mock's section 11). What is worth proving: that
 * what the native view says is read as a side, a width, the lane UIKit keeps its buttons in and a
 * fold, and nothing from a phone that has none; that the two pages meet in the middle of a fold
 * that runs down the screen, and not at a fold across it; that open, the list runs to the fold and
 * the room stops at the column, and half open both keep off the fold's margins; that the column
 * holds the tabs, the one in front chosen and another a press away, with the + under them, in the
 * lane where the Duo says it; that the window's top is where UIKit stands its bars, with the status
 * bar in the column; and that a sheet's X stands in the lane, never above its top.
 */

import { render, screen, userEvent } from "@testing-library/react-native";
import { Dimensions, Text } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { type Duo, DuoContext, foldLine, pageOffFold, readDuo } from "./duo";
import { closeInLane } from "./SheetClose";
import { SideColumn } from "./SideColumn";
import { listWidth, Split } from "./Split";
import { useWindowInsets, WindowInsets } from "./windowInsets";

/** What the Duo simulator says, iOS 27.2, 2 November 2026: the fold down the middle of the open
 * screen with its margins, flat open; the column on the right; and the lane down it, folded. */
const FOLD = { x: 455.5, y: 0, width: 40, height: 669, active: false };
const LANE = { x: 394, y: 174, width: 48, height: 470 };
const COLUMN = 84;

describe("what the Duo says", () => {
  it("is a side, the column's width, the lane in it and the fold", () => {
    expect(readDuo({ edge: "right", column: COLUMN, bar: LANE, top: 24, fold: FOLD })).toEqual({
      side: "right",
      column: COLUMN,
      bar: LANE,
      top: 24,
      fold: FOLD,
    });
    expect(
      readDuo({ edge: "right", column: COLUMN, fold: { ...FOLD, active: true } }).fold,
    ).toEqual({ ...FOLD, active: true });
  });

  it("is nothing from a phone with no column and no fold", () => {
    expect(readDuo({ edge: "none", column: 0 })).toEqual({
      side: undefined,
      column: 0,
      bar: undefined,
      top: 0,
      fold: undefined,
    });
  });

  it("has no width or lane without a side, and no fold that isn't one", () => {
    expect(readDuo({ edge: "none", column: 40, bar: LANE, top: 24, fold: { x: 1 } })).toEqual({
      side: undefined,
      column: 0,
      bar: undefined,
      top: 0,
      fold: undefined,
    });
  });
});

describe("where the two pages meet", () => {
  it("is the middle of a fold down the screen", () => {
    expect(foldLine(FOLD)).toBe(476);
  });

  it("is nowhere for a fold across it, or none", () => {
    expect(foldLine({ x: 0, y: 455.5, width: 669, height: 40, active: false })).toBeUndefined();
    expect(foldLine(undefined)).toBeUndefined();
  });
});

describe("a card half open", () => {
  const duo = (active: boolean): Duo => ({
    side: "right",
    column: 84,
    bar: undefined,
    top: 24,
    fold: { ...FOLD, active },
  });

  it("stands on the page beside the column, clear of the fold and its margins", () => {
    expect(pageOffFold(duo(true), 951)).toEqual({ x: 496, width: 371 });
    expect(pageOffFold({ ...duo(true), side: "left" }, 951)).toEqual({ x: 84, width: 371 });
  });

  it("stands where it would open flat, folded, turned upright, and on any other phone", () => {
    expect(pageOffFold(duo(false), 951)).toBeUndefined();
    expect(pageOffFold({ ...duo(true), fold: undefined }, 466)).toBeUndefined();
    const across = { x: 0, y: 455.5, width: 669, height: 40, active: true };
    expect(
      pageOffFold({ ...duo(true), side: undefined, column: 0, fold: across }, 669),
    ).toBeUndefined();
  });
});

describe("a split on the Duo open", () => {
  const split = (duo: Duo, away = false) => (
    <DuoContext.Provider value={duo}>
      <Split list={<Text>the list</Text>} detail={<Text>the room</Text>} away={away} />
    </DuoContext.Provider>
  );
  const open: Duo = { side: "right", column: COLUMN, bar: undefined, top: 24, fold: FOLD };

  it("runs the list to the fold, and the room from there to the column", async () => {
    const { width } = Dimensions.get("window");
    await render(split(open));
    expect(screen.getByTestId("split-list")).toHaveStyle({ width: 476 });
    expect(screen.queryByTestId("split-fold")).toBeNull();
    expect(screen.getByTestId("split-detail")).toHaveStyle({ width: width - 476 - COLUMN });
  });

  it("half open, keeps both pages off the fold and its margins", async () => {
    const { width } = Dimensions.get("window");
    await render(split({ ...open, fold: { ...FOLD, active: true } }));
    expect(screen.getByTestId("split-list")).toHaveStyle({ width: 455 });
    expect(screen.getByTestId("split-fold")).toHaveStyle({ width: 41 });
    expect(screen.getByTestId("split-detail")).toHaveStyle({ width: width - 496 - COLUMN });
  });

  it("gives the room both pages, short of the column, with the list away", async () => {
    const { width } = Dimensions.get("window");
    await render(split(open, true));
    expect(screen.getByTestId("split-detail")).toHaveStyle({ width: width - COLUMN });
  });

  it("keeps the iPad's list where there is no fold", async () => {
    const { width } = Dimensions.get("window");
    await render(<Split list={<Text>the list</Text>} detail={<Text>the room</Text>} />);
    expect(screen.getByTestId("split-detail")).toHaveStyle({ width: width - listWidth(width) });
  });
});

describe("the column", () => {
  const METRICS = {
    frame: { x: 0, y: 0, width: 466, height: 678 },
    insets: { top: 0, left: 0, right: COLUMN, bottom: 34 },
  };
  const column = (props: Partial<Parameters<typeof SideColumn>[0]> = {}) => (
    <SafeAreaProvider initialMetrics={METRICS}>
      <SideColumn
        side="right"
        width={COLUMN}
        lane={LANE}
        tabs={["index", "agents", "search", "you"]}
        chosen="index"
        plus={<Text>the gold +</Text>}
        aside={false}
        onChoose={jest.fn()}
        {...props}
      />
    </SafeAreaProvider>
  );

  it("holds the tabs, the one in front chosen and another a press away, and the + under them", async () => {
    const onChoose = jest.fn();
    const user = userEvent.setup();
    await render(column({ onChoose }));
    expect(screen.getByRole("tab", { name: "Spaces" })).toBeSelected();
    expect(screen.getByRole("tab", { name: "Agents" })).not.toBeSelected();
    expect(screen.getByText("the gold +")).toBeTruthy();
    await user.press(screen.getByRole("tab", { name: "Agents" }));
    expect(onChoose).toHaveBeenCalledWith("agents");
  });

  it("stands in the lane UIKit keeps its own buttons in, under a room's back button", async () => {
    await render(column());
    expect(screen.getByTestId("side-column")).toHaveStyle({ left: 394, top: 174, width: 48 });
  });

  it("stands in the middle of the column where the Duo says no lane", async () => {
    await render(column({ lane: undefined }));
    expect(screen.getByTestId("side-column")).toHaveStyle({ right: 0, width: COLUMN });
  });

  it("steps aside for a screen's own bar, untouchable", async () => {
    await render(column({ plus: null, aside: true }));
    const side = screen.getByTestId("side-column");
    expect(side).toHaveStyle({ opacity: 0 });
    expect(side.props["pointerEvents"]).toBe("none");
  });
});

describe("the window's top on the Duo", () => {
  const Top = () => <Text testID="top">{useWindowInsets().top}</Text>;
  const at = (top: number, duo: Duo) => (
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 466, height: 678 },
        insets: { top, left: 0, right: COLUMN, bottom: 34 },
      }}
    >
      <DuoContext.Provider value={duo}>
        <WindowInsets>
          <Top />
        </WindowInsets>
      </DuoContext.Provider>
    </SafeAreaProvider>
  );
  const folded: Duo = { side: "right", column: COLUMN, bar: LANE, top: 24, fold: undefined };

  it("is where UIKit stands its bars, under no status bar of its own", async () => {
    await render(at(0, folded));
    expect(screen.getByTestId("top")).toHaveTextContent("24");
  });

  it("is the window's own on a phone with its status bar at the top", async () => {
    await render(at(59, { ...folded, side: undefined, column: 0, bar: undefined, top: 0 }));
    expect(screen.getByTestId("top")).toHaveTextContent("59");
  });
});

describe("a sheet's X on the Duo folded", () => {
  // The space sheet, its tiles beside the column: its title's line ends 16 points short of it.
  const lineRight = 466 - COLUMN - 16;

  it("stands in the middle of the lane, at its top where the sheet rises above it", () => {
    // The sheet's top at rest at 136 and its title's line at 157: the X stood under the battery.
    const at = closeInLane(LANE, lineRight, 157);
    expect(lineRight - at.right - 34 / 2).toBe(418);
    expect(157 + at.top).toBe(174);
  });

  it("stays on its title's line where the sheet stands lower", () => {
    expect(closeInLane(LANE, lineRight, 400).top).toBe(-6);
  });
});
