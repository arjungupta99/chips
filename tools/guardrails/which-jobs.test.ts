/**
 * CI runs a job only where a push changed something it checks (tools/ci/which-jobs.sh), because
 * minutes on a private repository are counted. A rule that is too narrow lets a change through
 * unchecked, so the paths that decide are pinned here, and so is each job's gate.
 */

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const REPO = fileURLToPath(new URL("../../", import.meta.url));
const SCRIPT = `${REPO}tools/ci/which-jobs.sh`;

/** What the script answers for these changed paths, as it runs on the runner: under `sh`. */
function jobsFor(paths: readonly string[], args: readonly string[] = []) {
  const ran = spawnSync("sh", [SCRIPT, ...args], { input: paths.join("\n"), encoding: "utf8" });
  expect(ran.status, ran.stderr).toBe(0);
  return Object.fromEntries(
    ran.stdout
      .trim()
      .split("\n")
      .map((line) => line.split("=") as [string, string]),
  );
}

describe("which CI jobs a change runs", () => {
  it("runs nothing but the sign-off for prose", () => {
    const prose = ["docs/STATUS.md", "docs/decisions/0053-a-video.md", "README.md", "LICENSE"];
    expect(jobsFor(prose)).toEqual({ code: "false", web: "false", desktop: "false" });
    expect(jobsFor([])).toEqual({ code: "false", web: "false", desktop: "false" });
  });

  it("tests a change to the architecture page, which lint checks, and to the published docs", () => {
    expect(jobsFor(["docs/architecture.md"])).toMatchObject({ code: "true" });
    expect(jobsFor(["apps/docs/src/content/docs/reference/http.md"])).toMatchObject({
      code: "true",
      web: "false",
    });
  });

  it("tests the server without the visual suite or the Mac", () => {
    expect(jobsFor(["server/src/gateway.ts", "docs/STATUS.md"])).toEqual({
      code: "true",
      web: "false",
      desktop: "false",
    });
    expect(jobsFor(["apps/mobile/src/room/Room.tsx"])).toMatchObject({ web: "false" });
  });

  it("renders the web app again for the web app, the packages it draws with, and the installs", () => {
    for (const path of [
      "apps/web/src/app/SpaceView.tsx",
      "packages/ui/src/tokens.css",
      "tools/visual/run.sh",
      "pnpm-lock.yaml",
      "package.json",
    ]) {
      expect(jobsFor([path]), path).toEqual({ code: "true", web: "true", desktop: "false" });
    }
  });

  it("builds the macOS shell only for the shell and the workflow", () => {
    expect(jobsFor(["apps/desktop/src-tauri/src/main.rs"])).toMatchObject({ desktop: "true" });
    expect(jobsFor(["apps/desktop/src-tauri/Cargo.lock"])).toMatchObject({ desktop: "true" });
    expect(jobsFor([".github/workflows/ci.yml"])).toEqual({
      code: "true",
      web: "true",
      desktop: "true",
    });
  });

  it("runs every job when asked to", () => {
    expect(jobsFor([], ["--all"])).toEqual({ code: "true", web: "true", desktop: "true" });
  });

  it("gates each job in the workflow on its answer, and asks the script", () => {
    const workflow = readFileSync(`${REPO}.github/workflows/ci.yml`, "utf8");
    const gate = (job: string, output: string) =>
      new RegExp(
        `\\n  ${job}:\\n    name: [^\\n]+\\n    needs: changes\\n    if: needs\\.changes\\.outputs\\.${output} == 'true'\\n`,
      );
    expect(workflow).toMatch(gate("check", "code"));
    expect(workflow).toMatch(gate("visual", "web"));
    expect(workflow).toMatch(gate("desktop", "desktop"));
    expect(workflow).toContain("tools/ci/which-jobs.sh --all");
    expect(workflow).toContain('| tools/ci/which-jobs.sh | tee -a "$GITHUB_OUTPUT"');
  });
});
