/**
 * The flash on a line gone to is a moment (ADR 0219, addendum): it lights and sweeps once each
 * time the line is lit, and the light and the band are then not drawn. A new width — a column
 * opening beside the room on an iPad — or the cell drawn again after the moment does not play it
 * again (Arjun's iPad, 6 November 2026).
 */

import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { Animated, Text } from "react-native";
import { FLASH_MS, Flash } from "./Motion";

let timed: jest.SpyInstance;
// The native driver does not run under Jest: each timing stands in as one that lands on its value
// once its delay and duration are past, and says it finished, or was stopped short.
beforeEach(() => {
  jest.useFakeTimers();
  timed = jest.spyOn(Animated, "timing").mockImplementation((value, config) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let done: Animated.EndCallback | undefined;
    const animation = {
      start: (callback?: Animated.EndCallback) => {
        done = callback;
        timer = setTimeout(
          () => {
            timer = undefined;
            (value as Animated.Value).setValue(config.toValue as number);
            done?.({ finished: true });
          },
          (config.delay ?? 0) + (config.duration ?? 0),
        );
      },
      stop: () => {
        if (timer === undefined) return;
        clearTimeout(timer);
        timer = undefined;
        done?.({ finished: false });
      },
      reset: () => undefined,
    };
    return animation as unknown as Animated.CompositeAnimation;
  });
});
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

const lit = (since: number, key = "line") => (
  <Flash key={key} on since={since} id="ln_1">
    <Text>Held for 6 at 7:30.</Text>
  </Flash>
);

/** The line laid out at `width`, as the room lays it out, and as a column moving lays it out again. */
async function laidOut(width: number): Promise<void> {
  await act(async () => {
    fireEvent(screen.getByTestId("flash-ln_1"), "layout", {
      nativeEvent: { layout: { x: 0, y: 0, width, height: 60 } },
    });
  });
}

const swept = () => screen.queryByTestId("flash-sweep");
const glowing = () => screen.queryByTestId("flash-glow");

/** Past the band's crossing and the light's fade. */
async function played(): Promise<void> {
  await act(async () => {
    jest.advanceTimersByTime(FLASH_MS);
  });
}

it("lights, sweeps once the line has a width, and draws neither once they have played", async () => {
  await render(lit(Date.now()));
  expect(glowing()).toBeOnTheScreen();
  expect(swept()).toBeNull();
  await laidOut(700);
  expect(swept()).toBeOnTheScreen();
  await played();
  expect(swept()).toBeNull();
  expect(glowing()).toBeNull();
  expect(screen.getByText("Held for 6 at 7:30.")).toBeOnTheScreen();
});

it("does not light or sweep again when a column coming or going lays the line out anew", async () => {
  await render(lit(Date.now()));
  await laidOut(700);
  // The light, then the band once the line has a width.
  expect(timed).toHaveBeenCalledTimes(2);
  // The column opens beside the room on the band's way: it crosses the width it set off with.
  const band = screen.getByTestId("flash-sweep");
  await laidOut(470);
  expect(screen.getByTestId("flash-sweep")).toBe(band);
  await played();
  // And later goes, and opens again.
  await laidOut(700);
  await laidOut(470);
  expect(timed).toHaveBeenCalledTimes(2);
  expect(swept()).toBeNull();
  expect(glowing()).toBeNull();
});

it("is drawn plain when its cell is drawn again after the moment", async () => {
  const since = Date.now();
  await render(lit(since));
  await laidOut(700);
  await played();
  timed.mockClear();
  // Scrolled out of the room's window and back: a new cell, the same time.
  await screen.rerender(lit(since, "again"));
  await laidOut(700);
  expect(timed).not.toHaveBeenCalled();
  expect(swept()).toBeNull();
  expect(glowing()).toBeNull();
  // Still the room's lit line.
  expect(screen.getByTestId("flash-ln_1")).toBeOnTheScreen();
});

it("lights and sweeps again at a new time, the same line gone to twice", async () => {
  await render(lit(Date.now()));
  await laidOut(700);
  await played();
  timed.mockClear();
  await screen.rerender(lit(Date.now()));
  expect(timed).toHaveBeenCalledTimes(2);
  expect(glowing()).toBeOnTheScreen();
  expect(swept()).toBeOnTheScreen();
  await played();
  expect(swept()).toBeNull();
  expect(glowing()).toBeNull();
});
