/**
 * The band under a room's head while an agent works there without asking (ADR 0281), as the web
 * and the Mac draw it: there while the yes holds, gone once its hour is up, and Stop ending it with
 * a word that it did.
 */

import { type Directory, type Space, STOPPED_MS } from "@chipschat/core";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LetWorkBand } from "./LetWorkBand.tsx";

const KIT = "hrn_kit";
const directory: Directory = { [KIT]: { id: KIT, kind: "harness", displayName: "Kit" } };
const NOW = Date.parse("2026-11-06T10:00:00.000Z");
const SINCE = "2026-11-06T09:50:00.000Z";

function room(letWork?: unknown[], state = "open"): Space {
  return { id: "sp_1", state, ...(letWork === undefined ? {} : { letWork }) } as unknown as Space;
}

describe("the band of an agent working without asking (ADR 0281)", () => {
  beforeEach(() => vi.useFakeTimers({ now: NOW }));
  afterEach(() => vi.useRealTimers());

  it("says nothing where nobody was let work, or in an archived room", () => {
    const { rerender } = render(<LetWorkBand space={room()} directory={directory} now={NOW} />);
    expect(screen.queryByTestId("let-work-band")).toBeNull();
    const held = [{ asker: KIT, by: "usr_a", since: SINCE }];
    rerender(<LetWorkBand space={room(held, "closed")} directory={directory} now={NOW} />);
    expect(screen.queryByTestId("let-work-band")).toBeNull();
  });

  it("stays while the yes holds, and Stop ends it with a word that it did", () => {
    const stopped: string[] = [];
    const held = [{ asker: KIT, by: "usr_a", since: SINCE }];
    const band = (space: Space) => (
      <LetWorkBand
        space={space}
        directory={directory}
        now={NOW}
        onStop={(asker) => stopped.push(asker)}
      />
    );
    const { rerender } = render(band(room(held)));
    expect(screen.getByTestId("let-work-band").textContent).toBe(
      "Kit is working without askingStop",
    );
    fireEvent.click(screen.getByRole("button", { name: "Stop Kit working without asking" }));
    expect(stopped).toEqual([KIT]);
    expect(screen.getByTestId("let-work-band").textContent).toBe(
      "Stopped. Kit asks again from its next step.",
    );
    expect(screen.getByTestId("let-work-band").dataset["stopped"]).toBe("true");
    // The server's word comes back and the room no longer holds the yes; the band goes in a moment.
    rerender(band(room()));
    expect(screen.getByTestId("let-work-band")).toBeTruthy();
    act(() => {
      vi.advanceTimersByTime(STOPPED_MS + 10);
    });
    expect(screen.queryByTestId("let-work-band")).toBeNull();
  });

  it("says until when for an hour, and goes once the hour is up", () => {
    const hour = { asker: KIT, by: "usr_a", since: SINCE, until: "2026-11-06T10:50:00.000Z" };
    const { rerender } = render(
      <LetWorkBand space={room([hour])} directory={directory} now={NOW} />,
    );
    expect(screen.getByTestId("let-work-band").textContent).toMatch(
      /^Kit is working without asking until \d{1,2}:50 [AP]M$/,
    );
    rerender(<LetWorkBand space={room([hour])} directory={directory} now={NOW + 51 * 60_000} />);
    expect(screen.queryByTestId("let-work-band")).toBeNull();
  });
});
