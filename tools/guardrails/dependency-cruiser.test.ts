/**
 * The layer rules in `.dependency-cruiser.cjs` are a requirement of technical-plan 6.1, and
 * a rule that never fires is not a guardrail. Each case here is a module that breaks one
 * rule on purpose; the test asserts the rule catches it.
 *
 * The fixtures live in a miniature repository under `fixtures/`, laid out with the same
 * directory names the real rules match on, and cruised with that directory as the working
 * directory so the paths line up.
 */

import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { beforeAll, describe, expect, it } from "vitest";

const run = promisify(execFile);

const CRUISER = fileURLToPath(new URL("./node_modules/.bin/depcruise", import.meta.url));
const CONFIG = fileURLToPath(new URL("../../.dependency-cruiser.cjs", import.meta.url));
const FIXTURES = fileURLToPath(new URL("./fixtures", import.meta.url));

interface Violation {
  rule: { name: string; severity: string };
  from: string;
  to: string;
}

let violations: Violation[] = [];

beforeAll(async () => {
  // dependency-cruiser exits non-zero when it finds violations, which is the point here.
  const result = await run(CRUISER, ["--config", CONFIG, "--output-type", "json", "."], {
    cwd: FIXTURES,
    maxBuffer: 32 * 1024 * 1024,
  }).catch((error: { stdout?: string }) => ({ stdout: error.stdout ?? "" }));

  violations = (JSON.parse(result.stdout) as { summary: { violations: Violation[] } }).summary
    .violations;
});

/** Every rule below is expected to fire, from this module, at least once. */
const CASES: ReadonlyArray<readonly [rule: string, from: string]> = [
  ["no-circular", "server/src/domain/cycle-a.ts"],
  ["no-unresolvable", "server/src/domain/reaches-framework.ts"],
  ["not-to-unlisted-dep", "server/src/domain/reaches-framework.ts"],
  ["no-deprecated-core", "server/src/infrastructure/deprecated-core.ts"],
  ["protocol-is-innermost", "packages/protocol/src/reaches-domain.ts"],
  ["domain-not-to-outer", "server/src/domain/reaches-infrastructure.ts"],
  ["domain-not-to-framework", "server/src/domain/reaches-framework.ts"],
  ["application-not-to-outer", "server/src/application/reaches-infrastructure.ts"],
  ["infrastructure-not-to-interfaces", "server/src/infrastructure/reaches-interfaces.ts"],
  ["platform-imports-nothing-of-ours", "packages/platform/src/reaches-protocol.ts"],
  ["clients-not-to-server", "packages/ui/src/reaches-server.ts"],
  ["server-not-to-clients", "server/src/domain/reaches-ui.ts"],
  ["ui-and-core-are-siblings", "packages/core/src/reaches-ui.ts"],
  ["no-deep-import-into-package", "server/src/interfaces/deep-import.ts"],
  ["no-deep-import-between-packages", "packages/other/src/deep-import.ts"],
];

describe("the layer rules fire on known-bad code", () => {
  it.each(CASES)("%s catches %s", (rule, from) => {
    const hit = violations.find((v) => v.rule.name === rule && v.from === from);
    expect(hit, `${rule} did not fire on ${from}`).toBeDefined();
    expect(hit?.rule.severity).toBe("error");
  });

  it("fires nothing else, so the fixtures stay a precise description of the rules", () => {
    const unexpected = violations.filter(
      (v) => !CASES.some(([rule, from]) => rule === v.rule.name && from === v.from),
    );
    expect(unexpected).toEqual([]);
  });
});

describe("the real source tree is clean", () => {
  it("cruises without a violation", async () => {
    const repo = fileURLToPath(new URL("../..", import.meta.url));
    const result = await run(CRUISER, ["--config", CONFIG, "."], { cwd: repo, maxBuffer: 32e6 });
    expect(result.stdout).toContain("no dependency violations found");
  });
});
