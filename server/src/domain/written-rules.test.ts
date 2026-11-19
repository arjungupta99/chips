import type { PolicyRule } from "@chipschat/protocol";
import { describe, expect, it } from "vitest";
import { holdRules, keepHold, keepWritten } from "./written-rules.js";

const AT = "2026-11-18T09:41:00.000Z";

describe("rules a person writes (ADR 0299)", () => {
  it("stamps each new rule, and lets each kept one keep its maker", () => {
    const old: PolicyRule = {
      match: "acp.bash",
      when: { starts_with: ["ls"] },
      decision: "allow",
      made_by: "usr_a",
      made_at: "2026-11-01T00:00:00.000Z",
    };
    const kept = keepWritten(
      [old],
      [
        { ...old, off: true },
        { match: "acp.bash", when: { starts_with: ["rm"] }, decision: "deny" },
      ],
      "usr_b",
      AT,
    );
    expect(kept).toEqual({
      ok: true,
      rules: [
        { ...old, off: true },
        {
          match: "acp.bash",
          when: { starts_with: ["rm"] },
          decision: "deny",
          made_by: "usr_b",
          made_at: AT,
        },
      ],
    });
  });

  it("refuses the first new rule no person may write", () => {
    const kept = keepWritten(
      [],
      [{ match: "acp.bash", when: { starts_with: ["curl"] }, decision: "allow" }],
      "usr_b",
      AT,
    );
    expect(kept.ok).toBe(false);
  });

  it("keeps a rule already there even when no person may write it now", () => {
    const legacy: PolicyRule = { match: "*", decision: "allow" };
    expect(keepWritten([legacy], [legacy], "usr_b", AT)).toEqual({ ok: true, rules: [legacy] });
  });
});

describe("a harness's asks turned off (ADR 0299)", () => {
  it("is stamped with who and when, keeping only its end and what it covers", () => {
    expect(
      keepHold(
        { until: "2026-11-18T10:41:00.000Z", matters: false, by: "x", at: "y" },
        "usr_a",
        AT,
      ),
    ).toEqual({
      until: "2026-11-18T10:41:00.000Z",
      by: "usr_a",
      at: AT,
    });
    expect(keepHold({ matters: true }, "usr_a", AT)).toEqual({
      matters: true,
      by: "usr_a",
      at: AT,
    });
  });

  it("says yes while it holds, keeping what matters for a person unless it covers that", () => {
    const now = "2026-11-18T10:00:00.000Z";
    expect(holdRules([{ until: "2026-11-18T10:41:00.000Z", by: "usr_a", at: AT }], now)).toEqual([
      {
        match: "*",
        decision: "allow",
        reason: "its asks are off until 2026-11-18T10:41:00.000Z",
        made_by: "usr_a",
        made_at: AT,
      },
    ]);
    expect(holdRules([{ matters: true, by: "usr_a", at: AT }], now)).toEqual([
      { match: "*", decision: "allow", reason: "its asks are off", made_by: "usr_a" },
    ]);
    expect(
      holdRules([{ until: "2026-11-18T09:59:00.000Z", at: AT }, null, undefined], now),
    ).toEqual([]);
  });
});
