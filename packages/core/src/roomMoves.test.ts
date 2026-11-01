import { describe, expect, it } from "vitest";
import {
  drawnRun,
  type ListRun,
  type Look,
  type Moves,
  moveFolded,
  moveKind,
  moveLanded,
  moveSlid,
  movesBetween,
  movesWaiting,
  NO_MOVES,
  releaseMoves,
  rowMove,
  runFolding,
  standing,
} from "./roomMoves.js";

interface Room {
  readonly id: string;
}
const room = (id: string): Room => ({ id });
const japan = room("japan");
const foodie = room("foodie");
const bills = room("bills");
const chess = room("chess");

function look(
  runs: Partial<Record<ListRun, readonly Room[]>>,
  shown: readonly ListRun[] = ["open"],
): Look<Room> {
  return {
    at: standing({ open: runs.open ?? [], hidden: runs.hidden ?? [], closed: runs.closed ?? [] }),
    shown: new Set(shown),
  };
}
const ids = (rooms: readonly Room[]) => rooms.map((each) => each.id);
const none = NO_MOVES as Moves<Room>;

describe("what took a room from one run to another (ADR 0205's addendum)", () => {
  it("names each change, and nothing for a room that stayed", () => {
    expect(moveKind("open", "hidden")).toBe("hide");
    expect(moveKind("hidden", "open")).toBe("unhide");
    expect(moveKind("open", "closed")).toBe("archive");
    expect(moveKind("hidden", "closed")).toBe("archive");
    expect(moveKind("closed", "open")).toBe("unarchive");
    expect(moveKind("closed", "hidden")).toBe("unarchive");
    expect(moveKind("open", undefined)).toBe("delete");
    expect(moveKind("open", "open")).toBeUndefined();
  });
});

describe("a room hidden from the open rooms, Hidden put away", () => {
  const before = look({ open: [japan, foodie, bills] });
  const after = look({ open: [japan, bills], hidden: [foodie] });
  const started = movesBetween(before, after, none);

  it("waits where it stood, going right, with nowhere in sight to land", () => {
    expect(started.get("foodie")).toEqual({
      item: foodie,
      kind: "hide",
      side: "right",
      to: "hidden",
      leaving: { run: "open", index: 1, phase: "waiting" },
      landing: undefined,
    });
    expect(movesWaiting(started)).toBe(true);
    expect(ids(drawnRun("open", [japan, bills], started))).toEqual(["japan", "foodie", "bills"]);
    // Not yet under Hidden, so its heading does not count it.
    expect(drawnRun("hidden", [foodie], started)).toEqual([]);
    // Waiting, the row does nothing yet.
    expect(rowMove(started, "foodie", "open")).toBeUndefined();
  });

  it("slides off, then counts under Hidden as it folds, then is gone", () => {
    const sliding = releaseMoves(started);
    expect(movesWaiting(sliding)).toBe(false);
    expect(rowMove(sliding, "foodie", "open")).toEqual({ going: "right", folding: false });
    expect(drawnRun("hidden", [foodie], sliding)).toEqual([]);
    const folding = moveSlid(sliding, "foodie");
    expect(rowMove(folding, "foodie", "open")).toEqual({ going: "right", folding: true });
    expect(ids(drawnRun("hidden", [foodie], folding))).toEqual(["foodie"]);
    const done = moveFolded(folding, "foodie");
    expect(done.size).toBe(0);
    expect(ids(drawnRun("open", [japan, bills], done))).toEqual(["japan", "bills"]);
  });
});

describe("a room unhidden while Hidden is open", () => {
  const before = look({ open: [japan, bills], hidden: [foodie] }, ["open", "hidden"]);
  const after = look({ open: [japan, foodie, bills] }, ["open", "hidden"]);
  const moving = releaseMoves(movesBetween(before, after, none));

  it("goes off Hidden first, and lands among the open rooms from the left after", () => {
    expect(ids(drawnRun("hidden", [], moving))).toEqual(["foodie"]);
    expect(ids(drawnRun("open", [japan, foodie, bills], moving))).toEqual(["japan", "bills"]);
    const slid = moveSlid(moving, "foodie");
    expect(ids(drawnRun("open", [japan, foodie, bills], slid))).toEqual([
      "japan",
      "foodie",
      "bills",
    ]);
    expect(rowMove(slid, "foodie", "open")).toEqual({ landing: "left" });
    // Hidden's heading folds with its last row.
    expect(runFolding("hidden", drawnRun("hidden", [], slid), slid)).toBe(true);
  });

  it("ends once the old row has folded and the new one has landed, in either order", () => {
    const slid = moveSlid(moving, "foodie");
    expect(moveLanded(moveFolded(slid, "foodie"), "foodie").size).toBe(0);
    expect(moveFolded(moveLanded(slid, "foodie"), "foodie").size).toBe(0);
  });
});

describe("a room unhidden from its sheet, with Hidden put away", () => {
  it("has no row to go, and lands among the open rooms once the list is seen", () => {
    const started = movesBetween(
      look({ open: [japan], hidden: [foodie] }),
      look({ open: [japan, foodie] }),
      none,
    );
    expect(started.get("foodie")?.leaving).toBeUndefined();
    expect(ids(drawnRun("open", [japan, foodie], started))).toEqual(["japan"]);
    const seen = releaseMoves(started);
    expect(rowMove(seen, "foodie", "open")).toEqual({ landing: "left" });
    expect(moveLanded(seen, "foodie").size).toBe(0);
  });
});

describe("archived, unarchived and deleted rooms go left", () => {
  it("archives into Archived when it is open, coming in from the right", () => {
    const moving = moveSlid(
      releaseMoves(
        movesBetween(
          look({ open: [japan, foodie] }, ["open", "closed"]),
          look({ open: [japan], closed: [foodie, chess] }, ["open", "closed"]),
          none,
        ),
      ),
      "foodie",
    );
    expect(moving.get("foodie")?.side).toBe("left");
    expect(rowMove(moving, "foodie", "closed")).toEqual({ landing: "right" });
  });

  it("holds a deleted room where it stood until it has folded away", () => {
    const moving = releaseMoves(
      movesBetween(look({ open: [japan, foodie, bills] }), look({ open: [japan, bills] }), none),
    );
    expect(moving.get("foodie")).toMatchObject({ kind: "delete", side: "left", to: undefined });
    expect(ids(drawnRun("open", [japan, bills], moving))).toEqual(["japan", "foodie", "bills"]);
    expect(moveFolded(moveSlid(moving, "foodie"), "foodie").size).toBe(0);
  });
});

describe("what does not move", () => {
  it("leaves a room alone that moved between two runs out of sight", () => {
    const moves = movesBetween(look({ hidden: [foodie] }), look({ closed: [foodie] }), none);
    expect(moves.size).toBe(0);
  });

  it("leaves Select's rows to Select", () => {
    const moves = movesBetween(
      look({ open: [japan, foodie] }),
      look({ open: [japan], closed: [foodie] }),
      none,
      (id) => id === "foodie",
    );
    expect(moves.size).toBe(0);
  });

  it("drops a move whose room moves again, as one put back by a refusal does", () => {
    const hidden = look({ open: [japan], hidden: [foodie] });
    const moving = releaseMoves(movesBetween(look({ open: [japan, foodie] }), hidden, none));
    const back = movesBetween(hidden, look({ open: [japan, foodie] }), moving);
    expect(back.size).toBe(0);
    expect(ids(drawnRun("open", [japan, foodie], back))).toEqual(["japan", "foodie"]);
  });

  it("keeps the same moves when nothing changed, so a list need not draw again", () => {
    const before = look({ open: [japan, foodie] });
    const moving = movesBetween(before, look({ open: [japan] }), none);
    const after = look({ open: [japan] });
    expect(movesBetween(after, after, moving)).toBe(moving);
  });
});
