/**
 * What Chips for Mac found on this Mac (ADR 0288), in the gallery: what is here comes first and
 * says so, an answer that arrives late adds the tag and moves nothing, and a browser, which can't
 * look, shows the gallery as it always has.
 */

import type { Connector } from "@chipschat/protocol";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const programsHere = vi.fn<(names: readonly string[]) => Promise<string[] | undefined>>();
let inMac = true;

vi.mock("../native.ts", async (original) => ({
  ...(await original<typeof import("../native.ts")>()),
  desktop: async () => (inMac ? { programsHere } : undefined),
}));

const card = (id: string, program: string): Connector => ({
  id,
  name: id,
  line: `${id}'s line`,
  kind: "one-line",
  command: `chips connect ${id} '{link}'`,
  program,
});
const CARDS = [card("first", "one"), card("second", "two"), card("third", "three")];

/** A fresh copy of the modules, with nothing found yet. */
async function gallery() {
  vi.resetModules();
  return import("./Join.tsx");
}

const order = () =>
  screen
    .getAllByTestId(/^join-card-/)
    .map((button) => button.getAttribute("data-testid")?.replace("join-card-", ""));

const tagOf = (id: string) =>
  screen.getByTestId(`join-card-${id}`).querySelector(".join-kind")?.textContent;

const settle = () => act(() => new Promise((done) => setTimeout(done, 0)));

beforeEach(() => {
  inMac = true;
  programsHere.mockReset();
});
afterEach(cleanup);

describe("the gallery, by what is on this Mac", () => {
  it("asks for the cards' agents, and tags what it found without moving a row", async () => {
    programsHere.mockResolvedValue(["three"]);
    const { Gallery } = await gallery();
    render(<Gallery titleId="t" cards={CARDS} onPick={() => undefined} />);
    await waitFor(() => expect(tagOf("third")).toBe("On this Mac"));
    expect(programsHere).toHaveBeenCalledWith(["one", "two", "three"]);
    expect(tagOf("first")).toBe("Run a line");
    expect(order()).toEqual(["first", "second", "third"]);
  });

  it("opens with what is here first when it was already known", async () => {
    programsHere.mockResolvedValue(["three"]);
    const { Gallery } = await gallery();
    const first = render(<Gallery titleId="t" cards={CARDS} onPick={() => undefined} />);
    await waitFor(() => expect(tagOf("third")).toBe("On this Mac"));
    first.unmount();
    render(<Gallery titleId="t" cards={CARDS} onPick={() => undefined} />);
    expect(order()).toEqual(["third", "first", "second"]);
  });

  it("looks again when the window comes back, which is when something was just installed", async () => {
    programsHere.mockResolvedValueOnce([]).mockResolvedValueOnce(["two"]);
    const { Gallery } = await gallery();
    render(<Gallery titleId="t" cards={CARDS} onPick={() => undefined} />);
    await settle();
    expect(tagOf("second")).toBe("Run a line");
    act(() => {
      window.dispatchEvent(new Event("focus"));
    });
    await waitFor(() => expect(tagOf("second")).toBe("On this Mac"));
  });

  it("stays as it is in a browser, and from a Mac app too old to say", async () => {
    inMac = false;
    const browser = await gallery();
    const shown = render(<browser.Gallery titleId="t" cards={CARDS} onPick={() => undefined} />);
    await settle();
    expect(order()).toEqual(["first", "second", "third"]);
    expect(tagOf("third")).toBe("Run a line");
    shown.unmount();

    inMac = true;
    programsHere.mockResolvedValue(undefined);
    const old = await gallery();
    render(<old.Gallery titleId="t" cards={CARDS} onPick={() => undefined} />);
    await settle();
    expect(tagOf("third")).toBe("Run a line");
  });
});
