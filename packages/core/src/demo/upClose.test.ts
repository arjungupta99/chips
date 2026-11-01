/**
 * Your agents, up close (ADR 0213, DM5), played through the store every workspace has and the fold
 * behind it: what each chapter leaves, read back the way Milo's page reads it — its model, its
 * file, its window, where it is — so a change to those reads or to the wire breaks here first.
 * The model sheet's Save is the person's: missed when nobody saved by its beat; and a start at
 * any chapter leaves what playing to it would.
 */

import { agentContextView, agentContextWindowView, agentModelView } from "@chipschat/protocol";
import { describe, expect, it } from "vitest";
import { windowRows } from "../agentWindow.js";
import { forkRoomTitle, forkState, withForkNames } from "../forks.js";
import type { Space } from "../model.js";
import type { Snapshot } from "../store.js";
import { summary, unparsed, type Watching, watch } from "../testing/demo.js";
import {
  type Act,
  chapterLength,
  FORK_ROOM,
  filmLength,
  filmOf,
  INSTRUCTIONS_SAVED,
} from "./script.js";
import { AGENTS, BIRTHDAY, MILO_INSTRUCTIONS, RECEIPTS } from "./workspace.js";

const FILM = filmOf("agents");
const MILO = AGENTS.milo.id;
const MODEL_CHAPTER = 1;
/** Where chapter 2's model is due: the sheet, Heron 2, Deep, then Save. */
const SAVES = 4600;

function roomTitled(snapshot: Snapshot, title: string): Space | undefined {
  return snapshot.model.spaces.find((space) => space.title === title);
}

function room(snapshot: Snapshot, id: string): Space {
  const space = snapshot.model.spaces.find((each) => each.id === id);
  if (space === undefined) throw new Error(`no room ${id}`);
  return space;
}

/** The system lines a room shows, by their words. */
function systemSays(space: Space): string[] {
  return space.lines.filter((line) => line.kind === "system").map((line) => line.text);
}

/** Nothing sent is still on its way, and no answer is still busy: what a chapter must not leave. */
function settled(snapshot: Snapshot, chapter: string): void {
  const sending = snapshot.model.spaces.flatMap((space) => space.lines).filter((l) => l.pending);
  expect(sending, chapter).toEqual([]);
  expect([...snapshot.busy], chapter).toEqual([]);
}

/** The model saves the store has made for Milo, as the demo took them. */
const modelSaves = (h: Watching) =>
  h.written.filter((write) => write.path === `/v1/agents/${MILO}/model/changes`);

/** What each chapter leaves, read as Milo's page reads it. */
const LEAVES: Readonly<Record<string, (h: Watching) => Promise<void>>> = {
  page: async (h) => {
    expect(h.player.getState()).toMatchObject({ screen: "agent", agentId: MILO });
    expect(h.snapshot().directory[MILO]?.room).toBe(BIRTHDAY);
    const model = await h.store.readAgentModel(MILO);
    expect(agentModelView.parse(model)).toMatchObject({ model: "heron-2-mini", effort: "steady" });
    expect(model.choices.map((choice) => choice.label)).toEqual([
      "Heron 2 Mini",
      "Heron 2",
      "Kestrel 1",
    ]);
    expect(model.choices[0]?.efforts.map((level) => level.label)).toEqual([
      "Light",
      "Steady",
      "Deep",
    ]);
  },
  model: async (h) => {
    const model = agentModelView.parse(await h.store.readAgentModel(MILO));
    expect(model).toMatchObject({ model: "heron-2", effort: "deep", change: { state: "saved" } });
    expect(modelSaves(h)).toHaveLength(1);
  },
  instructions: async (h) => {
    const context = agentContextView.parse(await h.store.agentContext(MILO));
    const [file] = context.files;
    expect(file).toMatchObject({ name: "INSTRUCTIONS.md", text: INSTRUCTIONS_SAVED });
    expect(INSTRUCTIONS_SAVED).toBe(
      `${MILO_INSTRUCTIONS}- Say whether a place has step-free access.\n`,
    );
  },
  compact: async (h) => {
    const view = agentContextWindowView.parse(await h.store.readAgentContextWindow(MILO));
    expect(view).toMatchObject({
      used: 24_000,
      window: 272_000,
      last: { from: 172_000, to: 24_000, by: "asked" },
      compaction: { state: "done" },
    });
    const rows = windowRows(view, "Milo", "Errand", Date.parse(view.read_at));
    expect(rows.note).toMatch(/^Compacted when asked at \d+:\d\d [AP]M, 172k to 24k\.$/);
    const quiet = room(h.snapshot(), BIRTHDAY).lines.find((line) => line.compacted !== undefined);
    expect(quiet?.compacted).toEqual({ from: 172_000, to: 24_000, window: 272_000, by: "asked" });
  },
  fork: async (h) => {
    const snapshot = h.snapshot();
    const forked = roomTitled(snapshot, FORK_ROOM);
    expect(forked).toBeDefined();
    const copy = Object.values(snapshot.directory).find((each) => each.forkedFrom === MILO);
    expect(copy).toMatchObject({ displayName: "Milo · fork", room: forked?.id });
    expect(forked?.members).toContain(copy?.id);
    const asked = forked?.lines.find((line) => line.fork?.agentId === MILO);
    expect(forked && asked && forkState(forked, asked, Date.now())).toEqual({
      state: "joined",
      copyId: copy?.id,
    });
    // Milo stays where it was; the copy remembers the same, kept by Errand as its own.
    expect(snapshot.directory[MILO]?.room).toBe(BIRTHDAY);
    expect((await h.store.readAgentModel(copy?.id ?? "")).model).toBe("heron-2");
  },
  move: async (h) => {
    const snapshot = h.snapshot();
    expect(snapshot.directory[MILO]).toMatchObject({ room: RECEIPTS, lastRoom: BIRTHDAY });
    expect(room(snapshot, BIRTHDAY).members).not.toContain(MILO);
    expect(room(snapshot, RECEIPTS).members).toContain(MILO);
    expect(systemSays(room(snapshot, BIRTHDAY))).toContain("moved to Tax receipts");
    expect(systemSays(room(snapshot, RECEIPTS))).toContain("moved here from Birthday dinner");
    const stays = await h.store.agentStays(MILO);
    expect(stays.map((stay) => [stay.spaceId, stay.to === null])).toEqual([
      [BIRTHDAY, false],
      [RECEIPTS, true],
    ]);
    // What Milo said in Birthday dinner: its greeting, the table, the ask of Theo, two answers.
    expect(stays[0]?.lines).toBe(5);
  },
};

describe("Your agents, up close", () => {
  it("is six chapters after the first film, about forty seconds", () => {
    expect(FILM).toMatchObject({ title: "Your agents, up close", after: "watch" });
    expect(FILM.chapters.map((chapter) => chapter.key)).toEqual([
      "page",
      "model",
      "instructions",
      "compact",
      "fork",
      "move",
    ]);
    expect(filmLength(FILM)).toBeGreaterThan(35_000);
    expect(filmLength(FILM)).toBeLessThan(45_000);
  });

  it("names the copy's room as the room picker names it", async () => {
    const h = await watch({ film: "agents" });
    expect(forkRoomTitle(withForkNames(h.snapshot().directory), MILO)).toBe(FORK_ROOM);
    h.close();
  });

  it("leaves each chapter's mark, read back as Milo's page reads it", async () => {
    const h = await watch({ film: "agents" });
    h.player.play();
    for (const chapter of FILM.chapters) {
      await h.clock.advance(chapterLength(chapter));
      settled(h.snapshot(), chapter.key);
      await LEAVES[chapter.key]?.(h);
    }
    expect(h.player.getState()).toMatchObject({ ended: true, playing: false });
    h.close();
  });

  it("opens each chapter on Milo's page, and does nothing of the person's", async () => {
    for (let from = MODEL_CHAPTER; from < FILM.chapters.length; from += 1) {
      const chapter = FILM.chapters[from];
      const act = chapter?.beats.find((beat) => beat.act !== undefined)?.act;
      const h = await watch({ film: "agents", from, skip: () => true });
      h.player.play();
      expect(h.player.getState(), chapter?.key).toMatchObject({ screen: "agent", agentId: MILO });
      await h.clock.advance(chapter === undefined ? 0 : chapterLength(chapter) - 1);
      expect(h.player.getState().missed, chapter?.key).toBe(act?.kind);
      expect(h.written, chapter?.key).toEqual([]);
      h.close();
    }
  });

  it("marks the model missed when nobody saved it by its beat, and never saves it", async () => {
    const h = await watch({ film: "agents", from: MODEL_CHAPTER, skip: () => true });
    h.player.play();
    await h.clock.advance(SAVES - 1);
    expect(h.player.getState().missed).toBeUndefined();
    await h.clock.advance(1);
    expect(h.player.getState().missed).toBe("model");
    await h.clock.advance(20_000);
    expect(modelSaves(h)).toHaveLength(0);
    h.close();
  });

  it("takes the sheet's own Save, whatever it picked, as the model's", async () => {
    const skip = (act: Act) => act.kind === "model";
    const h = await watch({ film: "agents", from: MODEL_CHAPTER, skip });
    h.player.play();
    await h.clock.advance(SAVES - 100);
    // What the sheet's Save does first (`saveModelChange`): the change, down Errand's socket.
    await h.store.changeAgentModel(MILO, { model: "kestrel-1", effort: "light" });
    await h.clock.advance(10_000);
    expect(modelSaves(h)).toHaveLength(1);
    expect(h.player.getState().missed).toBeUndefined();
    // The person's own pick stands.
    expect((await h.store.readAgentModel(MILO)).model).toBe("kestrel-1");
    h.close();
  });

  it("sends the store only what the protocol's schemas take, nor a field they drop", async () => {
    const played = await watch({ film: "agents" });
    played.player.play();
    await played.clock.advance(filmLength(FILM));
    const whole = await watch({ film: "agents", from: FILM.chapters.length });
    for (const h of [played, whole]) {
      expect(h.delivered.length).toBeGreaterThan(60);
      expect(unparsed(h.delivered)).toEqual([]);
      h.close();
    }
  });

  it("starts at any chapter where playing to it would have left the store", async () => {
    // The copy's room is minted by the store when played, and by the replay when jumped past.
    const named = new Map([[FORK_ROOM, "the fork's room"]]);
    const h = await watch({ film: "agents" });
    h.player.play();
    const played = [summary(h.snapshot(), named)];
    for (const chapter of FILM.chapters) {
      await h.clock.advance(chapterLength(chapter));
      played.push(summary(h.snapshot(), named));
    }
    h.close();
    for (let from = 1; from <= FILM.chapters.length; from += 1) {
      const jumped = await watch({ film: "agents", from });
      expect(summary(jumped.snapshot(), named), `from chapter ${from}`).toEqual(played[from]);
      const model = await jumped.store.readAgentModel(MILO);
      expect(model.model, `from chapter ${from}`).toBe(
        from > MODEL_CHAPTER ? "heron-2" : "heron-2-mini",
      );
      jumped.close();
    }
  });
});
