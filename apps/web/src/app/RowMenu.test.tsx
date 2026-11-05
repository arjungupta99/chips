/**
 * A room's row in the rail offers the phone's swipes on a right-click (`RowMenu.tsx`): Pin, Hide,
 * Archive and Delete in core's order and words, the reader's own acts at once and Archive and
 * Delete asked first; a refusal is said under Recent; and You is the fourth tab, in the phone's
 * order, with nothing at the rail's foot.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildModel, type ClientEvent, type Directory } from "@chipschat/core";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { RowActs } from "./RowMenu.tsx";
import { Sidebar } from "./Sidebar.tsx";

const FIXTURES = `${resolve(import.meta.dirname, "../../../../packages/protocol/fixtures")}/`;
const ARJUN = "usr_01K4ZQPX0000000000000ARJUN";

function fixture(type: string, seq: number, overrides: Record<string, unknown> = {}): ClientEvent {
  return { ...JSON.parse(readFileSync(`${FIXTURES}${type}.json`, "utf8")), seq, ...overrides };
}

const person = { kind: "person", id: ARJUN };
const model = buildModel([
  fixture("person.joined", 1, { participant_id: ARJUN, role: "owner", actor: person }),
  fixture("space.created", 2, { actor: person, space_id: "spc_japan", title: "Japan trip" }),
  fixture("space.created", 3, { actor: person, space_id: "spc_taxes", title: "Taxes" }),
  fixture("space.updated", 4, { actor: person, space_id: "spc_taxes", state: "closed" }),
]);
const directory = { [ARJUN]: { id: ARJUN, kind: "person", displayName: "Arjun" } } as Directory;

function rail(acts: RowActs, extra: { pinned?: string[]; tab?: "spaces" | "you" } = {}) {
  const onSelectTab = vi.fn();
  render(
    <Sidebar
      model={model}
      directory={directory}
      readState={{}}
      spaceIcons={new Map()}
      pinnedSpaces={extra.pinned ?? []}
      selectedSpaceId={undefined}
      tab={extra.tab ?? "spaces"}
      selfId={ARJUN}
      onSelectTab={onSelectTab}
      onSelectSpace={vi.fn()}
      onNewSpace={vi.fn()}
      rowActs={acts}
    />,
  );
  return { onSelectTab };
}

function acts(): RowActs & { [K in keyof RowActs]: ReturnType<typeof vi.fn> } {
  return {
    pin: vi.fn(() => Promise.resolve()),
    hide: vi.fn(() => Promise.resolve()),
    archive: vi.fn(() => Promise.resolve()),
    erase: vi.fn(() => Promise.resolve()),
  };
}

const row = (id: string) =>
  document.querySelector<HTMLElement>(`[data-space="${id}"]`) as HTMLElement;
const items = () =>
  within(screen.getByTestId("row-menu"))
    .getAllByRole("menuitem")
    .map((each) => each.textContent);

describe("a room's row on a right-click", () => {
  it("offers the phone's swipes in core's order, and pins and hides at once", () => {
    const done = acts();
    rail(done);
    fireEvent.contextMenu(row("spc_japan"), { clientX: 40, clientY: 200 });
    expect(items()).toEqual(["Pin", "Hide", "Archive", "Delete"]);
    expect(screen.getByRole("menu", { name: "What to do with Japan trip" })).toBeTruthy();
    fireEvent.click(screen.getByTestId("row-act-pin"));
    expect(done.pin).toHaveBeenCalledWith("spc_japan", true);
    expect(screen.queryByTestId("row-menu")).toBeNull();
    // The row has the focus back, for a keyboard that opened it.
    expect(document.activeElement).toBe(row("spc_japan"));

    fireEvent.contextMenu(row("spc_japan"), { clientX: 40, clientY: 200 });
    fireEvent.click(screen.getByTestId("row-act-hide"));
    expect(done.hide).toHaveBeenCalledWith("spc_japan", true);
  });

  it("offers Change icon first, as the phone's long press, where the shell can open the sheet", () => {
    const icon = vi.fn();
    rail({ ...acts(), icon });
    fireEvent.contextMenu(row("spc_japan"), { clientX: 40, clientY: 200 });
    expect(items()).toEqual(["Change icon", "Pin", "Hide", "Archive", "Delete"]);
    // It takes the focus first, for a keyboard that opened the menu.
    expect(document.activeElement).toBe(screen.getByTestId("row-act-icon"));
    fireEvent.click(screen.getByTestId("row-act-icon"));
    expect(icon).toHaveBeenCalledWith("spc_japan");
    expect(screen.queryByTestId("row-menu")).toBeNull();
  });

  it("offers Unpin on a pinned room, and Unarchive at once on an archived one", () => {
    const done = acts();
    rail(done, { pinned: ["spc_japan"] });
    fireEvent.contextMenu(row("spc_japan"), { clientX: 40, clientY: 200 });
    expect(items()[0]).toBe("Unpin");
    fireEvent.keyDown(screen.getByTestId("row-menu"), { key: "Escape" });
    expect(screen.queryByTestId("row-menu")).toBeNull();

    fireEvent.click(screen.getByTestId("archived-toggle"));
    fireEvent.contextMenu(row("spc_taxes"), { clientX: 40, clientY: 300 });
    expect(items()).toEqual(["Unarchive", "Delete"]);
    fireEvent.click(screen.getByTestId("row-act-unarchive"));
    expect(done.archive).toHaveBeenCalledWith("spc_taxes", false);
  });

  it("asks before it archives or deletes, in the room sheet's words", async () => {
    const done = acts();
    rail(done);
    fireEvent.contextMenu(row("spc_japan"), { clientX: 40, clientY: 200 });
    fireEvent.click(screen.getByTestId("row-act-delete"));
    expect(done.erase).not.toHaveBeenCalled();
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Delete Japan trip?")).toBeTruthy();
    // Cancel gives the row the focus back, and asking again asks again.
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(document.activeElement).toBe(row("spc_japan"));
    fireEvent.contextMenu(row("spc_japan"), { clientX: 40, clientY: 200 });
    fireEvent.click(screen.getByTestId("row-act-delete"));
    fireEvent.click(
      within(await screen.findByRole("dialog")).getByRole("button", { name: "Delete" }),
    );
    await waitFor(() =>
      expect(done.erase).toHaveBeenCalledWith("spc_japan", { deleteAgent: false }),
    );
  });

  it("says under Recent why a pin did not hold", async () => {
    const done = acts();
    done.pin.mockImplementation(() => Promise.reject(new Error("404 no route matches")));
    rail(done);
    fireEvent.contextMenu(row("spc_japan"), { clientX: 40, clientY: 200 });
    await act(async () => fireEvent.click(screen.getByTestId("row-act-pin")));
    expect((await screen.findByTestId("row-note")).textContent).toBe(
      "Not pinned: this server is older than the app.",
    );
  });
});

describe("the rail's tabs", () => {
  it("are the phone's four, in its order, with You lit over the workspace's log too", () => {
    const { onSelectTab } = rail(acts(), { tab: "you" });
    const nav = screen.getByRole("navigation", { name: "Sections" });
    expect(
      within(nav)
        .getAllByRole("button")
        .map((each) => each.textContent),
    ).toEqual(["Spaces", "Agents", "Search", "You"]);
    const you = screen.getByTestId("you");
    expect(you.getAttribute("aria-current")).toBe("page");
    fireEvent.click(you);
    expect(onSelectTab).toHaveBeenCalledWith("you");
  });
});

describe("the rail with no open room", () => {
  it("says nothing over rooms that are only archived", () => {
    rail(acts());
    expect(screen.getByTestId("space-list").textContent).not.toContain("No spaces yet.");
  });
});
