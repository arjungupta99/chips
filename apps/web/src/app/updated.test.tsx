/**
 * A browser tab whose computer was updated under it (everything in step): it reloads at a quiet
 * moment and comes back where it was, or says so when none comes; never in Chips for Mac.
 */

import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ASK_AFTER_MS,
  IDLE_MS,
  keepPlace,
  PLACE_KEY,
  QUIET_CHECK_MS,
  quietNow,
  takePlace,
  useUpdatedUnder,
} from "./updated.tsx";

afterEach(() => {
  document.body.innerHTML = "";
  sessionStorage.clear();
});

describe("a quiet moment", () => {
  it("is one with nothing typed and unsent, and no sheet or dialog open", () => {
    document.body.innerHTML = '<textarea></textarea><input type="text">';
    expect(quietNow()).toBe(true);

    document.body.innerHTML = "<textarea>Half a thought</textarea>";
    (document.querySelector("textarea") as HTMLTextAreaElement).value = "Half a thought";
    expect(quietNow()).toBe(false);

    document.body.innerHTML = '<div contenteditable="true">Draft</div>';
    expect(quietNow()).toBe(false);

    document.body.innerHTML = '<div role="dialog"></div>';
    expect(quietNow()).toBe(false);
  });

  it("is not one with something typed in a field of any kind", () => {
    for (const kind of ["number", "search", "email", "url", "tel", "password"]) {
      document.body.innerHTML = `<input type="${kind}">`;
      expect(quietNow(), `${kind}, empty`).toBe(true);
      (document.querySelector("input") as HTMLInputElement).value = kind === "number" ? "48" : "x";
      expect(quietNow(), kind).toBe(false);
    }
  });

  it("is one whatever a switch, a hidden field or a button holds", () => {
    document.body.innerHTML =
      '<input type="checkbox" checked value="on"><input type="hidden" value="spc_1">' +
      '<input type="radio" checked value="a"><input type="submit" value="Send">';
    expect(quietNow()).toBe(true);
  });

  it("is not one with a file staged in the composer and not sent", () => {
    // The composer's own chips, as `@chipschat/ui` draws them over an empty field.
    document.body.innerHTML =
      '<form class="ui-composer"><ul class="ui-composer__attachments" aria-label="Attachments">' +
      "<li>plan.pdf</li></ul><textarea></textarea></form>";
    expect(quietNow()).toBe(false);
    document.querySelector(".ui-composer__attachments")?.remove();
    expect(quietNow()).toBe(true);
  });
});

describe("where the tab was", () => {
  it("is kept for the reload and taken once, so a later reload of its own opens as usual", () => {
    keepPlace({ tab: "spaces", spaceId: "spc_1" });
    expect(takePlace()).toEqual({ tab: "spaces", spaceId: "spc_1" });
    expect(takePlace()).toBeUndefined();
  });

  it("is nothing when what was kept isn't a place", () => {
    sessionStorage.setItem(PLACE_KEY, JSON.stringify({ tab: "nowhere" }));
    expect(takePlace()).toBeUndefined();
    sessionStorage.setItem(PLACE_KEY, "{not json");
    expect(takePlace()).toBeUndefined();
  });
});

describe("a computer updated under the tab", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    // In sight again, as the browser has it when a test hasn't said otherwise.
    Reflect.deleteProperty(document, "visibilityState");
  });

  function tab(options: { enabled?: boolean; quiet?: () => boolean; connected?: boolean } = {}) {
    const reload = vi.fn();
    const hook = renderHook(
      ({ version, connected }: { version: string | undefined; connected?: boolean }) =>
        useUpdatedUnder({
          serverVersion: version,
          enabled: options.enabled ?? true,
          connected: connected ?? options.connected ?? true,
          place: () => ({ tab: "agents", spaceId: "spc_7" }),
          reload,
          quiet: options.quiet ?? (() => true),
        }),
      {
        initialProps: { version: undefined } as {
          version: string | undefined;
          connected?: boolean;
        },
      },
    );
    return { reload, hook };
  }

  /** The tab out of sight, or back in it, as the browser says it. */
  function sight(state: "hidden" | "visible") {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => state });
  }

  it("does nothing while the computer runs the version it first heard", () => {
    const { reload, hook } = tab();
    hook.rerender({ version: "1.2.5" });
    hook.rerender({ version: "1.2.5" });
    act(() => vi.advanceTimersByTime(IDLE_MS + QUIET_CHECK_MS * 2));
    expect(reload).not.toHaveBeenCalled();
  });

  it("reloads once the person has left it alone, and comes back to the same place", () => {
    const { reload, hook } = tab();
    hook.rerender({ version: "1.2.5" });
    hook.rerender({ version: "1.2.6" });
    act(() => vi.advanceTimersByTime(QUIET_CHECK_MS * 2));
    expect(reload).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(IDLE_MS));
    expect(reload).toHaveBeenCalledTimes(1);
    expect(takePlace()).toEqual({ tab: "agents", spaceId: "spc_7" });
  });

  it("asks with a line when no quiet moment comes, and reloads when asked", () => {
    const { reload, hook } = tab({ quiet: () => false });
    hook.rerender({ version: "1.2.5" });
    hook.rerender({ version: "1.2.6" });
    expect(hook.result.current.asking).toBe(false);
    act(() => vi.advanceTimersByTime(ASK_AFTER_MS + QUIET_CHECK_MS));
    expect(hook.result.current.asking).toBe(true);
    expect(reload).not.toHaveBeenCalled();
    act(() => hook.result.current.reloadNow());
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("reloads a tab out of sight without waiting for it to be left alone", () => {
    const { reload, hook } = tab();
    hook.rerender({ version: "1.2.5" });
    hook.rerender({ version: "1.2.6" });
    sight("hidden");
    act(() => vi.advanceTimersByTime(QUIET_CHECK_MS));
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("starts the wait again each time a key is pressed", () => {
    const { reload, hook } = tab();
    hook.rerender({ version: "1.2.5" });
    hook.rerender({ version: "1.2.6" });
    act(() => vi.advanceTimersByTime(IDLE_MS - QUIET_CHECK_MS));
    act(() => {
      globalThis.dispatchEvent(new KeyboardEvent("keydown", { key: "a" }));
    });
    // Half a minute from the first look has passed, but not from the key.
    act(() => vi.advanceTimersByTime(QUIET_CHECK_MS * 2));
    expect(reload).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(IDLE_MS));
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("never reloads while the computer isn't connected, and does once it is", () => {
    const { reload, hook } = tab();
    hook.rerender({ version: "1.2.5" });
    hook.rerender({ version: "1.2.6" });
    // The computer went away again, as one starting on a new release does.
    hook.rerender({ version: "1.2.6", connected: false });
    sight("hidden");
    act(() => vi.advanceTimersByTime(IDLE_MS + QUIET_CHECK_MS * 2));
    expect(reload).not.toHaveBeenCalled();
    hook.rerender({ version: "1.2.6", connected: true });
    act(() => vi.advanceTimersByTime(QUIET_CHECK_MS));
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("doesn't offer Reload while the computer isn't connected", () => {
    const { hook } = tab({ quiet: () => false });
    hook.rerender({ version: "1.2.5" });
    hook.rerender({ version: "1.2.6" });
    act(() => vi.advanceTimersByTime(ASK_AFTER_MS + QUIET_CHECK_MS));
    expect(hook.result.current.asking).toBe(true);
    hook.rerender({ version: "1.2.6", connected: false });
    expect(hook.result.current.asking).toBe(false);
    hook.rerender({ version: "1.2.6", connected: true });
    expect(hook.result.current.asking).toBe(true);
  });

  it("stops looking and listening when the shell goes", () => {
    const listening = vi.spyOn(globalThis, "addEventListener");
    const stopped = vi.spyOn(globalThis, "removeEventListener");
    const { reload, hook } = tab();
    hook.rerender({ version: "1.2.5" });
    hook.rerender({ version: "1.2.6" });
    const kinds = ["pointerdown", "keydown", "wheel", "touchstart"];
    const heard = listening.mock.calls.filter(([kind]) => kinds.includes(kind));
    expect(heard.map(([kind]) => kind)).toEqual(kinds);
    expect(vi.getTimerCount()).toBe(1);

    hook.unmount();
    expect(vi.getTimerCount()).toBe(0);
    // Each listener taken off is the one that was put on.
    for (const [kind, listener] of heard) expect(stopped).toHaveBeenCalledWith(kind, listener);
    act(() => vi.advanceTimersByTime(IDLE_MS + QUIET_CHECK_MS * 2));
    expect(reload).not.toHaveBeenCalled();
    listening.mockRestore();
    stopped.mockRestore();
  });

  it("never reloads in Chips for Mac, whose own copy a reload would bring back", () => {
    const { reload, hook } = tab({ enabled: false });
    hook.rerender({ version: "1.2.5" });
    hook.rerender({ version: "1.2.6" });
    act(() => vi.advanceTimersByTime(ASK_AFTER_MS + QUIET_CHECK_MS));
    expect(reload).not.toHaveBeenCalled();
    expect(hook.result.current.asking).toBe(false);
  });
});
