/**
 * The film's player on the web and in the Mac app (ADR 0217, FV3; its addendum of 26 October): the
 * film fetched whole and played from memory, the chapter bar filled from the video's time, a
 * segment going to its part, a click on the film's right or left and → and ←, Pause, Skip, Escape
 * and Leave, and the app's own end card after the video's end with its ways on. A real decoder is
 * the browser's, in `e2e/the-demo.spec.ts`.
 */

import { chaptersOf, spokenOf } from "@chipschat/core";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { FilmPlayer, type FilmWays } from "./FilmPlayer.tsx";
import { videoNamed } from "./videos.ts";

const WATCH = videoNamed("watch");
if (WATCH === undefined) throw new Error("Watch Chips work has no video.");
const CHAPTERS = chaptersOf(WATCH);

/** The film as the page fetches it: a few bytes stand in for it, at an address in memory. */
function stubFilm(answer: () => Promise<Response>): void {
  vi.stubGlobal("fetch", vi.fn(answer));
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: vi.fn(() => "blob:film"),
  });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
}

function ways(): FilmWays {
  return {
    onLeave: vi.fn(),
    onSetUp: vi.fn(),
    onInvite: vi.fn(),
    onFilm: vi.fn(),
    onLookAround: vi.fn(),
  };
}

/** The video element, once the film's bytes have come. */
async function video(): Promise<HTMLVideoElement> {
  const element = (await screen.findByTestId("film-video")) as HTMLVideoElement;
  await vi.waitFor(() => expect(element.getAttribute("src")).toBe("blob:film"));
  return element;
}

/** Where the video stands, as its element says, told as the element tells it. */
function at(element: HTMLVideoElement, seconds: number): void {
  Object.defineProperty(element, "currentTime", { configurable: true, writable: true });
  element.currentTime = seconds;
  fireEvent.timeUpdate(element);
}

/** How each segment stands: done, now or later. */
const standing = () => screen.getAllByTestId("film-seg").map((each) => each.dataset["state"]);

beforeEach(() => {
  stubFilm(async () => new Response(new Uint8Array([0, 0, 0, 1])));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

it("fetches the film whole and plays it from memory, in a modal dialog", async () => {
  render(<FilmPlayer video={WATCH} ways={ways()} />);
  const element = await video();
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(element.muted).toBe(true);
  expect(element.autoplay).toBe(true);
  expect((screen.getByTestId("film-player") as HTMLDialogElement).open).toBe(true);
  expect(screen.getAllByTestId("film-seg")).toHaveLength(CHAPTERS.length);
});

it("fills the bar from the video's time, and says the beat's words", async () => {
  render(<FilmPlayer video={WATCH} ways={ways()} />);
  const element = await video();
  const spaces = CHAPTERS[2];
  if (spaces === undefined) throw new Error("No third beat.");
  act(() => at(element, (spaces.start + spaces.end) / 2));
  expect(standing().slice(0, 4)).toEqual(["done", "done", "now", "later"]);
  expect(screen.getByTestId("demo-fill").dataset["fill"]).toBe("0.500");
  expect(element.getAttribute("aria-label")).toBe(spokenOf(spaces));
});

it("goes to a beat from its segment, and plays from there", async () => {
  render(<FilmPlayer video={WATCH} ways={ways()} />);
  const element = await video();
  Object.defineProperty(element, "currentTime", { configurable: true, writable: true, value: 0 });
  const play = vi.spyOn(element, "play");
  fireEvent.click(screen.getByRole("button", { name: "Play part 5, Who answers" }));
  expect(element.currentTime).toBe(CHAPTERS[4]?.start);
  expect(play).toHaveBeenCalled();
  expect(standing().slice(3, 6)).toEqual(["done", "now", "later"]);
});

it("pauses from Pause, and plays again from Play", async () => {
  render(<FilmPlayer video={WATCH} ways={ways()} />);
  const element = await video();
  act(() => at(element, 3));
  fireEvent.play(element);
  fireEvent.click(screen.getByRole("button", { name: "Pause" }));
  expect(await screen.findByTestId("film-paused")).toBeDefined();
  fireEvent.click(screen.getByRole("button", { name: "Play" }));
  expect(screen.queryByTestId("film-paused")).toBeNull();
  expect(screen.getByRole("button", { name: "Pause" })).toBeDefined();
});

it("goes on a part from a click on the film's right or →, and back from its left or ←", async () => {
  render(<FilmPlayer video={WATCH} ways={ways()} />);
  const element = await video();
  const taps = screen.getByTestId("film-taps");
  taps.getBoundingClientRect = () => new DOMRect(0, 0, 1080, 1920);
  act(() => at(element, (CHAPTERS[2]?.start ?? 0) + 4));
  fireEvent.click(taps, { clientX: 900 });
  expect(element.currentTime).toBe(CHAPTERS[3]?.start);
  fireEvent.click(taps, { clientX: 100 });
  expect(element.currentTime).toBe(CHAPTERS[2]?.start);
  fireEvent.keyDown(window, { key: "ArrowRight" });
  expect(element.currentTime).toBe(CHAPTERS[3]?.start);
  fireEvent.keyDown(window, { key: "ArrowLeft" });
  expect(element.currentTime).toBe(CHAPTERS[2]?.start);
});

it("goes straight to the end card from Skip", async () => {
  render(<FilmPlayer video={WATCH} ways={ways()} />);
  await video();
  fireEvent.click(screen.getByRole("button", { name: "Skip" }));
  const end = screen.getByTestId("demo-end");
  expect(within(end).getByRole("heading", { name: "That's Chips" })).toBeDefined();
  expect(screen.queryByRole("button", { name: "Skip" })).toBeNull();
});

it("leaves from Leave and from Escape", async () => {
  const told = ways();
  render(<FilmPlayer video={WATCH} ways={told} />);
  await video();
  fireEvent.click(screen.getByRole("button", { name: "Leave the film" }));
  const dialog = screen.getByTestId("film-player");
  const pressed = new Event("cancel", { cancelable: true });
  act(() => void dialog.dispatchEvent(pressed));
  expect(pressed.defaultPrevented).toBe(true);
  expect(told.onLeave).toHaveBeenCalledTimes(2);
});

it("ends on the app's own end card, whose ways go on, and Watch again plays it from the start", async () => {
  const told = ways();
  render(<FilmPlayer video={WATCH} ways={told} />);
  const element = await video();
  Object.defineProperty(element, "currentTime", { configurable: true, writable: true, value: 50 });
  fireEvent.ended(element);
  const end = screen.getByTestId("demo-end");
  expect(within(end).getByRole("heading", { name: "That's Chips" })).toBeDefined();
  expect(standing().every((each) => each === "done")).toBe(true);
  // No Pause on a film that has ended; the other films under More walkthroughs, with their lengths.
  expect(screen.queryByRole("button", { name: "Pause" })).toBeNull();
  expect(within(end).getByText("More walkthroughs")).toBeDefined();
  fireEvent.click(within(end).getByRole("button", { name: "Costs and trouble, 0:38" }));
  expect(told.onFilm).toHaveBeenCalledWith("trouble");
  for (const [name, way] of [
    ["Set up my own Chips", told.onSetUp],
    ["I have an invite", told.onInvite],
    ["Look around", told.onLookAround],
  ] as const) {
    fireEvent.click(within(end).getByRole("button", { name }));
    expect(way).toHaveBeenCalledTimes(1);
  }

  fireEvent.click(within(end).getByRole("button", { name: "Watch again" }));
  expect(element.currentTime).toBe(0);
  expect(screen.queryByTestId("demo-end")).toBeNull();
  expect(standing()[0]).toBe("now");
});

it("plays a short film with a segment for each of its parts, and offers the others after it", async () => {
  const agents = videoNamed("agents");
  if (agents === undefined) throw new Error("Your agents, up close has no video.");
  render(<FilmPlayer video={agents} ways={ways()} />);
  const element = await video();
  expect(fetch).toHaveBeenCalledWith(expect.stringContaining("agents"));
  expect(screen.getAllByTestId("film-seg")).toHaveLength(chaptersOf(agents).length);
  fireEvent.ended(element);
  const end = screen.getByTestId("demo-end");
  expect(within(end).getByRole("heading", { name: "That's an agent, up close" })).toBeDefined();
  expect(within(end).getByRole("button", { name: /Watch Chips work/ })).toBeDefined();
  expect(within(end).getByRole("button", { name: /Costs and trouble/ })).toBeDefined();
});

it("says so when the film cannot be fetched", async () => {
  stubFilm(async () => new Response("", { status: 404 }));
  render(<FilmPlayer video={WATCH} ways={ways()} />);
  expect((await screen.findByRole("alert")).textContent).toBe("The film did not load.");
  expect(screen.getByRole("button", { name: "Leave the film" })).toBeDefined();
});
