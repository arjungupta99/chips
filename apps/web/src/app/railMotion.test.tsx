/**
 * The rail moves as Arjun asked on 3 November 2026 ("smooth transitions", "highly polished"):
 * nothing comes, goes or moves in a frame where motion is wanted, and with Reduce Motion, or with
 * no screen to ask (a test's, unless it stubs one), every change is there at once. jsdom runs no
 * animation, so where one would end the test ends it by hand; the frames themselves were measured
 * in WebKit.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  buildModel,
  type ClientEvent,
  type Directory,
  type ReadState,
  type SetupStep,
} from "@chipschat/core";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { RowActs } from "./RowMenu.tsx";
import { SET_UP_FOLDS_MS, SetupRail } from "./SetupCard.tsx";
import { Sidebar } from "./Sidebar.tsx";

const FIXTURES = `${resolve(import.meta.dirname, "../../../../packages/protocol/fixtures")}/`;
const ARJUN = "usr_01K4ZQPX0000000000000ARJUN";

function fixture(type: string, seq: number, overrides: Record<string, unknown> = {}): ClientEvent {
  return { ...JSON.parse(readFileSync(`${FIXTURES}${type}.json`, "utf8")), seq, ...overrides };
}

const person = { kind: "person", id: ARJUN };
const events = [
  fixture("person.joined", 1, { participant_id: ARJUN, role: "owner", actor: person }),
  fixture("space.created", 2, { actor: person, space_id: "spc_japan", title: "Japan trip" }),
  fixture("space.created", 3, { actor: person, space_id: "spc_taxes", title: "Taxes" }),
  fixture("space.updated", 4, { actor: person, space_id: "spc_taxes", state: "closed" }),
  fixture("message.post", 5, { space_id: "spc_japan", actor: person, text: "Rail pass?" }),
];
const directory = { [ARJUN]: { id: ARJUN, kind: "person", displayName: "Arjun" } } as Directory;

const acts: RowActs = {
  pin: () => Promise.resolve(),
  hide: () => Promise.resolve(),
  archive: () => Promise.resolve(),
  erase: () => Promise.resolve(),
};

function rail(more: readonly ClientEvent[] = [], readState: ReadState = {}) {
  return (
    // The rail's top and, under it, Spaces' list, as the phone's menu draws them (ADR 0284).
    <Sidebar
      rooms
      model={buildModel([...events, ...more])}
      directory={directory}
      readState={readState}
      spaceIcons={new Map()}
      selectedSpaceId={undefined}
      tab="spaces"
      selfId={ARJUN}
      onSelectTab={vi.fn()}
      onSelectSpace={vi.fn()}
      workspaces={[{ deviceId: "dev_home", label: "Home", current: true, muted: false }]}
      rowActs={acts}
    />
  );
}

/** A screen that wants motion: no Reduce Motion asked for. */
function withMotion() {
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

/**
 * An animation's end, by name, as a browser sends it: jsdom has no `AnimationEvent`, so testing
 * library's leaves the name out, and the row's moves read it.
 */
function ended(element: HTMLElement, animationName: string): void {
  const event = new Event("animationend", { bubbles: true });
  Object.defineProperty(event, "animationName", { value: animationName });
  act(() => {
    element.dispatchEvent(event);
  });
}

const row = (id: string) =>
  document.querySelector<HTMLElement>(`[data-space="${id}"]`) as HTMLElement;

describe("the rail's menus", () => {
  it("put a row's menu away on a fade, the row given the focus back at once", () => {
    withMotion();
    render(rail());
    fireEvent.contextMenu(row("spc_japan"), { clientX: 40, clientY: 200 });
    const menu = screen.getByTestId("row-menu");
    fireEvent.keyDown(menu, { key: "Escape" });
    expect(menu.dataset["leaving"]).toBe("true");
    expect(document.activeElement).toBe(row("spc_japan"));
    ended(menu, "line-menu-out");
    expect(screen.queryByTestId("row-menu")).toBeNull();
  });

  it("put Workspaces away on a fade, the name no longer saying it is open", () => {
    withMotion();
    render(rail());
    const name = screen.getByTestId("workspace-switcher");
    fireEvent.click(name);
    const menu = screen.getByTestId("workspace-menu");
    fireEvent.keyDown(menu, { key: "Escape" });
    expect(menu.dataset["leaving"]).toBe("true");
    expect(name.getAttribute("aria-expanded")).toBe("false");
    ended(menu, "line-menu-out");
    expect(screen.queryByTestId("workspace-menu")).toBeNull();
  });

  it("go at once with nothing to watch", () => {
    render(rail());
    fireEvent.click(screen.getByTestId("workspace-switcher"));
    fireEvent.keyDown(screen.getByTestId("workspace-menu"), { key: "Escape" });
    expect(screen.queryByTestId("workspace-menu")).toBeNull();
  });
});

describe("a row's unread count", () => {
  it("pops in when it goes up, and shrinks away when read", () => {
    withMotion();
    const { rerender } = render(rail());
    const count = () => row("spc_japan").querySelector<HTMLElement>(".cv-unread");
    // There when the rail was drawn: it simply is.
    expect(count()?.dataset["new"]).toBeUndefined();
    rerender(rail([fixture("message.post", 6, { space_id: "spc_japan", actor: person })]));
    expect(count()?.textContent).toBe("2");
    expect(count()?.dataset["new"]).toBe("true");
    rerender(
      rail([fixture("message.post", 6, { space_id: "spc_japan", actor: person })], {
        spc_japan: 6,
      }),
    );
    expect(count()?.dataset["going"]).toBe("true");
    ended(count() as HTMLElement, "unread-go");
    expect(count()).toBeNull();
  });

  it("is gone at once when read, with no animation to end (Reduce Motion)", () => {
    const { rerender } = render(rail());
    expect(screen.getByTestId("unread").textContent).toBe("1");
    rerender(rail([], { spc_japan: 5 }));
    // It stood, a read count, for good: Reduce Motion stops every animation, so none ended.
    expect(row("spc_japan").querySelector(".cv-unread")).toBeNull();
  });
});

describe("rooms coming and going", () => {
  const bali = fixture("space.created", 6, { actor: person, space_id: "spc_bali", title: "Bali" });

  it("opens a room that comes after the rail was drawn into its place", () => {
    withMotion();
    const { rerender } = render(rail());
    expect(row("spc_japan").closest("li")?.dataset["new"]).toBeUndefined();
    rerender(rail([bali]));
    expect(row("spc_bali").closest("li")?.dataset["new"]).toBe("true");
    expect(row("spc_japan").closest("li")?.dataset["new"]).toBeUndefined();
  });

  it("draws it as it is with nothing to watch", () => {
    const { rerender } = render(rail());
    rerender(rail([bali]));
    expect(row("spc_bali").closest("li")?.dataset["new"]).toBeUndefined();
  });

  it("folds Archived's rooms shut into their heading, and lets them go once folded", () => {
    withMotion();
    render(rail());
    const toggle = screen.getByTestId("archived-toggle");
    fireEvent.click(toggle);
    const list = screen.getByTestId("archived-list");
    const fold = list.parentElement as HTMLElement;
    expect(fold.dataset["phase"]).toBe("opening");
    ended(fold, "move-fold");
    expect(fold.dataset["phase"]).toBeUndefined();
    fireEvent.click(toggle);
    expect(fold.dataset["phase"]).toBe("folding");
    expect(screen.getByTestId("archived-list")).toBe(list);
    ended(fold, "move-fold");
    expect(screen.queryByTestId("archived-list")).toBeNull();
  });
});

describe("the setup card's ×", () => {
  const steps: SetupStep[] = [
    { id: "running", title: "Chips is running", done: true },
    { id: "hello", title: "An agent said hello", done: false },
  ];

  it("folds the card away, and puts it away once folded", () => {
    withMotion();
    vi.useFakeTimers();
    const onHide = vi.fn();
    const { container } = render(<SetupRail theirs steps={steps} actions={{}} onHide={onHide} />);
    act(() => vi.advanceTimersByTime(0));
    fireEvent.click(screen.getByTestId("setup-hide"));
    expect(container.querySelector(".setup-fold")?.classList.contains("gone")).toBe(true);
    expect(onHide).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(SET_UP_FOLDS_MS));
    expect(onHide).toHaveBeenCalledTimes(1);
  });

  it("puts it away at once with nothing to watch", () => {
    const onHide = vi.fn();
    render(<SetupRail theirs steps={steps} actions={{}} onHide={onHide} />);
    fireEvent.click(screen.getByTestId("setup-hide"));
    expect(onHide).toHaveBeenCalledTimes(1);
  });
});
