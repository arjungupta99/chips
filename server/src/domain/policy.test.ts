/**
 * The policy engine, tested exhaustively with a table (ADR 0008): every level against every
 * combination of the flags the presets look at, then the rules, the cap, and the invariants
 * as properties.
 */

import type { AutonomyLevel, PolicyRule } from "@chipschat/protocol";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  approversFor,
  describeRule,
  evaluate,
  type HarnessPolicy,
  kindMatches,
  matters,
  type PolicyAction,
  resolveApprovers,
  type WorkspacePolicy,
} from "./policy.js";

const LEVELS: readonly AutonomyLevel[] = [0, 1, 2, 3];
const noRules = (autonomy: AutonomyLevel): HarnessPolicy => ({ autonomy, rules: [] });
const open: WorkspacePolicy = { maxAutonomy: 3, rules: [] };

/**
 * Every level against every combination of external, irreversible and money, for a write
 * (`doc.write`). Read as: level, then which flags are on, then what the engine says.
 */
const TABLE: readonly [AutonomyLevel, boolean, boolean, number, "allow" | "ask"][] = [
  [0, false, false, 0, "ask"],
  [0, true, false, 0, "ask"],
  [0, false, true, 0, "ask"],
  [0, false, false, 50, "ask"],
  [0, true, true, 0, "ask"],
  [0, true, false, 50, "ask"],
  [0, false, true, 50, "ask"],
  [0, true, true, 50, "ask"],
  [1, false, false, 0, "ask"],
  [1, true, false, 0, "ask"],
  [1, false, true, 0, "ask"],
  [1, false, false, 50, "ask"],
  [1, true, true, 0, "ask"],
  [1, true, false, 50, "ask"],
  [1, false, true, 50, "ask"],
  [1, true, true, 50, "ask"],
  [2, false, false, 0, "allow"],
  [2, true, false, 0, "ask"],
  [2, false, true, 0, "ask"],
  [2, false, false, 50, "ask"],
  [2, true, true, 0, "ask"],
  [2, true, false, 50, "ask"],
  [2, false, true, 50, "ask"],
  [2, true, true, 50, "ask"],
  [3, false, false, 0, "allow"],
  [3, true, false, 0, "allow"],
  [3, false, true, 0, "allow"],
  [3, false, false, 50, "allow"],
  [3, true, true, 0, "allow"],
  [3, true, false, 50, "allow"],
  [3, false, true, 50, "allow"],
  [3, true, true, 50, "allow"],
];

describe("the four levels, against every flag", () => {
  it.each(TABLE)(
    "L%i with external=%s irreversible=%s money=%i → %s",
    (level, external, irreversible, money, expected) => {
      const action: PolicyAction = { kind: "doc.write", external, irreversible, money_usd: money };
      const decision = evaluate(action, noRules(level), open);
      expect(decision.decision).toBe(expected);
      expect(decision.level).toBe(level);
      expect(decision.reason).toContain(`L${level}`);
      if (expected === "ask") expect(decision.approvers).toEqual(["owner"]);
    },
  );

  it("lets a read through at L1, but not an external one", () => {
    expect(evaluate({ kind: "drive.read" }, noRules(1), open).decision).toBe("allow");
    expect(evaluate({ kind: "crm.search" }, noRules(1), open).decision).toBe("allow");
    expect(evaluate({ kind: "drive.read", external: true }, noRules(1), open).decision).toBe("ask");
    expect(evaluate({ kind: "drive.read" }, noRules(0), open).decision).toBe("ask");
  });

  it("stops at L2 for a hot risk class even with no flag set", () => {
    const action: PolicyAction = { kind: "vault.open", risk: ["credential"] };
    expect(evaluate(action, noRules(2), open).decision).toBe("ask");
    expect(evaluate({ kind: "vault.open", risk: ["legal"] }, noRules(2), open).decision).toBe(
      "allow",
    );
    expect(matters({ kind: "x.y", risk: ["destructive"] })).toBe(true);
    expect(matters({ kind: "x.y", risk: ["privacy"] })).toBe(false);
  });
});

describe("the workspace cap", () => {
  it("always wins: a harness at L3 in a room capped at L1 behaves as L1", () => {
    const capped: WorkspacePolicy = { maxAutonomy: 1, rules: [] };
    const decision = evaluate({ kind: "doc.write" }, noRules(3), capped);
    expect(decision).toMatchObject({ decision: "ask", level: 1 });
  });

  it("does not raise a harness above its own level", () => {
    expect(evaluate({ kind: "doc.write" }, noRules(1), open).level).toBe(1);
  });
});

describe("rules", () => {
  const askFinance: PolicyRule = {
    match: "payment.*",
    when: { money_usd_over: 500 },
    decision: "ask",
    approvers: ["role:finance"],
  };
  const denyDelete: PolicyRule = { match: "file.delete", decision: "deny", reason: "Never." };
  const allowInternalMail: PolicyRule = {
    match: "email.send",
    when: { external: false },
    decision: "allow",
  };

  it("asks the people a rule names, over the amount it names", () => {
    const harness: HarnessPolicy = { autonomy: 3, rules: [askFinance] };
    const big = evaluate({ kind: "payment.transfer", money_usd: 900 }, harness, open);
    expect(big).toMatchObject({ decision: "ask", approvers: ["role:finance"], rule: askFinance });
    expect(big.reason).toBe("payment.* when over $500 → ask, by the harness's policy");
    const small = evaluate({ kind: "payment.transfer", money_usd: 20 }, harness, open);
    expect(small.decision).toBe("allow");
  });

  it("denies with the rule's own reason", () => {
    const harness: HarnessPolicy = { autonomy: 3, rules: [denyDelete] };
    expect(evaluate({ kind: "file.delete" }, harness, open)).toMatchObject({
      decision: "deny",
      reason: "Never.",
    });
  });

  it("consults the workspace's rules before the harness's", () => {
    const harness: HarnessPolicy = { autonomy: 3, rules: [allowInternalMail] };
    const workspace: WorkspacePolicy = {
      maxAutonomy: 3,
      rules: [{ match: "email.*", decision: "ask" }],
    };
    expect(evaluate({ kind: "email.send", external: false }, harness, workspace)).toMatchObject({
      decision: "ask",
      reason: "email.* → ask, by the workspace",
    });
  });

  it("lets a harness's allow speak only where the workspace lets policy decide", () => {
    const harness: HarnessPolicy = { autonomy: 3, rules: [allowInternalMail] };
    const mail: PolicyAction = { kind: "email.send", external: false };
    expect(evaluate(mail, harness, { maxAutonomy: 2, rules: [] }).decision).toBe("allow");
    expect(evaluate(mail, harness, { maxAutonomy: 1, rules: [] }).decision).toBe("ask");
    expect(evaluate(mail, harness, { maxAutonomy: 0, rules: [] }).decision).toBe("ask");
    // A workspace's allow is the workspace's to give.
    const room: WorkspacePolicy = { maxAutonomy: 0, rules: [allowInternalMail] };
    expect(evaluate(mail, noRules(0), room).decision).toBe("allow");
  });

  it("lets a harness's allow speak at L1 under a cap that would not stop it (finding 24)", () => {
    // Where "Always" and "This session" land: a person's answer, kept as the harness's rule.
    const always: PolicyRule = { match: "shell.exec", when: {}, decision: "allow" };
    const command: PolicyAction = { kind: "shell.exec" };
    const at = (autonomy: AutonomyLevel, maxAutonomy: AutonomyLevel) =>
      evaluate(command, { autonomy, rules: [always] }, { maxAutonomy, rules: [] }).decision;
    expect(at(1, 2)).toBe("allow");
    expect(at(1, 3)).toBe("allow");
    // A room capped below L2 still cannot be talked past, and L0 still asks for everything.
    expect(at(1, 1)).toBe("ask");
    expect(at(3, 1)).toBe("ask");
    expect(at(0, 3)).toBe("ask");
  });

  it("skips a rule a person turned off, until they turn it back on (ADR 0195)", () => {
    const always: PolicyRule = { match: "shell.exec", when: {}, decision: "allow" };
    const command: PolicyAction = { kind: "shell.exec" };
    const policy = (rule: PolicyRule): HarnessPolicy => ({ autonomy: 1, rules: [rule] });
    expect(evaluate(command, policy(always), open).decision).toBe("allow");
    expect(evaluate(command, policy({ ...always, off: true }), open).decision).toBe("ask");
    expect(evaluate(command, policy({ ...always, off: false }), open).decision).toBe("allow");
    // A workspace's rule turned off is skipped the same way.
    const room: WorkspacePolicy = { maxAutonomy: 2, rules: [{ ...always, off: true }] };
    expect(evaluate(command, noRules(1), room).decision).toBe("ask");
  });

  it("never lets a person's answer allow what matters (ADR 0195)", () => {
    // An Always from a small ask of a kind: the same kind carrying money still asks.
    const answered: PolicyRule = {
      match: "payment.quote",
      when: {},
      decision: "allow",
      made_by: "usr_01K4ZQPX000000000000000003",
      made_at: "2026-10-12T09:00:00.000Z",
    };
    const policy: HarnessPolicy = { autonomy: 1, rules: [answered] };
    expect(evaluate({ kind: "payment.quote" }, policy, open).decision).toBe("allow");
    expect(evaluate({ kind: "payment.quote", money_usd: 5000 }, policy, open).decision).toBe("ask");
    expect(evaluate({ kind: "payment.quote", risk: ["credential"] }, policy, open).decision).toBe(
      "ask",
    );
    // A no it made still stands for what matters; and a rule nobody's answer made is as before.
    const refused: PolicyRule = { ...answered, decision: "deny" };
    expect(
      evaluate({ kind: "payment.quote", money_usd: 5 }, { autonomy: 1, rules: [refused] }, open)
        .decision,
    ).toBe("deny");
    const written: PolicyRule = { match: "payment.quote", decision: "allow" };
    expect(
      evaluate({ kind: "payment.quote", money_usd: 5 }, { autonomy: 1, rules: [written] }, open)
        .decision,
    ).toBe("allow");
  });

  it("matches on flags, risk and the first rule in order", () => {
    const rules: PolicyRule[] = [
      { match: "*", when: { risk: ["financial"] }, decision: "deny" },
      { match: "*", when: { irreversible: true }, decision: "ask" },
      { match: "*", decision: "allow" },
    ];
    const harness: HarnessPolicy = { autonomy: 2, rules };
    expect(evaluate({ kind: "x.y", risk: ["financial"] }, harness, open).decision).toBe("deny");
    expect(evaluate({ kind: "x.y", irreversible: true }, harness, open).decision).toBe("ask");
    expect(evaluate({ kind: "x.y" }, harness, open).decision).toBe("allow");
  });

  it("lets a command through only when every part starts as an allow says (ADR 0239)", () => {
    const starts = (decision: PolicyRule["decision"], ...words: string[]): PolicyRule => ({
      match: "shell.exec",
      when: { starts_with: words },
      decision,
      made_at: "2026-10-27T09:00:00.000Z",
    });
    const harness: HarnessPolicy = {
      autonomy: 1,
      rules: [starts("allow", "node", "--check"), starts("allow", "echo", "ok")],
    };
    const run = (command: string | readonly string[], policy = harness, room = open) =>
      evaluate({ kind: "shell.exec", command }, policy, room);

    const both = run("node --check game.js && echo ok");
    expect(both.decision).toBe("allow");
    expect(both.reason).toBe(
      "every part of the command is allowed always (node --check …, echo ok …), by the harness's policy",
    );
    expect(run(["node", "--check", "a.js"]).decision).toBe("allow");
    // A part nothing covers, one start too short, a command it can't read: the level decides.
    expect(run("node --check a.js && cat a.js").decision).toBe("ask");
    expect(run("node a.js").decision).toBe("ask");
    expect(run("node --check a.js > out").decision).toBe("ask");
    // A start never covers a listed command, even one a rule names.
    const named: HarnessPolicy = { autonomy: 1, rules: [starts("allow", "rm")] };
    expect(run("rm x", named).decision).toBe("ask");
    // A part a rule stops stops it; and nothing gets past a cap below L2 or what matters.
    const stopped: HarnessPolicy = {
      autonomy: 1,
      rules: [...harness.rules, starts("deny", "echo")],
    };
    expect(run("node --check a.js && echo ok", stopped).decision).toBe("deny");
    expect(run("node --check a.js", harness, { maxAutonomy: 1, rules: [] }).decision).toBe("ask");
    expect(
      evaluate(
        { kind: "shell.exec", command: "node --check a.js", irreversible: true },
        harness,
        open,
      ).decision,
    ).toBe("ask");
    // Without a command, a rule for starts says nothing; a rule without starts answers the kind.
    expect(evaluate({ kind: "shell.exec" }, harness, open).decision).toBe("ask");
    const whole: HarnessPolicy = {
      autonomy: 1,
      rules: [{ match: "shell.exec", decision: "allow" }],
    };
    expect(run("cat x && rm y", whole).decision).toBe("allow");
  });

  it("lets a yes that holds on reach every ask but one that matters, after a person's no (ADR 0281)", () => {
    const held: PolicyRule = { match: "*", decision: "allow", made_at: "2026-11-06T07:08:00.000Z" };
    const run = (action: PolicyAction, rules: PolicyRule[] = []) =>
      evaluate(action, { autonomy: 1, rules: [...rules, held] }, open).decision;
    // Read or not, rm and git push too, and asks that are not commands.
    expect(run({ kind: "shell.exec", command: "cd /x; cat a | wc -l" })).toBe("allow");
    expect(run({ kind: "shell.exec", command: "for r in a b; do head -3 $r; done" })).toBe("allow");
    expect(run({ kind: "shell.exec", command: "rm -rf build && git push" })).toBe("allow");
    expect(run({ kind: "file.write" })).toBe("allow");
    // What matters still waits for a person.
    expect(run({ kind: "shell.exec", command: "ls", irreversible: true })).toBe("ask");
    expect(run({ kind: "email.send", external: true })).toBe("ask");
    expect(run({ kind: "payment.transfer", money_usd: 5 })).toBe("ask");
    // A no a person set, for the kind or for how a part starts, comes first.
    expect(run({ kind: "web.fetch" }, [{ match: "web.fetch", decision: "deny" }])).toBe("deny");
    const noRm: PolicyRule = { match: "shell.*", when: { starts_with: ["rm"] }, decision: "deny" };
    expect(run({ kind: "shell.exec", command: "ls && rm x" }, [noRm])).toBe("deny");
    // And nothing gets past a cap below L2.
    expect(
      evaluate(
        { kind: "file.write" },
        { autonomy: 1, rules: [held] },
        { maxAutonomy: 1, rules: [] },
      ).decision,
    ).toBe("ask");
  });

  it("reads the workspace's starts first, whichever way they decide (ADR 0239)", () => {
    const room: WorkspacePolicy = {
      maxAutonomy: 2,
      rules: [{ match: "shell.*", when: { starts_with: ["git", "status"] }, decision: "allow" }],
    };
    const command: PolicyAction = { kind: "shell.exec", command: "git status --short" };
    expect(evaluate(command, noRules(0), room)).toMatchObject({
      decision: "allow",
      reason: "every part of the command is allowed always (git status …), by the workspace",
    });
  });

  it("reads like a sentence", () => {
    expect(describeRule(askFinance)).toBe("payment.* when over $500 → ask");
    expect(describeRule(allowInternalMail)).toBe("email.send when internal → allow");
    expect(
      describeRule({
        match: "x.*",
        when: { irreversible: true, risk: ["legal"] },
        decision: "ask",
      }),
    ).toBe("x.* when irreversible, risk legal → ask");
    expect(
      describeRule({
        match: "shell.exec",
        when: { starts_with: ["node", "--check"] },
        decision: "allow",
      }),
    ).toBe("shell.exec when starting node --check → allow");
  });
});

describe("kind globs", () => {
  it("stands `*` for anything", () => {
    expect(kindMatches("payment.*", "payment.transfer")).toBe(true);
    expect(kindMatches("payment.*", "payment.card.charge")).toBe(true);
    expect(kindMatches("payment.*", "payments.transfer")).toBe(false);
    expect(kindMatches("*", "anything.at.all")).toBe(true);
    expect(kindMatches("*.delete", "file.delete")).toBe(true);
    expect(kindMatches("email.send", "email.send")).toBe(true);
    expect(kindMatches("email.send", "email.sends")).toBe(false);
  });

  it("treats a dot as a dot, not as a wildcard", () => {
    expect(kindMatches("email.send", "emailXsend")).toBe(false);
  });
});

describe("invariants, as properties", () => {
  const action = fc.record({
    kind: fc.constantFrom("doc.write", "drive.read", "email.send", "payment.transfer"),
    external: fc.boolean(),
    irreversible: fc.boolean(),
    money_usd: fc.nat({ max: 1000 }),
  });
  const strictness = { allow: 0, ask: 1, deny: 2 } as const;

  it("never gets looser as the level goes down", () => {
    fc.assert(
      fc.property(action, fc.constantFrom(...LEVELS), fc.constantFrom(...LEVELS), (a, x, y) => {
        const [lower, higher] = x <= y ? [x, y] : [y, x];
        const atLower = evaluate(a, noRules(lower), open).decision;
        const atHigher = evaluate(a, noRules(higher), open).decision;
        expect(strictness[atLower]).toBeGreaterThanOrEqual(strictness[atHigher]);
      }),
    );
  });

  it("never lets a harness's allow past a cap below L2, or past L0", () => {
    const anything: PolicyRule = { match: "*", decision: "allow" };
    fc.assert(
      fc.property(action, fc.constantFrom(...LEVELS), fc.constantFrom(...LEVELS), (a, x, cap) => {
        if (cap >= 2 && x >= 1) return;
        const harness: HarnessPolicy = { autonomy: x, rules: [anything] };
        const withRule = evaluate(a, harness, { maxAutonomy: cap, rules: [] }).decision;
        const without = evaluate(a, noRules(x), { maxAutonomy: cap, rules: [] }).decision;
        expect(withRule).toBe(without);
      }),
    );
  });

  it("caps the way it levels: a harness above the cap is the cap", () => {
    fc.assert(
      fc.property(
        action,
        fc.constantFrom(...LEVELS),
        fc.constantFrom(...LEVELS),
        (a, harness, cap) => {
          const capped = evaluate(a, noRules(harness), { maxAutonomy: cap, rules: [] });
          const effective = Math.min(harness, cap) as AutonomyLevel;
          expect(capped).toEqual(evaluate(a, noRules(effective), open));
        },
      ),
    );
  });

  it("always names who may answer when it asks, and never when it does not", () => {
    fc.assert(
      fc.property(action, fc.constantFrom(...LEVELS), (a, level) => {
        const decision = evaluate(a, noRules(level), open);
        expect(decision.approvers === undefined).toBe(decision.decision !== "ask");
      }),
    );
  });
});

describe("a cap that cannot be read", () => {
  it("fails closed: an unreadable workspace cap is L0, not no cap at all (gate 1 probe P4)", () => {
    const external = { kind: "email.send", external: true, irreversible: true };
    const decision = evaluate(
      external,
      { autonomy: 3, rules: [] },
      { maxAutonomy: undefined as unknown as 0, rules: [] },
    );
    expect(decision.level).toBe(0);
    expect(decision.decision).toBe("ask");
  });
});

describe("who may answer, from a list of refs (M3.3)", () => {
  const facts = {
    owner: "usr_arjun",
    people: [
      { id: "usr_arjun", role: "owner" },
      { id: "usr_dana", role: "member" },
      { id: "usr_guest", role: "guest" },
    ],
  };

  it("resolves owner, any, a role and a person, each once, in order", () => {
    expect(approversFor(["owner"], facts)).toEqual(["usr_arjun"]);
    // `any` is everyone in the room but a guest (Gate 5); a guest is named by id, or not at all.
    expect(approversFor(["any"], facts)).toEqual(["usr_arjun", "usr_dana"]);
    expect(approversFor(["usr_guest", "any"], facts)).toEqual([
      "usr_guest",
      "usr_arjun",
      "usr_dana",
    ]);
    expect(approversFor(["role:guest"], facts)).toEqual(["usr_guest"]);
    expect(
      approversFor(["any"], {
        ...facts,
        people: [{ id: "usr_sam", role: "member", workspaceRole: "guest" }],
      }),
    ).toEqual(["usr_arjun"]);
    expect(approversFor(["role:member", "owner"], facts)).toEqual(["usr_dana", "usr_arjun"]);
    expect(approversFor(["usr_dana", "role:member"], facts)).toEqual(["usr_dana"]);
  });

  it("falls back to the owner when the refs name nobody, and to anyone without one", () => {
    expect(approversFor(["role:ops_lead"], facts)).toEqual(["usr_arjun"]);
    expect(approversFor(["role:ops_lead"], { ...facts, owner: undefined })).toEqual([]);
    expect(approversFor([], facts)).toEqual(["usr_arjun"]);
  });

  it("resolves strictly, with no fall-back, for a routing (Gate 5)", () => {
    expect(resolveApprovers(["role:ops_lead"], facts)).toEqual([]);
    expect(resolveApprovers([], facts)).toEqual([]);
    expect(resolveApprovers(["owner", "usr_dana", "owner"], facts)).toEqual([
      "usr_arjun",
      "usr_dana",
    ]);
  });
});

describe("who may answer, with a lead and the workspace's standings (M5.5)", () => {
  const facts = {
    owner: "usr_arjun",
    people: [
      { id: "usr_arjun", role: "owner", workspaceRole: "owner" },
      { id: "usr_dana", role: "member", workspaceRole: "admin" },
      { id: "usr_priya", role: "member", workspaceRole: "member" },
    ],
    lead: "hrn_scout",
  };

  it("names the lane's lead for `lead`, and nobody when the run is no lane's", () => {
    expect(approversFor(["lead"], facts)).toEqual(["hrn_scout"]);
    expect(approversFor(["lead", "owner"], facts)).toEqual(["hrn_scout", "usr_arjun"]);
    expect(approversFor(["lead"], { ...facts, lead: undefined })).toEqual(["usr_arjun"]);
  });

  it("reads a role as a standing in the space or in the workspace", () => {
    expect(approversFor(["role:admin"], facts)).toEqual(["usr_dana"]);
    expect(approversFor(["role:member"], facts)).toEqual(["usr_dana", "usr_priya"]);
    expect(approversFor(["role:owner"], facts)).toEqual(["usr_arjun"]);
  });
});
