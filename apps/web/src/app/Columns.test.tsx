/**
 * The columns telling a room beside them that its width is changing (ADR 0284's second addendum):
 * once its words have gone, just before the columns set off, and again in the frame they do, with
 * where the room will stand. jsdom lays nothing out; the glide itself is `room/widthGlide.ts`'s.
 */

import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Columns, ColumnsShellFrame, useRoomGlide, WORDS_LEAD } from "./Columns.tsx";

let told: string[] = [];

function Room() {
  useRoomGlide({
    note: (within) => told.push(`note ${within === null ? "window" : within.className}`),
    start: (within, room) => told.push(`start ${within.className} ${room}`),
  });
  return <div className="conv" />;
}

function Page({ third }: { readonly third: boolean }) {
  return (
    <ColumnsShellFrame room menu={false}>
      <Columns
        name="spaces"
        room
        list={<div />}
        detail={<Room />}
        third={third ? <div>Details</div> : undefined}
      />
    </ColumnsShellFrame>
  );
}

beforeEach(() => {
  told = [];
  vi.useFakeTimers();
  // Motion asked for, and a window wide enough for all three columns.
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("a room beside the columns", () => {
  it("is told before the third column sets off, once its words have gone, and as it does", () => {
    const { container, rerender } = render(<Page third={false} />);
    expect(told).toEqual([]);

    rerender(<Page third />);
    // The words go first; nothing moves yet.
    expect(container.querySelector(".col-detail")?.getAttribute("data-words")).toBe("out");
    expect(told).toEqual([]);

    act(() => {
      vi.advanceTimersByTime(WORDS_LEAD);
    });
    expect(told).toEqual(["note columns", "start columns 0"]);
    expect(container.querySelector(".columns")?.getAttribute("data-third")).toBe("true");
  });

  it("is told nothing when nothing moves: with less motion asked for, the column is simply there", () => {
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: query.includes("reduce"),
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }));
    const { rerender } = render(<Page third={false} />);
    rerender(<Page third />);
    act(() => {
      vi.advanceTimersByTime(WORDS_LEAD);
    });
    // The room is told of its new width, but no note was taken, so it glides nowhere.
    expect(told.filter((each) => each.startsWith("note"))).toEqual([]);
  });
});
