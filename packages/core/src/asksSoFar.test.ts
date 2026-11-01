import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  askAnswer,
  askDay,
  askedAtWords,
  askFilters,
  askKey,
  askRows,
  askRowWords,
  askTime,
  askVerdict,
  byDay,
  type FoundAsk,
  findAsk,
  gapWords,
  harnessAskKey,
  rowsUnder,
} from "./asksSoFar.js";
import type { ClientEvent, Directory } from "./events.js";
import { buildModel } from "./model/index.js";
import type { Approval } from "./model/types.js";

const FIXTURES = fileURLToPath(new URL("../../protocol/fixtures/", import.meta.url));

function fixture(type: string, seq: number, overrides: Record<string, unknown> = {}): ClientEvent {
  return { ...JSON.parse(readFileSync(`${FIXTURES}${type}.json`, "utf8")), seq, ...overrides };
}

const KIT = "hrn_01K4ZQPX000000000000000004";
const THEA = "agt_01K4ZQPX00000000000000000T";
const ARJUN = "usr_01K4ZQPX000000000000000003";
const DANA = "usr_01K4ZQPX00000000000000000D";
const RUN = "run_01K4ZQPX000000000000000005";
const THEAS_RUN = "run_01K4ZQPX00000000000000000T";
// Midday, so a date reads the same in any time zone the suite runs in.
const NOW = Date.parse("2026-10-18T12:00:00.000Z");

const directory: Directory = {
  [KIT]: { id: KIT, kind: "harness", displayName: "Kit", ownerId: ARJUN },
  [THEA]: { id: THEA, kind: "agent", displayName: "Thea", harnessId: KIT },
  [ARJUN]: { id: ARJUN, kind: "person", displayName: "Arjun" },
  [DANA]: { id: DANA, kind: "person", displayName: "Dana" },
};

const id = (letter: string) => `apr_01K4ZQPX00000000000000000${letter}`;
const ask = (seq: number, letter: string, extra: Record<string, unknown> = {}) =>
  fixture("approval.request", seq, { approval_id: id(letter), ...extra });
const answer = (seq: number, letter: string, extra: Record<string, unknown> = {}) =>
  fixture("approval.resolved", seq, { approval_id: id(letter), ...extra });
/** An ask asked a number of minutes after the fixture's, so the newest is the last. */
const at = (minutes: number) =>
  new Date(Date.parse("2026-09-02T14:22:04.004Z") + minutes * 60_000).toISOString();

describe("an ask's answer, in words (ADR 0255)", () => {
  const model = buildModel([
    fixture("space.created", 1),
    fixture("run.started", 2),
    ask(3, "A", { ts: at(0) }),
    answer(4, "A"),
    ask(5, "B", { ts: at(1), question: undefined, preview: undefined }),
    answer(6, "B", { scope: "session" }),
    ask(7, "C", { ts: at(2) }),
    answer(8, "C", { decision: "denied" }),
    ask(9, "E", { ts: at(3) }),
    answer(10, "E", { resolved_by: "system" }),
    ask(11, "F", { ts: at(4) }),
    answer(12, "F", { resolved_by: KIT }),
    ask(13, "G", { ts: at(5) }),
    answer(14, "G", { decision: "expired", resolved_by: "system" }),
    ask(15, "H", { ts: at(6) }),
    answer(16, "H", { decision: "denied", resolved_by: DANA }),
    ask(17, "J", { ts: at(7) }),
    answer(18, "J", { decision: "edited" }),
    ask(19, "K", { ts: at(8) }),
  ]);

  it("lists every ask newest first, each with its words, its answer and where it was asked", () => {
    const rows = askRows(model, directory, KIT, ARJUN, NOW);
    expect(rows.map((row) => [row.end, row.answer, row.filter])).toEqual([
      ["open", "Waiting for you", undefined],
      ["yes", "You said yes with changes", "yes"],
      ["no", "Dana said no", "no"],
      ["lapsed", "Nobody answered, so it was denied", "no"],
      ["own", "Kit said yes in its own tools", "yes"],
      ["policy", "Policy said yes", "yes"],
      ["no", "You said no", "no"],
      ["standing", "You said yes for the session", "yes"],
      ["yes", "You said yes", "yes"],
    ]);
    const first = rows[rows.length - 1];
    expect(first?.words).toBe("Send this email to dana@northwind.com?");
    expect(first?.where).toBe("Kit in PO-4471");
    expect(first?.spaceId).toBe("spc_01K4ZQPX000000000000000002");
    expect(first?.runId).toBe(RUN);
    expect(first?.day).toBe("Wednesday 2 September");
  });

  it("says who the open ask waits for, and the answers, from where the reader stands", () => {
    const rows = askRows(model, directory, KIT, DANA, NOW);
    expect(rows[0]?.answer).toBe("Waiting for Arjun");
    expect(rows[2]?.answer).toBe("You said no");
    expect(rows[8]?.answer).toBe("Arjun said yes");
  });

  it("says the kind's own words when an ask has no question or title, never the kind", () => {
    const bare = (kind: string): Approval => ({
      approvalId: id("Z"),
      runId: RUN,
      actionKind: kind,
      askedAt: at(0),
      risk: [],
      sources: [],
      editable: false,
      fallback: "deny",
      approvers: [],
    });
    expect(askRowWords(bare("jacobian.workroot.changeset_apply"))).toBe("Apply changes");
    expect(askRowWords({ ...bare("shell.exec"), previewTitle: "build.sh" })).toBe("build.sh");
    expect(askRowWords({ ...bare("shell.exec"), question: "Run `date`?" })).toBe("Run `date`?");
    expect(askRowWords(bare("kit.frobnicate"))).toBe("kit.frobnicate");
    // The fixture's B lost its question and its preview: its kind says what it does.
    expect(askRows(model, directory, KIT, ARJUN, NOW)[7]?.words).toBe("Send email");
  });

  it("says an answer in the harness's own tools only when it was the asker's own harness", () => {
    const approval = findAsk(model, id("F"))?.approval as Approval;
    const answered = approval.resolved as NonNullable<Approval["resolved"]>;
    expect(askAnswer(approval, directory, ARJUN, THEA).words).toBe("Kit said yes in its own tools");
    const lead = "hrn_01K4ZQPX00000000000000000L";
    const other: Directory = {
      ...directory,
      [lead]: { id: lead, kind: "harness", displayName: "Lux" },
    };
    const byLead = { ...approval, resolved: { ...answered, by: lead } } as Approval;
    expect(askAnswer(byLead, other, ARJUN, THEA)).toEqual({ end: "own", words: "Lux said yes" });
    const always = { ...approval, resolved: { ...answered, by: ARJUN, scope: "always" } };
    expect(askAnswer(always as Approval, directory, ARJUN)).toEqual({
      end: "standing",
      words: "You said yes always",
    });
    const went = { ...approval, fallback: "allow" as const };
    const lapsed = { ...went, resolved: { ...answered, decision: "expired" } };
    expect(askAnswer(lapsed as Approval, directory, ARJUN).words).toBe(
      "Nobody answered, so it went ahead",
    );
  });

  it("names the agent that asked, in a space of its own", () => {
    const theas = buildModel([
      fixture("space.created", 1, { title: "Memory match again" }),
      fixture("run.started", 2, { run_id: THEAS_RUN, actor: { kind: "agent", id: THEA } }),
      ask(3, "A", { run_id: THEAS_RUN }),
    ]);
    expect(askRows(theas, directory, KIT, ARJUN, NOW)[0]?.where).toBe("Thea in Memory match again");
  });

  it("filters the yeses and the noes, and offers no filter when there is nothing to choose", () => {
    const rows = askRows(model, directory, KIT, ARJUN, NOW);
    expect(askFilters(rows).map((each) => each.label)).toEqual(["All 9", "Yes 5", "No 3"]);
    expect(rowsUnder(rows, "no").map((row) => row.answer)).toEqual([
      "Dana said no",
      "Nobody answered, so it was denied",
      "You said no",
    ]);
    expect(rowsUnder(rows, "all")).toBe(rows);
    expect(askFilters(rowsUnder(rows, "yes"))).toEqual([]);
  });

  it("counts every ask for the key under the dots", () => {
    expect(harnessAskKey(model, directory, KIT)).toEqual([
      { dot: "yes", words: "5 yes" },
      { dot: "no", words: "2 no" },
      { dot: "lapsed", words: "1 unanswered" },
      { dot: "open", words: "1 waiting" },
    ]);
    expect(askKey([])).toEqual([]);
  });

  it("finds an ask by its id, with its run and its space", () => {
    const found = findAsk(model, id("C"));
    expect(found?.run.runId).toBe(RUN);
    expect(found?.spaceId).toBe("spc_01K4ZQPX000000000000000002");
    expect(findAsk(model, id("Y"))).toBeUndefined();
  });
});

describe("days, times and gaps (ADR 0255)", () => {
  // Made in the suite's own zone, so the clock reads the same wherever it runs.
  const local = (day: number, hour: number, minute: number) =>
    new Date(2026, 9, day, hour, minute).toISOString();
  const now = new Date(2026, 9, 25, 12, 0).getTime();

  it("says the day as a heading and the time on the row", () => {
    expect(askDay(local(25, 8, 0), now)).toBe("Today");
    expect(askDay(local(24, 23, 59), now)).toBe("Yesterday");
    expect(askDay(local(23, 5, 33), now)).toBe("Friday 23 October");
    expect(askDay(new Date(2025, 9, 23, 5, 33).toISOString(), now)).toBe(
      "Thursday 23 October 2025",
    );
    expect(askTime(local(23, 5, 33))).toBe("5:33 AM");
    expect(askTime(local(23, 20, 46))).toBe("8:46 PM");
    expect(askedAtWords(local(23, 5, 33), now)).toBe("Asked Friday 23 October at 5:33 AM");
    expect(askedAtWords(local(25, 9, 12), now)).toBe("Asked today at 9:12 AM");
  });

  it("groups the rows under their days, keeping their order", () => {
    const rows = [
      { day: "Today", n: 1 },
      { day: "Today", n: 2 },
      { day: "Friday 23 October", n: 3 },
    ] as never;
    expect(byDay(rows).map((each) => [each.day, each.rows.length])).toEqual([
      ["Today", 2],
      ["Friday 23 October", 1],
    ]);
  });

  it("says how long an answer took", () => {
    expect(gapWords(51_000)).toBe("under a minute");
    expect(gapWords(68_000)).toBe("1 minute");
    expect(gapWords(229_000)).toBe("3 minutes");
    expect(gapWords(3_600_000)).toBe("1 hour");
    expect(gapWords(47 * 3_600_000)).toBe("47 hours");
    expect(gapWords(72 * 3_600_000)).toBe("3 days");
  });

  it("says an answered ask's verdict, and when it came", () => {
    const asked = local(23, 5, 33);
    const model = buildModel([
      fixture("space.created", 1),
      fixture("run.started", 2, { run_id: THEAS_RUN, actor: { kind: "agent", id: THEA } }),
      ask(3, "A", { run_id: THEAS_RUN, ts: asked }),
      answer(4, "A", { run_id: THEAS_RUN, decision: "denied", resolved_at: local(23, 5, 37) }),
      ask(5, "B", { run_id: THEAS_RUN, ts: asked }),
      answer(6, "B", { run_id: THEAS_RUN, resolved_at: local(24, 9, 0) }),
      ask(7, "C", { run_id: THEAS_RUN, ts: asked }),
      answer(8, "C", {
        run_id: THEAS_RUN,
        decision: "expired",
        resolved_by: "system",
        resolved_at: local(23, 6, 33),
      }),
      ask(9, "E", { run_id: THEAS_RUN, ts: asked }),
    ]);
    const verdict = (letter: string) =>
      askVerdict(findAsk(model, id(letter)) as FoundAsk, directory, ARJUN, now);
    expect(verdict("A")).toEqual({
      end: "no",
      words: "You said no",
      line: "At 5:37 AM, 4 minutes after Thea asked.",
    });
    expect(verdict("B")?.line).toBe("Yesterday at 9:00 AM, 27 hours after Thea asked.");
    expect(verdict("C")).toEqual({
      end: "lapsed",
      words: "Nobody answered, so it was denied",
      line: "At 6:33 AM, when its time ran out, 1 hour after Thea asked.",
    });
    expect(verdict("E")).toBeUndefined();
  });
});
