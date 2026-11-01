/**
 * The first film played through the store every workspace has, and the fold behind it (ADR 0213):
 * what each chapter leaves on the snapshot, so a change to the wire or the fold that would break
 * the film on a newcomer's phone breaks here first. And a start at any chapter leaves what
 * playing to it would.
 */

import { parseEvent } from "@chipschat/protocol";
import { describe, expect, it } from "vitest";
import { waitingOn } from "../agents.js";
import { inAlbum, kindOf } from "../attachments.js";
import { doingSays } from "../bubbleSays.js";
import type { Line, Space } from "../model.js";
import type { Snapshot } from "../store.js";
import { summary, watch } from "../testing/demo.js";
import { runDoing } from "../timeline.js";
import { DEMO_PERSON_ID } from "./device.js";
import { APPROVALS, chapterLength, FILMS, filmOf, RUNS } from "./script.js";
import { AGENTS, BIRTHDAY, BRIEF, GARDEN, PEOPLE, RECEIPTS } from "./workspace.js";

const FILM = filmOf("watch");
const YOU = DEMO_PERSON_ID;

function room(snapshot: Snapshot, id: string): Space {
  const space = snapshot.model.spaces.find((each) => each.id === id);
  if (space === undefined) throw new Error(`no room ${id}`);
  return space;
}

/** What was said in a room, as its lines: a message, or one its run's summary folded into. */
function said(snapshot: Snapshot, id: string): readonly Line[] {
  return room(snapshot, id).lines.filter((line) => line.kind === "text" || line.kind === "summary");
}

function saidBy(snapshot: Snapshot, id: string, author: string, text: string): Line | undefined {
  return said(snapshot, id).find((line) => line.authorId === author && line.text.includes(text));
}

function runOf(snapshot: Snapshot, runId: string) {
  return snapshot.model.spaces.flatMap((space) => space.runs).find((run) => run.runId === runId);
}

function approval(snapshot: Snapshot, approvalId: string) {
  return runOf(snapshot, RUNS.dinner)?.approvals.find((each) => each.approvalId === approvalId);
}

function bubble(snapshot: Snapshot, runId: string) {
  const doing = runDoing(runOf(snapshot, runId));
  return doing === undefined ? undefined : doingSays(doing);
}

/** Nothing sent is still on its way, and no answer is still busy: what a chapter must not leave. */
function settled(snapshot: Snapshot, chapter: string): void {
  const sending = snapshot.model.spaces.flatMap((space) => space.lines).filter((l) => l.pending);
  expect(sending, chapter).toEqual([]);
  expect([...snapshot.busy], chapter).toEqual([]);
}

/**
 * No message waits on an agent that never answers it, or the room would say it hasn't picked it
 * up (ADR 0083): not in the history the film opens on, nor once it has played.
 */
function nobodyWaits(snapshot: Snapshot, when: string): void {
  const waits = snapshot.model.spaces.flatMap((space) => waitingOn(space, snapshot.directory));
  expect(waits, when).toEqual([]);
}

/** What each chapter leaves, checked at its end. */
const LEAVES: Readonly<Record<string, (snapshot: Snapshot) => void>> = {
  spaces: (snapshot) => {
    expect(snapshot.model.spaces.map((space) => space.title).sort()).toEqual([
      "Birthday dinner",
      "Garden website",
      "Morning brief",
      "Tax receipts",
    ]);
    expect(room(snapshot, BIRTHDAY).members).toEqual([
      YOU,
      PEOPLE.rosa.id,
      AGENTS.milo.id,
      AGENTS.theo.id,
    ]);
    expect(runOf(snapshot, RUNS.gallery)?.state).toBe("running");
    expect(bubble(snapshot, RUNS.gallery)).toMatchObject({
      label: "Thinking",
      detail: "Building the gallery page",
    });
    expect(snapshot.spaceIcons.get(BIRTHDAY)?.letters).toBe("🎂");
    expect(snapshot.workspaceName).toBe("Chips demo");
  },
  ask: (snapshot) => {
    const ask = saidBy(snapshot, BIRTHDAY, YOU, "Find somewhere for Mum's 60th");
    // To Milo alone, as You's message before it went (ADR 0081): Theo waits to be asked.
    expect(ask?.addressedTo).toEqual([AGENTS.milo.id]);
    expect(saidBy(snapshot, GARDEN, AGENTS.felix.id, "The gallery page is up")).toBeDefined();
    expect(runOf(snapshot, RUNS.gallery)).toMatchObject({ state: "done", costUsd: 0.11 });
  },
  watch: (snapshot) => {
    expect(runOf(snapshot, RUNS.dinner)?.state).toBe("running");
    expect(bubble(snapshot, RUNS.dinner)).toMatchObject({
      label: "Thinking",
      detail: "Comparing prices, reviews and a table for 12",
    });
  },
  steer: (snapshot) => {
    const steer = saidBy(snapshot, BIRTHDAY, YOU, "Somewhere she can walk to");
    expect(steer?.key).toBeDefined();
    expect(snapshot.receipts.get(steer?.key ?? "")).toBe("steered");
    expect(bubble(snapshot, RUNS.dinner)?.detail).toBe("Checking which are a walk from Mum's");
  },
  results: (snapshot) => {
    const table = saidBy(snapshot, BIRTHDAY, AGENTS.milo.id, "| Place | Per head | Rating |");
    expect(table?.text).toContain("| **Osteria Verde** | $58 | 4.7 |");
    // Milo has spoken since: the steer's receipt has said what it had to say.
    expect(snapshot.receipts.size).toBe(0);
  },
  teamwork: (snapshot) => {
    const handOff = saidBy(snapshot, BIRTHDAY, AGENTS.milo.id, "@Theo, could you make");
    expect(handOff?.mentions).toEqual([AGENTS.theo.id]);
    expect(handOff?.addressedTo).toEqual([AGENTS.theo.id]);
    const card = saidBy(snapshot, BIRTHDAY, AGENTS.theo.id, "Here's the card.");
    const [picture] = card?.attachments ?? [];
    expect(picture).toMatchObject({ mimeType: "image/png", width: 600, height: 800 });
    expect(kindOf(picture?.mimeType ?? "")).toBe("image");
    expect(picture === undefined ? false : inAlbum(picture)).toBe(true);
    expect(runOf(snapshot, RUNS.card)).toMatchObject({ state: "done", costUsd: 0.08 });
    expect(saidBy(snapshot, BIRTHDAY, PEOPLE.rosa.id, "Love the card!")).toBeDefined();
  },
  approve: (snapshot) => {
    const deposit = approval(snapshot, APPROVALS.deposit);
    expect(deposit?.question).toBe("Pay the $120 deposit to book Osteria Verde for 12?");
    expect(deposit?.resolved).toMatchObject({ decision: "approved", by: YOU, scope: "once" });
    expect(deposit?.resolved?.at).toMatch(/^2026-10-20T/);
    expect(deposit?.executed).toBe("executed");
    expect(saidBy(snapshot, BIRTHDAY, AGENTS.milo.id, "Booked.")).toBeDefined();
  },
  lock: (snapshot) => {
    const invites = approval(snapshot, APPROVALS.invites);
    expect(invites?.resolved).toMatchObject({ decision: "approved", by: YOU });
    expect(saidBy(snapshot, BIRTHDAY, AGENTS.milo.id, "Sent to 11.")).toBeDefined();
    expect(runOf(snapshot, RUNS.dinner)).toMatchObject({ state: "done", costUsd: 0.42 });
  },
  agents: (snapshot) => {
    expect(runOf(snapshot, RUNS.brief)?.state).toBe("done");
    expect(saidBy(snapshot, BRIEF, AGENTS.hugo.id, "Tomorrow's brief is ready")).toBeDefined();
    const agents = Object.values(snapshot.directory).filter((each) => each.kind === "agent");
    expect(agents.map((each) => each.displayName).sort()).toEqual([
      "Felix",
      "Hugo",
      "Milo",
      "Oscar",
      "Theo",
    ]);
    expect(said(snapshot, RECEIPTS)).toHaveLength(2);
  },
};

describe("the first film", () => {
  it("is ten chapters, each long enough to see what it does", () => {
    expect(FILMS[0]?.key).toBe("watch");
    expect(FILM.chapters.map((chapter) => chapter.key)).toEqual([
      "spaces",
      "ask",
      "watch",
      "steer",
      "results",
      "teamwork",
      "pick",
      "approve",
      "lock",
      "agents",
    ]);
    for (const chapter of FILM.chapters) {
      expect(chapterLength(chapter), chapter.key).toBeGreaterThan(3000);
    }
  });

  it("names no date, which would go stale, and promises nothing an agent does, in any film", () => {
    const words = JSON.stringify(FILMS);
    expect(words).not.toMatch(
      /January|February|March|April|\bMay\b|June|July|August|September|October|November|December/,
    );
    expect(words).not.toMatch(/\balways\b|nothing risky|\bminutes?\b/i);
  });

  it("leaves each chapter's mark on the snapshot, with nothing still sending or busy", async () => {
    const h = await watch();
    h.player.play();
    for (const chapter of FILM.chapters) {
      await h.clock.advance(chapterLength(chapter));
      const snapshot = h.snapshot();
      settled(snapshot, chapter.key);
      LEAVES[chapter.key]?.(snapshot);
      if (chapter === FILM.chapters[0]) nobodyWaits(snapshot, "as the film opens");
    }
    nobodyWaits(h.snapshot(), "played whole");
    expect(h.player.getState()).toMatchObject({ ended: true, playing: false });
    h.close();
  });

  it("sends the store nothing the protocol's schemas would not take, nor a field they drop", async () => {
    const h = await watch({ from: FILM.chapters.length });
    const logged = h.delivered.filter((event) => event.type !== "hello");
    expect(logged.length).toBeGreaterThan(50);
    for (const event of logged) {
      const parsed = parseEvent(event);
      expect(parsed.ok ? [] : parsed.error, `${event.seq} ${event.type}`).toEqual([]);
      expect(parsed.ok ? parsed.dropped : [], `${event.seq} ${event.type}`).toEqual([]);
    }
    h.close();
  });

  it("starts at any chapter where playing to it would have left the store", async () => {
    const h = await watch();
    h.player.play();
    const played: ReturnType<typeof summary>[] = [summary(h.snapshot())];
    for (const chapter of FILM.chapters) {
      await h.clock.advance(chapterLength(chapter));
      played.push(summary(h.snapshot()));
    }
    h.close();
    for (let from = 1; from <= FILM.chapters.length; from += 1) {
      const jumped = await watch({ from });
      expect(summary(jumped.snapshot()), `from chapter ${from}`).toEqual(played[from]);
      expect(jumped.player.getState().chapter).toBe(Math.min(from, FILM.chapters.length - 1));
      jumped.close();
    }
  });
});
