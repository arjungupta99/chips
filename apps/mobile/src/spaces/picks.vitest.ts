import { beforeEach, describe, expect, it, vi } from "vitest";

/** The phone's settings, as a map: what `prefs` would write to SQLite. */
const written = new Map<string, string>();
vi.mock("../prefs", () => ({
  SETTINGS: { picks: "picks" },
  readSetting: async (name: string) => written.get(name),
  writeSetting: async (name: string, value: string) => {
    written.set(name, value);
  },
}));

/** The module fresh, as the app is after iOS has ended it and it has been opened again. */
async function relaunched() {
  vi.resetModules();
  const picks = await import("./picks");
  await picks.loadPicks();
  return picks;
}

describe("the field's picks, kept on the phone (ADR 0114)", () => {
  beforeEach(() => written.clear());

  it("finds a room's pick again after the app has been ended and opened", async () => {
    const before = await relaunched();
    before.keepPick("sp_kitchen", ["agt_j0", "agt_o1"]);
    before.keepPick("sp_garden", "all");
    await vi.waitFor(() => expect(written.get("picks")).toContain("sp_garden"));
    const after = await relaunched();
    expect(after.pickFor("sp_kitchen")).toEqual(["agt_j0", "agt_o1"]);
    expect(after.pickFor("sp_garden")).toBe("all");
    expect(after.pickFor("sp_hall")).toBeUndefined();
  });

  it("lets a pick go when told, and forgets them all on unpairing", async () => {
    const picks = await relaunched();
    picks.keepPick("sp_kitchen", ["agt_j0"]);
    picks.keepPick("sp_kitchen", undefined);
    expect(picks.pickFor("sp_kitchen")).toBeUndefined();
    picks.keepPick("sp_garden", "all");
    picks.forgetPicks();
    await vi.waitFor(() => expect(written.get("picks")).toBe("{}"));
    expect((await relaunched()).pickFor("sp_garden")).toBeUndefined();
  });

  it("reads nonsense as nothing, and keeps only what is a pick", async () => {
    written.set("picks", "not json");
    expect((await relaunched()).pickFor("sp_kitchen")).toBeUndefined();
    written.set("picks", JSON.stringify({ sp_kitchen: ["agt_j0"], sp_odd: 7, sp_bad: [1] }));
    const picks = await relaunched();
    expect(picks.pickFor("sp_kitchen")).toEqual(["agt_j0"]);
    expect(picks.pickFor("sp_odd")).toBeUndefined();
    expect(picks.pickFor("sp_bad")).toBeUndefined();
  });
});
