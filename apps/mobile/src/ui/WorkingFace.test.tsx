/**
 * A room's face while there is work in it (ADR 0285): the pins are out for as long as it works,
 * and stay until they have gone back in when it ends.
 */

import { act, render, screen } from "@testing-library/react-native";
import { AccessibilityInfo } from "react-native";
import { Avatar } from "./Avatar";
import { PINS_IN_MS, PINS_OUT_MS } from "./pinTravel";
import { light } from "./tokens";
import { roundMs } from "./turns";
import { WORKING_ROUND } from "./WorkingFace";

const pins = () => screen.queryByTestId("working-pins");

describe("a room's working face", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it("goes round in the web's 1500 ms, with no pause before the top pin comes up again", () => {
    expect(roundMs(WORKING_ROUND)).toBe(1500);
  });

  it("is drawn with its twelve pins out when it is already working", async () => {
    await render(<Avatar name="Birthday dinner" size="row" busy decorative />);
    expect(pins()?.children).toHaveLength(12);
  });

  it("wears them on metal in light, as an agent's are", async () => {
    await render(<Avatar name="Birthday dinner" size="row" busy decorative />);
    for (const pin of pins()?.children ?? []) {
      expect(pin).toHaveStyle({ backgroundColor: light.pinMetal });
    }
  });

  it("wears none while it is quiet, nor where nobody said it could change", async () => {
    const { rerender } = await render(<Avatar name="Birthday dinner" size="row" busy={false} />);
    expect(pins()).toBeNull();
    await rerender(<Avatar name="Birthday dinner" size="row" />);
    expect(pins()).toBeNull();
  });

  it("brings them out when work starts", async () => {
    const { rerender } = await render(<Avatar name="Birthday dinner" size="row" busy={false} />);
    await rerender(<Avatar name="Birthday dinner" size="row" busy />);
    expect(pins()?.children).toHaveLength(12);
    await act(async () => jest.advanceTimersByTime(PINS_OUT_MS + 100));
    expect(pins()?.children).toHaveLength(12);
  });

  it("keeps them until they have gone back in when work ends", async () => {
    const { rerender } = await render(<Avatar name="Birthday dinner" size="row" busy />);
    await rerender(<Avatar name="Birthday dinner" size="row" busy={false} />);
    expect(pins()?.children).toHaveLength(12);
    await act(async () => jest.advanceTimersByTime(PINS_IN_MS + 100));
    expect(pins()).toBeNull();
  });

  it("takes them away at once with Reduce Motion on, and keeps them still while it works", async () => {
    jest.spyOn(AccessibilityInfo, "isReduceMotionEnabled").mockResolvedValue(true);
    const { rerender } = await render(<Avatar name="Birthday dinner" size="row" busy />);
    await act(async () => jest.advanceTimersByTime(10));
    expect(pins()?.children).toHaveLength(12);
    await rerender(<Avatar name="Birthday dinner" size="row" busy={false} />);
    expect(pins()).toBeNull();
  });

  it("leaves an agent to its own pins, and a face too small for any", async () => {
    await render(<Avatar name="Scout" kind="agent" size="row" busy decorative />);
    expect(pins()).toBeNull();
    await render(<Avatar name="Birthday dinner" size="xs" busy decorative />);
    expect(pins()).toBeNull();
  });
});
