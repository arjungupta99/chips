/**
 * When a pane's box moves (`PaneMotion.tsx`): when its length changes, and at no other time. Each
 * frame of a move is a commit of the whole tree, so a box that sets off from where it stands costs
 * as much as one that goes somewhere, for nothing.
 *
 * Reanimated cannot be loaded under Jest and `jest.setup.js` stands plain boxes in for these, so
 * this reads the real file over a small stand-in that says which moves were started.
 */

import { render } from "@testing-library/react-native";
import type { ComponentType, ReactNode } from "react";

const mockTimed = jest.fn((to: number, _config: unknown) => to);
const mockSteady = jest.fn((to: number, _config: unknown) => to);

jest.mock("react-native-reanimated", () => {
  const { useRef } = require("react");
  const { View } = require("react-native");
  return {
    __esModule: true,
    default: { View },
    useSharedValue: (initial: number) => useRef({ value: initial }).current,
    useAnimatedStyle: (style: () => unknown) => style(),
    withTiming: (to: number, config: unknown) => mockTimed(to, config),
  };
});
jest.mock("./steadySpring", () => ({
  withSteadyTiming: (to: number, config: unknown) => mockSteady(to, config),
}));
jest.mock("./PadBarMotion", () => ({
  DURATION: 520,
  EASE: "ease",
  EASED: "eased",
  PANES_HOLD: "the lines",
}));

const { Clearing, PaneLead, Widening } = jest.requireActual("./PaneMotion") as {
  readonly Clearing: ComponentType<{ readonly left: number }>;
  readonly PaneLead: React.Context<number>;
  readonly Widening: ComponentType<{ readonly width: number; readonly still?: boolean }>;
};

function moves(): number {
  return mockTimed.mock.calls.length + mockSteady.mock.calls.length;
}

function led(lead: number, children: ReactNode) {
  return <PaneLead.Provider value={lead}>{children}</PaneLead.Provider>;
}

describe("a pane's box", () => {
  beforeEach(() => {
    mockTimed.mockClear();
    mockSteady.mockClear();
  });

  it("takes its first width at once, and does not set off when it is drawn again", async () => {
    const view = await render(<Widening width={0} />);
    await view.rerender(<Widening width={0} />);
    await view.rerender(<Widening width={0} />);
    expect(moves()).toBe(0);
  });

  it("goes to a new width on the panes' timing", async () => {
    const view = await render(<Widening width={0} />);
    await view.rerender(<Widening width={420} />);
    expect(mockTimed).toHaveBeenCalledTimes(1);
    expect(mockTimed.mock.calls[0]?.[0]).toBe(420);
    expect(mockSteady).not.toHaveBeenCalled();
  });

  it("waits for the panes' lead before it goes", async () => {
    const view = await render(led(200, <Widening width={0} />));
    await view.rerender(led(200, <Widening width={420} />));
    expect(mockTimed).not.toHaveBeenCalled();
    expect(mockSteady).toHaveBeenCalledTimes(1);
    expect(mockSteady.mock.calls[0]?.[0]).toBe(420);
    expect(mockSteady.mock.calls[0]?.[1]).toMatchObject({ wait: 200, hold: "the lines" });
  });

  it("does not set off because the lead changed", async () => {
    const view = await render(led(0, <Widening width={420} />));
    await view.rerender(led(200, <Widening width={420} />));
    await view.rerender(led(0, <Widening width={420} />));
    expect(moves()).toBe(0);
  });

  it("takes a new width at once while still", async () => {
    const view = await render(<Widening width={420} still />);
    await view.rerender(<Widening width={0} still />);
    expect(moves()).toBe(0);
  });

  it("moves again only for the next change", async () => {
    const view = await render(<Widening width={0} />);
    await view.rerender(<Widening width={420} />);
    await view.rerender(<Widening width={420} />);
    await view.rerender(<Widening width={0} />);
    expect(mockTimed.mock.calls.map((call) => call[0])).toEqual([420, 0]);
  });

  it("holds a padding the same way", async () => {
    const view = await render(<Clearing left={0} />);
    await view.rerender(<Clearing left={0} />);
    expect(moves()).toBe(0);
    await view.rerender(<Clearing left={92} />);
    expect(mockTimed.mock.calls.map((call) => call[0])).toEqual([92]);
  });
});
