/**
 * About's Acknowledgements (ADR 0295) lists the open-source packages each app ships, written by
 * `pnpm notices` (`tools/notices/notices.mjs`) and kept in the repository: the phone's from its iOS
 * bundle, the web's and the Mac's from its production dependencies. A dependency added or moved to
 * another version without running it again would ship a list that is no longer the app's. So every
 * direct dependency of each app is held here to its list, at the version installed.
 *
 * The phone leaves out what is never in its iOS bundle: a config plugin the native build reads,
 * and what only its web target draws with.
 */

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const REPO = fileURLToPath(new URL("../../", import.meta.url));

/** The phone's dependencies that its iOS bundle never carries, and why. */
const NOT_IN_THE_PHONE: Readonly<Record<string, string>> = {
  "expo-build-properties": "a config plugin: the native build reads it, the bundle never does",
  "react-dom": "the web target's renderer",
  "react-native-web": "the web target's components",
};

const APPS = [
  { app: "apps/mobile", list: "apps/mobile/src/about/notices.json", leftOut: NOT_IN_THE_PHONE },
  { app: "apps/web", list: "apps/web/src/app/you/notices.json", leftOut: {} },
] as const;

interface Listed {
  readonly app: string;
  readonly packages: readonly { name: string; version: string; texts: readonly unknown[] }[];
}

const read = <T>(path: string): T => JSON.parse(readFileSync(`${REPO}${path}`, "utf8")) as T;

describe.each(APPS)("$app's acknowledgements", ({ app, list, leftOut }) => {
  const manifest = read<{ dependencies?: Record<string, string> }>(`${app}/package.json`);
  const listed = read<Listed>(list);
  const versions = new Map(listed.packages.map((each) => [each.name, each.version]));
  const require = createRequire(`${REPO}${app}/package.json`);
  const direct = Object.keys(manifest.dependencies ?? {}).filter(
    (name) => !name.startsWith("@chipschat/") && !(name in leftOut),
  );

  it.each(direct)("lists %s at the version installed (run `pnpm notices` if not)", (name) => {
    const installed = (
      JSON.parse(readFileSync(require.resolve(`${name}/package.json`), "utf8")) as {
        version: string;
      }
    ).version;
    expect(versions.get(name)).toBe(installed);
  });

  it("leaves out Chips' own packages, which Licence covers", () => {
    expect(listed.packages.filter((each) => each.name.startsWith("@chipschat/"))).toEqual([]);
  });

  it("leaves out only what is really a dependency", () => {
    for (const name of Object.keys(leftOut)) expect(manifest.dependencies).toHaveProperty(name);
  });
});
