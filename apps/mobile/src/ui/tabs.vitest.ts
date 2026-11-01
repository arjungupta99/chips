/**
 * The tabs as data. What is worth asserting is not the words — they are right there — but the
 * two things a reader of the list cannot see: that the order covers every tab exactly once, so a
 * sixth tab cannot be added and silently left out of the bar, and that Runtime is the only one a
 * release hides.
 */

import { describe, expect, it } from "vitest";
import { inBar, TAB_ORDER, TABS, tabsShown } from "./tabs";

describe("the tabs", () => {
  it("orders every one of them, once", () => {
    expect([...TAB_ORDER].sort()).toEqual(Object.keys(TABS).sort());
    expect(new Set(TAB_ORDER).size).toBe(TAB_ORDER.length);
  });

  it("opens on Spaces, the index route, and has no For you (ADR 0065)", () => {
    expect(TAB_ORDER[0]).toBe("index");
    expect(TABS.index.title).toBe("Spaces");
    expect(Object.values(TABS).map((tab) => tab.title)).not.toContain("For you");
  });

  it("shows Runtime in development and nowhere else", () => {
    expect(tabsShown(true)).toEqual(["index", "agents", "search", "you", "runtime"]);
    expect(tabsShown(false)).toEqual(["index", "agents", "search", "you"]);
    expect(inBar("runtime", false)).toBe(false);
    expect(inBar("index", false)).toBe(true);
  });

  it("has Search between Agents and You, as a tab of its own (ADR 0132)", () => {
    expect(TAB_ORDER.indexOf("search")).toBe(TAB_ORDER.indexOf("agents") + 1);
    expect(TAB_ORDER.indexOf("you")).toBe(TAB_ORDER.indexOf("search") + 1);
    expect(TABS.search).toMatchObject({ title: "Search", mark: "search" });
  });

  it("gives each tab a mark for the system's bar and one for a drawn bar", () => {
    for (const name of TAB_ORDER) {
      const tab = TABS[name];
      expect(tab.symbol.sf.length).toBeGreaterThan(0);
      expect(tab.symbol.md.length).toBeGreaterThan(0);
      expect(tab.mark.length).toBeGreaterThan(0);
    }
  });
});
