import { describe, expect, it } from "vitest";
import {
  endedAtArchive,
  everyoneFor,
  holders,
  type Move,
  selvesIn,
  staysOf,
} from "./agent-stays.js";

let seq = 0;
function move(type: string, room: string, payload: Record<string, unknown>): Move {
  seq += 1;
  return {
    seq,
    ts: `2026-09-${String(seq).padStart(2, "0")}T00:00:00.000Z`,
    type,
    space_id: room,
    payload: JSON.stringify(payload),
  };
}
const added = (room: string, id: string) => move("membership.added", room, { participant_id: id });
const removed = (room: string, id: string) =>
  move("membership.removed", room, { participant_id: id });
const replaced = (room: string, from: string, to: string) =>
  move("membership.replaced", room, { from, to });

describe("an agent's stays", () => {
  it("start where its harness joined, read through the place it holds now", () => {
    seq = 0;
    const rooms = holders([{ space_id: "chess", from_id: "hrn_j", to_id: "agt_chess" }]);
    expect(everyoneFor(rooms, "agt_chess").sort()).toEqual(["agt_chess", "hrn_j"]);
    const moves = [
      added("chess", "hrn_j"),
      replaced("chess", "hrn_j", "agt_chess"),
      removed("chess", "agt_chess"),
    ];
    expect(staysOf(moves, (room) => selvesIn(rooms, room, "agt_chess"))).toEqual([
      { room: "chess", from: { seq: 1, at: moves[0]?.ts }, to: { seq: 3, at: moves[2]?.ts } },
    ]);
  });

  it("keep one stay through a place that changed hands and came back", () => {
    // OpenClaw's own room: the harness, its default agent, `main`, and the default agent again.
    seq = 0;
    const rooms = holders([
      { space_id: "direct", from_id: "hrn_oc", to_id: "agt_default" },
      { space_id: "direct", from_id: "agt_default", to_id: "agt_main" },
      { space_id: "direct", from_id: "agt_main", to_id: "agt_default" },
    ]);
    const moves = [
      added("direct", "hrn_oc"),
      replaced("direct", "hrn_oc", "agt_default"),
      replaced("direct", "agt_default", "agt_main"),
      replaced("direct", "agt_main", "agt_default"),
    ];
    const of = (agent: string) => staysOf(moves, (room) => selvesIn(rooms, room, agent));
    expect(of("agt_default")).toEqual([
      { room: "direct", from: { seq: 1, at: moves[0]?.ts }, to: null },
    ]);
    // `main`'s hours there are the default agent's now, with what was said in them.
    expect(of("agt_main")).toEqual([]);
  });

  it("go with a place handed to an agent that doesn't stand for it", () => {
    seq = 0;
    const rooms = holders([{ space_id: "plus", from_id: "agt_main", to_id: "agt_key" }]);
    const moves = [added("plus", "agt_main"), replaced("plus", "agt_main", "agt_key")];
    expect(staysOf(moves, (room) => selvesIn(rooms, room, "agt_main"))).toEqual([]);
    expect(staysOf(moves, (room) => selvesIn(rooms, room, "agt_key"))).toEqual([
      { room: "plus", from: { seq: 1, at: moves[0]?.ts }, to: null },
    ]);
  });

  it("are one per visit, each room its own", () => {
    seq = 0;
    const rooms = holders([]);
    const moves = [
      added("a", "agt_s"),
      removed("a", "agt_s"),
      added("b", "agt_s"),
      removed("b", "agt_s"),
      added("a", "agt_s"),
    ];
    expect(
      staysOf(moves, (room) => selvesIn(rooms, room, "agt_s")).map((stay) => [
        stay.room,
        stay.from.seq,
        stay.to?.seq ?? null,
      ]),
    ).toEqual([
      ["a", 1, 2],
      ["b", 3, 4],
      ["a", 5, null],
    ]);
  });

  it("end at an archive the room was still under when the agent left", () => {
    const stay = { room: "r", from: { seq: 1, at: "a" }, to: { seq: 9, at: "z" } };
    const archived = { seq: 5, ts: "e", space_id: "r", state: "closed" };
    expect(endedAtArchive(stay, [archived])).toEqual({ ...stay, to: { seq: 5, at: "e" } });
    // Archived and opened again while it stayed: the stay runs on.
    expect(
      endedAtArchive(stay, [archived, { seq: 7, ts: "g", space_id: "r", state: "open" }]),
    ).toEqual(stay);
    // Another room's archive is not this one's.
    expect(endedAtArchive(stay, [{ ...archived, space_id: "other" }])).toEqual(stay);
  });
});
