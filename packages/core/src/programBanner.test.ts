/**
 * The program's banner over a page in Universe, and the sheet a link brings up (ADR 0227's
 * addendum of 9 November 2026): the banner said from the Desktop tab's run bar, what a tapped link
 * does, and the sheet's words.
 */

import { describe, expect, it } from "vitest";
import type { Directory } from "./events.js";
import {
  addressShown,
  askAfterNews,
  askUnheard,
  frameAsks,
  isOwnAddress,
  linkAsk,
  linkTap,
  memberBanner,
  ownerNameOf,
  PROGRAM_BANNER,
  programBanner,
} from "./programBanner.js";
import { runBar } from "./projectRun.js";

const NOW = Date.parse("2026-11-09T20:10:00.000Z");
const recipe = { run: "python3 app/server.py" };
const banner = (input: Omit<Parameters<typeof runBar>[0], "now">) =>
  programBanner(runBar({ ...input, now: NOW }));

describe("the program's banner", () => {
  it("says the program isn't running, with Run, until it runs", () => {
    expect(banner({ recipe })).toEqual({
      kind: "off",
      title: "Program isn’t running",
      body: "Some links here open only while it runs on your Mac.",
      tone: "plain",
      press: "run",
    });
    const stopped = banner({
      recipe,
      run: { state: "stopped", ended: "2026-11-09T20:09:00.000Z" },
    });
    expect(stopped).toMatchObject({ kind: "off", press: "run", body: PROGRAM_BANNER.offBody });
  });

  it("says why a press did nothing, and has no Run when the run file can't be used", () => {
    expect(banner({ recipe, macs: 0 })).toMatchObject({
      kind: "off",
      tone: "bad",
      press: "run",
      body: "Chips for Mac isn't open, so nothing ran. Open Chips on your Mac and press again.",
    });
    expect(banner({ recipe: { why: "run.json isn't JSON." } })).toMatchObject({
      kind: "off",
      tone: "bad",
      body: "run.json isn't JSON.",
      press: undefined,
    });
  });

  it("says who changed the files since the person last ran it, over Run (SEC-40)", () => {
    expect(banner({ recipe, changedBy: ["Luis"] })).toMatchObject({
      kind: "off",
      tone: "changed",
      body: "Changed by Luis since you last ran it.",
      press: "run",
    });
  });

  it("has Stop while it starts and while it runs", () => {
    expect(banner({ recipe, run: { state: "starting" } })).toEqual({
      kind: "starting",
      title: "Starting on your Mac",
      body: "Some links here open once it’s up.",
      tone: "plain",
      press: "stop",
    });
    const running = banner({
      recipe,
      run: { state: "running", since: "2026-11-09T20:06:00.000Z" },
    });
    expect(running).toEqual({
      kind: "running",
      title: "Running on your Mac",
      body: "Links here open now.",
      tone: "plain",
      press: "stop",
      settles: true,
    });
  });

  it("keeps what went wrong with a running program in sight rather than folding it away", () => {
    const trouble = "It's running, but nothing answered at localhost:4173 after 30 seconds.";
    expect(
      banner({ recipe, run: { state: "running", since: "2026-11-09T20:09:00.000Z", trouble } }),
    ).toMatchObject({ kind: "running", body: trouble, settles: false, press: "stop" });
  });

  it("says how it ended, with Run again", () => {
    const failed = banner({
      recipe,
      run: {
        state: "failed",
        since: "2026-11-09T19:50:00.000Z",
        ended: "2026-11-09T20:02:00.000Z",
        code: 1,
      },
    });
    expect(failed).toEqual({
      kind: "ended",
      title: "It stopped after 12 min.",
      body: "It ended with code 1.",
      tone: "bad",
      press: "run",
    });
    const finished = banner({
      recipe,
      run: { state: "ended", since: "2026-11-09T19:50:00.000Z", ended: "2026-11-09T20:02:00.000Z" },
    });
    expect(finished).toMatchObject({
      kind: "ended",
      body: PROGRAM_BANNER.againBody,
      tone: "plain",
    });
  });

  it("tells somebody who isn't the owner whose Mac it runs on, with nothing to press", () => {
    expect(memberBanner("Arjun")).toEqual({
      kind: "off",
      title: "Runs on Arjun’s Mac",
      body: "Some links here open only while Arjun runs it.",
      tone: "plain",
    });
    expect(memberBanner(undefined).title).toBe("Runs on the owner’s Mac");
  });

  it("names the owner from the directory, else as they joined, never by an id", () => {
    const people = {
      usr_a: { participantId: "usr_a", displayName: "arjun", role: "owner", joinedAt: "" },
      usr_l: { participantId: "usr_l", displayName: "Luis", role: "member", joinedAt: "" },
    } as const;
    const directory = { usr_a: { displayName: "Arjun" } } as unknown as Directory;
    expect(ownerNameOf({ people }, directory)).toBe("Arjun");
    expect(ownerNameOf({ people }, {})).toBe("arjun");
    expect(ownerNameOf({ people: {} }, directory)).toBeUndefined();
  });
});

describe("a link tapped on a page of the space", () => {
  const off = { program: true, owner: true, kind: "off" } as const;
  const app = "https://mac-mini.example.ts.net:8443/overview.html";

  it("asks first when the owner's program isn't running, and while it starts", () => {
    expect(linkTap({ ...off, url: app })).toBe("ask");
    expect(linkTap({ ...off, kind: "starting", url: app })).toBe("ask");
    expect(linkTap({ ...off, kind: "ended", url: app })).toBe("ask");
  });

  it("opens at once while it runs, for anybody else, and where there is no program", () => {
    expect(linkTap({ ...off, kind: "running", url: app })).toBe("open");
    expect(linkTap({ ...off, owner: false, url: app })).toBe("open");
    expect(linkTap({ ...off, program: false, url: app })).toBe("open");
  });

  it("opens mail and anything but a web address as it would anywhere", () => {
    expect(linkTap({ ...off, url: "mailto:dr.gill@example.com" })).toBe("open");
  });

  it("says the phone's own address opens only on the Mac, running or not", () => {
    for (const url of [
      "http://localhost:4173/home.html",
      "http://127.0.0.1:4173",
      "http://[::1]:4173/",
      "http://app.localhost/",
    ]) {
      expect(linkTap({ ...off, url })).toBe("here-only");
      expect(linkTap({ ...off, kind: "running", owner: false, url })).toBe("here-only");
    }
    expect(isOwnAddress(app)).toBe(false);
    expect(isOwnAddress("http://localhost.example.com")).toBe(false);
  });

  it("takes localhost on the Mac itself as an address that needs the program", () => {
    const local = "http://localhost:4173/home.html";
    expect(linkTap({ ...off, onTheMac: true, url: local })).toBe("ask");
    expect(linkTap({ ...off, onTheMac: true, kind: "running", url: local })).toBe("open");
  });
});

describe("which links a page's frame hands to its window", () => {
  const off = { program: true, owner: true, kind: "off", onTheMac: true } as const;

  it("hands every address over while the owner's program isn't running, on the Mac or not", () => {
    expect(frameAsks(off)).toBe("every");
    expect(frameAsks({ ...off, kind: "starting" })).toBe("every");
    expect(frameAsks({ ...off, onTheMac: false, kind: "ended" })).toBe("every");
  });

  it("hands every address over on the Mac while it runs, and only localhost in a browser", () => {
    // The Mac looks at an address only some devices reach before it opens it (10 November 2026).
    expect(frameAsks({ ...off, kind: "running" })).toBe("every");
    expect(frameAsks({ ...off, kind: "running", onTheMac: false })).toBe("own");
  });

  it("hands every address over on the Mac for anybody, program or not", () => {
    expect(frameAsks({ ...off, owner: false })).toBe("every");
    expect(frameAsks({ ...off, program: false })).toBe("every");
  });

  it("hands none over for somebody who isn't the owner, whose links open as anywhere", () => {
    expect(frameAsks({ ...off, owner: false, onTheMac: false })).toBe("none");
  });

  it("hands none over where the space has no program", () => {
    expect(frameAsks({ ...off, program: false, onTheMac: false })).toBe("none");
    expect(isOwnAddress("not a url")).toBe(false);
  });
});

describe("the sheet a link brings up", () => {
  it("asks, with Run and open and Open anyway", () => {
    expect(linkAsk("ask")).toEqual({
      kind: "ask",
      title: "This link needs the program running",
      body: "It runs on your Mac. Run it, and Chips opens the page once it answers.",
      tone: "plain",
      go: "Run and open",
      anyway: true,
    });
    expect(linkAsk("ask", { changed: "Changed by Luis since you last ran it." })).toMatchObject({
      body: "Changed by Luis since you last ran it.",
      tone: "changed",
    });
  });

  it("waits while it starts and opens, with Open anyway folded away", () => {
    expect(linkAsk("starting")).toMatchObject({ busy: true, anyway: false });
    const opening = linkAsk("opening");
    expect(opening).toMatchObject({ title: "Opening the page", busy: true });
    expect(opening.body).toBeUndefined();
  });

  it("says when the page doesn't answer, or the Mac didn't hear, or the run stopped", () => {
    expect(linkAsk("quiet")).toMatchObject({
      title: "The page isn’t answering yet",
      body: "The program is running, but nothing answered after 20 seconds.",
      go: "Open anyway",
      anyway: false,
    });
    expect(linkAsk("unheard", { said: "Chips for Mac isn't open." })).toMatchObject({
      tone: "bad",
      body: "Chips for Mac isn't open.",
      anyway: true,
    });
    expect(linkAsk("failed", { said: "Only this Mac's own server runs it." })).toMatchObject({
      title: "It didn’t start",
      tone: "bad",
      anyway: true,
    });
    expect(linkAsk("stopped", { said: "It ended with code 1." })).toMatchObject({
      title: "The program stopped",
      tone: "bad",
    });
  });

  it("offers Open in a browser once it runs, since the browser can't ask the page itself", () => {
    expect(linkAsk("ready")).toEqual({
      kind: "ready",
      title: "Running on your Mac",
      body: "Open the page once it’s up.",
      tone: "plain",
      go: "Open",
      anyway: false,
    });
  });

  it("moves on as the Mac says the run started, ended or stopped", () => {
    const off = programBanner(runBar({ recipe: { run: "python3 app/server.py" } }));
    expect(askAfterNews({ state: "starting" }, off)).toBeUndefined();
    expect(askAfterNews({ state: "running" }, off)).toEqual({ kind: "opening" });
    expect(askAfterNews({ state: "stopped" }, off)).toEqual({
      kind: "stopped",
      said: "It was stopped.",
    });
  });

  it("says why Run and open did nothing: the ask failed, or no Mac heard it", () => {
    expect(askUnheard({ failed: "The server is gone." })).toBe("The server is gone.");
    expect(askUnheard({ macs: 0 })).toBe(
      "Chips for Mac isn't open, so nothing ran. Open Chips on your Mac and press again.",
    );
    expect(askUnheard({ macs: 1 })).toBeUndefined();
  });

  it("shows the address without its scheme", () => {
    expect(addressShown("https://mac-mini.example.ts.net:8443/overview.html")).toBe(
      "mac-mini.example.ts.net:8443/overview.html",
    );
  });
});
