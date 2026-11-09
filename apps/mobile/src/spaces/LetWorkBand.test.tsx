/**
 * The band under a room's bar while an agent works there without asking (ADR 0281): there while
 * the yes holds, gone once its hour is up, and Stop ending it with a word that it did.
 */

import {
  BANNER_HIDDEN_MS,
  type Banners,
  type LetWork,
  type Snapshot,
  type Space,
  STOPPED_MS,
} from "@chipschat/core";
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
      /^Scout isn't asking until \d{1,2}:50 [AP]MStop$/,
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

  describe("putting it away (ADR 0286)", () => {
    const HELD = { asker: "har_scout", by: "per_arjun", since: SINCE };
    const user = () => userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    const after = async (ms: number) =>
      act(async () => {
        jest.advanceTimersByTime(ms);
      });
    const mounted = (banners?: Banners, more: Partial<Snapshot> = {}) => {
      const shot = { ...snapshot(), banners, keepsBanners: true, ...more } as Snapshot;
      const store = fakeStore(shot);
      return {
        store,
        element: <LetWorkBand store={store} space={room([HELD])} directory={shot.directory} />,
      };
    };
    const callNames = (store: { calls: readonly { name: string }[] }) =>
      store.calls.map((each) => each.name);

    it("doesn't show a banner that is off for this agent or its harness", async () => {
      await render(mounted({ choices: { har_scout: false }, closed: [] }).element);
      expect(screen.queryByTestId("let-work-band")).toBeNull();
    });

    it("doesn't show one closed for this yes, and shows it for a new one", async () => {
      await render(
        mounted({ choices: {}, closed: [{ spaceId: "sp_1", asker: "har_scout", since: SINCE }] })
          .element,
      );
      expect(screen.queryByTestId("let-work-band")).toBeNull();
      await render(
        mounted({
          choices: {},
          closed: [{ spaceId: "sp_1", asker: "har_scout", since: "2026-11-05T09:50:00.000Z" }],
        }).element,
      );
      expect(screen.getByTestId("let-work-band")).toBeTruthy();
    });

    it("× says Hidden for now, offers Disable and Undo, then folds", async () => {
      const { element, store } = mounted();
      await render(element);
      await user().press(screen.getByRole("button", { name: "Close this banner" }));
      expect(store.calls).toContainEqual({
        name: "closeBanner",
        args: { spaceId: "sp_1", asker: "har_scout", since: SINCE },
      });
      expect(screen.getByTestId("let-work-band")).toHaveTextContent(
        "Hidden for nowDisable bannerUndo",
      );
      expect(screen.queryByRole("button", { name: /^Stop/ })).toBeNull();
      await after(BANNER_HIDDEN_MS - 100);
      expect(screen.getByTestId("let-work-band")).toBeTruthy();
    });

    it("Undo on Hidden for now brings the band back and opens it again", async () => {
      const { element, store } = mounted();
      await render(element);
      await user().press(screen.getByTestId("let-work-close"));
      await user().press(screen.getByTestId("let-work-undo-close"));
      expect(store.calls).toContainEqual({
        name: "reopenBanner",
        args: { spaceId: "sp_1", asker: "har_scout" },
      });
      expect(screen.getByTestId("let-work-band")).toHaveTextContent(
        "Scout is working without askingStop",
      );
    });

    it("Disable banner turns it off for the agent, says so, and Undo turns it on", async () => {
      const { element, store } = mounted();
      await render(element);
      await user().press(screen.getByTestId("let-work-close"));
      await user().press(screen.getByRole("button", { name: "Disable the banner for Scout" }));
      expect(store.calls).toContainEqual({
        name: "setAgentBanner",
        args: { agentId: "har_scout", shown: false },
      });
      // Off says all of it: closed for now is let go, so turning it on later shows the band.
      expect(callNames(store)).toContain("reopenBanner");
      expect(screen.getByTestId("let-work-band")).toHaveTextContent("Banner off for ScoutUndo");
      await user().press(screen.getByTestId("let-work-undo-off"));
      expect(store.calls).toContainEqual({
        name: "setAgentBanner",
        args: { agentId: "har_scout", shown: true },
      });
      expect(screen.getByTestId("let-work-band")).toHaveTextContent(/working without asking/);
    });

    it("doesn't offer Disable banner on a server that keeps no choices", async () => {
      const { element } = mounted(undefined, { keepsBanners: false });
      await render(element);
      await user().press(screen.getByTestId("let-work-close"));
      expect(screen.getByTestId("let-work-band")).toHaveTextContent("Hidden for nowUndo");
      expect(screen.queryByTestId("let-work-disable")).toBeNull();
    });

    it("opens what can be done about it from its words", async () => {
      const opened: string[] = [];
      const shot = {
        ...snapshot(),
        directory: { agt_jiro: { id: "agt_jiro", kind: "agent", displayName: "Jiro" } },
      } as unknown as Snapshot;
      const store = fakeStore(shot);
      await render(
        <LetWorkBand
          store={store}
          space={room([{ ...HELD, asker: "agt_jiro" }])}
          directory={shot.directory}
          onOpenPermissions={(id) => opened.push(id)}
        />,
      );
      await user().press(
        screen.getByRole("button", {
          name: "Jiro is working without asking. Opens Jiro's permissions",
        }),
      );
      expect(opened).toEqual(["agt_jiro"]);
    });
  });
});
