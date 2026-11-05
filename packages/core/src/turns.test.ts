import { describe, expect, it } from "vitest";
import type { Line } from "./model/types.js";
import {
  dayLabel,
  endsTurn,
  GROUP_WITHIN_MS,
  opensTurn,
  separatorLabel,
  type Turned,
  turnsOf,
} from "./turns.js";

const at = (seconds: number) => new Date(Date.UTC(2026, 8, 7, 10, 0, seconds)).toISOString();

function line(over: Partial<Line> & { readonly id: string }): Line {
  return {
    seq: 1,
    kind: "text",
    authorId: "per_dana",
    authorKind: "person",
    text: "hello",
    ts: at(0),
    ...over,
  };
}

const speaker = (each: Line) => each.authorId;
const places = (turned: readonly Turned[]) => turned.map((each) => each.place);

describe("how a room's lines read as turns (ADR 0050, ADR 0268)", () => {
  it("closes up one author's bubbles said close together, and marks the last", () => {
    const turned = turnsOf(
      [line({ id: "a", ts: at(0) }), line({ id: "b", ts: at(30) }), line({ id: "c", ts: at(70) })],
      speaker,
    );
    expect(places(turned)).toEqual(["first", "middle", "last"]);
    expect(turned.map((each) => each.separator)).toEqual([true, false, false]);
  });

  it("starts a new turn when the author changes, and when three minutes have passed", () => {
    const turned = turnsOf(
      [
        line({ id: "a", ts: at(0) }),
        line({ id: "b", ts: at(10), authorId: "per_arjun" }),
        line({ id: "c", ts: at(20), authorId: "per_arjun" }),
        line({ id: "d", ts: at(20 + GROUP_WITHIN_MS / 1000), authorId: "per_arjun" }),
      ],
      speaker,
    );
    expect(places(turned)).toEqual(["only", "first", "last", "only"]);
  });

  it("says the time over the first line and after fifteen quiet minutes, and breaks the turn there", () => {
    const turned = turnsOf(
      [
        line({ id: "a", ts: at(0) }),
        line({ id: "b", ts: at(14 * 60) }),
        line({ id: "c", ts: at(29 * 60) }),
      ],
      speaker,
    );
    expect(turned.map((each) => each.separator)).toEqual([true, false, true]);
    expect(places(turned)).toEqual(["only", "only", "only"]);
  });

  it("lets a card, a margin line or a tombstone stand alone", () => {
    const turned = turnsOf(
      [
        line({ id: "a", ts: at(0) }),
        line({ id: "r", ts: at(1), kind: "route", laneId: "lane_1" }),
        line({ id: "b", ts: at(2) }),
        line({ id: "gone", ts: at(3), deleted: true, text: "" }),
        line({ id: "c", ts: at(4) }),
        line({ id: "s", ts: at(5), kind: "summary", authorId: "har_scout", authorKind: "harness" }),
        line({ id: "d", ts: at(6), authorId: "har_scout", authorKind: "harness" }),
      ],
      speaker,
    );
    expect(places(turned)).toEqual(["only", "only", "only", "only", "only", "first", "last"]);
  });

  it("starts a turn where a line says it does: under a route, either side of a fold", () => {
    const turned = turnsOf(
      [line({ id: "a" }), line({ id: "b" }), line({ id: "c" }), line({ id: "d" })],
      speaker,
      (each) => each.id === "c",
    );
    expect(places(turned)).toEqual(["first", "last", "first", "last"]);
  });

  it("gives the time to the end of a turn and the name to its start", () => {
    expect(["only", "first", "middle", "last"].map((p) => endsTurn(p as Turned["place"]))).toEqual([
      true,
      false,
      false,
      true,
    ]);
    expect(["only", "first", "middle", "last"].map((p) => opensTurn(p as Turned["place"]))).toEqual(
      [true, true, false, false],
    );
  });
});

describe("the day a separator names", () => {
  const now = new Date("2026-09-07T14:00:00").getTime();

  it("says today since midnight, yesterday the day before, and the date before that", () => {
    expect(dayLabel("2026-09-07T00:00:01", now)).toBe("Today");
    expect(dayLabel("2026-09-06T23:59:59", now)).toBe("Yesterday");
    expect(dayLabel("2026-09-04T12:00:00", now)).toMatch(/4/);
  });

  it("puts the hour after the day, and says nothing for a time it cannot read", () => {
    expect(separatorLabel("2026-09-07T11:26:00", now)).toMatch(/^Today \d{1,2}[:.]26/);
    expect(separatorLabel("whenever", now)).toBe("");
  });
});
