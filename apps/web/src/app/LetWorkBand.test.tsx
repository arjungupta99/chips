/**
 * The band under a room's head while an agent works there without asking (ADR 0281), as the web
 * and the Mac draw it: there while the yes holds, gone once its hour is up, and Stop ending it with
 * a word that it did.
 */

import {
  BANNER_HIDDEN_MS,
  type Directory,
  type Space,
  STOPPED_MS,
  type WorkspaceModel,
} from "@chipschat/core";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BannerService } from "./agent/bannerService.ts";
import { LetWorkBand } from "./LetWorkBand.tsx";

const KIT = "hrn_kit";
const directory: Directory = { [KIT]: { id: KIT, kind: "harness", displayName: "Kit" } };
const NOW = Date.parse("2026-11-06T10:00:00.000Z");
const SINCE = "2026-11-06T09:50:00.000Z";

/** Kit's Chips's rules switch as said; nothing said, it was never set (ADR 0300). */
function workspace(chipsRules?: boolean): WorkspaceModel {
  const kit = { harnessId: KIT, autonomy: 1, rules: [], bySpace: {}, chipsRules };
  return { harnesses: { [KIT]: kit } } as unknown as WorkspaceModel;
}
/** A yes holds on only while the harness's Chips's rules are on, so they are. */
const ON = workspace(true);

function room(letWork?: unknown[], state = "open"): Space {
  return { id: "sp_1", state, ...(letWork === undefined ? {} : { letWork }) } as unknown as Space;
}

describe("the band of an agent working without asking (ADR 0281)", () => {
  beforeEach(() => vi.useFakeTimers({ now: NOW }));
  afterEach(() => vi.useRealTimers());

  it("says nothing where nobody was let work, or in an archived room", () => {
    const { rerender } = render(
      <LetWorkBand model={ON} space={room()} directory={directory} now={NOW} />,
    );
    expect(screen.queryByTestId("let-work-band")).toBeNull();
    const held = [{ asker: KIT, by: "usr_a", since: SINCE }];
    rerender(
      <LetWorkBand model={ON} space={room(held, "closed")} directory={directory} now={NOW} />,
    );
    expect(screen.queryByTestId("let-work-band")).toBeNull();
  });

  it("stays while the yes holds, and Stop ends it with a word that it did", () => {
    const stopped: string[] = [];
    const held = [{ asker: KIT, by: "usr_a", since: SINCE }];
    const band = (space: Space) => (
      <LetWorkBand
        model={ON}
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

  it("says nothing while the harness's Chips's rules are off, whatever yes the space still holds (ADR 0300)", () => {
    const held = [{ asker: KIT, by: "usr_a", since: SINCE }];
    const band = (model: WorkspaceModel | undefined) => (
      <LetWorkBand model={model} space={room(held)} directory={directory} now={NOW} />
    );
    const { rerender } = render(band(ON));
    expect(screen.getByTestId("let-work-band")).toBeTruthy();
    // Turned off, never set, and no model to read the switch from.
    for (const model of [workspace(false), workspace(), undefined]) {
      rerender(band(model));
      expect(screen.queryByTestId("let-work-band")).toBeNull();
    }
    rerender(band(ON));
    expect(screen.getByTestId("let-work-band")).toBeTruthy();
  });

  it("says until when for an hour, and goes once the hour is up", () => {
    const hour = { asker: KIT, by: "usr_a", since: SINCE, until: "2026-11-06T10:50:00.000Z" };
    const { rerender } = render(
      <LetWorkBand model={ON} space={room([hour])} directory={directory} now={NOW} />,
    );
    expect(screen.getByTestId("let-work-band").textContent).toMatch(
      /^Kit isn't asking until \d{1,2}:50 [AP]M$/,
    );
    rerender(
      <LetWorkBand model={ON} space={room([hour])} directory={directory} now={NOW + 51 * 60_000} />,
    );
    expect(screen.queryByTestId("let-work-band")).toBeNull();
  });

  describe("putting it away (ADR 0286)", () => {
    const HELD = { asker: KIT, by: "usr_a", since: SINCE };
    function service(over: Partial<BannerService> = {}) {
      const calls: [string, unknown][] = [];
      const note =
        (name: string) =>
        async (...args: unknown[]) => {
          calls.push([name, args]);
        };
      const made: BannerService = {
        banners: undefined,
        keepsBanners: true,
        keepsHeldStart: true,
        letAgentWork: () => undefined,
        stopLetWork: () => undefined,
        closeBanner: note("close"),
        reopenBanner: note("reopen"),
        setAgentBanner: note("set"),
        setHarnessBanner: (harnessId) => ({ harnessId, shown: undefined, apart: {} }),
        undoHarnessBanner: note("undo"),
        ...over,
      };
      return { made, calls };
    }
    const band = (made: BannerService, onOpen?: (asker: string) => void) => (
      <LetWorkBand
        model={ON}
        space={room([HELD])}
        directory={directory}
        now={NOW}
        onStop={() => undefined}
        service={made}
        onOpenPermissions={onOpen}
      />
    );

    it("leaves out a banner that is off, or closed for this yes", () => {
      const off = service({ banners: { choices: { [KIT]: false }, closed: [] } });
      const { rerender } = render(band(off.made));
      expect(screen.queryByTestId("let-work-band")).toBeNull();
      const closed = service({
        banners: { choices: {}, closed: [{ spaceId: "sp_1", asker: KIT, since: SINCE }] },
      });
      rerender(band(closed.made));
      expect(screen.queryByTestId("let-work-band")).toBeNull();
      const older = service({
        banners: {
          choices: {},
          closed: [{ spaceId: "sp_1", asker: KIT, since: "2026-11-05T09:50:00.000Z" }],
        },
      });
      rerender(band(older.made));
      expect(screen.getByTestId("let-work-band")).toBeTruthy();
    });

    it("× says Hidden for now, with Disable banner and Undo", () => {
      const { made, calls } = service();
      render(band(made));
      fireEvent.click(screen.getByRole("button", { name: "Close this banner" }));
      expect(calls).toEqual([["close", [{ spaceId: "sp_1", asker: KIT, since: SINCE }]]]);
      expect(screen.getByTestId("let-work-band").textContent).toBe(
        "Hidden for nowDisable bannerUndo",
      );
      expect(screen.getByTestId("let-work-band").dataset["state"]).toBe("hidden");
    });

    it("folds once its time is up", () => {
      const { made } = service();
      const closed = service({
        banners: { choices: {}, closed: [{ spaceId: "sp_1", asker: KIT, since: SINCE }] },
      });
      const { rerender } = render(band(made));
      fireEvent.click(screen.getByTestId("let-work-close"));
      rerender(band(closed.made));
      expect(screen.getByTestId("let-work-band").textContent).toMatch(/^Hidden for now/);
      act(() => {
        vi.advanceTimersByTime(BANNER_HIDDEN_MS + 10);
      });
      expect(screen.queryByTestId("let-work-band")).toBeNull();
    });

    it("Undo brings the band back and opens it again", () => {
      const { made, calls } = service();
      render(band(made));
      fireEvent.click(screen.getByTestId("let-work-close"));
      fireEvent.click(screen.getByTestId("let-work-undo-close"));
      expect(calls.at(-1)).toEqual(["reopen", [{ spaceId: "sp_1", asker: KIT }]]);
      expect(screen.getByTestId("let-work-band").textContent).toBe(
        "Kit is working without askingStop",
      );
    });

    it("Disable banner turns it off for the agent, says so, and Undo turns it on", () => {
      const { made, calls } = service();
      render(band(made));
      fireEvent.click(screen.getByTestId("let-work-close"));
      fireEvent.click(screen.getByRole("button", { name: "Disable the banner for Kit" }));
      expect(calls).toContainEqual(["set", [KIT, false]]);
      expect(calls).toContainEqual(["reopen", [{ spaceId: "sp_1", asker: KIT }]]);
      expect(screen.getByTestId("let-work-band").textContent).toBe("Banner off for KitUndo");
      fireEvent.click(screen.getByTestId("let-work-undo-off"));
      expect(calls.at(-1)).toEqual(["set", [KIT, true]]);
    });

    it("doesn't offer Disable banner on a server that keeps no choices", () => {
      render(band(service({ keepsBanners: false }).made));
      fireEvent.click(screen.getByTestId("let-work-close"));
      expect(screen.getByTestId("let-work-band").textContent).toBe("Hidden for nowUndo");
    });

    it("opens the agent's Permissions from its words", () => {
      const opened: string[] = [];
      render(band(service().made, (asker) => opened.push(asker)));
      fireEvent.click(
        screen.getByRole("button", {
          name: "Kit is working without asking. Opens Kit's permissions",
        }),
      );
      expect(opened).toEqual([KIT]);
    });
  });
});
