/**
 * The demo workspace in the app (ADR 0213, DM3), over the real core and the real script: the first
 * screen plays the film's video and makes nothing (ADR 0217's addendum of 26 October); Look around
 * from That's Chips makes the demo and puts it in front, kept in the switcher as Chips demo, and a
 * reload builds it again from the script; the switcher plays the films again over it; Remove takes
 * it away. And all the while nothing is kept where the device keeps its workspaces: IndexedDB is
 * never so much as opened for them.
 */

import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../App.tsx";
import { demoAtLaunch, keepDemo, keptDemo } from "./kept.ts";

/** Every database the page opened, by name; none is ever opened for real here. */
let opened: string[] = [];

beforeEach(() => {
  opened = [];
  // The film's video, as the player fetches it: a few bytes, at an address in memory.
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(new Uint8Array([0, 0, 0, 1]))),
  );
  Object.defineProperty(URL, "createObjectURL", { configurable: true, value: () => "blob:film" });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: () => undefined });
  // IndexedDB, as a page has it, recording what is opened and opening nothing.
  Object.defineProperty(globalThis, "indexedDB", {
    configurable: true,
    value: {
      open: (name: string) => {
        opened.push(name);
        throw new Error("no IndexedDB in this test");
      },
    },
  });
});

afterEach(() => {
  keepDemo(undefined);
  vi.unstubAllGlobals();
  Reflect.deleteProperty(globalThis, "indexedDB");
});

/** The first screen, and the film playing in its frame. */
async function watch(): Promise<HTMLElement> {
  await screen.findByRole("heading", { level: 1, name: "Chips" });
  return screen.findByTestId("welcome-film");
}

/** The switcher's Watch Chips work, over the demo once Look around has kept it. */
async function fromSwitcher(): Promise<HTMLElement> {
  const switcher = await screen.findByRole("combobox", { name: "Workspace" });
  await act(async () => {
    fireEvent.change(switcher, { target: { value: "-watch" } });
  });
  return screen.findByTestId("film-player");
}

/** The film's video at its end, and its end card. */
async function ended(): Promise<HTMLElement> {
  fireEvent.ended(await screen.findByTestId("film-video"));
  return screen.findByTestId("demo-end");
}

/** Look around from the end card. */
async function lookAround(): Promise<void> {
  const end = await ended();
  fireEvent.click(within(end).getByRole("button", { name: "Look around" }));
}

describe("the demo workspace", () => {
  it("plays the film's video on the first screen, and makes no demo for it", async () => {
    render(<App devices={[]} />);
    const film = await watch();
    expect(within(film).getAllByTestId("film-seg")).toHaveLength(8);
    expect(screen.queryByTestId("film-source")).toBeNull();
    expect(screen.queryByTestId("film-player")).toBeNull();
    expect(keptDemo()).toBeUndefined();
    expect(opened).not.toContain("chips");
  });

  it("is never kept where the device keeps its workspaces", async () => {
    render(<App devices={[]} />);
    await watch();
    await lookAround();
    await screen.findByRole("combobox", { name: "Workspace" });
    expect(opened).not.toContain("chips");
    // Kept, as a word of the page's own.
    expect(keptDemo()).toBe("front");
  });

  it("keeps Look around across a reload, built again from the script played to its end", async () => {
    const first = render(<App devices={[]} />);
    await watch();
    await lookAround();
    await screen.findByRole("combobox", { name: "Workspace" });
    first.unmount();

    // The next launch, as `main.tsx` makes it.
    const launch = await demoAtLaunch();
    expect(launch?.front).toBe(true);
    render(<App devices={[]} demo={launch} />);
    const switcher = await screen.findByRole("combobox", { name: "Workspace" });
    expect((switcher as HTMLSelectElement).selectedOptions[0]?.textContent).toBe("Chips demo");
    expect(screen.queryByTestId("film-source")).toBeNull();
    expect(await screen.findByText("Birthday dinner")).toBeDefined();
    expect(screen.getAllByTestId("demo-tag").length).toBeGreaterThan(0);
    // Played to its end: the last thing said in the room is there.
    expect(await screen.findByText(/Sent to 11/)).toBeDefined();
    expect(opened).not.toContain("chips");
  });

  it("opens the demo as the first film leaves it after Costs and trouble, not as that film does", async () => {
    render(<App devices={[]} />);
    await watch();
    const first = await ended();
    fireEvent.click(within(first).getByRole("button", { name: /Costs and trouble/ }));
    await lookAround();
    await screen.findByRole("combobox", { name: "Workspace" });
    // The first film's end: Morning brief's last line is Hugo's, not the question Herald, offline, left.
    expect(await screen.findByText(/Rain after 3/)).toBeDefined();
    expect(screen.queryByText("What's on tomorrow?")).toBeNull();
  });

  it("is taken away by Remove, and the page is the welcome again", async () => {
    render(<App devices={[]} />);
    await watch();
    await lookAround();
    const switcher = await screen.findByRole("combobox", { name: "Workspace" });
    expect(within(switcher).getByRole("option", { name: "Remove Chips demo" })).toBeDefined();
    await act(async () => {
      fireEvent.change(switcher, { target: { value: "-demo" } });
    });
    expect(await screen.findByRole("heading", { level: 1, name: "Chips" })).toBeDefined();
    expect(keptDemo()).toBeUndefined();
    expect(await demoAtLaunch()).toBeUndefined();
    expect(opened).not.toContain("chips");
  });

  it("plays the films again from the switcher, once Look around has kept it", async () => {
    render(<App devices={[]} />);
    await watch();
    await lookAround();
    await screen.findByRole("combobox", { name: "Workspace" });
    expect(screen.queryByTestId("film-player")).toBeNull();
    expect(await fromSwitcher()).toBeDefined();
    // The demo stays as it was looked around, behind the film.
    expect(keptDemo()).toBe("front");
    expect(opened).not.toContain("chips");
  });

  it("leaves the demo as it was when the switcher's film is left", async () => {
    render(<App devices={[]} />);
    await watch();
    await lookAround();
    await fromSwitcher();
    fireEvent.click(screen.getByRole("button", { name: "Leave the film" }));
    expect(screen.queryByTestId("film-player")).toBeNull();
    expect(await screen.findByRole("combobox", { name: "Workspace" })).toBeDefined();
    expect(keptDemo()).toBe("front");
  });

  it("says Not in the demo where a server of your own is needed, with Set up my own Chips", async () => {
    render(<App devices={[]} />);
    await watch();
    await lookAround();
    await screen.findByRole("combobox", { name: "Workspace" });
    // Agents: the line in place of Connect a harness.
    fireEvent.click(screen.getAllByRole("button", { name: /^Agents/ })[0] as HTMLElement);
    const agents = await screen.findByTestId("not-in-demo");
    expect(agents.textContent).toContain("Not in the demo");
    expect(screen.queryByRole("button", { name: "Connect a harness" })).toBeNull();
    // You: pairing a device, inviting somebody and connecting a harness, each the same.
    fireEvent.click(screen.getAllByTestId("you")[0] as HTMLElement);
    const devices = await screen.findByTestId("devices");
    expect(within(devices).getByTestId("not-in-demo")).toBeDefined();
    expect(within(devices).queryByText("Pair another device…")).toBeNull();
    expect(within(screen.getByTestId("invites")).getByTestId("not-in-demo")).toBeDefined();
    expect(within(screen.getByTestId("connect-harness")).getByTestId("not-in-demo")).toBeDefined();
    // Set up my own Chips: the pairing page's ways in, with the demo kept behind it.
    fireEvent.click(within(devices).getByRole("button", { name: "Set up my own Chips" }));
    expect(await screen.findByLabelText("Pairing code")).toBeDefined();
    expect(keptDemo()).toBe("front");
    fireEvent.click(screen.getByTestId("pair-cancel"));
    expect(await screen.findByRole("combobox", { name: "Workspace" })).toBeDefined();
  });

  it("sends the switcher's film's Set up my own Chips to the pairing page's ways in, on That's Chips", async () => {
    render(<App devices={[]} />);
    await watch();
    await lookAround();
    await fromSwitcher();
    fireEvent.click(screen.getByRole("button", { name: "Skip" }));
    const end = screen.getByTestId("demo-end");
    fireEvent.click(within(end).getByRole("button", { name: "Set up my own Chips" }));
    expect(await screen.findByLabelText("Pairing code")).toBeDefined();
    expect(screen.queryByTestId("film-player")).toBeNull();
    expect(
      within(screen.getByTestId("demo-end")).getByRole("heading", { name: "That's Chips" }),
    ).toBeDefined();
    expect(keptDemo()).toBe("front");
  });
});
