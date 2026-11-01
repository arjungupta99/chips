/**
 * When the thinking bubble comes, which is a matter of the clock: a beat after the run begins,
 * never before the person's own line is confirmed, and not at all for a run that answers inside
 * the beat — for each harness at work, on a beat of its own. The bubble itself is proved with the
 * room (`SpaceView.test.tsx`); how it comes and goes is the room's transition's, and the
 * simulator's to prove (`RoomMotion.tsx`).
 */

import type { Doing } from "@chipschat/core";
import { act, renderHook } from "@testing-library/react-native";
import { NOBODY, THINKING_GRACE_MS, useThinking } from "./Thinking";

const thinking: Doing = { harnessId: "har_scout", runId: "run_1", calls: 0, made: [] };
const working: Doing = {
  harnessId: "har_scout",
  runId: "run_1",
  verb: "Reading the map",
  calls: 1,
  made: [],
};
/** A second harness in the same room. */
const other: Doing = {
  harnessId: "har_tree",
  runId: "run_2",
  verb: "Checking the hours",
  calls: 2,
  made: [],
};

interface Room {
  readonly doing: readonly Doing[];
  readonly confirmed: boolean;
}

function watching(initial: Room) {
  return renderHook((room: Room) => useThinking(room.doing, room.confirmed), {
    initialProps: initial,
  });
}

async function tick(ms: number): Promise<void> {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
}

describe("when the thinking bubble comes", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it("waits a beat after the run begins", async () => {
    const { result } = await watching({ doing: [thinking], confirmed: true });
    expect(result.current).toEqual([]);
    await tick(THINKING_GRACE_MS - 1);
    expect(result.current).toEqual([]);
    await tick(1);
    expect(result.current).toEqual([thinking]);
  });

  it("shows nothing at all for a run that answers inside the beat", async () => {
    const { result, rerender } = await watching({ doing: [thinking], confirmed: true });
    await tick(THINKING_GRACE_MS / 2);
    await rerender({ doing: [], confirmed: true });
    await tick(THINKING_GRACE_MS);
    expect(result.current).toEqual([]);
  });

  it("waits for the person's own line to be confirmed before the beat starts", async () => {
    const { result, rerender } = await watching({ doing: [thinking], confirmed: false });
    await tick(THINKING_GRACE_MS * 2);
    expect(result.current).toEqual([]);
    await rerender({ doing: [thinking], confirmed: true });
    await tick(THINKING_GRACE_MS - 1);
    expect(result.current).toEqual([]);
    await tick(1);
    expect(result.current).toEqual([thinking]);
  });

  it("does not restart the beat when the run's word changes", async () => {
    const { result, rerender } = await watching({ doing: [thinking], confirmed: true });
    await tick(THINKING_GRACE_MS / 2);
    await rerender({ doing: [working], confirmed: true });
    await tick(THINKING_GRACE_MS / 2);
    expect(result.current).toEqual([working]);
  });

  it("stays standing while the next line goes out, and says what the next run is doing", async () => {
    // Taken down at each send and brought back a beat after the confirmation, it folded and
    // opened again under every message typed while the harness worked (Arjun, 23 September 2026).
    const { result, rerender } = await watching({ doing: [working], confirmed: true });
    await tick(THINKING_GRACE_MS);
    await rerender({ doing: [working], confirmed: false });
    expect(result.current).toEqual([working]);
    await tick(THINKING_GRACE_MS * 2);
    expect(result.current).toEqual([working]);
    // Confirmed, and the harness has started a run for it: the same bubble, at once, with its words.
    await rerender({ doing: [thinking], confirmed: true });
    expect(result.current).toEqual([thinking]);
  });

  it("goes the moment the run ends, once it has come", async () => {
    const { result, rerender } = await watching({ doing: [working], confirmed: true });
    await tick(THINKING_GRACE_MS);
    await rerender({ doing: [], confirmed: true });
    expect(result.current).toEqual([]);
  });

  it("is the same empty list whenever nobody is at work, so the foot is not drawn again for it", async () => {
    const { result, rerender } = await watching({ doing: [], confirmed: true });
    expect(result.current).toBe(NOBODY);
    await rerender({ doing: [thinking], confirmed: true });
    expect(result.current).toBe(NOBODY);
  });
});

describe("when a second harness is at work in the room (the OpenClaw test, finding 22)", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it("waits a beat of its own, and leaves the first bubble standing meanwhile", async () => {
    const { result, rerender } = await watching({ doing: [working], confirmed: true });
    await tick(THINKING_GRACE_MS / 2);
    // The second starts half way through the first's beat, which runs on regardless.
    await rerender({ doing: [working, other], confirmed: true });
    await tick(THINKING_GRACE_MS / 2);
    expect(result.current).toEqual([working]);
    await tick(THINKING_GRACE_MS / 2 - 1);
    expect(result.current).toEqual([working]);
    await tick(1);
    expect(result.current).toEqual([working, other]);
  });

  it("goes when its own run ends, and the other stays", async () => {
    const { result, rerender } = await watching({ doing: [working, other], confirmed: true });
    await tick(THINKING_GRACE_MS);
    expect(result.current).toEqual([working, other]);
    // OpenClaw answered and Jacobian worked on: the bubble that goes is the one that answered.
    await rerender({ doing: [working], confirmed: true });
    expect(result.current).toEqual([working]);
    await rerender({ doing: [], confirmed: true });
    expect(result.current).toEqual([]);
  });

  it("waits a whole beat again when a harness that went starts once more", async () => {
    const { result, rerender } = await watching({ doing: [working, other], confirmed: true });
    await tick(THINKING_GRACE_MS);
    await rerender({ doing: [working], confirmed: true });
    await rerender({ doing: [working, other], confirmed: true });
    expect(result.current).toEqual([working]);
    await tick(THINKING_GRACE_MS);
    expect(result.current).toEqual([working, other]);
  });

  it("holds back a harness starting while the person's line is on its way, and not one standing", async () => {
    const { result, rerender } = await watching({ doing: [working], confirmed: true });
    await tick(THINKING_GRACE_MS);
    await rerender({ doing: [working, other], confirmed: false });
    await tick(THINKING_GRACE_MS * 2);
    expect(result.current).toEqual([working]);
    await rerender({ doing: [working, other], confirmed: true });
    await tick(THINKING_GRACE_MS);
    expect(result.current).toEqual([working, other]);
  });
});
