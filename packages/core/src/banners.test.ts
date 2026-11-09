import { describe, expect, it } from "vitest";
import {
  agentBannerRow,
  type BannerChange,
  type Banners,
  bannerClosed,
  bannersOf,
  bannersToKeep,
  bannersToShow,
  bannerWanted,
  harnessAgentIds,
  harnessBannerRow,
  harnessBannersWords,
  NO_BANNERS,
  withBannerChanges,
} from "./banners.js";
import type { Directory } from "./events.js";
import type { LetWork, Space } from "./model/types.js";

const directory: Directory = {
  har: { id: "har", kind: "harness", displayName: "Claude Code" },
  other: { id: "other", kind: "harness", displayName: "Codex" },
  jiro: { id: "jiro", kind: "agent", displayName: "Jiro", harnessId: "har" },
  kit: { id: "kit", kind: "agent", displayName: "Kit", harnessId: "har" },
  ada: { id: "ada", kind: "agent", displayName: "Ada", harnessId: "har" },
  old: { id: "old", kind: "agent", displayName: "Old", harnessId: "har", archived: true },
  far: { id: "far", kind: "agent", displayName: "Far", harnessId: "other" },
};

const held = (asker: string, since = "2026-11-08T10:00:00.000Z"): LetWork => ({
  asker,
  by: "usr",
  since,
});
const closedFor = (asker: string, since = "2026-11-08T10:00:00.000Z") => ({
  spaceId: "spc",
  asker,
  since,
});
const space = (...letWork: LetWork[]) => ({ id: "spc", letWork }) as unknown as Space;
const changes = (...each: BannerChange[]) => new Map(each.map((one, at) => [String(at), one]));
const choose = (choices: Record<string, boolean>): Banners => ({ choices, closed: [] });
const NOW = Date.parse("2026-11-08T11:00:00.000Z");

describe("whether a banner shows (ADR 0286)", () => {
  it("shows it with nothing said, follows the harness, and an agent's own word wins", () => {
    expect(bannerWanted(NO_BANNERS, directory, "jiro")).toBe(true);
    expect(bannerWanted(choose({ har: false }), directory, "jiro")).toBe(false);
    expect(bannerWanted(choose({ har: false, jiro: true }), directory, "jiro")).toBe(true);
    expect(bannerWanted(choose({ jiro: false }), directory, "kit")).toBe(true);
    expect(bannerWanted(choose({ har: false }), directory, "far")).toBe(true);
  });

  it("wants a harness's own banner by its own word", () => {
    expect(bannerWanted(choose({ har: false }), directory, "har")).toBe(false);
  });

  it("closes a banner for that yes in that space, and a later yes shows again", () => {
    const banners: Banners = { choices: {}, closed: [closedFor("jiro")] };
    expect(bannerClosed(banners, "spc", held("jiro"))).toBe(true);
    expect(bannerClosed(banners, "spc2", held("jiro"))).toBe(false);
    expect(bannerClosed(banners, "spc", held("jiro", "2026-11-08T10:30:00.000Z"))).toBe(false);
    expect(bannerClosed(banners, "spc", held("kit"))).toBe(false);
  });

  it("leaves out what is off and what is closed, against the clock", () => {
    const hour = { ...held("ada"), until: "2026-11-08T10:30:00.000Z" };
    const room = space(held("jiro"), held("kit"), hour);
    const banners: Banners = { choices: { kit: false }, closed: [] };
    expect(bannersToShow(room, directory, banners, NOW).map((each) => each.asker)).toEqual([
      "jiro",
    ]);
    const closed: Banners = { choices: {}, closed: [closedFor("jiro")] };
    expect(bannersToShow(room, directory, closed, NOW).map((each) => each.asker)).toEqual(["kit"]);
    expect(bannersToShow(undefined, directory, NO_BANNERS, NOW)).toEqual([]);
  });
});

describe("what the switches say", () => {
  it("says where an agent's switch stands", () => {
    expect(agentBannerRow(NO_BANNERS, directory, "jiro")).toEqual({
      shown: true,
      apart: false,
      sub: "Same as Claude Code",
    });
    expect(agentBannerRow(choose({ har: false }), directory, "jiro")).toEqual({
      shown: false,
      apart: false,
      sub: "Off for all of Claude Code",
    });
    expect(agentBannerRow(choose({ jiro: false }), directory, "jiro").sub).toBe(
      "Off for Jiro only",
    );
    expect(agentBannerRow(choose({ har: false, jiro: true }), directory, "jiro").sub).toBe(
      "On for Jiro only",
    );
  });

  it("counts a harness's agents still going", () => {
    expect(harnessAgentIds(directory, "har")).toEqual(["jiro", "kit", "ada"]);
    expect(harnessBannerRow(NO_BANNERS, directory, "har")).toEqual({
      shown: true,
      sub: "On for all 3 agents",
    });
    expect(harnessBannerRow(choose({ har: false }), directory, "har")).toEqual({
      shown: false,
      sub: "Off for all 3 agents",
    });
    expect(harnessBannersWords(directory, "har", false)).toBe("Banners off for all 3 agents");
    expect(harnessBannersWords(directory, "har", true)).toBe("Banners on for all 3 agents");
  });

  it("names the one set apart, and counts several", () => {
    expect(harnessBannerRow(choose({ jiro: false }), directory, "har")).toEqual({
      shown: true,
      sub: "On for 2, off for Jiro",
    });
    expect(harnessBannerRow(choose({ jiro: false, kit: false }), directory, "har").sub).toBe(
      "On for 1, off for 2",
    );
    expect(
      harnessBannerRow(choose({ har: false, jiro: true, kit: true }), directory, "har").sub,
    ).toBe("Off for 1, on for 2");
  });

  it("reads every one set apart as what they are, and a harness with one or none", () => {
    const all = choose({ jiro: false, kit: false, ada: false });
    expect(harnessBannerRow(all, directory, "har")).toEqual({
      shown: false,
      sub: "Off for all 3 agents",
    });
    expect(harnessBannerRow(NO_BANNERS, directory, "other").sub).toBe("On for its agent");
    expect(harnessBannersWords(directory, "other", false)).toBe("Banners off for its agent");
    const none: Directory = { har: directory["har"] as Directory[string] };
    expect(harnessBannerRow(NO_BANNERS, none, "har").sub).toBe("On for its agents");
    expect(harnessBannersWords(none, "har", true)).toBe("Banners on for its agents");
  });
});

describe("changes on their way", () => {
  it("is what the server said while nothing is on its way", () => {
    const banners = choose({ jiro: false });
    expect(withBannerChanges(banners, new Map())).toBe(banners);
  });

  it("says a choice and lets one go", () => {
    expect(
      withBannerChanges(NO_BANNERS, changes({ kind: "choice", target: "jiro", shown: false }))
        .choices,
    ).toEqual({ jiro: false });
    expect(
      withBannerChanges(
        choose({ jiro: false }),
        changes({ kind: "choice", target: "jiro", shown: undefined }),
      ).choices,
    ).toEqual({});
  });

  it("brings a harness's agents back in line with it", () => {
    expect(
      withBannerChanges(
        choose({ jiro: true, far: false }),
        changes({ kind: "all", harnessId: "har", agentIds: ["jiro", "kit"], shown: false }),
      ).choices,
    ).toEqual({ har: false, far: false });
  });

  it("closes one once, for its latest yes, and shows it again", () => {
    const first: Banners = { choices: {}, closed: [closedFor("jiro")] };
    const later = "2026-11-08T10:30:00.000Z";
    expect(
      withBannerChanges(first, changes({ kind: "closed", ...closedFor("jiro", later) })).closed,
    ).toEqual([closedFor("jiro", later)]);
    expect(
      withBannerChanges(
        first,
        changes({ kind: "closed", spaceId: "spc", asker: "jiro", since: undefined }),
      ).closed,
    ).toEqual([]);
  });
});

describe("the wire and the cache", () => {
  it("reads what the server says, and what it keeps reads back", () => {
    const wire = {
      choices: { jiro: false },
      closed: [{ space_id: "spc", asker: "jiro", since: "2026-11-08T10:00:00.000Z" }],
    };
    const banners = bannersOf(wire);
    expect(banners).toEqual({ choices: { jiro: false }, closed: [closedFor("jiro")] });
    expect(bannersToKeep(banners as Banners)).toEqual(wire);
  });

  it("drops what isn't what it should be", () => {
    expect(bannersOf(undefined)).toBeUndefined();
    expect(bannersOf({ choices: {} })).toBeUndefined();
    expect(bannersOf({ choices: null, closed: [] })).toBeUndefined();
    expect(bannersOf({ choices: { a: "no", b: true }, closed: [{ space_id: 1 }, null] })).toEqual({
      choices: { b: true },
      closed: [],
    });
  });
});
