/**
 * The visual regression suite renders in one container image, locally and in CI, so its
 * snapshots mean the same thing everywhere. The image's version has to be the installed
 * Playwright's, or the browser in the container is not the one the tests were written for.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const REPO = fileURLToPath(new URL("../../", import.meta.url));

describe("the Playwright container image", () => {
  const version = (
    JSON.parse(readFileSync(`${REPO}apps/web/package.json`, "utf8")) as {
      devDependencies: Record<string, string>;
    }
  ).devDependencies["@playwright/test"];

  it("is pinned in CI to the installed @playwright/test", () => {
    const workflow = readFileSync(`${REPO}.github/workflows/ci.yml`, "utf8");
    expect(workflow).toContain(`mcr.microsoft.com/playwright:v${version}-noble`);
  });

  it("is derived from the same version by the local runner", () => {
    const script = readFileSync(`${REPO}tools/visual/run.sh`, "utf8");
    expect(script).toContain(`devDependencies['@playwright/test']`);
    const placeholder = ["$", "{VERSION}"].join("");
    expect(script).toContain(`mcr.microsoft.com/playwright:v${placeholder}-noble`);
  });
});
