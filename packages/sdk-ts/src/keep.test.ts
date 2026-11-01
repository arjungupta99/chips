/**
 * Where a harness keeps its key: the command the macOS keychain is given carries the secret on
 * stdin, never on argv (SEC-34).
 */

import { describe, expect, it } from "vitest";
import { addPasswordCommand } from "./keep.js";

describe("the keychain's command (SEC-34)", () => {
  it("carries the secret to the tool's stdin, quoted, and never onto its argv", () => {
    expect(addPasswordCommand("hermes@http://127.0.0.1:4431", 'chips_at_se"c\\ret')).toBe(
      'add-generic-password -U -a "hermes@http://127.0.0.1:4431" -s "chips" -w "chips_at_se\\"c\\\\ret"\n',
    );
    expect(() => addPasswordCommand("a\nb", "x")).toThrow("one line");
  });
});
