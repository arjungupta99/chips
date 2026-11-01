/**
 * When an asked room is named, as the room's bar hears it (`useNamed.ts`): once, in the render
 * the name arrives in, and never for a room the person named from the + (ADR 0149).
 */

import type { Space } from "@chipschat/core";
import { renderHook } from "@testing-library/react-native";
import { useNamed } from "./useNamed";

function room(over: Partial<Space> = {}): Space {
  return {
    id: "sp_new",
    kind: "direct",
    askedOf: "har_scout",
    members: ["per_arjun", "har_scout"],
    roles: {},
    state: "open",
    lastEventSeq: 1,
    lines: [],
    runs: [],
    sessions: [],
    pins: [],
    glimpse: false,
    ...over,
  } as Space;
}

describe("a room being named", () => {
  it("counts the moment the harness names a room that was waiting, and only that", async () => {
    const { result, rerender } = await renderHook(
      ({ space }: { space: Space }) => useNamed(space),
      {
        initialProps: { space: room() },
      },
    );
    expect(result.current).toBe(0);
    await rerender({ space: room({ title: "Kitchen remodel", keyed: true }) });
    expect(result.current).toBe(1);
    // A person's rename after that is not the harness naming it.
    await rerender({ space: room({ title: "Kitchen", keyed: true }) });
    expect(result.current).toBe(1);
  });

  it("is nothing for a room the person named from the +, though its harness claims it", async () => {
    const { result, rerender } = await renderHook(
      ({ space }: { space: Space }) => useNamed(space),
      {
        initialProps: { space: room({ title: "Japan trip" }) },
      },
    );
    await rerender({ space: room({ title: "Japan trip", keyed: true }) });
    expect(result.current).toBe(0);
  });

  it("is nothing for a room opened already named, or never asked of anybody", async () => {
    const opened = await renderHook(() => useNamed(room({ title: "Kitchen remodel" })));
    expect(opened.result.current).toBe(0);
    const group = await renderHook(() =>
      useNamed(room({ askedOf: undefined, kind: "group", title: "Trip" })),
    );
    expect(group.result.current).toBe(0);
  });
});
