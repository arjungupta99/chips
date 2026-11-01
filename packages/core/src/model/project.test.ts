/**
 * The room's project as the room shows it (ADR 0222): a reply carries its change and the room
 * draws no line for it; a change nothing carries gets one quiet line, once its agent's run is over;
 * an Undo is a line of its own, and Put it back is the Undo of an Undo.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { ClientEvent } from "../events.js";
import { buildModel } from "./fold.js";
import { changeWords, filesChangedWords } from "./project.js";

const FIXTURES = fileURLToPath(new URL("../../../protocol/fixtures/", import.meta.url));
const ROOM = "spc_01K4ZQPX000000000000000002";
const WREN = "agt_01K4ZQPX0000000000000000W1";
const ARJUN = "usr_01K4ZQPX000000000000000003";
const RUN = "run_01K4ZQPX000000000000000005";
const asWren = { kind: "agent", id: WREN };

function fixture(type: string, seq: number, overrides: Record<string, unknown> = {}): ClientEvent {
  return { ...JSON.parse(readFileSync(`${FIXTURES}${type}.json`, "utf8")), seq, ...overrides };
}

const commit = (letter: string) => letter.repeat(40);

/** A room with Wren and Arjun in it, and Wren's run going. */
function aRoom(): ClientEvent[] {
  return [
    fixture("space.created", 1, { space_id: ROOM }),
    fixture("membership.added", 2, {
      participant_id: WREN,
      participant_kind: "agent",
      display_name: "Wren",
    }),
    fixture("run.started", 3, { actor: asWren, run_id: RUN }),
  ];
}

function changed(seq: number, after: string, overrides: Record<string, unknown> = {}): ClientEvent {
  return fixture("project.changed", seq, {
    id: `evt_change_${seq}`,
    actor: asWren,
    by: WREN,
    after,
    file_count: 6,
    ...overrides,
  });
}

const roomOf = (events: ClientEvent[]) =>
  buildModel(events).spaces.find((space) => space.id === ROOM);
const changeLines = (events: ClientEvent[]) =>
  (roomOf(events)?.lines ?? []).filter(
    (line) => line.kind === "system" && line.change !== undefined,
  );

describe("a change to the room's project", () => {
  it("goes with the reply that carries it, and draws no line of its own", () => {
    const events = [
      ...aRoom(),
      changed(4, commit("a")),
      fixture("message.post", 5, {
        id: "evt_reply",
        actor: asWren,
        run_id: RUN,
        text: "Kept the list.",
        change: commit("a"),
      }),
      fixture("run.completed", 6, { actor: asWren, run_id: RUN, summary: "Kept the list." }),
    ];
    const room = roomOf(events);
    expect(room?.project?.files).toBe(6);
    expect(room?.project?.changes).toMatchObject([
      { commit: commit("a"), by: WREN, reply: "evt_reply" },
    ]);
    expect(room?.lines.find((line) => line.id === "evt_reply")?.change).toBe(commit("a"));
    expect(changeLines(events)).toEqual([]);
    expect(filesChangedWords(room?.project?.changes[0] ?? { files: [], moreFiles: 0 })).toBe(
      "2 files changed",
    );
  });

  it("nothing carries gets one quiet line by its agent, once its run is over", () => {
    const going = [...aRoom(), changed(4, commit("a"))];
    expect(changeLines(going)).toEqual([]);
    const over = [
      ...going,
      fixture("run.completed", 5, { actor: asWren, run_id: RUN, summary: "NO_REPLY" }),
    ];
    expect(changeLines(over)).toMatchObject([
      { seq: 4, authorId: WREN, text: "changed 2 files", change: commit("a") },
    ]);
  });

  it("from a person's own push shows at once", () => {
    const events = [
      ...aRoom(),
      changed(4, commit("p"), { actor: { kind: "person", id: ARJUN }, by: ARJUN }),
    ];
    expect(changeLines(events)).toMatchObject([
      { authorId: ARJUN, authorKind: "person", text: "changed 2 files" },
    ]);
  });

  it("taken back by Undo says so, and Put it back undoes the Undo", () => {
    const person = { actor: { kind: "person", id: ARJUN }, by: ARJUN };
    const events = [
      ...aRoom(),
      changed(4, commit("a")),
      fixture("message.post", 5, {
        id: "evt_reply",
        actor: asWren,
        run_id: RUN,
        text: "Done.",
        change: commit("a"),
      }),
      changed(6, commit("u"), {
        ...person,
        undoes: commit("a"),
        files: [{ path: "src/store.js", added: 3, removed: 10 }],
      }),
    ];
    const undone = roomOf(events);
    expect(undone?.project?.changes.find((change) => change.commit === commit("a"))?.undoneBy).toBe(
      commit("u"),
    );
    expect(changeLines(events)).toMatchObject([
      { authorId: ARJUN, text: "undid a change", change: commit("u") },
    ]);
    const nameOf = (id: string) => (id === WREN ? "Wren" : undefined);
    expect(changeWords(undone?.project ?? { changes: [] }, commit("u"), nameOf)).toBe(
      "undid Wren's change",
    );

    const back = [...events, changed(7, commit("b"), { ...person, undoes: commit("u") })];
    const put = roomOf(back);
    expect(
      put?.project?.changes.find((change) => change.commit === commit("a"))?.undoneBy,
    ).toBeUndefined();
    expect(put?.project?.changes.find((change) => change.commit === commit("u"))?.undoneBy).toBe(
      commit("b"),
    );
    expect(changeLines(back).map((line) => line.text)).toEqual([
      "undid a change",
      "put a change back",
    ]);
    expect(changeWords(put?.project ?? { changes: [] }, commit("b"), nameOf)).toBe(
      "put Wren's change back",
    );
    expect(put?.project?.changes.map((change) => change.commit)).toEqual([
      commit("b"),
      commit("u"),
      commit("a"),
    ]);
  });
});
