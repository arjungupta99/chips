/**
 * Search's backdrop (ADR 0136, ADR 0138): which spaces and agents lend their faces, and which place
 * each face is worn in.
 */

import { describe, expect, it } from "vitest";
import type { Directory } from "./events.js";
import type { Space, WorkspaceModel } from "./model/types.js";
import {
  BACKDROP_DEPTHS,
  BACKDROP_GLOW,
  BACKDROP_PLACES,
  BACKDROP_ROUND_MS,
  type BackdropLender,
  backdropFill,
  backdropLenders,
} from "./searchBackdrop.js";

const ME = "usr_me";
const JACOBIAN = "hrn_jacobian";

function space(id: string, at: string, over: Partial<Space> = {}): Space {
  return {
    id,
    kind: "room",
    members: [ME],
    roles: {},
    state: "open",
    lastEventSeq: 1,
    lastActivityAt: at,
    lines: [],
    runs: [],
    sessions: [],
    pins: [],
    glimpse: false,
    ...over,
  };
}

const model = (spaces: Space[]) => ({ spaces, people: {} }) as unknown as WorkspaceModel;

const agent = (id: string, name: string, extra: Record<string, unknown> = {}) => ({
  id,
  kind: "agent" as const,
  harnessId: JACOBIAN,
  displayName: name,
  ...extra,
});

const people: Directory = {
  [ME]: { id: ME, kind: "person", displayName: "Arjun" },
  [JACOBIAN]: { id: JACOBIAN, kind: "harness", displayName: "Jacobian", ownerId: ME },
};

const ids = (lenders: readonly BackdropLender[]) =>
  lenders.map((each) => (each.kind === "space" ? each.space.id : each.agent.id));

describe("what lends its face", () => {
  it("is the open spaces, the most recently active first, and no threads", () => {
    const lenders = backdropLenders(
      model([
        space("sp_old", "2026-10-01T10:00:00Z"),
        space("sp_new", "2026-10-07T10:00:00Z"),
        space("sp_closed", "2026-10-07T11:00:00Z", { state: "closed" }),
        space("sp_thread", "2026-10-07T12:00:00Z", { parentSpaceId: "sp_new" }),
      ]),
      people,
      ME,
    );
    expect(ids(lenders)).toEqual(["sp_new", "sp_old"]);
  });

  it("takes in the agents by their room's last line, a room before its agent (ADR 0138)", () => {
    const directory: Directory = {
      ...people,
      agt_shop: agent("agt_shop", "Shopping", { room: "sp_shop" }),
      agt_j: agent("agt_j", "J", { lead: true, room: "sp_j" }),
      agt_free: agent("agt_free", "Bland Pricing", { room: null }),
      agt_gone: agent("agt_gone", "Chess Game", { archived: true, room: null }),
    };
    const lenders = backdropLenders(
      model([
        space("sp_j", "2026-10-05T10:00:00Z"),
        space("sp_shop", "2026-10-07T10:00:00Z"),
        space("sp_mid", "2026-10-06T10:00:00Z"),
      ]),
      directory,
      ME,
    );
    expect(ids(lenders)).toEqual(["sp_shop", "agt_shop", "sp_mid", "sp_j", "agt_j", "agt_free"]);
    const shop = lenders[1];
    expect(shop?.kind === "agent" && shop.agent.name).toBe("Shopping");
  });

  it("is as many as there are places, and no more", () => {
    const many = Array.from({ length: 30 }, (_, i) =>
      space(`sp_${i}`, `2026-10-07T10:${String(i).padStart(2, "0")}:00Z`),
    );
    const lenders = backdropLenders(model(many), people, ME);
    expect(lenders).toHaveLength(BACKDROP_PLACES.length);
    expect(ids(lenders)[0]).toBe("sp_29");
  });
});

describe("which face each place wears", () => {
  it("is none at all without spaces", () => {
    expect(backdropFill([])).toEqual([]);
  });

  it("is one space's face in every place, and three spaces' round and round", () => {
    expect(backdropFill(["a"])).toEqual(new Array(BACKDROP_PLACES.length).fill("a"));
    const three = backdropFill(["a", "b", "c"]);
    expect(three).toHaveLength(BACKDROP_PLACES.length);
    expect(three.filter((face) => face === "a").length).toBeGreaterThanOrEqual(5);
    expect(new Set(three)).toEqual(new Set(["a", "b", "c"]));
  });

  it("puts the most recent spaces in the nearest places", () => {
    const worn = backdropFill(["newest", "b", "c", "d", "e", "f"]);
    const near = BACKDROP_PLACES.flatMap((place, i) => (place.depth === "near" ? [worn[i]] : []));
    expect(near).toEqual(["newest", "b", "c", "d", "e"]);
  });

  it("is each face once from as many spaces as there are places", () => {
    const all = Array.from({ length: BACKDROP_PLACES.length }, (_, i) => i);
    expect(new Set(backdropFill(all)).size).toBe(BACKDROP_PLACES.length);
  });
});

describe("the places", () => {
  it("are eighteen, 15% denser than the sixteen they were, and no two at one spot across", () => {
    expect(BACKDROP_PLACES).toHaveLength(18);
    expect(new Set(BACKDROP_PLACES.map((place) => place.across)).size).toBe(18);
  });

  it("each go round a whole number of times in a round, at three paces", () => {
    for (const place of BACKDROP_PLACES) {
      expect(Number.isInteger(place.sways)).toBe(true);
      expect(place.start).toBeGreaterThan(0);
      expect(place.start).toBeLessThan(1);
      expect(place.across).toBeGreaterThanOrEqual(0);
      expect(place.across).toBeLessThanOrEqual(1);
    }
    const seconds = Object.values(BACKDROP_DEPTHS).map((d) => BACKDROP_ROUND_MS / d.climbs / 1000);
    expect(seconds).toEqual([40, 60, 80]);
  });
});

describe("the glow", () => {
  it("breathes a whole number of times a round, so it is where it began when the round is", () => {
    expect(Number.isInteger(BACKDROP_GLOW.breaths)).toBe(true);
    expect(BACKDROP_ROUND_MS / BACKDROP_GLOW.breaths).toBeGreaterThan(10_000);
    expect(BACKDROP_GLOW.small).toBeLessThan(BACKDROP_GLOW.full);
    expect(BACKDROP_GLOW.faint).toBeLessThan(1);
  });
});
