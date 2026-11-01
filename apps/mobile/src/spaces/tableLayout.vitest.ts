import { parseMarkdown, type Table } from "@chipschat/core";
import { describe, expect, it } from "vitest";
import { CELL_PAD, EDGE_PAD, measure, tableLayout } from "./tableLayout";

/** The first table in some Markdown. */
function tableIn(text: string): Table {
  const table = parseMarkdown(text).find((block) => block.type === "table");
  if (table?.type !== "table") throw new Error("no table");
  return table;
}

// Garage door replacement, 15 October 2026.
const GARAGE = tableIn(
  [
    "| Your door/conditions | What the guidance says |",
    "|---|---|",
    "| **15-foot-wide door** | Wider doors have greater potential bowing. |",
    "| **Cherry Finish** | Darker colors generally absorb more solar heat than white; the exact effect of your finish hasn’t been established. |",
    "| **Direct sunlight** | Sun exposure increases the temperature difference between the outer and inner skins. |",
    "| **Center sticks outward** | That direction is consistent with a hotter exterior skin. |",
  ].join("\n"),
);

// Riaan's development, 9 October 2026.
const LEGO = tableIn(
  [
    "| Set | Age | Why it’s a good match | Price guide* |",
    "|---|---|---|---|",
    "| **[Cement Mixer — 60478](https://x.example/60478)** | 7+ | A rotating drum with an internal screw mechanism to mix and discharge the pretend concrete. | ~$40 |",
    "| **[Heavy-Duty Recovery Tow Truck with Crane — 60467](https://x.example/60467)** | 8+ | A working crane, stabilizing legs, towing lift, and winch. | Check current price |",
  ].join("\n"),
);

/** The widest a bubble is on a 402-point iPhone: nine tenths of the room inside its margins. */
const PHONE = (402 - 24) * 0.9;

describe("a table's columns in a bubble", () => {
  it("fits two columns of long words, sharing the room out toward each column's least", () => {
    const layout = tableLayout(GARAGE, 15, PHONE);
    expect(layout.scrolls).toBe(false);
    expect(layout.width).toBeLessThanOrEqual(PHONE);
    // Asked for more than the bubble has, so the bubble is drawn at its widest.
    expect(layout.most).toBeGreaterThan(PHONE);
    const [labels, guidance] = layout.columns;
    // The labels' longest word sets their least; the guidance is never squeezed to a word.
    expect(labels?.least).toBeGreaterThanOrEqual(
      measure([{ type: "text", text: "outward" }], 15, true).word,
    );
    expect(guidance?.least).toBeGreaterThan(6 * 15);
    // The guidance has more to give, so it gives more.
    expect((guidance?.most ?? 0) - (guidance?.least ?? 0)).toBeGreaterThan(
      (labels?.most ?? 0) - (labels?.least ?? 0),
    );
  });

  it("scrolls four columns sideways, each no wider than its words or the cap", () => {
    const layout = tableLayout(LEGO, 15, PHONE);
    expect(layout.scrolls).toBe(true);
    expect(layout.width).toBeGreaterThan(PHONE);
    const [set, age, why, price] = layout.columns;
    // Age is as wide as "Age" and "8+", no more.
    expect(age?.width).toBe(age?.most);
    expect(age?.width).toBeLessThan(60);
    // The long ones stop at the cap and wrap.
    expect(set?.width).toBe((why?.width ?? 0) + EDGE_PAD - CELL_PAD);
    expect(why?.width).toBeLessThan(why?.most ?? 0);
    expect(price?.width).toBe(price?.most);
    expect(layout.width).toBe(layout.columns.reduce((total, column) => total + column.width, 0));
  });

  it("fits a short table on a phone at its words' width, with nothing to give up", () => {
    const layout = tableLayout(tableIn("| Set | Age |\n|---|---|\n| Mixer | 7+ |"), 15, PHONE);
    expect(layout.scrolls).toBe(false);
    expect(layout.most).toBeLessThan(PHONE / 2);
    for (const column of layout.columns) expect(column.least).toBe(column.most);
  });

  it("pads the outside columns to the bubble's own edge, and the rest by a cell's", () => {
    const [first, middle, last] = tableLayout(
      tableIn("| a | b | c |\n|---|---|---|\n| a | b | c |"),
      15,
      PHONE,
    ).columns;
    expect((first?.most ?? 0) - (middle?.most ?? 0)).toBe(EDGE_PAD - CELL_PAD);
    expect(first?.most).toBe(last?.most);
  });

  it("grows with the size the words are set in", () => {
    expect(tableLayout(GARAGE, 22.5, PHONE).most).toBeGreaterThan(
      tableLayout(GARAGE, 15, PHONE).most,
    );
    expect(tableLayout(GARAGE, 22.5, 200).scrolls).toBe(true);
  });

  it("measures bold words wider, and a mention as bold", () => {
    const plain = measure([{ type: "text", text: "Direct sunlight" }], 15, false);
    const bold = measure(
      [{ type: "strong", children: [{ type: "text", text: "Direct sunlight" }] }],
      15,
      false,
    );
    expect(bold.line).toBeGreaterThan(plain.line);
    expect(plain.word).toBeLessThan(plain.line);
    expect(measure([{ type: "mention", handle: "Scout" }], 15, false).line).toBeCloseTo(
      (bold.line / 15) * 6,
      0,
    );
  });
});
