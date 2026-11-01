/**
 * What a tab reads of the store (`useDeferredSnapshot`): every word while it is in sight; once in
 * `OUT_OF_SIGHT_MS` while it is not, as under a room opened from it or behind another tab; and
 * what the store holds the moment it is back in sight. Each message sent in a room drew Spaces,
 * Agents and You six times over, unseen (the simulator, 19 October 2026).
 */

import type { Snapshot, Store } from "@chipschat/core";
import { act, render } from "@testing-library/react-native";
import { OUT_OF_SIGHT_MS, useDeferredSnapshot } from "./provider";

let mockInSight = true;
jest.mock("expo-router", () => ({ useIsFocused: () => mockInSight }));

/** A store that is told things, each a snapshot numbered by when it came. */
function told() {
  let snapshot = { said: 0 } as unknown as Snapshot;
  const listeners = new Set<(next: Snapshot) => void>();
  return {
    store: {
      getSnapshot: () => snapshot,
      // As core's does: a new listener hears at once what the store holds.
      subscribe: (listener: (next: Snapshot) => void) => {
        listeners.add(listener);
        listener(snapshot);
        return () => listeners.delete(listener);
      },
    } as unknown as Store,
    hear: (said: number) => {
      snapshot = { said } as unknown as Snapshot;
      for (const listener of listeners) listener(snapshot);
    },
  };
}

/** What a tab drew, each time it drew. */
let drawn: number[] = [];
function Tab({ store }: { readonly store: Store }) {
  drawn.push((useDeferredSnapshot(store) as unknown as { said: number }).said);
  return null;
}

beforeEach(() => {
  drawn = [];
  mockInSight = true;
});
afterEach(() => jest.useRealTimers());

describe("a tab's snapshot", () => {
  it("follows every word while the tab is in sight", async () => {
    const { store, hear } = told();
    await render(<Tab store={store} />);
    await act(() => hear(1));
    await act(() => hear(2));
    expect(drawn.at(-1)).toBe(2);
  });

  it("out of sight, is drawn once a second with the last word, however many came", async () => {
    jest.useFakeTimers();
    mockInSight = false;
    const { store, hear } = told();
    await render(<Tab store={store} />);
    drawn = [];

    await act(() => {
      hear(1);
      hear(2);
      hear(3);
    });
    expect(drawn).toEqual([]);
    await act(() => jest.advanceTimersByTime(OUT_OF_SIGHT_MS - 1));
    expect(drawn).toEqual([]);
    await act(() => jest.advanceTimersByTime(1));
    expect(drawn).toEqual([3]);
  });

  it("back in sight, draws what the store holds at once, without waiting for the second", async () => {
    jest.useFakeTimers();
    mockInSight = false;
    const { store, hear } = told();
    const view = await render(<Tab store={store} />);
    await act(() => hear(4));

    mockInSight = true;
    await view.rerender(<Tab store={store} />);
    expect(drawn.at(-1)).toBe(4);
    // Nothing is drawn again when the second it was owed comes.
    const count = drawn.length;
    await act(() => jest.advanceTimersByTime(OUT_OF_SIGHT_MS));
    expect(drawn.length).toBe(count);
  });
});
