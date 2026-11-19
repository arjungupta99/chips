import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { OwnRules } from "@chipschat/protocol";
import { describe, expect, it } from "vitest";
import {
  alwaysRules,
  askHistory,
  EVERY_HARNESS,
  rulesAt,
  rulesOf,
  switchedRule,
  withoutRule,
  withRuleBack,
  withRules,
} from "./asking.js";
import { harnessAskKey } from "./asksSoFar.js";
import type { ClientEvent, Directory } from "./events.js";
import { buildModel } from "./model/index.js";
import type { WorkspaceModel } from "./model/types.js";
import {
  COMMANDS_KIND,
  draftProblem,
  draftRules,
  harnessPermissions,
  holdOf,
  NOT_SAID,
  newRuleOptions,
  ownRulesView,
  permissionsRowWords,
  permissionsSummary,
  roomHolds,
  rulePreview,
  segments,
  withDraft,
  youPermissions,
} from "./permissions.js";

const FIXTURES = fileURLToPath(new URL("../../protocol/fixtures/", import.meta.url));

function fixture(type: string, seq: number, overrides: Record<string, unknown> = {}): ClientEvent {
  return { ...JSON.parse(readFileSync(`${FIXTURES}${type}.json`, "utf8")), seq, ...overrides };
}

const KIT = "hrn_01K4ZQPX000000000000000004";
const LUX = "hrn_01K4ZQPX00000000000000000L";
const ARJUN = "usr_01K4ZQPX000000000000000003";
const DANA = "usr_01K4ZQPX00000000000000000D";
const SPACE = "spc_01K4ZQPX000000000000000002";
/** 10:41 in the morning, the reader's time, so the words read the same wherever the suite runs. */
const NOW = new Date(2026, 10, 18, 9, 41, 0, 0).getTime();
const at = (hours: number, minutes = 0, day = 18) =>
  new Date(2026, 10, day, hours, minutes).toISOString();

const directory: Directory = {
  [KIT]: { id: KIT, kind: "harness", displayName: "Claude Code", ownerId: ARJUN },
  [LUX]: { id: LUX, kind: "harness", displayName: "OpenCode", ownerId: ARJUN },
  [ARJUN]: { id: ARJUN, kind: "person", displayName: "Arjun" },
  [DANA]: { id: DANA, kind: "person", displayName: "Dana" },
};

const owned = (model: WorkspaceModel): WorkspaceModel => ({
  ...model,
  people: {
    [ARJUN]: { participantId: ARJUN, role: "owner", displayName: "Arjun", joinedAt: "2026-09-01" },
    [DANA]: { participantId: DANA, role: "member", displayName: "Dana", joinedAt: "2026-09-01" },
  },
});

const policy = (seq: number, extra: Record<string, unknown>) =>
  fixture("policy.updated", seq, {
    space_id: undefined,
    harness_id: KIT,
    policy: { autonomy: 1, rules: [] },
    ...extra,
  });

const shell = (seq: number, id: string, command: string) =>
  fixture("approval.request", seq, {
    approval_id: id,
    action: { kind: "acp.bash", input: { command } },
    risk: [],
  });

describe("turning a harness's asks off (ADR 0299)", () => {
  it("folds a hold from policy.updated: absent keeps it, null turns the asks back on", () => {
    const hold = { until: at(10, 41), by: ARJUN, at: at(9, 41) };
    const on = buildModel([policy(1, { policy: { autonomy: 1, rules: [], hold } })]);
    expect(on.harnesses[KIT]?.hold).toEqual({ ...hold, matters: false });
    const kept = buildModel([
      policy(1, { policy: { autonomy: 1, rules: [], hold } }),
      policy(2, { policy: { autonomy: 1, rules: [{ match: "file.read", decision: "allow" }] } }),
    ]);
    expect(kept.harnesses[KIT]?.hold?.until).toBe(hold.until);
    const back = buildModel([
      policy(1, { policy: { autonomy: 1, rules: [], hold } }),
      policy(2, { policy: { autonomy: 1, rules: [], hold: null } }),
    ]);
    expect(back.harnesses[KIT]?.hold).toBeUndefined();
  });

  it("folds the rules and hold for every harness, and says whose holds", () => {
    const model = buildModel([
      fixture("policy.workspace_updated", 1, {
        hold: { until: at(10, 41), matters: false, by: ARJUN, at: at(9, 41) },
      }),
    ]);
    expect(model.workspaceRules.rules).toHaveLength(1);
    expect(holdOf(model, KIT, NOW)).toMatchObject({ every: true });
    const cleared = buildModel([
      fixture("policy.workspace_updated", 1, { hold: { by: ARJUN } }),
      fixture("policy.workspace_updated", 2, { rules: [] }),
    ]);
    expect(cleared.workspaceRules.hold?.by).toBe(ARJUN);
    expect(
      buildModel([
        fixture("policy.workspace_updated", 1, { hold: { by: ARJUN } }),
        fixture("policy.workspace_updated", 2, { rules: [], hold: null }),
      ]).workspaceRules.hold,
    ).toBeUndefined();
  });

  it("draws a band in a room with an agent of a harness whose asks are off", () => {
    const AGENT = "hrn_01K4ZQPX0000000000000000A1";
    const agents: Directory = {
      ...directory,
      [AGENT]: { id: AGENT, kind: "agent", displayName: "Jiro", harnessId: KIT },
    };
    const model = buildModel([
      fixture("space.created", 1),
      fixture("membership.added", 2, { participant_id: AGENT, participant_kind: "agent" }),
      policy(3, { policy: { autonomy: 1, rules: [], hold: { until: at(10, 41) } } }),
    ]);
    expect(roomHolds(model, agents, SPACE, NOW)).toEqual([
      { harnessId: KIT, words: "Chips is saying yes for Claude Code until 10:41 AM" },
    ]);
    expect(roomHolds(model, agents, SPACE, Date.parse(at(11)))).toEqual([]);
    // A pause is Chips's: with its rules switched off, nothing of it holds (ADR 0300).
    const switched = buildModel([
      fixture("space.created", 1),
      fixture("membership.added", 2, { participant_id: AGENT, participant_kind: "agent" }),
      policy(3, { policy: { autonomy: 1, rules: [], hold: { until: at(10, 41) } } }),
      policy(4, { policy: { autonomy: 1, rules: [], chips_rules: false } }),
    ]);
    expect(roomHolds(switched, agents, SPACE, NOW)).toEqual([]);
  });
});

const CLAUDE_CODE: OwnRules = {
  read_from: ["~/.claude/settings.json", ".claude/settings.json"],
  mode: "Default",
  runs: [
    { kind: "read", name: "Read" },
    { kind: "read", name: "Grep" },
    { kind: "write", name: "Edit" },
    { kind: "web", name: "WebFetch" },
    { kind: "command", name: "Bash", words: ["git"], raw: "Bash(git:*)" },
    { kind: "command", name: "Bash", words: ["curl"], raw: "Bash(curl:*)" },
    { kind: "command", name: "Bash", words: ["find"], raw: "Bash(find:*)" },
    { kind: "command", name: "Bash", words: ["ls"], raw: "Bash(ls:*)" },
    { kind: "command", name: "Bash", words: ["*", "--version"], raw: "Bash(* --version)" },
  ],
  asks: [{ kind: "command", name: "Bash", words: ["git", "reset"] }],
  ask_line: {
    entry: '"Bash({words}:*)"',
    line: '"ask": [{entries}]',
    where: "`permissions` in `~/.claude/settings.json`",
  },
};

describe("what a harness runs on its own (ADR 0299)", () => {
  it("says it in plain words, and names what Chips would never allow", () => {
    const view = ownRulesView("Claude Code", { own_rules: CLAUDE_CODE, heard_at: at(9) });
    expect(view.count).toBe(9);
    expect(view.rows.map((row) => row.title)).toEqual([
      "Read and search files",
      "Edit and write files",
      "Fetch pages and search the web",
      "Run 4 programs",
      "Run commands shaped like these",
    ]);
    expect(view.rows[3]?.names).toEqual([
      { name: "git", never: true },
      { name: "curl", never: true },
      { name: "find", never: true },
      { name: "ls", never: false },
    ]);
    // `git reset` asks in its own settings, so it is no conflict.
    expect(view.conflicts).toEqual([
      "curl",
      "git push",
      "find -exec",
      "git clean",
      "find -execdir",
      "find -ok",
      "find -delete",
    ]);
    expect(view.notice?.title).toBe(
      "Claude Code runs `curl`, `git push`, `find -exec` and 4 more without a card.",
    );
    expect(view.notice?.line).toBe(
      '"ask": ["Bash(curl:*)", "Bash(git push:*)", "Bash(find:*)", "Bash(git clean:*)"]',
    );
    expect(view.foot).toBe(
      "Read from `~/.claude/settings.json` and `.claude/settings.json`. Its sessions here run in Default mode, so anything not on this list asks.",
    );
    expect(segments(view.notice?.title ?? "")[1]).toEqual({ text: "curl", code: true });
  });

  it("says when it runs everything, and nothing before it said", () => {
    const view = ownRulesView("OpenCode", {
      own_rules: { read_from: ["opencode.json"], everything: true, runs: [] },
      heard_at: at(9),
    });
    expect(view.everything).toBe(true);
    expect(view.notice?.title).toMatch(/runs everything without asking/);
    expect(ownRulesView("Hermes", { own_rules: null, heard_at: null })).toBe(NOT_SAID);
    expect(ownRulesView("Hermes", undefined)).toBe(NOT_SAID);
  });
});

describe("a harness's Permissions page (ADR 0299)", () => {
  const model = owned(
    buildModel([
      fixture("space.created", 1),
      fixture("run.started", 2),
      shell(3, "apr_01K4ZQPX00000000000000000A", "ls -la"),
      fixture("approval.resolved", 4, { approval_id: "apr_01K4ZQPX00000000000000000A" }),
      shell(5, "apr_01K4ZQPX00000000000000000B", "echo $(whoami)"),
      shell(6, "apr_01K4ZQPX00000000000000000C", "pnpm test"),
      fixture("approval.resolved", 7, {
        approval_id: "apr_01K4ZQPX00000000000000000C",
        resolved_by: "system",
        reason: "its asks are off until 2026-11-18T18:41:00.000Z",
      }),
      policy(8, {
        policy: {
          autonomy: 1,
          rules: [
            {
              match: "*",
              when: { starts_with: ["ls"] },
              decision: "allow",
              made_by: ARJUN,
              made_at: at(9),
            },
            {
              match: "*",
              when: { starts_with: ["cat"] },
              decision: "allow",
              made_by: ARJUN,
              made_at: at(9),
            },
            {
              match: "*",
              when: { starts_with: ["rm"] },
              decision: "deny",
              made_by: ARJUN,
              made_at: at(9, 5),
            },
          ],
        },
      }),
    ]),
  );
  const own = ownRulesView("Claude Code", { own_rules: CLAUDE_CODE, heard_at: at(9) });

  it("shows both gates, the rules written together as one row, and what can't be read", () => {
    const page = harnessPermissions({ model, directory }, KIT, ARJUN, own, NOW);
    expect(page.mayChange).toBe(true);
    expect(page.headline).toBe(
      "Claude Code runs 9 kinds of work without asking. Everything else comes to Chips first.",
    );
    expect(page.gates).toEqual({ own: "Default", chips: "2 rules" });
    // Its rules have never been switched, and it has some: on (ADR 0300).
    expect(page.chipsOn).toBe(true);
    expect(page.lead).toBe(
      "Claude Code decides what to ask. Chips answers the ones your rules cover and brings you the rest.",
    );
    expect(page.settingsRow).toMatchObject({ title: "Claude Code's settings", value: "Default" });
    expect(page.chipsRow).toEqual({ value: "On", sub: "On · 2 rules" });
    expect(page.chipsPage.pause.holding).toBe(false);
    expect(page.rules.map((rule) => [rule.title, rule.decision, rule.indexes])).toEqual([
      ["Run rm", "deny", [2]],
      ["Run ls and cat", "allow", [0, 1]],
    ]);
    expect(page.rulesFoot).toBe(
      "A rule answers the next ask it covers. Commands Chips can't read still come to you: 1 of the 3 so far.",
    );
    expect(harnessPermissions({ model, directory }, KIT, DANA, own, NOW).mayChange).toBe(false);
    expect(
      harnessPermissions({ model, directory, keepsHarnessRules: false }, KIT, ARJUN, own, NOW)
        .mayChange,
    ).toBe(false);
    expect(harnessPermissions({ model, directory }, KIT, ARJUN, NOT_SAID, NOW).headline).toBe(
      "Claude Code doesn't say yet what it runs on its own. Everything it asks comes to Chips first.",
    );
  });

  it("draws a yes Chips said while its asks were off as a gold dot", () => {
    expect(askHistory(model, directory, KIT, ARJUN, NOW)?.dots).toEqual(["yes", "open", "snoozed"]);
    expect(askHistory(model, directory, KIT, ARJUN, NOW)?.line).toMatch(/1 while it wasn't asking/);
    expect(harnessAskKey(model, directory, KIT).map((each) => each.words)).toEqual([
      "1 yes",
      "1 while not asking",
      "1 waiting",
    ]);
  });

  it("says so at the top and on its row while its asks are off", () => {
    const off = owned(
      buildModel([
        policy(1, { policy: { autonomy: 1, rules: [], hold: { until: at(10, 41), by: ARJUN } } }),
      ]),
    );
    const page = harnessPermissions({ model: off, directory }, KIT, ARJUN, own, NOW);
    expect(page.off?.every).toBe(false);
    expect(page.gates.chips).toBe("saying yes");
    expect(page.chipsRow.sub).toBe("Saying yes for you until 10:41 AM");
    expect(page.chipsPage.pause).toMatchObject({ holding: true, title: "Saying yes for you" });
    expect(page.headline).toBe(
      "Claude Code runs 9 kinds of work on its own, and Chips says yes to the rest for now.",
    );
    expect(page.sub).toMatch(/^The big ones still (come to you|go to )/);
    const all = owned(
      buildModel([
        policy(1, { policy: { autonomy: 1, rules: [], hold: { matters: true, by: ARJUN } } }),
      ]),
    );
    expect(harnessPermissions({ model: all, directory }, KIT, ARJUN, own, NOW).sub).toBe(
      "Nothing it asks waits for an answer while this holds.",
    );
    expect(permissionsRowWords(off, directory, KIT, ARJUN, NOW)).toEqual({
      value: "Chips says yes until 10:41 AM",
      off: false,
    });
    expect(permissionsRowWords(model, directory, KIT, ARJUN, NOW)).toEqual({
      value: "2 on",
      off: false,
    });
  });

  it("switches, removes and puts back a row's rules together", () => {
    const rules = rulesOf(model, KIT, undefined);
    expect(switchedRule(rules, [0, 1], false).map((rule) => rule["off"])).toEqual([
      true,
      true,
      undefined,
    ]);
    const without = withoutRule(rules, [0, 1]);
    expect(without).toHaveLength(1);
    expect(withRuleBack(without, [0, 1], rulesAt(rules, [0, 1]))).toEqual(rules);
    expect(withRuleBack(withoutRule(rules, 2), 2, rules[2] as never)).toEqual(rules);
  });
});

describe("You → Permissions and the rules for every harness (ADR 0299)", () => {
  const model = owned(
    buildModel([
      fixture("policy.workspace_updated", 1, {
        rules: [
          {
            match: "*",
            when: { starts_with: ["rm", "-rf"] },
            decision: "deny",
            made_by: ARJUN,
            made_at: at(8),
          },
        ],
      }),
      policy(2, { policy: { autonomy: 1, rules: [], hold: { by: ARJUN, at: at(9) } } }),
    ]),
  );

  it("reads and draws the rules for every harness through EVERY_HARNESS", () => {
    expect(rulesOf(model, EVERY_HARNESS, undefined)).toHaveLength(1);
    const rows = alwaysRules(model, directory, EVERY_HARNESS, ARJUN, NOW);
    expect(rows.map((row) => [row.title, row.line])).toEqual([
      ["Run rm -rf", "Denied always · Before each harness's own · by you, 18 November"],
    ]);
    expect(withRules(model, EVERY_HARNESS, undefined, []).workspaceRules.rules).toEqual([]);
  });

  it("lists every harness, with whether Chips's rules are on and never gold for a pause", () => {
    const own = ownRulesView("Claude Code", { own_rules: CLAUDE_CODE, heard_at: at(9) });
    const you = youPermissions({ model, directory }, ARJUN, { [LUX]: own }, NOW);
    expect(you.mayChange).toBe(true);
    expect(you.every).toBeUndefined();
    expect(you.harnesses).toEqual([
      {
        harnessId: KIT,
        name: "Claude Code",
        asking: false,
        line: "Chips says yes for it",
        gold: false,
        warn: false,
        chipsOn: true,
      },
      {
        harnessId: LUX,
        name: "OpenCode",
        asking: true,
        line: "Runs 9 kinds of work on its own",
        gold: false,
        warn: true,
        chipsOn: true,
      },
    ]);
  });

  it("says on You's row how many harnesses have Chips's rules on (ADR 0300)", () => {
    // Every harness has a rule for every harness to read, so each has Chips's rules on (ADR 0300).
    expect(permissionsSummary(model, directory, NOW)).toBe("Chips's rules on for 2");
    // A model folded before ADR 0299 has no workspace rules at all.
    const { workspaceRules: _none, ...older } = owned(buildModel([]));
    expect(permissionsSummary(older as WorkspaceModel, directory, NOW)).toBe("Harnesses decide");
  });
});

describe("a new rule (ADR 0299)", () => {
  const model = buildModel([
    fixture("space.created", 1),
    fixture("run.started", 2),
    shell(3, "apr_01K4ZQPX00000000000000000A", "ls -la"),
    shell(4, "apr_01K4ZQPX00000000000000000B", "git log --oneline && ls"),
    shell(5, "apr_01K4ZQPX00000000000000000C", "rm -rf build"),
    shell(6, "apr_01K4ZQPX00000000000000000D", "echo $(whoami)"),
    fixture("approval.request", 7, { approval_id: "apr_01K4ZQPX00000000000000000E" }),
  ]);

  it("offers commands, the kinds it asked about, and the starts its asks began with", () => {
    const own = ownRulesView("Claude Code", { own_rules: CLAUDE_CODE, heard_at: at(9) });
    const options = newRuleOptions(model, directory, KIT, own);
    expect(options.kinds.map((kind) => [kind.title, kind.own])).toEqual([
      ["Run commands", false],
      ["Send email", false],
      ["Read and search files", true],
      ["Edit and write files", true],
      ["Fetch pages and search the web", true],
    ]);
    expect(options.starts).toEqual(["ls", "git log"]);
    expect(options.never).toEqual(["rm", "git push", "curl", "sudo"]);
    expect(options.spaces.map((space) => space.id)).toEqual([SPACE]);
    expect(newRuleOptions(model, directory, EVERY_HARNESS).spaces).toEqual([]);
  });

  it("lights the asks a draft would have answered, refused or brought to you", () => {
    const allow = { what: COMMANDS_KIND, starts: ["ls", "git log"], answer: "allow" as const };
    const preview = rulePreview(model, directory, KIT, allow);
    expect(preview.dots).toEqual(["lit", "lit", "never", "unread", "still"]);
    expect(preview.count).toBe(2);
    expect(preview.words).toBe("of its 5 asks this rule would have answered for you");
    const never = rulePreview(model, directory, KIT, { ...allow, starts: ["rm"], answer: "deny" });
    expect(never.dots).toEqual(["still", "still", "lit", "unread", "still"]);
    expect(never.words).toBe("of its 5 asks this rule would have refused");
    const email = rulePreview(model, directory, KIT, {
      what: "email.send",
      starts: [],
      answer: "ask",
    });
    expect(email.count).toBe(1);
  });

  it("saves one rule per start, never an Allow for a listed one", () => {
    const draft = {
      what: COMMANDS_KIND,
      starts: ["ls", "git log", "rm"],
      answer: "allow" as const,
    };
    expect(draftRules(draft)).toEqual([
      { match: "*", when: { starts_with: ["ls"] }, decision: "allow" },
      { match: "*", when: { starts_with: ["git", "log"] }, decision: "allow" },
    ]);
    expect(draftRules({ ...draft, answer: "deny" })).toHaveLength(3);
    expect(draftRules({ what: "email.send", starts: [], answer: "ask" })).toEqual([
      { match: "email.send", decision: "ask" },
    ]);
    expect(draftProblem({ ...draft, starts: ["rm"] })).toBe("Pick how the commands start.");
    expect(draftProblem(draft)).toBeUndefined();
    expect(withDraft([{ match: "file.read", decision: "allow" }], draft)).toHaveLength(3);
  });
});
