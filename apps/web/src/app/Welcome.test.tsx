/**
 * The first screen (ADR 0217's addendum of 26 October), in a browser and in the Mac app with no
 * server: the Chips mark, and Watch Chips work playing under it. A click on the film's right goes
 * on a part, on its left back, → and ← the same, and a press held keeps it waiting. Skip, or the
 * film's end, puts That's Chips in its place: Set up my own Chips opens the page's ways in as they
 * have always been, I have an invite the field to paste into, and More walkthroughs plays the
 * other films in the same frame. Paste an invite link at the foot takes an invite for this page's
 * server to its card and says where another's goes. A page asked to pair again, or with a code on
 * its way, opens on its ways in, as before.
 */

import { chaptersOf } from "@chipschat/core";
import { inviteUrl } from "@chipschat/protocol";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Desktop } from "../native.ts";
import { videoNamed } from "./film/videos.ts";

// An invite's card asks its server what the link is for: here it is still asking, and no request
// leaves the test.
vi.mock("@chipschat/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@chipschat/core")>();
  return {
    ...actual,
    establishLink: () => new Promise(() => undefined),
    peekInvite: () => new Promise(() => undefined),
  };
});

import { Pair } from "./Pairing.tsx";

const WATCH = videoNamed("watch");
const AGENTS = videoNamed("agents");
if (WATCH === undefined || AGENTS === undefined) throw new Error("A film has no video.");
const PARTS = chaptersOf(WATCH);
const start = (part: number) => PARTS[part]?.start ?? Number.NaN;

beforeEach(() => {
  history.replaceState(null, "", "/");
  // The film, as the first screen fetches it: a few bytes, at an address in memory.
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(new Uint8Array([0, 0, 0, 1]))),
  );
  Object.defineProperty(URL, "createObjectURL", { configurable: true, value: () => "blob:film" });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: () => undefined });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/** A Mac app with nothing on its network. */
const MAC: Desktop = {
  discover: async () => [],
  ask: async () => undefined,
  tell: async () => undefined,
  badge: async () => undefined,
  onDecision: async () => () => undefined,
  onOpen: async () => () => undefined,
};

/** The film's video once its bytes have come, standing at `seconds`, as its element tells it. */
async function video(seconds = 0): Promise<HTMLVideoElement> {
  const element = (await screen.findByTestId("film-video")) as HTMLVideoElement;
  await vi.waitFor(() => expect(element.getAttribute("src")).toBe("blob:film"));
  Object.defineProperty(element, "currentTime", {
    configurable: true,
    writable: true,
    value: seconds,
  });
  act(() => void fireEvent.timeUpdate(element));
  return element;
}

/** A click on the film, `x` of its 360 pixels from its left. */
function click(x: number): void {
  const taps = screen.getByTestId("film-taps");
  taps.getBoundingClientRect = () => new DOMRect(0, 0, 360, 640);
  fireEvent.click(taps, { clientX: x });
}
const RIGHT = 300;
const LEFT = 60;

/** That's Chips, from Skip. */
function skip(): HTMLElement {
  fireEvent.click(screen.getByRole("button", { name: "Skip" }));
  return screen.getByTestId("demo-end");
}

describe("the first screen", () => {
  it("plays Watch Chips work under the mark, with Paste and Skip at its foot, and the ways in folded", async () => {
    render(<Pair onPaired={vi.fn()} onLookAround={vi.fn()} />);
    expect(screen.getByRole("heading", { level: 1, name: "Chips" })).toBeDefined();
    expect(screen.getByRole("heading", { level: 2, name: "Watch Chips work 1:14" })).toBeDefined();
    const element = await video();
    expect(element.muted).toBe(true);
    expect(element.autoplay).toBe(true);
    expect(screen.getAllByTestId("film-seg")).toHaveLength(PARTS.length);
    expect(screen.getByRole("button", { name: "Paste an invite link" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Skip" })).toBeDefined();
    expect(screen.queryByTestId("demo-end")).toBeNull();
    expect(screen.queryByLabelText("Pairing code")).toBeNull();
  });

  it("goes on a part from a click on the film's right, and back from its left", async () => {
    render(<Pair onPaired={vi.fn()} onLookAround={vi.fn()} />);
    const element = await video(start(2) + 4);
    click(RIGHT);
    expect(element.currentTime).toBe(start(3));
    expect(screen.getByTestId("film-flash-right-next")).toBeDefined();
    // Only just begun: the part before, from its start.
    click(LEFT);
    expect(element.currentTime).toBe(start(2));
    expect(screen.getByTestId("film-flash-left-previous")).toBeDefined();
    // Well into a part: its own start.
    act(() => {
      element.currentTime = start(2) + 3;
      fireEvent.timeUpdate(element);
    });
    click(LEFT);
    expect(element.currentTime).toBe(start(2));
    expect(screen.getByTestId("film-flash-left-again")).toBeDefined();
  });

  it("takes → and ← as the clicks, but not in a field", async () => {
    render(<Pair onPaired={vi.fn()} onLookAround={vi.fn()} />);
    const element = await video(start(4) + 4);
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(element.currentTime).toBe(start(5));
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    expect(element.currentTime).toBe(start(4));
    fireEvent.click(screen.getByRole("button", { name: "Paste an invite link" }));
    fireEvent.keyDown(screen.getByLabelText("Invite link"), { key: "ArrowRight" });
    expect(element.currentTime).toBe(start(4));
  });

  it("goes on from the last part to That's Chips", async () => {
    render(<Pair onPaired={vi.fn()} onLookAround={vi.fn()} />);
    await video(start(PARTS.length - 1) + 1);
    click(RIGHT);
    expect(
      within(screen.getByTestId("demo-end")).getByRole("heading", { name: "That's Chips" }),
    ).toBeDefined();
  });

  it("keeps the film waiting while a press is held, and plays on as it lifts", async () => {
    render(<Pair onPaired={vi.fn()} onLookAround={vi.fn()} />);
    const element = await video(start(1) + 1);
    act(() => void fireEvent.play(element));
    vi.useFakeTimers();
    const pause = vi.spyOn(element, "pause");
    const play = vi.spyOn(element, "play");
    const taps = screen.getByTestId("film-taps");
    fireEvent.pointerDown(taps);
    act(() => vi.advanceTimersByTime(300));
    expect(pause).toHaveBeenCalledTimes(1);
    fireEvent.pointerUp(taps);
    expect(play).toHaveBeenCalledTimes(1);
    // The click the press ends with is the hold's: the film stays in its part.
    click(RIGHT);
    expect(element.currentTime).toBe(start(1) + 1);
  });

  it("puts That's Chips in the film's place on Skip, with every way on", async () => {
    render(<Pair onPaired={vi.fn()} onLookAround={vi.fn()} />);
    await video();
    const end = skip();
    expect(within(end).getByRole("heading", { name: "That's Chips" })).toBeDefined();
    expect(screen.queryByRole("button", { name: "Skip" })).toBeNull();
    expect(screen.getByTestId("welcome-film").hidden).toBe(true);
    expect(screen.queryByRole("heading", { name: /^Watch Chips work/ })).toBeNull();
    expect(within(end).getByText("More walkthroughs")).toBeDefined();
    expect(within(end).getByRole("button", { name: "Your agents, up close, 0:47" })).toBeDefined();
    expect(within(end).getByRole("button", { name: "Costs and trouble, 0:38" })).toBeDefined();
    expect(within(end).getByRole("button", { name: "Look around" })).toBeDefined();
  });

  it("opens the page's ways in on Set up my own Chips, and folds them again", async () => {
    render(<Pair onPaired={vi.fn()} onLookAround={vi.fn()} />);
    await video();
    const own = within(skip()).getByRole("button", { name: "Set up my own Chips" });
    expect(own.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(own);
    expect(own.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("heading", { name: "Pair this browser" })).toBeDefined();
    expect(screen.getByLabelText("Pairing code")).toBeDefined();
    fireEvent.click(own);
    expect(screen.queryByLabelText("Pairing code")).toBeNull();
  });

  it("plays another film in the same frame from More walkthroughs, to its own end", async () => {
    render(<Pair onPaired={vi.fn()} onLookAround={vi.fn()} />);
    await video();
    fireEvent.click(within(skip()).getByRole("button", { name: /^Your agents, up close/ }));
    const element = await video();
    expect(fetch).toHaveBeenLastCalledWith(expect.stringContaining("agents"));
    expect(screen.getAllByTestId("film-seg")).toHaveLength(chaptersOf(AGENTS).length);
    expect(screen.getByRole("heading", { name: "Your agents, up close 0:47" })).toBeDefined();
    fireEvent.ended(element);
    const end = screen.getByTestId("demo-end");
    expect(within(end).getByRole("heading", { name: "That's an agent, up close" })).toBeDefined();
    expect(within(end).getByRole("button", { name: /^Watch Chips work/ })).toBeDefined();
  });

  it("plays the film from its start on Watch again, with the ways in folded", async () => {
    render(<Pair onPaired={vi.fn()} onLookAround={vi.fn()} />);
    const element = await video(start(3));
    const end = skip();
    fireEvent.click(within(end).getByRole("button", { name: "Set up my own Chips" }));
    fireEvent.click(within(end).getByRole("button", { name: "Watch again" }));
    expect(element.currentTime).toBe(0);
    expect(screen.queryByTestId("demo-end")).toBeNull();
    expect(screen.getByTestId("welcome-film").hidden).toBe(false);
    expect(screen.queryByLabelText("Pairing code")).toBeNull();
  });

  it("looks around from That's Chips", async () => {
    const onLookAround = vi.fn();
    render(<Pair onPaired={vi.fn()} onLookAround={onLookAround} />);
    await video();
    fireEvent.click(within(skip()).getByRole("button", { name: "Look around" }));
    expect(onLookAround).toHaveBeenCalledTimes(1);
  });

  it("takes an invite for this page's server to its card, and points another's at its own", async () => {
    render(<Pair onPaired={vi.fn()} onLookAround={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Paste an invite link" }));
    const field = screen.getByLabelText("Invite link");
    expect(document.activeElement).toBe(field);

    fireEvent.change(field, { target: { value: "hello there" } });
    expect(screen.getByRole("status").textContent).toContain("isn't an invite link");

    const elsewhere = inviteUrl("https://chips.example.org", "chips_inv_far");
    fireEvent.change(field, { target: { value: elsewhere } });
    expect(screen.getByRole("status").textContent).toContain("chips.example.org");
    expect(screen.getByTestId("welcome-invite-open").getAttribute("href")).toBe(elsewhere);

    // This page's own server: the invite's card, as the link opened here would be.
    fireEvent.change(field, { target: { value: inviteUrl(location.origin, "chips_inv_here") } });
    expect(await screen.findByTestId("join")).toBeDefined();
  });

  it("opens the invite field under That's Chips' I have an invite", async () => {
    render(<Pair onPaired={vi.fn()} onLookAround={vi.fn()} />);
    await video();
    const invite = within(skip()).getByRole("button", { name: "I have an invite" });
    fireEvent.click(invite);
    expect(invite.getAttribute("aria-expanded")).toBe("true");
    expect(within(screen.getByTestId("demo-end")).getByLabelText("Invite link")).toBeDefined();
  });

  it("opens on That's Chips where the demo's end card sent the person: the ways in, or the invite field", () => {
    const { unmount } = render(<Pair onPaired={vi.fn()} onLookAround={vi.fn()} opensOn="own" />);
    expect(screen.getByTestId("demo-end")).toBeDefined();
    expect(screen.getByLabelText("Pairing code")).toBeDefined();
    unmount();
    render(<Pair onPaired={vi.fn()} onLookAround={vi.fn()} opensOn="invite" />);
    expect(screen.getByTestId("demo-end")).toBeDefined();
    expect(screen.getByLabelText("Invite link")).toBeDefined();
    expect(screen.queryByLabelText("Pairing code")).toBeNull();
  });

  it("is not there to pair again, with a code on its way, or without Look around", () => {
    const again = render(
      <Pair
        onPaired={vi.fn()}
        onLookAround={vi.fn()}
        reason="This server does not know this browser."
      />,
    );
    expect(screen.queryByTestId("welcome")).toBeNull();
    expect(screen.getByLabelText("Pairing code")).toBeDefined();
    again.unmount();
    const without = render(<Pair onPaired={vi.fn()} />);
    expect(screen.queryByTestId("welcome")).toBeNull();
    without.unmount();
    // A pairing link's code goes at once (ADR 0121): nothing stands before it.
    history.replaceState(null, "", "/#pair=ABC-234&v=1");
    render(<Pair onPaired={vi.fn()} onLookAround={vi.fn()} />);
    expect(screen.queryByTestId("welcome")).toBeNull();
  });

  it("stands at the top of the Mac app's page with no server, over Find your server", async () => {
    render(<Pair onPaired={vi.fn()} desktop={MAC} onLookAround={vi.fn()} />);
    expect(await screen.findByRole("heading", { level: 1, name: "Chips" })).toBeDefined();
    expect(screen.getByTestId("choose-server").dataset["welcome"]).toBe("true");
    expect(screen.queryByRole("heading", { name: "Find your server" })).toBeNull();
    await video();
    fireEvent.click(within(skip()).getByRole("button", { name: "Set up my own Chips" }));
    expect(await screen.findByRole("heading", { name: "Find your server" })).toBeDefined();
  });

  it("brings Chips on this Wi-Fi up under the film once one answers, and connects to it", async () => {
    const mini = {
      name: "Chips on the mini",
      host: "10.0.0.5",
      port: 4431,
      url: "http://10.0.0.5:4431",
    };
    let answer: (servers: (typeof mini)[]) => void = () => undefined;
    const found = new Promise<(typeof mini)[]>((resolve) => {
      answer = resolve;
    });
    render(
      <Pair
        onPaired={vi.fn()}
        desktop={{ ...MAC, discover: () => found }}
        onLookAround={vi.fn()}
      />,
    );
    expect(await screen.findByRole("heading", { level: 1, name: "Chips" })).toBeDefined();
    // Nothing before something answers.
    expect(screen.queryByTestId("pair-wifi")).toBeNull();
    answer([mini]);
    const wifi = await screen.findByTestId("pair-wifi");
    expect(wifi.textContent).toContain("On this Wi-Fi");
    // Under the film, with the ways in still folded.
    expect(screen.queryByRole("heading", { name: "Find your server" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Chips on the mini/ }));
    expect(await screen.findByRole("heading", { name: "Pair with your server" })).toBeDefined();
  });

  it("takes an invite pasted in the Mac app to the server the link names", async () => {
    render(<Pair onPaired={vi.fn()} desktop={MAC} onLookAround={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: "Paste an invite link" }));
    fireEvent.change(screen.getByLabelText("Invite link"), {
      target: { value: inviteUrl("http://mini.local:4431", "chips_inv_mac") },
    });
    expect(await screen.findByTestId("join")).toBeDefined();
  });
});
