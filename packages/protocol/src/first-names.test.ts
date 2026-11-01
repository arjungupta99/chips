import { describe, expect, it } from "vitest";
import { AGENT_FIRST_NAMES, mayHoldName, pickAgentName } from "./first-names.js";
import { clashKey } from "./names.js";

const taken = (...names: string[]) => new Set(names.map(clashKey));
/** A `random` that always lands on the first of what it is offered. */
const first = () => 0;

describe("the first names a new agent is given (ADR 0150)", () => {
  it("are short men's names, each its own @-name, and none an AI product's or a harness's", () => {
    expect(AGENT_FIRST_NAMES.length).toBeGreaterThan(250);
    for (const name of AGENT_FIRST_NAMES) expect(name).toMatch(/^[A-Z][a-z]{2,5}$/);
    const keys = AGENT_FIRST_NAMES.map(clashKey);
    expect(new Set(keys).size).toBe(keys.length);
    for (const left of ["Claude", "Jules", "Leo", "Devin", "Jarvis", "Will", "Jacobian", "Scout"]) {
      expect(keys).not.toContain(clashKey(left));
    }
  });

  it("is one nobody has, picked at random among those", () => {
    expect(pickAgentName(taken("Abel"), [], first)).toBe("Aldo");
    expect(pickAgentName(taken(), [], () => 0.999)).toBe(AGENT_FIRST_NAMES.at(-1));
  });

  it("starts with a letter nobody in the room has, while there is one", () => {
    const picked = pickAgentName(taken(), ["Arjun", "Milo"], first);
    expect(picked).toBe("Basil");
    const allButM = AGENT_FIRST_NAMES.filter((name) => !name.startsWith("M"));
    expect(pickAgentName(taken(...allButM), ["Milo"], first)).toBe("Mads");
  });

  it("is numbered once every name is taken, as any clash is", () => {
    expect(pickAgentName(taken(...AGENT_FIRST_NAMES), [], first)).toBe("Abel 2");
  });
});

describe("a name a device proposes to hold", () => {
  it("is kept when it is a free name on one line", () => {
    expect(mayHoldName("Milo", taken("Theo"))).toBe(true);
    expect(mayHoldName("milo", taken("Milo"))).toBe(false);
    expect(mayHoldName("", taken())).toBe(false);
    expect(mayHoldName("Milo\nTheo", taken())).toBe(false);
    expect(mayHoldName(7, taken())).toBe(false);
    // SEC-33: what nobody sees, mixed letters, Main and You, and a lookalike of a name taken.
    expect(mayHoldName("Mi\u200blo", taken())).toBe(false);
    expect(mayHoldName("M\u0456lo", taken())).toBe(false);
    expect(mayHoldName("Main", taken())).toBe(false);
    expect(mayHoldName("\u0422\u041d\u0415\u041e", taken("Theo"))).toBe(false);
  });
});
