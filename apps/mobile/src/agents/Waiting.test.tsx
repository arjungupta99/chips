/**
 * Whether a group's copy comes in over a blank (ADR 0238's addendum). What is worth proving: a copy
 * that lands where a blank stood comes in, and one there from the first frame, as a kept copy is,
 * is drawn as it is, however often it is read again. The motion itself is Reanimated's, on the
 * simulator.
 */

import { renderHook } from "@testing-library/react-native";
import { useStood } from "./Waiting";

describe("useStood", () => {
  it("says a blank stood once one has, and keeps saying it after the copy lands", async () => {
    const { result, rerender } = await renderHook(
      ({ standing }: { standing: boolean }) => useStood(standing),
      {
        initialProps: { standing: true },
      },
    );
    expect(result.current).toBe(true);
    await rerender({ standing: false });
    expect(result.current).toBe(true);
    await rerender({ standing: false });
    expect(result.current).toBe(true);
  });

  it("says no blank stood for a copy there from the first frame", async () => {
    const { result, rerender } = await renderHook(
      ({ standing }: { standing: boolean }) => useStood(standing),
      {
        initialProps: { standing: false },
      },
    );
    expect(result.current).toBe(false);
    await rerender({ standing: false });
    expect(result.current).toBe(false);
  });

  it("says a blank stood when one comes after a first frame with nothing", async () => {
    const { result, rerender } = await renderHook(
      ({ standing }: { standing: boolean }) => useStood(standing),
      {
        initialProps: { standing: false },
      },
    );
    await rerender({ standing: true });
    await rerender({ standing: false });
    expect(result.current).toBe(true);
  });
});
