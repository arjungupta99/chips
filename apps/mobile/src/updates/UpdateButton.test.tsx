/**
 * About's update buttons and the dot's flight into them (ADR 0296, addendum of 17 November 2026):
 * at rest a button shows and glows; while the dot is on its way it waits unseen at the dot's size,
 * the first saying where it stands; it grows out of the dot as it lands, the one under it a beat
 * later, and both glow from then on; a flight with nowhere to land lets them grow at once.
 */

import { UPDATE_MOTION, updateButtonTimes } from "@chipschat/core";
import { act, render, screen, userEvent } from "@testing-library/react-native";
import {
  AccessibilityInfo,
  Animated,
  type StyleProp,
  StyleSheet,
  View,
  type ViewStyle,
} from "react-native";
import { DotFlight } from "./DotFlight";
import { flights } from "./flight";
import { UpdateButton } from "./UpdateButton";

const opacityOf = (testID: string): number => {
  const { style: drawn } = screen.getByTestId(testID).props as { style?: StyleProp<ViewStyle> };
  const style = StyleSheet.flatten(drawn) as { opacity?: number };
  return style.opacity ?? 1;
};
const tick = (ms: number) => act(() => jest.advanceTimersByTime(ms));

function two() {
  return (
    <>
      <UpdateButton label="Update" onPress={() => undefined} testID="app" />
      <UpdateButton label="Update" soft order={1} onPress={() => undefined} testID="computer" />
    </>
  );
}

beforeEach(() => {
  jest.useFakeTimers();
  jest
    .spyOn(View.prototype as unknown as { measureInWindow: () => void }, "measureInWindow")
    .mockImplementation(((answer: (x: number, y: number, w: number, h: number) => void) =>
      answer(300, 400, 80, 30)) as never);
});
afterEach(async () => {
  // Whatever flight a test left goes out and the store comes to rest.
  const left = flights.now();
  if (left.stage === "up") flights.miss(left.id);
  await tick(10_000);
  jest.useRealTimers();
  jest.restoreAllMocks();
});

// Under Jest the native driver never hands a frame back, so these check what is drawn at rest and
// what each button starts, and when; the motion itself is walked on the simulator.
const delays = () =>
  (Animated.delay as unknown as jest.Mock).mock.calls.map(([ms]) => ms as number);
const loops = () => (Animated.loop as unknown as jest.Mock).mock.calls.length;

describe("About's update buttons", () => {
  beforeEach(() => {
    jest.spyOn(Animated, "delay");
    jest.spyOn(Animated, "loop");
  });

  it("show at rest and start to glow, when About was opened without the dot", async () => {
    const pressed: string[] = [];
    await render(<UpdateButton label="Update" onPress={() => pressed.push("app")} testID="app" />);
    expect(opacityOf("app-body")).toBe(1);
    expect(screen.getByTestId("app-glow")).toBeTruthy();
    expect(loops()).toBe(1);
    expect(delays()).toEqual([0]);
    jest.useRealTimers();
    await userEvent.press(screen.getByRole("button", { name: "Update" }));
    expect(pressed).toEqual(["app"]);
  });

  it("keep a still glow with Reduce Motion", async () => {
    // Jest's AccessibilityInfo is a mock already, which a spy would change for every test after.
    jest.mocked(AccessibilityInfo.isReduceMotionEnabled).mockResolvedValueOnce(true);
    await render(<UpdateButton label="Update" onPress={() => undefined} testID="app" />);
    await act(async () => undefined);
    expect(opacityOf("app-body")).toBe(1);
    expect(screen.getByTestId("app-glow")).toBeTruthy();
    // It started to breathe before the setting was read, and stopped once it was.
    expect(loops()).toBe(1);
  });

  it("wait unseen while the dot flies, the first saying where it stands", async () => {
    const id = flights.takeOff();
    await render(two());
    expect(opacityOf("app-body")).toBe(0);
    expect(opacityOf("computer-body")).toBe(0);
    expect(flights.now()).toEqual({ stage: "up", id, to: { x: 340, y: 415 } });
    expect(loops()).toBe(0);
  });

  it("grow out of the dot as it lands, the second a beat later, a light over each, then glow", async () => {
    const id = flights.takeOff();
    await render(two());
    expect(delays()).toEqual([]);
    await act(async () => flights.land(id));
    const first = updateButtonTimes(0);
    const second = updateButtonTimes(1);
    expect(delays().sort((a, b) => a - b)).toEqual(
      [
        first.growAt,
        first.sweepAt,
        first.glowAt,
        second.growAt,
        second.sweepAt,
        second.glowAt,
      ].sort((a, b) => a - b),
    );
    expect(second.growAt).toBe(UPDATE_MOTION.growBeatMs);
    expect(loops()).toBe(2);
  });

  it("grow at once, with no light, when the dot had nowhere to land", async () => {
    const id = flights.takeOff();
    await render(two());
    await act(async () => flights.miss(id));
    expect(delays().sort((a, b) => a - b)).toEqual([
      0,
      0,
      UPDATE_MOTION.growMs,
      UPDATE_MOTION.growMs,
    ]);
  });

  it("grow only once, however the flight goes on", async () => {
    const id = flights.takeOff();
    await render(two());
    await act(async () => flights.land(id));
    const started = delays().length;
    await tick(10_000);
    expect(flights.now().stage).toBe("rest");
    expect(delays()).toHaveLength(started);
  });
});

describe("the dot's flight", () => {
  it("flies from the dot to the first button and lands there", async () => {
    await render(<DotFlight />);
    const id = flights.takeOff();
    await act(async () => flights.from(id, { x: 196, y: 65 }));
    expect(screen.getByTestId("update-dot-flying")).toBeTruthy();
    await act(async () => flights.aim(id, { x: 340, y: 415 }));
    await tick(UPDATE_MOTION.flyMs + 50);
    expect(flights.now()).toEqual({ stage: "landed", id });
    expect(screen.queryByTestId("update-dot-flying")).toBeNull();
  });

  it("goes out where it stands with no button to land on", async () => {
    await render(<DotFlight />);
    const id = flights.takeOff();
    await act(async () => flights.from(id, { x: 196, y: 65 }));
    await act(async () => flights.miss(id));
    await tick(300);
    expect(screen.queryByTestId("update-dot-flying")).toBeNull();
    expect(flights.now().stage).toBe("missed");
  });

  it("goes out on its own when no button answers in time", async () => {
    await render(<DotFlight />);
    const id = flights.takeOff();
    await act(async () => flights.from(id, { x: 196, y: 65 }));
    await tick(UPDATE_MOTION.waitMs + 300);
    expect(screen.queryByTestId("update-dot-flying")).toBeNull();
    expect(flights.now()).toEqual({ stage: "missed", id });
  });
});
