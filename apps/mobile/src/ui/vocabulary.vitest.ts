import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  AUTONOMY_LEVELS,
  autonomyInfo,
  autonomyLabel,
  HARNESS_STATUSES,
  initials,
  RISK,
  ringTone,
  riskLabel,
  STATUS,
  statusLabel,
} from "./vocabulary";

/**
 * The originals, read as text. Importing them would be nicer and is not available: this app may
 * not depend on `@chipschat/ui`, whose entry drags stylesheets Metro cannot read. So the tables are
 * parsed out of the source — the shape is a literal record either way — and compared field by
 * field, which is what stops the copy here drifting from the design system.
 */
function source(file: string): string {
  return readFileSync(
    fileURLToPath(new URL(`../../../../packages/ui/src/vocabulary/${file}`, import.meta.url)),
    "utf8",
  );
}

/** Every `key: { … }` entry of the named record, as key → the raw braces. */
function entries(text: string, record: string): Readonly<Record<string, string>> {
  const at = text.indexOf(`export const ${record}`);
  if (at === -1) throw new Error(`no ${record} in the design system's vocabulary`);
  const body = text.slice(at, text.indexOf("\n};", at));
  const found: Record<string, string> = {};
  for (const [, key, fields] of body.matchAll(/^ {2}(\w+): \{([^}]*)\}/gm)) {
    if (key !== undefined && fields !== undefined) found[key] = fields;
  }
  return found;
}

/** One field out of a raw entry: `label: "Idle"` → `Idle`. */
function field(fields: string, name: string): string | undefined {
  return new RegExp(`${name}: (?:"([^"]*)"|(\\w+))`).exec(fields)?.slice(1).find(Boolean);
}

describe("the phone's vocabulary", () => {
  it("says what the design system says about each harness status", () => {
    const theirs = entries(source("status.ts"), "STATUS");
    expect(Object.keys(theirs)).toEqual([...HARNESS_STATUSES]);
    for (const [status, fields] of Object.entries(theirs)) {
      const mine = STATUS[status as (typeof HARNESS_STATUSES)[number]];
      expect([mine.label, mine.tone, mine.dot]).toEqual([
        field(fields, "label"),
        field(fields, "tone"),
        field(fields, "dot"),
      ]);
    }
  });

  it("holds every risk class, with the same word and the same heat", () => {
    const theirs = entries(source("risk.ts"), "RISK");
    expect(Object.keys(RISK)).toEqual(Object.keys(theirs));
    for (const [risk, fields] of Object.entries(theirs)) {
      const mine = RISK[risk];
      expect([mine?.label, String(mine?.hot)]).toEqual([
        field(fields, "label"),
        field(fields, "hot"),
      ]);
    }
  });

  it("holds the four autonomy levels, word for word", () => {
    // The summaries are the sentences a person reads before turning the dial up, so they are
    // checked in full rather than by name: a level that means something slightly different on
    // the phone than on the desktop is the kind of drift nobody notices until it matters.
    const flat = source("autonomy.ts").replace(/\s+/g, " ");
    const theirs = [
      ...flat.matchAll(/\{ level: (\d), name: "([^"]*)", summary: "([^"]*)", \}/g),
    ].map(([, level, name, summary]) => ({ level: Number(level), name, summary }));
    expect(theirs).toHaveLength(4);
    expect(AUTONOMY_LEVELS.map((info) => ({ ...info }))).toEqual(theirs);
    expect(autonomyLabel(2)).toBe("L2 · Ask when it matters");
  });

  it("says the verb phrase only for the state that has one to say", () => {
    expect(statusLabel("working", "Drafting the reply")).toBe("Working · Drafting the reply");
    expect(statusLabel("working")).toBe("Working");
    // A verb phrase on anything else is noise: Blocked is not blocked *doing* something.
    expect(statusLabel("blocked", "Drafting the reply")).toBe("Blocked");
  });

  it("gives a ring to every state but the one that is not a state", () => {
    expect(ringTone(undefined)).toBeUndefined();
    expect(ringTone("idle")).toBeUndefined();
    for (const status of HARNESS_STATUSES.filter((each) => each !== "idle")) {
      expect(ringTone(status)).toBe(STATUS[status].tone);
    }
  });

  it("names a risk class it has never heard of rather than dropping it", () => {
    expect(riskLabel("financial")).toBe("Money");
    // The protocol's list is closed today and may not be tomorrow. A chip saying the raw class
    // is ugly; a decision card silently missing one of its risks is worse.
    expect(riskLabel("something_new")).toBe("something_new");
  });

  it("finds each level by its own number", () => {
    for (const info of AUTONOMY_LEVELS) expect(autonomyInfo(info.level)).toBe(info);
  });

  it("draws initials the way the design system does", () => {
    expect(initials("Dana Ruiz")).toBe("DR");
    expect(initials("Scout")).toBe("S");
    expect(initials("#supplier-updates")).toBe("#");
    expect(initials("  ")).toBe("?");
    expect(initials("Ada B Lovelace")).toBe("AB");
    expect(initials("Shopping · fork")).toBe("SF");
    expect(initials("Garage door - fork")).toBe("GD");
  });
});
