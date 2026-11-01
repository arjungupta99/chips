/**
 * `chips join` (ADR 0122): the four lines a shell takes in, on standard output and nothing else
 * there; the code, and any refusal, on standard error.
 */

import { JoinError, type JoinOptions } from "@chipschat/harness";
import { describe, expect, it } from "vitest";
import type { Console } from "../output.js";
import { exportLines, joinChips } from "./join.js";

/** Standard output and standard error, kept apart: only the first is evaluated. */
function scriptedConsole(_answer: boolean): Console & { lines: string[]; errors: string[] } {
  const lines: string[] = [];
  const errors: string[] = [];
  return {
    lines,
    errors,
    out: (line) => lines.push(line),
    err: (line) => errors.push(line),
    confirm: async () => false,
  };
}

const JOINED = {
  url: "http://100.64.0.7:4431",
  harnessId: "hrn_01K4ZQPX000000000000000099",
  token: "chips_at_shown-once",
  spaceId: "spc_01K4ZQPX000000000000000098",
  capabilities: ["autonomy"],
};

describe("chips join", () => {
  it("takes up a link and prints the four lines, as exports a shell can eval", async () => {
    const out = scriptedConsole(false);
    const asked: JoinOptions[] = [];
    const code = await joinChips({
      target: "http://100.64.0.7:4431/j/chips_j_0123456789abcdefghijkl",
      name: "Tide",
      console: out,
      env: {},
      join: async (options) => {
        asked.push(options);
        return JOINED;
      },
    });
    expect(code).toBe(0);
    expect(asked[0]).toMatchObject({
      link: "http://100.64.0.7:4431/j/chips_j_0123456789abcdefghijkl",
      name: "Tide",
    });
    expect(out.lines).toEqual([
      "export CHIPS_URL='http://100.64.0.7:4431'",
      "export CHIPS_HARNESS_ID='hrn_01K4ZQPX000000000000000099'",
      "export CHIPS_HARNESS_TOKEN='chips_at_shown-once'",
      "export CHIPS_SPACE_ID='spc_01K4ZQPX000000000000000098'",
    ]);
  });

  it("asks at an address with a code it says on standard error", async () => {
    const out = scriptedConsole(false);
    await joinChips({
      target: "http://127.0.0.1:4431",
      name: "Tide",
      console: out,
      env: {},
      join: async (options) => {
        expect(options.url).toBe("http://127.0.0.1:4431");
        options.onCode?.("KQ7-M4P", "http://127.0.0.1:4431");
        return JOINED;
      },
    });
    expect(out.errors).toEqual([
      "Allow Tide in Chips at http://127.0.0.1:4431. Its code is KQ7-M4P.",
    ]);
    expect(out.lines).toHaveLength(4);
  });

  it("says why it was refused, and prints nothing to evaluate", async () => {
    const out = scriptedConsole(false);
    const code = await joinChips({
      target: "http://127.0.0.1:4431/j/chips_j_0123456789abcdefghijkl",
      console: out,
      env: {},
      join: async () => {
        throw new JoinError("spent", "It was used already. Ask for a new one.");
      },
    });
    expect(code).toBe(1);
    expect(out.lines).toEqual([]);
    expect(out.errors).toEqual(["It was used already. Ask for a new one."]);
    expect(await joinChips({ target: undefined, console: out, env: {} })).toBe(1);
  });

  it("quotes what it prints so nothing in it is read twice", () => {
    expect(exportLines({ ...JOINED, token: "it's" })[2]).toBe(
      "export CHIPS_HARNESS_TOKEN='it'\\''s'",
    );
  });
});
