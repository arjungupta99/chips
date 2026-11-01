import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  ALWAYS_EMPTY,
  actionWords,
  alwaysAsking,
  alwaysByHarness,
  alwaysCount,
  alwaysFoot,
  alwaysNone,
  alwaysRules,
  alwaysSheetWhy,
  alwaysSummary,
  askHistory,
  askingOpening,
  askingPromises,
  askMatters,
  askStanding,
  asksGoTo,
  changeScope,
  changesStill,
  dayMonth,
  ONCE_ONLY_WORDS,
  ownToolsWords,
  RULES_CHANGE_MS,
  type RulesChange,
  reachWords,
  rulesOf,
  startWords,
  switchedRule,
  UNREADABLE_WORDS,
  waitsWords,
  withChanges,
  withoutRule,
  withRuleBack,
  withRules,
  workspaceAskHistory,
} from "./asking.js";
import type { ClientEvent, Directory } from "./events.js";
import { buildModel } from "./model/index.js";

const FIXTURES = fileURLToPath(new URL("../../protocol/fixtures/", import.meta.url));

function fixture(type: string, seq: number, overrides: Record<string, unknown> = {}): ClientEvent {
  return { ...JSON.parse(readFileSync(`${FIXTURES}${type}.json`, "utf8")), seq, ...overrides };
}

const KIT = "hrn_01K4ZQPX000000000000000004";
const LUX = "hrn_01K4ZQPX00000000000000000L";
const ARJUN = "usr_01K4ZQPX000000000000000003";
const DANA = "usr_01K4ZQPX00000000000000000D";
const SPACE = "spc_01K4ZQPX000000000000000002";
// Midday, so a date reads the same in any time zone the suite runs in.
const NOW = Date.parse("2026-10-18T12:00:00.000Z");

const directory: Directory = {
  [KIT]: { id: KIT, kind: "harness", displayName: "Kit", ownerId: ARJUN },
  [LUX]: { id: LUX, kind: "harness", displayName: "Lux", ownerId: DANA },
  [ARJUN]: { id: ARJUN, kind: "person", displayName: "Arjun" },
  [DANA]: { id: DANA, kind: "person", displayName: "Dana" },
};

const always = (match: string, by: string, at: string, extra: Record<string, unknown> = {}) => ({
  match,
  when: {},
  decision: "allow",
  reason: `somebody said always, on ${at}`,
  made_by: by,
  made_at: at,
  ...extra,
});

describe("the section's opening and promises (ADR 0195)", () => {
  it("says who decides when, and who decides the answer, from where the reader stands", () => {
    expect(asksGoTo(directory, KIT, ARJUN)).toEqual({ kind: "you" });
    expect(asksGoTo(directory, KIT, DANA)).toEqual({ kind: "owner", name: "Arjun" });
    expect(asksGoTo({ [KIT]: { id: KIT, kind: "harness", displayName: "Kit" } }, KIT)).toEqual({
      kind: "unknown",
    });
    expect(askingOpening("Kit", { kind: "you" })).toEqual({
      headline: "Kit decides when to ask. You decide the answer.",
      sub: "Its asks come to you on any device, unless it names someone else in the space.",
    });
    expect(askingOpening("Kit", { kind: "owner", name: "Arjun" })).toEqual({
      headline: "Kit decides when to ask. Arjun decides the answer.",
      sub: "Its asks go to Arjun on any device, unless it names someone else in the space.",
    });
    expect(askingOpening("Kit", { kind: "unknown" }).headline).toBe(
      "Kit decides when to ask. A person decides the answer.",
    );
  });

  it("keeps three promises, the first said to the reader when the asks are theirs", () => {
    const mine = askingPromises("Kit", { kind: "you" });
    expect(mine.map((each) => each.title)).toEqual([
      "The big ones wait for you",
      "Its own window counts for the small ones",
      "No answer is a no",
    ]);
    expect(mine[0]?.line).toBe(
      "Money, outside messages, deletions and anything that can't be undone. Kit can't answer these itself, and each one takes a fresh yes.",
    );
    expect(mine[1]?.line).toBe("Say yes in Kit's window and the card here closes too.");
    expect(askingPromises("Kit", { kind: "owner", name: "Arjun" })[0]?.title).toBe(
      "The big ones wait for a person",
    );
  });
});

describe("Allowed always (ADR 0195)", () => {
  const model = buildModel([
    fixture("space.created", 1),
    fixture("policy.updated", 2, {
      space_id: undefined,
      harness_id: KIT,
      policy: {
        autonomy: 1,
        rules: [{ match: "file.read", decision: "allow" }],
      },
    }),
    fixture("policy.updated", 3, {
      harness_id: KIT,
      policy: {
        autonomy: 1,
        rules: [
          always("shell.exec", ARJUN, "2026-10-12T12:00:00.000Z"),
          always("jacobian.workroot.changeset_apply", DANA, "2026-10-03T12:00:00.000Z", {
            off: true,
          }),
          always("file.delete", DANA, "2025-12-01T12:00:00.000Z", { decision: "deny" }),
        ],
      },
    }),
  ]);

  it("lists every rule newest first, with where it holds, who made it and when", () => {
    const rules = alwaysRules(model, directory, KIT, ARJUN, NOW);
    expect(rules.map((rule) => [rule.kind, rule.words, rule.on, rule.line])).toEqual([
      // A rule that answers every command, as only a policy written another way now makes.
      ["shell.exec", "Any command", true, "In PO-4471 · by you, 12 October"],
      ["jacobian.workroot.changeset_apply", "Apply changes", false, "Off · Kit asks again"],
      [
        "file.delete",
        "Delete files",
        true,
        "Denied always · In PO-4471 · by Dana, 1 December 2025",
      ],
      ["file.read", "Read files", true, "In every space · from its policy"],
    ]);
    // Each says where it is kept, so a change sends that list back.
    expect(rules[0]).toMatchObject({ harnessId: KIT, spaceId: SPACE, index: 0 });
    expect(rules[3]).toMatchObject({ harnessId: KIT, index: 0 });
    expect(rules[3]?.spaceId).toBeUndefined();
    // Somebody else reads Arjun's by name.
    expect(alwaysRules(model, directory, KIT, DANA, NOW)[0]?.line).toBe(
      "In PO-4471 · by Arjun, 12 October",
    );
  });

  it("names a command's rule by the start it lets through (ADR 0239)", () => {
    const starts = buildModel([
      fixture("space.created", 1),
      fixture("policy.updated", 2, {
        space_id: undefined,
        harness_id: KIT,
        policy: {
          autonomy: 1,
          rules: [
            always("acp.execute", ARJUN, "2026-10-27T09:00:00.000Z", {
              when: { starts_with: ["node", "--check"] },
            }),
          ],
        },
      }),
    ]);
    const [rule] = alwaysRules(starts, directory, KIT, ARJUN, NOW);
    expect(rule).toMatchObject({
      kind: "acp.execute",
      start: "node --check …",
      line: "In every space · by you, 27 October",
    });
    expect(startWords(["sort"])).toBe("sort …");
  });

  it("says an older Always without its maker as from an Always", () => {
    const older = buildModel([
      fixture("space.created", 1),
      fixture("policy.updated", 2, {
        space_id: undefined,
        harness_id: KIT,
        policy: {
          autonomy: 1,
          rules: [{ match: "shell.exec", decision: "allow", reason: "Arjun said always, on x" }],
        },
      }),
    ]);
    expect(alwaysRules(older, directory, KIT, ARJUN, NOW)[0]?.line).toBe(
      "In every space · from an Always",
    );
  });

  it("counts what is on, and says nothing for none", () => {
    expect(alwaysCount(alwaysRules(model, directory, KIT, ARJUN, NOW))).toBe("3 of 4 on");
    expect(alwaysCount([{ on: true }, { on: true }])).toBe("2 on");
    expect(alwaysCount([])).toBeUndefined();
    expect(alwaysRules(model, directory, LUX, ARJUN, NOW)).toEqual([]);
    expect(ALWAYS_EMPTY).toBe("Nothing yet. Answering a smaller ask with Always adds it here.");
    expect(alwaysFoot("Kit", true)).toBe(
      "Turn one off and Kit asks again; it stays here to turn back on. Swipe one to remove it for good.",
    );
    expect(alwaysFoot("Kit", true, "cross")).toBe(
      "Turn one off and Kit asks again; it stays here to turn back on. Its × removes it for good.",
    );
    expect(alwaysFoot("Kit", false)).toBe("Only an owner or admin changes these.");
  });

  it("switches, removes and puts back a rule, and changes nothing else in the list", () => {
    const room = rulesOf(model, KIT, SPACE);
    expect(room).toHaveLength(3);
    const off = switchedRule(room, 0, false);
    expect(off[0]).toMatchObject({ match: "shell.exec", off: true });
    expect(off.slice(1)).toEqual(room.slice(1));
    // Turned back on, the rule carries no `off` at all, so it reads as it did.
    const on = switchedRule(off, 0, true);
    expect(on[0]).toEqual(room[0]);
    expect("off" in (on[0] ?? {})).toBe(false);
    const gone = withoutRule(room, 1);
    expect(gone.map((rule) => rule["match"])).toEqual(["shell.exec", "file.delete"]);
    expect(withRuleBack(gone, 1, room[1] ?? {})).toEqual(room);
    expect(rulesOf(model, KIT, undefined).map((rule) => rule["match"])).toEqual(["file.read"]);
    expect(rulesOf(model, LUX, undefined)).toEqual([]);
  });

  it("draws a change on its way as if it had landed, and leaves the rest alone", () => {
    const room = rulesOf(model, KIT, SPACE);
    const pending = withRules(model, KIT, SPACE, switchedRule(room, 0, false));
    expect(alwaysRules(pending, directory, KIT, ARJUN, NOW)[0]?.on).toBe(false);
    expect(rulesOf(pending, KIT, undefined)).toEqual(rulesOf(model, KIT, undefined));
    expect(pending.harnesses[KIT]?.bySpace[SPACE]?.autonomy).toBe(1);
    const everywhere = withRules(model, KIT, undefined, []);
    expect(rulesOf(everywhere, KIT, undefined)).toEqual([]);
    expect(withRules(model, LUX, undefined, [])).toBe(model);
  });

  it("keeps a change on its way until the model says the same, or until it is too old to trust", () => {
    const room = rulesOf(model, KIT, SPACE);
    const off: RulesChange = {
      harnessId: KIT,
      spaceId: SPACE,
      rules: switchedRule(room, 0, false),
      at: NOW,
    };
    const changes = new Map([[changeScope(KIT, SPACE), off]]);
    expect(changeScope(KIT, undefined)).toBe(`${KIT}:*`);
    expect(alwaysRules(withChanges(model, changes), directory, KIT, ARJUN, NOW)[0]?.on).toBe(false);
    // Not echoed yet: kept, and the same map, so nothing draws again.
    expect(changesStill(changes, model, NOW + 1000)).toBe(changes);
    // Echoed: gone.
    expect(changesStill(changes, withRules(model, KIT, SPACE, off.rules), NOW).size).toBe(0);
    // Never echoed, the server refused it: the model is drawn again.
    expect(changesStill(changes, model, NOW + RULES_CHANGE_MS + 1).size).toBe(0);
    expect(withChanges(model, new Map())).toBe(model);
  });

  it("gathers every harness for You's sheet, and sums them for its row", () => {
    const sheet = alwaysByHarness(model, directory, ARJUN, NOW);
    expect(sheet.map((each) => [each.name, each.rules.length])).toEqual([
      ["Kit", 4],
      ["Lux", 0],
    ]);
    expect(alwaysSummary(model, directory)).toBe("3 of 4 on");
    expect(alwaysSummary(buildModel([]), directory)).toBe("Asks every time");
    // The harnesses with nothing are one line under the list, not a box each.
    expect(alwaysAsking(sheet)).toBe("Lux asks every time.");
    expect(alwaysAsking(alwaysByHarness(buildModel([]), directory, ARJUN, NOW))).toBe(
      "Kit and Lux ask every time.",
    );
    expect(alwaysAsking(sheet.slice(0, 1))).toBeUndefined();
    expect(alwaysSheetWhy()).toBe(
      "Each rule lets a harness do one kind of thing without asking you. Turn one off and its asks come back. Swipe one away to remove it.",
    );
    expect(alwaysSheetWhy("cross")).toMatch(/come back\. Its × removes it\.$/);
  });

  it("says once, when nothing is allowed, how a rule comes to be there", () => {
    // Lux is Dana's, so not every ask comes to Arjun.
    expect(alwaysNone(directory, ARJUN)).toEqual({
      headline: "Nothing is allowed always, so every ask comes to a person.",
      line: "When a harness asks to do something small, Always on its card lets it do that again without asking, in that space or in every space. Each one made is listed here, where it can be turned off.",
      matters:
        "Asks that a harness marks as spending money, messaging outside, deleting or not undoable take a yes each time, so Always isn't offered for them.",
      yours: false,
    });
    const mine: Directory = { [KIT]: directory[KIT], [ARJUN]: directory[ARJUN] } as Directory;
    expect(alwaysNone(mine, ARJUN)).toMatchObject({
      headline: "Nothing is allowed always, so every ask comes to you.",
      yours: true,
    });
    expect(alwaysNone(mine, undefined).yours).toBe(false);
  });

  it("names what a kind allows from its own words, and nothing it can't read", () => {
    expect(
      [
        "shell.exec",
        "acp.bash",
        "acp.execute",
        "file.delete",
        "acp.delete",
        "email.send",
        "mail.draft",
        "message.send",
        "payment.transfer",
        "acp.fetch",
        "acp.search",
        "acp.move",
        "workroot.changeset_apply",
        "file.edit",
        "acp.edit",
        "notes.write",
        "acp.read",
        "workroot_config.workroot_bind",
        "garden.note",
      ].map(actionWords),
    ).toEqual([
      "Run commands",
      "Run commands",
      "Run commands",
      "Delete files",
      "Delete files",
      "Send email",
      "Draft email",
      "Send messages",
      "Make payments",
      "Fetch from the web",
      "Search files",
      "Move files",
      "Apply changes",
      "Edit files",
      "Edit files",
      "Write files",
      "Read files",
      undefined,
      undefined,
    ]);
    // A command that deletes is still a command: the first that fits says it.
    expect(actionWords("shell.exec_delete")).toBe("Run commands");
  });
});

describe("what has happened, as dots (ADR 0195)", () => {
  const ask = (seq: number, id: string, extra: Record<string, unknown> = {}) =>
    fixture("approval.request", seq, { approval_id: id, ...extra });
  const answer = (seq: number, id: string, extra: Record<string, unknown> = {}) =>
    fixture("approval.resolved", seq, { approval_id: id, ...extra });

  it("draws a dot per ask and says who answered", () => {
    const model = buildModel([
      fixture("space.created", 1),
      fixture("run.started", 2),
      ask(3, "apr_01K4ZQPX00000000000000000A"),
      answer(4, "apr_01K4ZQPX00000000000000000A"),
      ask(5, "apr_01K4ZQPX00000000000000000B"),
      answer(6, "apr_01K4ZQPX00000000000000000B", { scope: "session" }),
      ask(7, "apr_01K4ZQPX00000000000000000C"),
      answer(8, "apr_01K4ZQPX00000000000000000C", { decision: "denied" }),
    ]);
    expect(askHistory(model, directory, KIT, ARJUN, NOW)).toEqual({
      dots: ["yes", "session", "no"],
      line: "3 asks since 2 September · all answered by you",
    });
    expect(askHistory(model, directory, KIT, DANA, NOW)?.line).toBe(
      "3 asks since 2 September · all answered by Arjun",
    );
  });

  it("counts its own window's answers, lapses and what still waits", () => {
    const model = buildModel([
      fixture("space.created", 1),
      fixture("run.started", 2),
      ask(3, "apr_01K4ZQPX00000000000000000A"),
      answer(4, "apr_01K4ZQPX00000000000000000A"),
      ask(5, "apr_01K4ZQPX00000000000000000B"),
      answer(6, "apr_01K4ZQPX00000000000000000B", { resolved_by: KIT }),
      ask(7, "apr_01K4ZQPX00000000000000000C"),
      answer(8, "apr_01K4ZQPX00000000000000000C", { decision: "expired", resolved_by: "system" }),
      ask(9, "apr_01K4ZQPX00000000000000000E"),
      ask(10, "apr_01K4ZQPX00000000000000000F"),
      // Let through on the spot by a rule: not lapsed, and nobody's answer.
      answer(11, "apr_01K4ZQPX00000000000000000F", { resolved_by: "system" }),
    ]);
    expect(askHistory(model, directory, KIT, ARJUN, NOW)).toEqual({
      dots: ["yes", "yes", "lapsed", "open", "yes"],
      line: "5 asks since 2 September · 1 answered by you · 1 in its own window · 1 by policy · 1 lapsed · 1 waiting",
    });
  });

  it("draws every harness's asks together for You's sheet", () => {
    const model = buildModel([
      fixture("space.created", 1),
      fixture("run.started", 2),
      ask(3, "apr_01K4ZQPX00000000000000000A"),
      answer(4, "apr_01K4ZQPX00000000000000000A", { decision: "denied" }),
      fixture("run.started", 5, { run_id: "run_01K4ZQPX00000000000000000L", harness_id: LUX }),
      ask(6, "apr_01K4ZQPX00000000000000000B", { run_id: "run_01K4ZQPX00000000000000000L" }),
      answer(7, "apr_01K4ZQPX00000000000000000B", { run_id: "run_01K4ZQPX00000000000000000L" }),
    ]);
    expect(workspaceAskHistory(model, directory, ARJUN, NOW)).toEqual({
      dots: ["no", "yes"],
      line: "2 asks since 2 September · all answered by you",
    });
    expect(workspaceAskHistory(buildModel([]), directory, ARJUN, NOW)).toBeUndefined();
  });

  it("has nothing to say of a harness never asked", () => {
    expect(askHistory(buildModel([fixture("space.created", 1)]), directory, KIT, ARJUN)).toBe(
      undefined,
    );
  });
});

describe("the ask card's words (ADR 0195)", () => {
  const asked = (action: Record<string, unknown>, risk: string[] = []) =>
    buildModel([
      fixture("space.created", 1),
      fixture("run.started", 2),
      fixture("approval.request", 3, { action, risk }),
    ]).spaces[0]?.runs[0]?.approvals[0];

  it("knows an ask that matters from its flags and risk, and a small one", () => {
    const email = asked({ kind: "email.send", external: true });
    expect(email === undefined ? undefined : askMatters(email)).toBe(true);
    const money = asked({ kind: "payment.transfer", money_usd: 40 });
    expect(money?.matters).toBe(true);
    expect(asked({ kind: "x.y" }, ["credential"])?.matters).toBe(true);
    const small = asked({ kind: "shell.exec" }, ["privacy"]);
    expect(small === undefined ? undefined : askMatters(small)).toBe(false);
    expect(ONCE_ONLY_WORDS).toBe("You answer asks like this each time, so there is no Always.");
    expect(waitsWords(true)).toBe("Waits for you");
    expect(waitsWords(false)).toBe("Waits for a person");
  });

  it("offers a command's yes beyond once by its parts' starts, or says why not (ADR 0239)", () => {
    const standing = (action: Record<string, unknown>, risk: string[] = []) => {
      const approval = asked(action, risk);
      return approval === undefined ? undefined : askStanding(approval);
    };
    expect(standing({ kind: "file.edit", input: { path: "a.md" } })).toEqual({ kind: "any" });
    expect(
      standing({ kind: "acp.execute", input: { command: "node --check game.js && echo ok" } }),
    ).toEqual({ kind: "starts", starts: ["node --check …", "echo ok …"] });
    expect(standing({ kind: "acp.execute", input: { command: "echo hi > out.txt" } })).toEqual({
      kind: "once",
      why: UNREADABLE_WORDS,
    });
    expect(standing({ kind: "acp.execute", input: { command: "ls && rm x" } })).toEqual({
      kind: "once",
      why: "Asks that use rm are answered each time.",
    });
    expect(standing({ kind: "email.send", external: true })).toEqual({
      kind: "once",
      why: ONCE_ONLY_WORDS,
    });
  });

  it("says how far a standing yes reaches, and what still comes to a person (ADR 0239)", () => {
    expect(reachWords("everywhere", "Bakery", true)).toBe(
      "Commands made only of these go ahead without a card in every space. Anything else still comes to you.",
    );
    expect(reachWords("space", "Bakery", true)).toBe(
      "Commands made only of these go ahead without a card in Bakery. Anything else still comes to you.",
    );
    expect(reachWords("session", "Bakery", false)).toBe(
      "Asks like this go ahead without a card until this session ends.",
    );
  });

  it("says when the harness answered in its own tools, and nothing for a person or policy", () => {
    const decided = (by: string, decision = "approved") =>
      buildModel([
        fixture("space.created", 1),
        fixture("run.started", 2),
        fixture("approval.request", 3, { action: { kind: "shell.exec" }, risk: [] }),
        fixture("approval.resolved", 4, { resolved_by: by, decision }),
      ]).spaces[0]?.runs[0]?.approvals[0];
    const own = decided(KIT);
    expect(own === undefined ? undefined : ownToolsWords(own, directory, KIT)).toBe(
      "Answered by Kit in its own tools.",
    );
    // A lead another harness's policy handed it to is not answering in its own tools.
    expect(own === undefined ? undefined : ownToolsWords(own, directory, LUX)).toBeUndefined();
    const person = decided(ARJUN);
    expect(person === undefined ? undefined : ownToolsWords(person, directory)).toBeUndefined();
    const policy = decided("system");
    expect(policy === undefined ? undefined : ownToolsWords(policy, directory)).toBeUndefined();
  });
});

describe("dates", () => {
  it("says the day and month, and the year when it is not this one", () => {
    expect(dayMonth("2026-10-12T12:00:00.000Z", NOW)).toBe("12 October");
    expect(dayMonth("2025-12-01T12:00:00.000Z", NOW)).toBe("1 December 2025");
    expect(dayMonth("not a date", NOW)).toBe("");
  });
});
