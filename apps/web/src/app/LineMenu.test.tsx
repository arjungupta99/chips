/**
 * The line's menu on its own: what it offers, how it is put away, and where it lands. The room
 * that opens it is covered in `Shell.test.tsx`; what is here is the menu's own behaviour, which
 * a room test would only reach through several clicks.
 */

import type { Line } from "@chipschat/core";
import { deleteForEveryoneAsking } from "@chipschat/core";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LineHandlers, LineMay } from "./LineActions.tsx";
import { hasMenu, LineMenu } from "./LineMenu.tsx";

afterEach(cleanup);

const LINE: Line = {
  id: "evt_1",
  seq: 4,
  kind: "text",
  authorId: "hrn_scout",
  authorKind: "harness",
  text: "The PO is for the 12th.",
  ts: "2026-09-08T10:00:00.000Z",
} as Line;

const ALL: LineMay = { edit: true, remove: true, hide: true, pin: true };
const NONE: LineMay = { edit: false, remove: false, hide: false, pin: false };

function handlers(): LineHandlers & { readonly calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    edit: () => calls.push("edit"),
    remove: () => calls.push("remove"),
    hide: () => calls.push("hide"),
    show: () => calls.push("show"),
    pin: () => calls.push("pin"),
    unpin: () => calls.push("unpin"),
  };
}

function open(over: Partial<Parameters<typeof LineMenu>[0]> = {}) {
  const on = handlers();
  const onClose = vi.fn();
  const onDelete = vi.fn();
  render(
    <LineMenu
      at={{ x: 40, y: 60 }}
      spaceId="spc_1"
      line={LINE}
      may={ALL}
      pinned={false}
      busy={false}
      on={on}
      asking={deleteForEveryoneAsking(true)}
      onDelete={onDelete}
      onFeedback={() => undefined}
      onEdit={() => undefined}
      onNote={() => undefined}
      onClose={onClose}
      {...over}
    />,
  );
  return { on, onClose, onDelete, menu: screen.getByTestId("line-menu") };
}

const labels = (menu: HTMLElement) =>
  within(menu)
    .getAllByRole("menuitem")
    .map(
      (item) =>
        item.getAttribute("aria-label") ??
        item.querySelector(".line-menu-label")?.textContent ??
        item.textContent,
    );

/** The browser's next animation frame, wrapped for React: the menu's listeners arm on it. */
const nextFrame = () =>
  act(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));

describe("the line's menu", () => {
  it("offers, in the phone's order, Copy and every action the reader's standing allows, and no thumbs", () => {
    const { menu } = open();
    expect(labels(menu)).toEqual([
      "Copy",
      "Edit",
      "Pin",
      "Not right?",
      "Delete for me",
      "Delete for everyone",
    ]);
    // The quick actions, then a rule, then the rest (ADR 0200's capsule and card).
    expect(menu.querySelectorAll(".line-menu-rule")).toHaveLength(1);
  });

  it("says who a Not right? goes to under it, and who said the line and when at its head", () => {
    const { menu } = open({ name: "Scout", head: "Scout · Today 10:00 AM" });
    expect(within(menu).getByRole("menuitem", { name: "Not right?" }).textContent).toContain(
      "Tell Scout, and it tries again",
    );
    expect(within(menu).getByTestId("line-menu-head").textContent).toBe("Scout · Today 10:00 AM");
  });

  it("offers What the run did on the line that closed a run, its receipt's line under it", () => {
    const onRunDid = vi.fn();
    const { menu, onClose } = open({ runDid: "5 steps · 52s · ≈$0.42", onRunDid });
    const item = within(menu).getByRole("menuitem", { name: "What the run did" });
    expect(item.textContent).toContain("5 steps · 52s · ≈$0.42");
    fireEvent.click(item);
    expect(onRunDid).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it("copies the words as written, says Copied, and goes a beat later", async () => {
    vi.useFakeTimers();
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    try {
      const { menu, onClose } = open();
      fireEvent.click(within(menu).getByRole("menuitem", { name: "Copy" }));
      expect(writeText).toHaveBeenCalledWith("The PO is for the 12th.");
      expect(within(menu).getAllByRole("menuitem")[0]?.textContent).toBe("Copied");
      expect(onClose).not.toHaveBeenCalled();
      await act(async () => {
        vi.advanceTimersByTime(800);
      });
      expect(onClose).toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("offers to take a pin down, and nothing about a thread the line has grown", () => {
    // The offer is withdrawn (ADR 0035's addendum): a thread the log holds is not a menu item.
    const { menu } = open({
      line: { ...LINE, threadId: "spc_t", replyCount: 2 } as Line,
      pinned: true,
      onFeedback: undefined,
    });
    expect(labels(menu)).toEqual(["Copy", "Edit", "Unpin", "Delete for me", "Delete for everyone"]);
  });

  it("deletes for the reader alone at once, since Undo is there after (ADR 0167)", () => {
    const { menu, onDelete, onClose } = open();
    const item = within(menu).getByRole("menuitem", { name: "Delete for me" });
    expect(item.getAttribute("aria-describedby")).not.toBeNull();
    expect(item.textContent).toContain("Only you stop seeing it");
    fireEvent.click(item);
    expect(onDelete).toHaveBeenCalledWith("me");
    expect(onClose).toHaveBeenCalled();
  });

  it("asks before it deletes for everyone, saying what the agents keep, and Cancel backs out", () => {
    const { menu, on, onDelete, onClose } = open();
    fireEvent.click(within(menu).getByRole("menuitem", { name: "Delete for everyone" }));
    expect(onDelete).not.toHaveBeenCalled();
    const asking = screen.getByTestId("line-menu-asking");
    expect(asking.textContent).toContain("Delete for everyone?");
    expect(asking.textContent).toContain("keep what they read");

    fireEvent.click(
      within(screen.getByTestId("line-menu")).getByRole("menuitem", { name: "Cancel" }),
    );
    expect(on.calls).toEqual([]);
    expect(onClose).not.toHaveBeenCalled();
    expect(labels(screen.getByTestId("line-menu"))).toContain("Delete for everyone");

    fireEvent.click(
      within(screen.getByTestId("line-menu")).getByRole("menuitem", {
        name: "Delete for everyone",
      }),
    );
    fireEvent.click(
      within(screen.getByTestId("line-menu")).getByRole("menuitem", {
        name: "Delete for everyone",
      }),
    );
    expect(onDelete).toHaveBeenCalledWith("everyone");
    expect(onClose).toHaveBeenCalled();
  });

  it("offers a tombstone only to be deleted for the reader", () => {
    const { menu } = open({
      line: { ...LINE, deleted: true, text: "" } as Line,
      may: { edit: false, remove: false, hide: true, pin: false },
      onFeedback: undefined,
    });
    expect(labels(menu)).toEqual(["Delete for me"]);
  });

  it("walks the items with the arrow keys, wrapping at each end", () => {
    const { menu } = open({ onFeedback: undefined });
    const items = within(menu).getAllByRole("menuitem");
    expect(document.activeElement).toBe(items[0]);
    fireEvent.keyDown(menu, { key: "ArrowDown" });
    expect(document.activeElement).toBe(items[1]);
    fireEvent.keyDown(menu, { key: "ArrowUp" });
    fireEvent.keyDown(menu, { key: "ArrowUp" });
    expect(document.activeElement).toBe(items[items.length - 1]);
    // Anything else is the menu's business, not the list's.
    fireEvent.keyDown(menu, { key: "a" });
    expect(document.activeElement).toBe(items[items.length - 1]);
  });

  it("is put away by Escape, and by a press anywhere else", () => {
    const first = open();
    fireEvent.keyDown(first.menu, { key: "Escape" });
    expect(first.onClose).toHaveBeenCalledTimes(1);

    // A press inside it is somebody choosing, not somebody leaving.
    fireEvent(first.menu, new MouseEvent("pointerdown", { bubbles: true }));
    expect(first.onClose).toHaveBeenCalledTimes(1);

    fireEvent(document.body, new MouseEvent("pointerdown", { bubbles: true }));
    expect(first.onClose).toHaveBeenCalledTimes(2);
  });

  it("is put away by the reader scrolling, a wheel or a finger dragging, outside it", () => {
    const wheeled = open();
    fireEvent.wheel(wheeled.menu);
    expect(wheeled.onClose).not.toHaveBeenCalled();
    fireEvent.wheel(document.body);
    expect(wheeled.onClose).toHaveBeenCalledTimes(1);
    cleanup();

    const dragged = open();
    fireEvent.touchMove(document.body);
    expect(dragged.onClose).toHaveBeenCalledTimes(1);
  });

  it("stays while the room scrolls by itself, as an agent's line lands or a row comes into view", async () => {
    const { onClose } = open();
    fireEvent.scroll(window);
    await nextFrame();
    fireEvent.scroll(window);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("moves with its line as the room scrolls by itself, and goes once the line has left the room", () => {
    const room = document.createElement("div");
    const row = document.createElement("div");
    const spaces = document.createElement("div");
    room.append(row);
    document.body.append(room, spaces);
    let top = 200;
    room.getBoundingClientRect = () => ({ top: 100, bottom: 500, left: 0, right: 400 }) as DOMRect;
    row.getBoundingClientRect = () => ({ top, bottom: top + 40, left: 20, right: 380 }) as DOMRect;
    const { menu, onClose } = open({ at: { x: 40, y: 260 }, row: { current: row } });
    expect(menu.style.top).toBe("260px");

    // An agent's answer lands under it and the room follows: the line goes up 80, and so does the menu.
    top = 120;
    fireEvent.scroll(room);
    expect(menu.style.top).toBe("180px");
    expect(menu.style.left).toBe("40px");

    // The spaces list scrolling by itself is nothing to do with this line.
    top = 50;
    fireEvent.scroll(spaces);
    expect(menu.style.top).toBe("180px");
    expect(onClose).not.toHaveBeenCalled();

    // Past the top of the room, the line is out of sight, and a menu for it would be beside others.
    fireEvent.scroll(room);
    expect(onClose).toHaveBeenCalledTimes(1);
    room.remove();
    spaces.remove();
  });

  it("stays inside the window when it is asked for at the edge of it", () => {
    const { menu } = open({ at: { x: 9000, y: 9000 } });
    expect(menu.style.left).toBe(`${window.innerWidth - 8}px`);
    expect(menu.style.top).toBe(`${window.innerHeight - 8}px`);
  });

  it("holds every choice while what was already asked is on its way", () => {
    const { menu } = open({ busy: true });
    for (const item of within(menu).getAllByRole("menuitem")) {
      expect((item as HTMLButtonElement).disabled).toBe(true);
    }
  });
});

describe("whether there is a menu at all", () => {
  // A line with words always has Copy; one of files alone has only what the reader may do to it.
  const FILES = { ...LINE, text: "" } as Line;

  it("is nothing when a line of files alone offers nothing and takes no feedback", () => {
    expect(hasMenu(NONE, FILES, false)).toBe(false);
    expect(hasMenu({ ...NONE, hide: true }, FILES, false)).toBe(true);
    expect(hasMenu(NONE, LINE, false)).toBe(true);
  });

  it("is something for a Not right? alone, or a receipt, and nothing for a thread somebody else started", () => {
    expect(hasMenu(NONE, FILES, true)).toBe(true);
    expect(hasMenu(NONE, FILES, false, false, true)).toBe(true);
    expect(hasMenu(NONE, { ...FILES, threadId: "spc_t" } as Line, false)).toBe(false);
  });
});
