/**
 * What a bubble says while its Pause, Resume or Stop is on its way (ADR 0293): nothing new inside
 * the beat, the act's word past it, and nothing once the answer lands or the server turns it away.
 */

import { type Doing, RUN_ASKED_BEAT_MS } from "@chipschat/core";
import { act, renderHook } from "@testing-library/react-native";
import { useRunAsked } from "./runAsked";

const working: Doing = {
  harnessId: "har_scout",
  runId: "run_1",
  calls: 0,
  made: [],
  pausable: true,
};
const paused: Doing = { ...working, paused: true };

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

it("is late only once the beat has gone by, and done once the pause lands", async () => {
  const { result, rerender } = await renderHook(
    ({ doing, busy }: { doing: Doing; busy: boolean }) => useRunAsked(doing, busy),
    { initialProps: { doing: working, busy: false } },
  );
  await act(async () => result.current.ask("pause"));
  expect(result.current).toMatchObject({ act: "pause", late: false });
  await act(async () => jest.advanceTimersByTime(RUN_ASKED_BEAT_MS));
  expect(result.current).toMatchObject({ act: "pause", late: true });
  await rerender({ doing: paused, busy: false });
  expect(result.current).toMatchObject({ act: undefined, late: false });
});

it("lets go of one the server turned away, a moment after the store's mark goes", async () => {
  const { result, rerender } = await renderHook(
    ({ doing, busy }: { doing: Doing; busy: boolean }) => useRunAsked(doing, busy),
    { initialProps: { doing: working, busy: false } },
  );
  await act(async () => result.current.ask("pause"));
  await rerender({ doing: working, busy: true });
  await rerender({ doing: working, busy: false });
  expect(result.current.act).toBe("pause");
  await act(async () => jest.advanceTimersByTime(600));
  expect(result.current.act).toBeUndefined();
});
