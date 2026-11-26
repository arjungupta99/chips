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
  auditWords,
  COMMANDS_KIND,
  draftProblem,
  draftRules,
  harnessPermissions,
  holdOf,
  MODE_LENGTHS,
  modeConfirmWords,
  modeLengthWords,
  modePicker,
  NOT_SAID,
  newRuleOptions,
  ownRulesView,
  permissionsRowWords,
  permissionsSummary,
  roomHolds,
  roomModes,
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
      "git checkout",
      "git restore",
      "find -execdir",
      "find -ok",
      "find -delete",
    ]);
    expect(view.notice?.title).toBe(
      "Claude Code runs `curl`, `git push`, `find -exec` and 6 more without a card.",
    );
    expect(view.notice?.line).toBe(
      '"ask": ["Bash(curl:*)", "Bash(git push:*)", "Bash(find:*)", "Bash(git clean:*)", "Bash(git checkout:*)", "Bash(git restore:*)"]',
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
    // In a mode that never asks, nothing off the list asks either.
    const bypass = ownRulesView("Claude Code", {
      own_rules: { read_from: [], mode: "Bypass permissions", everything: true, runs: [] },
      heard_at: at(9),
    });
    expect(bypass.foot).toBe("Its sessions here run in Bypass permissions mode.");
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
        // The fixture's own hold ends at 10:41 UTC, which is still ahead of NOW wherever the
        // reader's clock is behind UTC's afternoon (CI runs in UTC), so it is cleared here.
        hold: null,
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

describe("the mode a person picks for a harness (ADR 0300, 19 November addendum)", () => {
  const AGENT = "hrn_01K4ZQPX0000000000000000A1";
  const agents: Directory = {
    ...directory,
    [AGENT]: { id: AGENT, kind: "agent", displayName: "Jiro", harnessId: KIT },
  };
  const MODES: NonNullable<OwnRules["modes"]> = {
    base: "default",
    running: "default",
    offers: [
      {
        id: "default",
        name: "Default",
        words: "Asks before edits and commands its settings don't allow.",
      },
      {
        id: "acceptEdits",
        name: "Accept edits",
        words: "Edits files without asking. Commands still ask.",
      },
      {
        id: "auto",
        name: "Auto",
        words: "Claude Code judges each step and asks only when one looks risky.",
      },
      {
        id: "bypassPermissions",
        name: "Bypass permissions",
        words: "Never asks.",
        everything: true,
      },
    ],
  };
  const OFFERS: OwnRules = { ...CLAUDE_CODE, modes: MODES };
  const heard = (rules: OwnRules, when = at(9, 40)) =>
    ownRulesView("Claude Code", { own_rules: rules, heard_at: when });
  const BYPASS = {
    id: "bypassPermissions",
    name: "Bypass permissions",
    back_to: "Default",
    everything: true,
    until: at(10, 41),
    by: ARJUN,
    at: at(9, 0),
  };
  const picked = (mode: Record<string, unknown> | null, seq = 3) =>
    policy(seq, { changed_by: ARJUN, policy: { autonomy: 1, rules: [], mode } });
  const base = [
    fixture("space.created", 1),
    fixture("membership.added", 2, { participant_id: AGENT, participant_kind: "agent" }),
  ];

  it("offers the modes the harness says, in its words, the one it starts in ticked", () => {
    const model = owned(buildModel(base));
    const picker = modePicker({ model, directory }, KIT, ARJUN, heard(OFFERS), NOW);
    expect(picker?.choices.map((choice) => choice.name)).toEqual([
      "Default",
      "Accept edits",
      "Auto",
      "Bypass permissions",
    ]);
    expect(picker?.current.id).toBe("default");
    expect(picker?.choices[3]?.everything).toBe(true);
    expect(picker?.back).toBeUndefined();
    expect(picker?.may).toBe(true);
    expect(picker?.foot).toBe(
      "Chips starts each of its Claude Code sessions in this mode, and switches it back when the time is up. Your own Claude Code keeps its own mode.",
    );
    // A member sees it, without the choices; an older server, or a harness that offers none, shows none.
    expect(modePicker({ model, directory }, KIT, DANA, heard(OFFERS), NOW)?.may).toBe(false);
    expect(
      modePicker({ model, directory, keepsHarnessMode: false }, KIT, ARJUN, heard(OFFERS), NOW),
    ).toBeUndefined();
    expect(modePicker({ model, directory }, KIT, ARJUN, heard(CLAUDE_CODE), NOW)).toBeUndefined();
    expect(MODE_LENGTHS.map(modeLengthWords)).toEqual([
      "1 hour",
      "8 hours",
      "Until tomorrow",
      "Keep it",
    ]);
    expect(modeConfirmWords("Auto")).toBe("Use Auto");
  });

  it("ticks a pick while it holds, says when it goes back, and the one it starts in after", () => {
    const model = owned(
      buildModel([
        ...base,
        picked({ id: "auto", name: "Auto", back_to: "Default", until: at(10, 41) }),
      ]),
    );
    const picker = modePicker(
      { model, directory },
      KIT,
      ARJUN,
      heard({ ...OFFERS, modes: { ...MODES, running: "auto" } }),
      NOW,
    );
    expect(picker?.current.id).toBe("auto");
    expect(picker?.back).toBe("Back to Default at 10:41 AM");
    expect(picker?.differs).toBeUndefined();
    const after = modePicker(
      { model, directory },
      KIT,
      ARJUN,
      heard(OFFERS, at(10, 42)),
      Date.parse(at(11)),
    );
    expect(after?.current.id).toBe("default");
    expect(after?.back).toBeUndefined();
    const kept = owned(buildModel([...base, picked({ id: "auto", name: "Auto" })]));
    expect(modePicker({ model: kept, directory }, KIT, ARJUN, heard(OFFERS), NOW)?.back).toBe(
      "Until you change it",
    );
    // And nothing once put back.
    const back = owned(buildModel([...base, picked({ id: "auto" }), picked(null, 4)]));
    expect(modePicker({ model: back, directory }, KIT, ARJUN, heard(OFFERS), NOW)?.current.id).toBe(
      "default",
    );
  });

  it("says when the harness runs in another mode, once it said so after the pick", () => {
    const model = owned(buildModel([...base, picked({ id: "auto", name: "Auto" })]));
    const fallback = { ...OFFERS, modes: { ...MODES, running: "acceptEdits" } };
    expect(modePicker({ model, directory }, KIT, ARJUN, heard(fallback), NOW)?.differs).toBe(
      "Claude Code is running in Accept edits: it couldn't use Auto.",
    );
    // Its word from before the pick is old news.
    expect(
      modePicker({ model, directory }, KIT, ARJUN, heard(fallback, "2026-09-01T00:00:00.000Z"), NOW)
        ?.differs,
    ).toBeUndefined();
  });

  it("wears yellow while a mode that never asks holds: the banner, the rows and a band in each space", () => {
    const model = owned(buildModel([...base, picked(BYPASS)]));
    const page = harnessPermissions({ model, directory }, KIT, ARJUN, heard(OFFERS), NOW);
    expect(page.open).toEqual({
      title: "Nothing asks",
      sub: "Bypass permissions · back to Default at 10:41 AM",
      back: "Back to Default",
    });
    expect(page.settingsRow).toMatchObject({
      value: "Bypass permissions",
      gold: true,
      warn: false,
    });
    expect(page.gates.own).toBe("runs all");
    expect(page.chipsPage.note).toBe(
      "Claude Code is in Bypass permissions, so it asks nothing and these rules have nothing to answer until it's back in Default.",
    );
    // A member sees the banner, without the button.
    expect(
      harnessPermissions({ model, directory }, KIT, DANA, heard(OFFERS), NOW).open?.back,
    ).toBeUndefined();
    expect(roomModes(model, agents, SPACE, NOW)).toEqual([
      { harnessId: KIT, words: "Claude Code asks nothing until 10:41 AM", back: "Back to Default" },
    ]);
    expect(permissionsRowWords(model, directory, KIT, ARJUN, NOW)).toEqual({
      value: "Bypass permissions",
      off: false,
      gold: true,
    });
    const row = youPermissions({ model, directory }, ARJUN, {}, NOW).harnesses.find(
      (each) => each.harnessId === KIT,
    );
    expect(row).toMatchObject({ line: "Bypass permissions until 10:41 AM", gold: true });

    // Its time up, the yellow goes.
    const later = Date.parse(at(11));
    expect(roomModes(model, agents, SPACE, later)).toEqual([]);
    expect(
      harnessPermissions({ model, directory }, KIT, ARJUN, heard(OFFERS, at(10, 42)), later).open,
    ).toBeUndefined();
    // A mode that asks wears none.
    const auto = owned(
      buildModel([...base, picked({ id: "auto", name: "Auto", until: at(10, 41) })]),
    );
    expect(roomModes(auto, agents, SPACE, NOW)).toEqual([]);
    expect(
      harnessPermissions({ model: auto, directory }, KIT, ARJUN, heard(OFFERS), NOW).settingsRow,
    ).toMatchObject({
      value: "Auto",
      gold: false,
    });
  });

  it("writes each pick in the record, with the harness and the mode's name", () => {
    const model = buildModel([...base, picked(BYPASS), picked(null, 4)]);
    // Oldest first, as they happened.
    const lines = model.audit
      .filter((entry) => entry.mode !== undefined)
      .sort((a, b) => a.seq - b.seq);
    expect(lines.map((entry) => entry.what)).toEqual([
      "put it in Bypass permissions",
      "put it back in Default",
    ]);
    expect(lines[0]?.mode).toEqual({
      harnessId: KIT,
      name: "Bypass permissions",
      until: at(10, 41),
    });
    expect(lines[1]?.mode).toEqual({ harnessId: KIT, back: true, name: "Default" });
    expect(lines[0]?.who).toBe(ARJUN);
    const said = lines.map((entry) => auditWords(entry, directory));
    expect(said[0]).toMatch(/^put Claude Code in Bypass permissions until /);
    expect(said[1]).toBe("put Claude Code back in Default");
    const kept = buildModel([...base, picked({ id: "auto", name: "Auto" })]).audit[0];
    expect(kept === undefined ? "" : auditWords(kept, directory)).toBe(
      "put Claude Code in Auto until you change it",
    );
  });

  it("says its own settings decide what asks, not that it runs 0 kinds of work, when it lists nothing it runs (Hermes)", () => {
    const hermes: OwnRules = {
      read_from: ["~/.hermes/profiles/grady/config.yaml"],
      note: "Your Main agent runs on your own Hermes's settings, so a mode picked here doesn't change it.",
      runs: [],
      modes: {
        base: "smart",
        running: "smart",
        offers: [
          { id: "manual", name: "Manual" },
          { id: "smart", name: "Smart" },
          { id: "off", name: "Off", everything: true },
        ],
      },
    };
    const model = owned(buildModel(base));
    const page = harnessPermissions({ model, directory }, KIT, ARJUN, heard(hermes), NOW);
    expect(page.headline).toBe(
      "Claude Code's own settings decide what it asks. Everything it asks comes to Chips first.",
    );
    expect(page.gates.own).toBe("Smart");
    expect(page.settingsRow).toMatchObject({ value: "Smart" });
    expect(JSON.stringify(page)).not.toMatch(/0 kinds|0 run/);
  });
});
