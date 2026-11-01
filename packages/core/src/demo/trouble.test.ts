/**
 * Costs and trouble (ADR 0213, DM5), played through the store every workspace has and the fold
 * behind it: what a job did and cost, what a room allows a job, Not right? and Milo's second try,
 * and Herald gone offline under a message to Hugo. Not right?'s Send is the person's: missed when
 * nobody sent it by its beat; and a start at any chapter leaves what playing to it would.
 */

import { describe, expect, it } from "vitest";
import { cantAnswer, waitingOn, waitWords } from "../agents.js";
import type { Line, Space } from "../model.js";
import type { Snapshot } from "../store.js";
import { summary, unparsed, type Watching, watch } from "../testing/demo.js";
import { DEMO_PERSON_ID } from "./device.js";
import { type Act, chapterLength, filmLength, filmOf, RUNS } from "./script.js";
import { AGENTS, BIRTHDAY, BRIEF, GARDEN, HERALD } from "./workspace.js";

const FILM = filmOf("trouble");
const MILO = AGENTS.milo.id;
const HUGO = AGENTS.hugo.id;
const SENT = "Sent to 11. Ana and Raj have said yes already.";
const TABLE = "Three can seat 12 on Saturday";
const CORRECTION = "Missed what I asked. Mum can't manage stairs.";
const SORRY =
  "Sorry, I missed that. Osteria Verde's private room is up a flight of stairs; Casa Lucca's is step-free. Shall I move the booking?";
const NOT_RIGHT_CHAPTER = 2;
/** Where chapter 3's correction is due: lifted, Not right?, the reason, the words, then Send. */
const SENDS = 5000;

function room(snapshot: Snapshot, id: string): Space {
  const space = snapshot.model.spaces.find((each) => each.id === id);
  if (space === undefined) throw new Error(`no room ${id}`);
  return space;
}

function lineSaying(snapshot: Snapshot, spaceId: string, words: string): Line | undefined {
  return room(snapshot, spaceId).lines.findLast((line) => line.text.startsWith(words));
}

function runOf(snapshot: Snapshot, runId: string) {
  return snapshot.model.spaces.flatMap((space) => space.runs).find((run) => run.runId === runId);
}

/** The corrections the store has sent, as the demo's socket gave them back. */
const corrections = (h: Watching) =>
  h.delivered.filter((event) => event.type === "feedback" && event["kind"] === "correction");

/** What each chapter leaves on the snapshot and in what the demo answers. */
const LEAVES: Readonly<Record<string, (h: Watching) => Promise<void>>> = {
  cost: async (h) => {
    const run = runOf(h.snapshot(), RUNS.dinner);
    expect(run).toMatchObject({
      state: "done",
      costUsd: 0.42,
      model: "heron-2-mini",
      inputTokens: 30_200,
      outputTokens: 2100,
    });
    expect(run?.steps.map((step) => [step.title, step.status, step.durationMs])).toEqual([
      ["web_search · Italian restaurants near Mum's", "done", 2100],
      ["Compared prices, reviews and a table for 12", "done", 3400],
      ["Checked which are a walk from Mum's", "done", 1800],
      ["Booked the private room at Osteria Verde", "done", 900],
      ["Sent Theo's card to 11 people", "done", 1100],
    ]);
    // The line that closed the run is the reply the sheet is about: its receipt is the run's.
    expect(lineSaying(h.snapshot(), BIRTHDAY, SENT)?.runId).toBe(RUNS.dinner);
  },
  spend: async (h) => {
    expect(room(h.snapshot(), BIRTHDAY).spendCeiling).toBe(5);
    expect(await h.store.roomSpend(BIRTHDAY)).toEqual({
      ceiling_usd: 5,
      spent_usd: 0.42,
      since_seq: expect.any(Number),
      uncounted_runs: 0,
    });
    expect(await h.store.roomSpend(GARDEN)).toMatchObject({ ceiling_usd: 3 });
  },
  notRight: async (h) => {
    const table = lineSaying(h.snapshot(), BIRTHDAY, TABLE);
    expect(table?.corrections?.map((note) => [note.by, note.text])).toEqual([
      [DEMO_PERSON_ID, CORRECTION],
    ]);
    expect(corrections(h)).toHaveLength(1);
    expect(runOf(h.snapshot(), RUNS.again)).toMatchObject({
      state: "done",
      harnessId: MILO,
      goal: CORRECTION,
      costUsd: 0.06,
    });
    expect(room(h.snapshot(), BIRTHDAY).lines.at(-1)).toMatchObject({
      authorId: MILO,
      text: SORRY,
    });
    // The correction began a new job, so the second try is all the room's job has spent.
    expect(await h.store.roomSpend(BIRTHDAY)).toMatchObject({ ceiling_usd: 5, spent_usd: 0.06 });
  },
  cantAnswer: async (h) => {
    const { directory } = h.snapshot();
    expect(directory[HERALD]?.state).toMatchObject({ connected: false });
    expect(cantAnswer(directory, HUGO)).toMatchObject({ kind: "offline" });
    const brief = room(h.snapshot(), BRIEF);
    const asked = lineSaying(h.snapshot(), BRIEF, "What's on tomorrow?");
    expect(asked?.addressedTo).toEqual([HUGO]);
    const [wait] = waitingOn(brief, directory);
    expect(wait).toEqual({ lineId: asked?.id, harnessId: HUGO, since: asked?.ts });
    const words = wait === undefined ? undefined : waitWords(wait, directory, Date.now());
    expect(words).toMatchObject({ title: "Hugo can't answer yet", known: true });
    expect(words?.why).toMatch(/^Offline · since /);
    // Read again, the directory says so too.
    await h.store.refreshDirectory();
    expect(cantAnswer(h.snapshot().directory, HUGO)).toMatchObject({ kind: "offline" });
  },
};

describe("Costs and trouble", () => {
  it("is four chapters after the first film, about thirty seconds", () => {
    expect(FILM).toMatchObject({ title: "Costs and trouble", after: "watch" });
    expect(FILM.chapters.map((chapter) => chapter.key)).toEqual([
      "cost",
      "spend",
      "notRight",
      "cantAnswer",
    ]);
    expect(filmLength(FILM)).toBeGreaterThan(25_000);
    expect(filmLength(FILM)).toBeLessThan(35_000);
  });

  it("leaves each chapter's mark on the snapshot, with nothing still sending or busy", async () => {
    const h = await watch({ film: "trouble" });
    h.player.play();
    for (const chapter of FILM.chapters) {
      await h.clock.advance(chapterLength(chapter));
      const sending = h.snapshot().model.spaces.flatMap((space) => space.lines);
      expect(
        sending.filter((line) => line.pending),
        chapter.key,
      ).toEqual([]);
      expect([...h.snapshot().busy], chapter.key).toEqual([]);
      await LEAVES[chapter.key]?.(h);
    }
    expect(h.player.getState()).toMatchObject({ ended: true, playing: false });
    h.close();
  });

  it("marks the correction missed when nobody sent it by its beat, and never sends it", async () => {
    const h = await watch({ film: "trouble", from: NOT_RIGHT_CHAPTER, skip: () => true });
    h.player.play();
    await h.clock.advance(SENDS - 1);
    expect(h.player.getState().missed).toBeUndefined();
    await h.clock.advance(1);
    expect(h.player.getState().missed).toBe("notRight");
    await h.clock.advance(20_000);
    expect(corrections(h)).toHaveLength(0);
    h.close();
  });

  it("takes the page's own Send, whatever it says, as the correction", async () => {
    const skip = (act: Act) => act.kind === "notRight";
    const h = await watch({ film: "trouble", from: NOT_RIGHT_CHAPTER, skip });
    h.player.play();
    await h.clock.advance(SENDS - 100);
    h.store.sendFeedback({
      spaceId: BIRTHDAY,
      lineId: lineSaying(h.snapshot(), BIRTHDAY, TABLE)?.id ?? "",
      kind: "correction",
      text: "Wrong facts. It's on Sunday.",
    });
    await h.clock.advance(10_000);
    expect(corrections(h).map((event) => event["text"])).toEqual(["Wrong facts. It's on Sunday."]);
    expect(h.player.getState().missed).toBeUndefined();
    h.close();
  });

  it("gives no canned answer for an agent whose harness is offline, once it is over", async () => {
    const h = await watch({ film: "trouble", from: FILM.chapters.length });
    h.store.send({ spaceId: BRIEF, text: "Anything else?" });
    h.store.send({ spaceId: GARDEN, text: "And the contact page?" });
    await h.clock.advance(2000);
    expect(room(h.snapshot(), BRIEF).lines.at(-1)).toMatchObject({ text: "Anything else?" });
    expect(room(h.snapshot(), GARDEN).lines.at(-1)?.authorId).toBe(AGENTS.felix.id);
    h.close();
  });

  it("sends the store only what the protocol's schemas take, nor a field they drop", async () => {
    const played = await watch({ film: "trouble" });
    played.player.play();
    await played.clock.advance(filmLength(FILM));
    const whole = await watch({ film: "trouble", from: FILM.chapters.length });
    for (const h of [played, whole]) {
      expect(h.delivered.length).toBeGreaterThan(60);
      expect(unparsed(h.delivered)).toEqual([]);
      h.close();
    }
  });

  it("starts at any chapter where playing to it would have left the store", async () => {
    const h = await watch({ film: "trouble" });
    h.player.play();
    const played = [summary(h.snapshot())];
    const offline = [false];
    for (const chapter of FILM.chapters) {
      await h.clock.advance(chapterLength(chapter));
      played.push(summary(h.snapshot()));
      offline.push(cantAnswer(h.snapshot().directory, HUGO) !== undefined);
    }
    h.close();
    for (let from = 1; from <= FILM.chapters.length; from += 1) {
      const jumped = await watch({ film: "trouble", from });
      expect(summary(jumped.snapshot()), `from chapter ${from}`).toEqual(played[from]);
      const gone = cantAnswer(jumped.snapshot().directory, HUGO) !== undefined;
      expect(gone, `from chapter ${from}`).toBe(offline[from]);
      jumped.close();
    }
  });
});
