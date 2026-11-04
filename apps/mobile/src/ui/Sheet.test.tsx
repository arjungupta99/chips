/**
 * A sheet's contract, short of the motion itself, which Jest cannot see: the native driver is a
 * mock that reports every animation finished a frame later. What is left is what a caller relies
 * on — what is in the sheet is there while it is open, the scrim and the platform's back both
 * close it, and it goes only once its exit has finished, so a caller that keeps it mounted and
 * turns `open` off gets the exit and a test that waits for it to go is waiting for that.
 */

import { act, fireEvent, render, screen, userEvent, waitFor } from "@testing-library/react-native";
import { useState } from "react";
import { Animated, Dimensions, StyleSheet, Text } from "react-native";
import { State } from "react-native-gesture-handler";
import { fireGestureHandler, getByGestureTestId } from "react-native-gesture-handler/jest-utils";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { Sheet, SheetScroll, useSheetRest } from "./Sheet";
import { SPACE } from "./tokens";
import { WindowInsets } from "./windowInsets";

const IPHONE = {
  frame: { x: 0, y: 0, width: 393, height: 852 },
  insets: { top: 59, left: 0, right: 0, bottom: 34 },
};

function sheet(
  open: boolean,
  onClose: () => void = () => undefined,
  onGone: (() => void) | undefined = undefined,
) {
  return (
    <SafeAreaProvider initialMetrics={IPHONE}>
      <Sheet open={open} onClose={onClose} onGone={onGone} testID="sheet">
        <Text>Three choices</Text>
      </Sheet>
    </SafeAreaProvider>
  );
}

/** The window as an iPhone's, for what a sheet does on one: Jest's own is 750 points across. */
function onA(window: { readonly width: number; readonly height: number }) {
  const was = Dimensions.get("window");
  Dimensions.set({ window: { ...window, scale: 3, fontScale: 1 } });
  return () => Dimensions.set({ window: was });
}

/** Watches for the value a pull moves: the one set to the finger's distance. */
function pull() {
  const set = jest.spyOn(Animated.Value.prototype, "setValue");
  const held = screen.getByTestId("sheet-panel").children[0];
  if (typeof held !== "object") throw new Error("no held view");
  fireEvent(held, "layout", { nativeEvent: { layout: { height: 300 } } });
  return () => {
    const at = set.mock.calls.findIndex(([value]) => value === PAST);
    const value = set.mock.contexts[at] as Animated.Value | undefined;
    set.mockRestore();
    return value;
  };
}

/** Past the line of a 300-point sheet, so letting go asks it to close. */
const PAST = 140;

function letGoPast() {
  fireGestureHandler(getByGestureTestId("sheet-pull"), [
    { state: State.BEGAN },
    { state: State.ACTIVE, translationY: 0 },
    { translationY: PAST / 2 },
    { translationY: PAST },
    { state: State.END, translationY: PAST },
  ]);
}

const springs = jest.spyOn(Animated, "spring");
afterEach(() => springs.mockClear());

/** Whether that value was sprung back to nothing: the panel coming home. */
function sentHome(value: Animated.Value | undefined) {
  expect(value).toBeDefined();
  return springs.mock.calls.some(
    ([sprung, config]) => sprung === value && "toValue" in config && config.toValue === 0,
  );
}

describe("a sheet", () => {
  it("is closed by its X, a finger on the scrim, a screen reader's escape, and the platform's back", async () => {
    const closed = jest.fn();
    await render(sheet(true, closed));
    expect(screen.getByText("Three choices")).toBeTruthy();
    // The X is the one Close a screen reader is offered (ADR 0169). The panel is modal to one,
    // which is why the scrim is hidden from it: the scrim is a finger's way out.
    expect(screen.getAllByRole("button", { name: "Close" })).toEqual([
      screen.getByTestId("sheet-close"),
    ]);
    await userEvent.press(screen.getByTestId("sheet-close"));
    expect(closed).toHaveBeenCalledTimes(1);
    const scrim = screen
      .getAllByLabelText("Close", { includeHiddenElements: true })
      .find((close) => close.props["testID"] !== "sheet-close");
    if (scrim === undefined) throw new Error("no scrim");
    await userEvent.press(scrim);
    expect(closed).toHaveBeenCalledTimes(2);
    // The panel is where a drag starts, and it declines a touch until one moves — which the
    // testing library reads as declining every event, the reader's escape included. That
    // gesture is not a touch, so it is delivered to the wiring rather than fired.
    screen.getByTestId("sheet-panel").props["onAccessibilityEscape"]();
    expect(closed).toHaveBeenCalledTimes(3);
    fireEvent(screen.getByTestId("sheet"), "requestClose");
    expect(closed).toHaveBeenCalledTimes(4);
  });

  it("closes from its X whatever a drag does, where the caller says so (a reader goes back on a drag)", async () => {
    const back = jest.fn();
    const shut = jest.fn();
    await render(
      <SafeAreaProvider initialMetrics={IPHONE}>
        <Sheet open onClose={back} onCloseButton={shut} testID="sheet">
          <Text>Selected text</Text>
        </Sheet>
      </SafeAreaProvider>,
    );
    await userEvent.press(screen.getByTestId("sheet-close"));
    expect(shut).toHaveBeenCalledTimes(1);
    expect(back).not.toHaveBeenCalled();
    fireEvent(screen.getByTestId("sheet"), "requestClose");
    expect(back).toHaveBeenCalledTimes(1);
  });

  it("greys its X and keeps it from closing while it may not be put away", async () => {
    const closed = jest.fn();
    await render(
      <SafeAreaProvider initialMetrics={IPHONE}>
        <Sheet open onClose={closed} closable={false} testID="sheet">
          <Text>Deleting</Text>
        </Sheet>
      </SafeAreaProvider>,
    );
    const close = screen.getByTestId("sheet-close");
    expect(close).toBeDisabled();
    await userEvent.press(close);
    expect(closed).not.toHaveBeenCalled();
  });

  it("is pulled down from anywhere on it, and goes when let go past a third of its height or flicked, not flicked back up", async () => {
    const closed = jest.fn();
    await render(sheet(true, closed));
    // What it holds is 300 points tall, so the line is at 100.
    const held = screen.getByTestId("sheet-panel").children[0];
    if (typeof held !== "object") throw new Error("no held view");
    fireEvent(held, "layout", { nativeEvent: { layout: { height: 300 } } });
    const letGo = (translationY: number, velocityY = 0) =>
      fireGestureHandler(getByGestureTestId("sheet-pull"), [
        { state: State.BEGAN },
        { state: State.ACTIVE, translationY: 0 },
        { translationY: translationY / 2, velocityY },
        { translationY, velocityY },
        { state: State.END, translationY, velocityY },
      ]);
    letGo(90);
    expect(closed).not.toHaveBeenCalled();
    letGo(110);
    expect(closed).toHaveBeenCalledTimes(1);
    letGo(30, 1200);
    expect(closed).toHaveBeenCalledTimes(2);
    // Past the line but on its way back up, fast: the finger has changed its mind.
    letGo(110, -1200);
    expect(closed).toHaveBeenCalledTimes(2);
  });

  it("springs back from the finger's speed when let go short of the line", async () => {
    await render(sheet(true));
    const held = screen.getByTestId("sheet-panel").children[0];
    if (typeof held !== "object") throw new Error("no held view");
    fireEvent(held, "layout", { nativeEvent: { layout: { height: 300 } } });
    fireGestureHandler(getByGestureTestId("sheet-pull"), [
      { state: State.BEGAN },
      { state: State.ACTIVE, translationY: 0 },
      { translationY: 60, velocityY: -700 },
      { state: State.END, translationY: 60, velocityY: -700 },
    ]);
    expect(springs).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ toValue: 0, velocity: -700 }),
    );
  });

  it("leaves at the speed the finger let it go, and a faster flick leaves sooner", async () => {
    // Arjun, 24 October 2026: let go, it "abruptly dismisses". The pull and the exit's own travel
    // are timed on one curve, from where the finger left the panel to out of sight, and that curve
    // starts as steep as the finger was fast.
    function Closes() {
      const [open, setOpen] = useState(true);
      return sheet(open, () => setOpen(false));
    }
    const leaving = async (velocityY: number) => {
      const timings = jest.spyOn(Animated, "timing");
      // A sheet of its own each time, which a key makes of the one rendered.
      await (velocityY === 0 ? render : screen.rerender)(<Closes key={velocityY} />);
      const pulled = pull();
      fireGestureHandler(getByGestureTestId("sheet-pull"), [
        { state: State.BEGAN },
        { state: State.ACTIVE, translationY: 0 },
        { translationY: PAST, velocityY },
        { state: State.END, translationY: PAST, velocityY },
      ]);
      await waitFor(() => expect(screen.queryByText("Three choices")).toBeNull());
      const drag = pulled();
      const away = timings.mock.calls.filter(([, config]) => config.toValue === 0);
      timings.mockRestore();
      const exit = away.find(([value]) => value === drag)?.[1];
      if (exit?.easing === undefined || exit.duration === undefined) throw new Error("no exit");
      // The panel's own travel, which the scrim fades on, runs on the same curve and clock.
      const travel = away.filter(([value]) => value !== drag).map(([, config]) => config);
      expect(travel).toEqual([
        expect.objectContaining({ duration: exit.duration, easing: exit.easing }),
      ]);
      expect(exit.easing(1)).toBe(1);
      // 160 points left of a 300-point sheet let go 140 down; its speed as it sets off.
      const t = 1e-4;
      const speed = ((exit.easing(t) / t) * (300 - PAST)) / (exit.duration / 1000);
      expect(Math.abs(speed - velocityY)).toBeLessThan(1);
      return exit.duration;
    };
    const slow = await leaving(0);
    const flicked = await leaving(1500);
    const thrown = await leaving(3000);
    expect(flicked).toBeLessThan(slow);
    expect(thrown).toBeLessThan(flicked);
  });

  it("comes back to rest when a pull past the line leaves it open, as a back a page or a busy sheet does", async () => {
    // What a caller's `onClose` may do: go back a page (a hand-off's full reply, AN-33), or
    // nothing while it is busy. Either way `open` stays on, and the panel must not stay where the
    // finger left it. Jest draws no motion, so what is seen is the spring the finger's value is
    // sent home on.
    const stays = jest.fn();
    await render(sheet(true, stays));
    const pulled = pull();
    letGoPast();
    expect(stays).toHaveBeenCalledTimes(1);
    const moved = pulled();
    await waitFor(() => expect(sentHome(moved)).toBe(true));
    // It had set off as the finger let go, so the panel comes back up from where it had got to.
    expect(springs).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ toValue: 1 }),
    );
  });

  it("sets off as the finger lets go, before the caller's answer, unless a pull cannot close it", async () => {
    // React draws the caller's answer 50 to 120 milliseconds after the finger lifts (the room
    // sheet on the simulator), and the panel stood still that long before it went.
    const setsOff = async (key: string, props: Partial<Parameters<typeof Sheet>[0]>) => {
      // A sheet of its own each time, which a key makes of the one rendered.
      await (key === "closes" ? render : screen.rerender)(
        <SafeAreaProvider initialMetrics={IPHONE} key={key}>
          <Sheet open onClose={() => undefined} testID="sheet" {...props}>
            <Text>Three choices</Text>
          </Sheet>
        </SafeAreaProvider>,
      );
      const held = screen.getByTestId("sheet-panel").children[0];
      if (typeof held !== "object") throw new Error("no held view");
      await fireEvent(held, "layout", { nativeEvent: { layout: { height: 300 } } });
      // Nothing else is timed while the sheet stays up: coming back is a spring.
      const timings = jest.spyOn(Animated, "timing");
      letGoPast();
      const went = timings.mock.calls.length > 0;
      timings.mockRestore();
      return went;
    };
    expect(await setsOff("closes", {})).toBe(true);
    // Busy: its X is grey and a pull does not put it away.
    expect(await setsOff("busy", { closable: false })).toBe(false);
    // A reader: a pull goes back a page, and only the X closes the sheet.
    expect(await setsOff("reader", { onCloseButton: () => undefined })).toBe(false);
  });

  it("says when it has come to rest, so a view on it is measured where it stops and not where it was (ADR 0202)", async () => {
    // On the native driver the layout hears where the panel is only once its spring has finished
    // and the sheet is drawn again: a square tapped on the room sheet's Media & files page as the
    // sheet glided to it measured 187 points high, and the picture flew from mid-screen.
    const back = onA({ width: 393, height: 852 });
    // The spring's frames run on Jest's clock: on a slow machine the wall clock let one finish
    // before the test had asked whether the sheet was at rest (public CI, 4 November 2026).
    jest.useFakeTimers();
    try {
      const asks: (() => Promise<void>)[] = [];
      function Measures() {
        asks.push(useSheetRest());
        return <Text>Three choices</Text>;
      }
      await render(
        <SafeAreaProvider initialMetrics={IPHONE}>
          <Sheet open onClose={() => undefined} testID="sheet">
            <Measures />
          </Sheet>
        </SafeAreaProvider>,
      );
      const panel = screen.getByTestId("sheet-panel");
      const held = panel.children[0];
      if (typeof held !== "object") throw new Error("no held view");
      await fireEvent(panel, "layout", { nativeEvent: { layout: { height: 790 } } });
      await fireEvent(held, "layout", { nativeEvent: { layout: { height: 300 } } });
      const rested = () => {
        const ask = asks.at(-1);
        if (ask === undefined) throw new Error("not asked");
        let at = false;
        void ask().then(() => {
          at = true;
        });
        return () => at;
      };
      // The mock driver finishes a spring 16 ms on: time for it, and for the sheet to be drawn.
      const springsEnd = () =>
        act(async () => {
          await jest.advanceTimersByTimeAsync(50);
        });
      // Arriving, it is not at rest; arrived, it is.
      const arrived = rested();
      await Promise.resolve();
      expect(arrived()).toBe(false);
      await springsEnd();
      expect(arrived()).toBe(true);

      // A taller page: the top glides, and ends where it is seen to stop.
      springs.mockClear();
      await fireEvent(held, "layout", { nativeEvent: { layout: { height: 500 } } });
      expect(springs).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ restDisplacementThreshold: 0.25, restSpeedThreshold: 4 }),
      );
      const glided = rested();
      await Promise.resolve();
      expect(glided()).toBe(false);
      await springsEnd();
      expect(glided()).toBe(true);
      // At rest, a measure waits for nothing.
      const still = rested();
      await Promise.resolve();
      expect(still()).toBe(true);
    } finally {
      jest.useRealTimers();
      back();
    }
  });

  it("leaves from where the finger let go when a pull closes it", async () => {
    function Closes() {
      const [open, setOpen] = useState(true);
      return sheet(open, () => setOpen(false));
    }
    await render(<Closes />);
    const pulled = pull();
    letGoPast();
    await waitFor(() => expect(screen.queryByText("Three choices")).toBeNull());
    expect(sentHome(pulled())).toBe(false);
  });

  it("goes once its exit has finished, and comes back", async () => {
    await render(sheet(true));
    await screen.rerender(sheet(false));
    // Still there: it is on its way out, and the modal under it waits for it.
    expect(screen.getByText("Three choices")).toBeTruthy();
    await waitFor(() => expect(screen.queryByText("Three choices")).toBeNull());
    expect(screen.queryByTestId("sheet")).toBeNull();
    await screen.rerender(sheet(true));
    expect(screen.getByText("Three choices")).toBeTruthy();
  });

  it("says when it has gone, for a caller that mounts it only while it is up", async () => {
    const gone = jest.fn();
    await render(sheet(true, undefined, gone));
    await screen.rerender(sheet(false, undefined, gone));
    // Not yet: the exit is still running, and the caller must not unmount it under the slide.
    expect(gone).not.toHaveBeenCalled();
    await waitFor(() => expect(gone).toHaveBeenCalledTimes(1));
  });

  it("stands on the window's bottom edge when it is opened from a tab, whose own bottom is the tab bar's", async () => {
    // A tab's insets end above its bar: 83 points on an iPhone, where the window's are 34.
    const inTab = { ...IPHONE, insets: { ...IPHONE.insets, bottom: 83 } };
    const back = onA(IPHONE.frame);
    await render(
      <SafeAreaProvider initialMetrics={IPHONE}>
        <WindowInsets>
          <SafeAreaProvider initialMetrics={inTab}>
            <Sheet open onClose={() => undefined} sizing="bounded" testID="sheet">
              <Text>Three choices</Text>
            </Sheet>
          </SafeAreaProvider>
        </WindowInsets>
      </SafeAreaProvider>,
    );
    const held = screen.getByTestId("sheet-panel").children[0];
    back();
    expect(typeof held === "object" && StyleSheet.flatten(held.props["style"])).toMatchObject({
      paddingBottom: SPACE.lg + IPHONE.insets.bottom,
    });
  });

  it("is a card clear of the bottom on an iPad mini upright, which has no list beside its rooms", async () => {
    const back = onA({ width: 744, height: 1133 });
    await render(sheet(true));
    const panel = StyleSheet.flatten(screen.getByTestId("sheet-panel").props["style"]);
    back();
    expect(panel).toMatchObject({ maxWidth: 520, alignSelf: "center" });
    expect(panel["marginBottom"]).toBeGreaterThan(0);
  });

  it("is not there at all until it is opened", async () => {
    await render(sheet(false));
    expect(screen.queryByTestId("sheet")).toBeNull();
    await screen.rerender(sheet(true));
    expect(screen.getByText("Three choices")).toBeTruthy();
  });
});

describe("a list on a sheet", () => {
  it("scrolls only when there is more of it than the sheet shows, and bounces over nothing never", async () => {
    // iOS bounces a list down the screen whatever its length; a short one on a tall sheet could be
    // pushed up over nothing (31 October 2026, the connection's sheet). Past the sheet it scrolls.
    await render(
      <SheetScroll testID="list">
        <Text>Two lines</Text>
      </SheetScroll>,
    );
    expect(screen.getByTestId("list")).toHaveProp("alwaysBounceVertical", false);
  });

  it("bounces whatever its length where its caller asks it to", async () => {
    await render(
      <SheetScroll testID="list" alwaysBounceVertical>
        <Text>Two lines</Text>
      </SheetScroll>,
    );
    expect(screen.getByTestId("list")).toHaveProp("alwaysBounceVertical", true);
  });
});
