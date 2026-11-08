/**
 * The band under a room's bar while an agent works there without asking (ADR 0281): there while
 * the yes holds, gone once its hour is up, and Stop ending it with a word that it did.
 */

import { type LetWork, type Space, STOPPED_MS } from "@chipschat/core";
import { act, render, screen, userEvent } from "@testing-library/react-native";
import { fakeStore, snapshot } from "../testing/fixtures";
import { LetWorkBand } from "./LetWorkBand";

const SINCE = "2026-11-06T09:50:00.000Z";

function room(letWork?: readonly LetWork[], state: "open" | "closed" = "open"): Space {
  return { id: "sp_1", state, ...(letWork === undefined ? {} : { letWork }) } as unknown as Space;
}

function band(space: Space) {
  const shot = snapshot();
  const store = fakeStore(shot);
  return {
    store,
    element: <LetWorkBand store={store} space={space} directory={shot.directory} />,
  };
}

describe("the band of an agent working without asking (ADR 0281)", () => {
  beforeEach(() => {
    jest.useFakeTimers({ now: Date.parse("2026-11-06T10:00:00.000Z") });
  });
  afterEach(() => jest.useRealTimers());

  it("says nothing in a room where nobody was let work", async () => {
    await render(band(room()).element);
    expect(screen.queryByTestId("let-work-band")).toBeNull();
  });

  it("stays while the yes holds, and Stop ends it with a word that it did", async () => {
    const { element, store } = band(room([{ asker: "har_scout", by: "per_arjun", since: SINCE }]));
    const view = await render(element);
    expect(screen.getByTestId("let-work-band")).toHaveTextContent(
      "Scout is working without askingStop",
    );
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    await user.press(screen.getByRole("button", { name: "Stop Scout working without asking" }));
    expect(store.calls).toEqual([
      { name: "stopLetWork", args: { spaceId: "sp_1", asker: "har_scout" } },
    ]);
    expect(screen.getByTestId("let-work-band")).toHaveTextContent(
      "Stopped. Scout asks again from its next step.",
    );
    expect(screen.queryByRole("button", { name: /^Stop/ })).toBeNull();
    // The server's word comes back and the room no longer holds the yes; the band says it stopped
    // for a moment, then goes.
    await view.rerender(band(room()).element);
    expect(screen.getByTestId("let-work-band")).toHaveTextContent(/^Stopped\./);
    await act(async () => {
      jest.advanceTimersByTime(STOPPED_MS + 10);
    });
    expect(screen.queryByTestId("let-work-band")).toBeNull();
  });

  it("says until when for an hour, and goes once the hour is up", async () => {
    const hour = {
      asker: "har_scout",
      by: "per_arjun",
      since: SINCE,
      until: "2026-11-06T10:50:00.000Z",
    };
    await render(band(room([hour])).element);
    expect(screen.getByTestId("let-work-band")).toHaveTextContent(
      /^Scout is working without asking until \d{1,2}:50 [AP]MStop$/,
    );
    const past = { ...hour, until: "2026-11-06T09:59:00.000Z" };
    await render(band(room([past])).element);
    expect(screen.queryByTestId("let-work-band")).toBeNull();
  });

  it("says nothing in an archived room, where nobody works", async () => {
    await render(
      band(room([{ asker: "har_scout", by: "per_arjun", since: SINCE }], "closed")).element,
    );
    expect(screen.queryByTestId("let-work-band")).toBeNull();
  });
});
