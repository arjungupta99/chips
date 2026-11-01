import { describe, expect, it } from "vitest";
import { docsFor, formatReport, levelsOf, passes, type Report, rowsOf } from "./report.js";

describe("the rows", () => {
  it("light by what was sent, and count it", () => {
    const rows = rowsOf(["run.started", "step.log", "step.log", "message.post", "run.completed"]);
    const lit = Object.fromEntries(rows.map((row) => [row.label, row.count]));
    expect(lit).toEqual({
      Messages: 1,
      Runs: 1,
      Steps: 2,
      Approvals: 0,
      Questions: 0,
      Context: 0,
      Cost: 0,
      Finished: 1,
      Lanes: 0,
    });
    expect(rows.find((row) => row.label === "Finished")?.types).toEqual([
      "run.completed",
      "run.failed",
    ]);
  });

  it("require what M2.5 names and the two a run cannot do without, and nothing else", () => {
    const required = rowsOf([])
      .filter((row) => row.required)
      .map((row) => row.label);
    expect(required).toEqual(["Messages", "Runs", "Steps", "Approvals", "Cost", "Finished"]);
  });
});

describe("passing", () => {
  const everything = [
    "message.post",
    "run.started",
    "step.log",
    "approval.request",
    "usage",
    "run.completed",
  ];

  it("takes every required row lit and nothing refused", () => {
    expect(passes(rowsOf(everything), [{ severity: "warn", message: "a nit" }])).toBe(true);
  });

  it("is refused by a dark required row or an error", () => {
    expect(passes(rowsOf(everything.filter((type) => type !== "usage")), [])).toBe(false);
    expect(passes(rowsOf(everything), [{ severity: "error", message: "refused" }])).toBe(false);
  });

  it("does not need the optional rows", () => {
    const rows = rowsOf(everything);
    expect(rows.find((row) => row.label === "Questions")?.lit).toBe(false);
    expect(passes(rows, [])).toBe(true);
  });
});

describe("the levels", () => {
  const supervised = rowsOf([
    "message.post",
    "run.started",
    "step.log",
    "approval.request",
    "usage",
    "run.completed",
  ]);

  it("talk and are supervised by the rows, and count what is checked or can't be", () => {
    const outcomes = new Map([
      ["new_spaces", "passed"],
      ["forks", "failed"],
      ["follows_rooms", "declared"],
      ["models", "passed"],
    ] as const);
    const levels = levelsOf(supervised, outcomes);
    expect(levels.map(({ label, has, of }) => [label, has, of])).toEqual([
      ["Talks", 1, 1],
      ["Supervised", 1, 1],
      ["Lives in Chips", 2, 6],
      ["Managed from Chips", 1, 6],
    ]);
    expect(levels[2]?.capabilities).toEqual([
      { capability: "new_spaces", outcome: "passed" },
      { capability: "forks", outcome: "failed" },
      { capability: "follows_rooms", outcome: "declared" },
    ]);
  });

  it("only talk without a run", () => {
    const levels = levelsOf(rowsOf(["message.post"]), new Map());
    expect(levels.map((level) => level.has)).toEqual([1, 0, 0, 0]);
  });
});

describe("the printed report", () => {
  const rows = rowsOf(["message.post", "run.started", "step.log", "step.log", "run.completed"]);
  const report: Report = {
    adapter: "example",
    rows,
    levels: levelsOf(rows, new Map([["restarts", "failed"]])),
    findings: [
      { severity: "error", message: "Chips refused usage: no such model" },
      { severity: "note", message: "nothing more came" },
    ],
    events: 5,
    durationMs: 1234,
    passed: false,
  };

  it("draws the checklist as the app does, then the notes, then the verdict", () => {
    const lines = formatReport(report);
    expect(lines).toContain("    ● Messages    sent message.post");
    expect(lines).toContain("    ● Steps       sent step.log ×2");
    expect(lines).toContain(
      "    ○ Approvals   send approval.request for an approval card in the space",
    );
    expect(lines).toContain("    5 events in 1.2 s");
    expect(lines).toContain("    ● Talks");
    expect(lines).toContain("    ○ Supervised");
    expect(lines).toContain("    ○ Lives in Chips       0 of 6: restarts ✗");
    expect(lines).toContain("    ○ Managed from Chips   0 of 6");
    expect(lines).toContain("    x Chips refused usage: no such model");
    expect(lines).toContain("    · nothing more came");
    expect(lines.at(-1)).toBe(
      "  Not passed: Approvals and Cost are not lit; 1 thing to fix below.",
    );
  });

  it("links every unlit row to the page that lights it", () => {
    const lines = formatReport(report).join("\n");
    expect(lines).toContain("https://chipschat.ai/reference/events/approval-request/");
    expect(docsFor("context.usage")).toBe("https://chipschat.ai/reference/events/context-usage/");
  });

  it("says so plainly when everything is lit", () => {
    const lines = formatReport({
      ...report,
      rows: rowsOf([
        "message.post",
        "run.started",
        "step.log",
        "approval.request",
        "question.ask",
        "context.usage",
        "usage",
        "run.completed",
      ]),
      findings: [],
      passed: true,
    });
    expect(lines.at(-1)).toBe("  Passed. Every required row is lit and nothing was refused.");
    expect(lines.join("\n")).not.toContain("Notes");
  });
});
