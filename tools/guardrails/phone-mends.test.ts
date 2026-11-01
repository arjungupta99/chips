/**
 * `chips phone` is meant to be the only thing you type. A check that finds something wrong and
 * answers it with a `pnpm` command of ours has already worked out what to do, and printing that
 * command rather than running it makes the person at the keyboard the thing that copies an
 * answer across (Arjun, 12 September 2026: "I expect it should just work without hassle").
 *
 * So: a failing check whose fix offers a `pnpm` command on a line of its own carries a mend from
 * the tool's `MENDS` table, and this is what says so when a new check forgets. A fix that names a
 * command in passing, or one that needs `sudo`, a keychain dialog answered or somebody else's
 * process stopped, is outside the rule — those are the ones that need the person, which is the
 * distinction the whole arrangement rests on.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const source = readFileSync(fileURLToPath(new URL("../phone/phone.mjs", import.meta.url)), "utf8");

/** Every `report(…)` call in the tool, as its own text, found by balancing the brackets. */
function reportCalls(text: string): string[] {
  const calls: string[] = [];
  for (let at = text.indexOf("report("); at !== -1; at = text.indexOf("report(", at + 1)) {
    let depth = 0;
    for (let end = at + "report".length; end < text.length; end += 1) {
      if (text[end] === "(") depth += 1;
      if (text[end] === ")") depth -= 1;
      if (depth === 0) {
        calls.push(text.slice(at, end + 1));
        break;
      }
    }
  }
  return calls;
}

/** The repairs the tool says it can make, by name. */
function mendNames(text: string): string[] {
  const table = text.slice(text.indexOf("const MENDS = {"));
  return [...table.slice(0, table.indexOf("\n};")).matchAll(/^ {2}(\w+): /gm)].map((m) => m[1]);
}

/** A command of ours the fix offers on a line of its own, rather than naming in a sentence. */
const offersOurCommand = (call: string) => /"pnpm |\\n {2}pnpm /.test(call);

describe("the checks in `pnpm phone`", () => {
  const calls = reportCalls(source);

  it("finds every check, which is what the rest of this rests on", () => {
    // The bracket-balancing above is the fragile part: if it slipped, the assertions below would
    // pass over nothing at all and say the tool was perfect.
    expect(calls.length).toBeGreaterThan(15);
    expect(calls.filter((call) => call.includes('"bad"')).length).toBeGreaterThan(8);
  });

  it("mends every failure it knows a command of ours for", () => {
    const unmended = calls
      .filter((call) => call.includes('"bad"') && offersOurCommand(call))
      .filter((call) => !call.includes("MENDS."))
      .map((call) => /"bad",\s*\n?\s*"([^"]+)"/.exec(call)?.[1] ?? call.slice(0, 60));
    expect(unmended).toEqual([]);
  });

  it("keeps no repair it never reaches for", () => {
    const names = mendNames(source);
    expect(names.length).toBeGreaterThan(3);
    expect(names.filter((name) => !source.includes(`MENDS.${name}`))).toEqual([]);
  });

  it("leaves alone what needs a person, a password or somebody else's process", () => {
    const theirs = calls.filter((call) =>
      /sudo |security set-key-partition-list|kill <pid>/.test(call),
    );
    expect(theirs.length).toBeGreaterThan(0);
    for (const call of theirs) expect(call).not.toContain("MENDS.");
  });
});
