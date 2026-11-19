import { describe, expect, it } from "vitest";
import { commandKind, neverCovered } from "./commands.js";
import { askLineFor, ownRules } from "./own-rules.js";
import { ruleShape, writtenRuleRefusal } from "./written-rules.js";

describe("what a harness runs on its own (ADR 0299)", () => {
  it("names the never-list commands a yes for a program lets through", () => {
    expect(neverCovered(["git"])).toEqual(["git push", "git reset", "git clean"]);
    expect(neverCovered(["find"])).toEqual([
      "find -exec",
      "find -execdir",
      "find -ok",
      "find -delete",
    ]);
    expect(neverCovered(["curl"])).toEqual(["curl"]);
    expect(neverCovered(["/usr/bin/curl"])).toEqual(["curl"]);
    expect(neverCovered(["rm", "-rf"])).toEqual(["rm"]);
    expect(neverCovered(["git", "log"])).toEqual([]);
    expect(neverCovered(["git", "push"])).toEqual(["git push"]);
    expect(neverCovered(["ls"])).toEqual([]);
    expect(neverCovered(["*", "--version"])).toEqual([]);
    expect(neverCovered([]).length).toBeGreaterThan(50);
  });

  it("writes the line that makes commands ask, from the harness's own template", () => {
    const template = {
      ask_line: {
        entry: '"Bash({words}:*)"',
        line: '"ask": [{entries}]',
        where: "permissions in ~/.claude/settings.json",
      },
    };
    expect(askLineFor(template, [["git", "push"], ["curl"]])).toBe(
      '"ask": ["Bash(git push:*)", "Bash(curl:*)"]',
    );
    expect(askLineFor({}, [["curl"]])).toBeUndefined();
    expect(askLineFor(template, [])).toBeUndefined();
  });

  it("takes a copy with only where it was read and what it runs", () => {
    expect(ownRules.safeParse({ read_from: ["~/.claude/settings.json"], runs: [] }).success).toBe(
      true,
    );
    expect(ownRules.safeParse({ read_from: [], runs: [] }).success).toBe(false);
    expect(
      ownRules.safeParse({
        read_from: ["x"],
        runs: [{ kind: "command", name: "git", words: ["git"], raw: "Bash(git:*)" }],
      }).success,
    ).toBe(true);
  });
});

describe("a rule a person writes (ADR 0299)", () => {
  it("knows a command kind by a word of its own", () => {
    expect(commandKind("acp.bash")).toBe(true);
    expect(commandKind("shell.exec")).toBe(true);
    expect(commandKind("acp.fetch")).toBe(false);
  });

  it("refuses an Allow that lets everything through, a command with no start, or a never-list start", () => {
    expect(writtenRuleRefusal({ match: "*", decision: "allow" })).toMatch(/Stop asking/);
    expect(writtenRuleRefusal({ match: "acp.*", decision: "allow" })).toBeDefined();
    expect(writtenRuleRefusal({ match: "acp.bash", decision: "allow" })).toMatch(/how they start/);
    expect(
      writtenRuleRefusal({
        match: "acp.bash",
        when: { starts_with: ["git", "push"] },
        decision: "allow",
      }),
    ).toMatch(/git push/);
    expect(
      writtenRuleRefusal({ match: "acp.bash", when: { starts_with: ["rm"] }, decision: "allow" }),
    ).toMatch(/rm/);
  });

  it("lets Allows with a safe start, other kinds, and every Ask me or Never stand", () => {
    expect(
      writtenRuleRefusal({
        match: "acp.bash",
        when: { starts_with: ["git", "log"] },
        decision: "allow",
      }),
    ).toBeUndefined();
    expect(writtenRuleRefusal({ match: "acp.fetch", decision: "allow" })).toBeUndefined();
    // Every kind's commands that start so: a start speaks only for a command.
    expect(
      writtenRuleRefusal({ match: "*", when: { starts_with: ["ls"] }, decision: "allow" }),
    ).toBeUndefined();
    expect(
      writtenRuleRefusal({ match: "*", when: { starts_with: ["git", "push"] }, decision: "allow" }),
    ).toMatch(/git push/);
    expect(writtenRuleRefusal({ match: "*", decision: "deny" })).toBeUndefined();
    expect(
      writtenRuleRefusal({ match: "acp.bash", when: { starts_with: ["rm"] }, decision: "ask" }),
    ).toBeUndefined();
  });

  it("is the same rule whether or not it is off, and whoever made it", () => {
    const rule = { match: "acp.bash", when: { starts_with: ["ls"] }, decision: "allow" as const };
    expect(
      ruleShape({ ...rule, off: true, made_by: "usr_1", made_at: "2026-11-18T09:41:00.000Z" }),
    ).toBe(ruleShape(rule));
    expect(ruleShape({ ...rule, decision: "deny" })).not.toBe(ruleShape(rule));
  });
});
