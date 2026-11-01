import { describe, expect, it } from "vitest";
import type { Participant } from "./events.js";
import {
  EMPTY_ROOM,
  newSpaceEmpty,
  newSpaceLine,
  newSpaceNextLead,
  newSpacePicked,
  newSpacePickIds,
  newSpacePicks,
  startersWords,
} from "./newSpace.js";

const agent = (displayName: string, connected = true): Participant => ({
  id: `har_${displayName.toLowerCase()}`,
  kind: "harness",
  displayName,
  state: { connected, since: "2026-09-28T18:00:00.000Z" },
});
const [atlas, kit, lux] = [agent("Atlas"), agent("Kit"), agent("Lux")] as const;
const offered = [atlas, kit, lux];

describe("who a new space is asked of (ADR 0084)", () => {
  it("opens on whoever was asked last while they are offered, else the first offered", () => {
    expect(newSpacePicked(offered, undefined)).toEqual([atlas]);
    expect(newSpacePicked(offered, undefined, "har_kit")).toEqual([kit]);
    expect(newSpacePicked(offered, undefined, "har_gone")).toEqual([atlas]);
    expect(newSpacePicked([], undefined, "har_kit")).toEqual([]);
  });

  it("is only who was picked once a face has been tapped, in the order picked, and may be nobody", () => {
    expect(newSpacePicked(offered, ["har_lux", "har_kit"])).toEqual([lux, kit]);
    expect(newSpacePicked(offered, ["har_gone", "har_kit"])).toEqual([kit]);
    expect(newSpacePicked(offered, [])).toEqual([]);
  });

  it("chooses on the first tap, and adds and takes away on every tap after it", () => {
    // The first tap on another face is that face instead.
    expect(newSpacePicks(["har_atlas"], false, "har_kit")).toEqual(["har_kit"]);
    // The first tap on the face the window opened on takes it out.
    expect(newSpacePicks(["har_atlas"], false, "har_atlas")).toEqual([]);
    expect(newSpacePicks(["har_kit"], true, "har_lux")).toEqual(["har_kit", "har_lux"]);
    expect(newSpacePicks(["har_kit", "har_lux"], true, "har_kit")).toEqual(["har_lux"]);
    expect(newSpacePicks(["har_lux"], true, "har_lux")).toEqual([]);
  });

  it("says who joins and that they wait, who leads, or that the one asked can't answer (ADR 0149)", () => {
    expect(newSpaceLine([])).toBeUndefined();
    expect(newSpaceLine([kit])).toEqual({
      lead: "Kit",
      words: " joins · waits for your first message",
      warn: false,
    });
    // Several: the first picked leads, and a tap on its name hands the lead to the next.
    expect(newSpaceLine([kit, lux])).toEqual({
      lead: "Kit",
      leads: " leads",
      next: "Lux",
      words: " · Lux joins · they wait for you",
      warn: false,
    });
    // More beside the lead are counted: the faces show which, and their names ran the line out.
    expect(newSpaceLine([kit, lux, atlas])).toMatchObject({
      next: "Lux",
      words: " · 2 more join · they wait for you",
    });
    expect(newSpaceLine([agent("Scout", false), kit])).toEqual({
      words: "Scout can't answer now",
      warn: true,
    });
  });
});

describe("who leads several picked (ADR 0149's addendum)", () => {
  it("hands the lead to the next one picked, the one that led going to the back", () => {
    expect(newSpaceNextLead(["har_kit", "har_lux"])).toEqual(["har_lux", "har_kit"]);
    expect(newSpaceNextLead(["har_kit", "har_lux", "har_atlas"])).toEqual([
      "har_lux",
      "har_atlas",
      "har_kit",
    ]);
    // Round them all and the first leads again.
    const round = newSpaceNextLead(newSpaceNextLead(["har_kit", "har_lux", "har_atlas"]));
    expect(newSpaceNextLead(round)).toEqual(["har_kit", "har_lux", "har_atlas"]);
    expect(newSpaceNextLead(["har_kit"])).toEqual(["har_kit"]);
    expect(newSpaceNextLead([])).toEqual([]);
  });
});

describe("an empty room, asked of nobody (ADR 0148)", () => {
  it("opens on Empty when the last room made from here was empty, with nobody asked", () => {
    expect(newSpacePicked(offered, undefined, EMPTY_ROOM)).toEqual([]);
    expect(newSpaceEmpty(offered, undefined, EMPTY_ROOM)).toBe(true);
    expect(newSpaceEmpty(offered, undefined, "har_kit")).toBe(false);
  });

  it("is all there is where no harness takes new spaces", () => {
    expect(newSpaceEmpty([], undefined)).toBe(true);
    expect(newSpaceEmpty([], [])).toBe(true);
  });

  it("is picked alone, and a face tapped while it is picked is that face instead", () => {
    expect(newSpacePicks(["har_kit", "har_lux"], true, EMPTY_ROOM)).toEqual([EMPTY_ROOM]);
    expect(newSpacePicks(["har_atlas"], false, EMPTY_ROOM)).toEqual([EMPTY_ROOM]);
    expect(newSpacePicks([EMPTY_ROOM], true, "har_lux")).toEqual(["har_lux"]);
    expect(newSpacePicks([EMPTY_ROOM], false, "har_lux")).toEqual(["har_lux"]);
    // Tapped again, it comes out, and nobody is picked.
    expect(newSpacePicks([EMPTY_ROOM], true, EMPTY_ROOM)).toEqual([]);
    expect(newSpaceEmpty(offered, [EMPTY_ROOM])).toBe(true);
    expect(newSpacePicked(offered, [EMPTY_ROOM])).toEqual([]);
  });

  it("is what is picked, as ids, in place of who is asked", () => {
    expect(newSpacePickIds([kit, lux], false)).toEqual(["har_kit", "har_lux"]);
    expect(newSpacePickIds([], true)).toEqual([EMPTY_ROOM]);
  });
});

describe("who can start a space, under an empty workspace's button (ADR 0131)", () => {
  it("names one, two, or two and how many more", () => {
    expect(startersWords([])).toBe("");
    expect(startersWords(["Ada"])).toBe("Ada can start one");
    expect(startersWords(["Ada", "Bo"])).toBe("Ada and Bo can start one");
    expect(startersWords(["Ada", "Bo", "Cy", "Di"])).toBe("Ada, Bo and 2 more can start one");
  });
});
