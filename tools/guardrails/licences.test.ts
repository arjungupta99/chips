/**
 * Two licences, split by folder (ADR 0128, LICENSING.md): the protocol, the SDK, the conformance
 * kit, the examples and the adapters are Apache-2.0, so a harness can build on them without
 * asking; everything else is FSL-1.1-ALv2. What an Apache-2.0 part ships never reaches into an
 * FSL part, or a harness author who bundles the SDK would take on the FSL without knowing. Its
 * tests may: they are not shipped (`tsconfig.build.json` leaves them out).
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join, normalize, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const REPO = fileURLToPath(new URL("../../", import.meta.url));

const APACHE = [
  "packages/protocol",
  "packages/sdk-ts",
  "packages/conformance",
  "examples",
  "adapters",
];
const isApache = (path: string): boolean =>
  APACHE.some((folder) => path === folder || path.startsWith(`${folder}/`));

const tracked = execFileSync("git", ["ls-files", "-z"], { cwd: REPO })
  .toString("utf8")
  .split("\0")
  .filter((path) => path !== "");

/** Every workspace package, by the folder that holds its `package.json`. */
const packages = tracked
  .filter((path) =>
    /^((packages|apps|adapters|examples|tools)\/[^/]+\/|server\/|cli\/|relay\/)?package\.json$/.test(
      path,
    ),
  )
  .map((path) => {
    const folder = dirname(path) === "." ? "" : dirname(path);
    const manifest = JSON.parse(readFileSync(join(REPO, path), "utf8")) as {
      name: string;
      license?: string;
      dependencies?: Record<string, string>;
      peerDependencies?: Record<string, string>;
      optionalDependencies?: Record<string, string>;
    };
    return { folder, manifest };
  });
const folderOf = new Map(packages.map(({ folder, manifest }) => [manifest.name, folder]));

/** Files an Apache-2.0 part ships: everything but its tests and their helpers. */
const shipped = tracked.filter(
  (path) =>
    isApache(path) &&
    /\.(ts|tsx|mts|mjs|js|cjs)$/.test(path) &&
    !/(\.test\.|(^|\/)tests?\/|\/src\/testing\/|(^|\/)vitest\.config\.)/.test(path),
);

const SPECIFIER =
  /(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*|^\s*import\s+)["']([^"']+)["']/gm;

/** The folder an import in `path` reaches, if it is in this repository. */
function reachedBy(path: string, specifier: string): string | undefined {
  if (specifier.startsWith("."))
    return relative(REPO, normalize(join(REPO, dirname(path), specifier)));
  const scoped = specifier.startsWith("@");
  return folderOf.get(
    specifier
      .split("/")
      .slice(0, scoped ? 2 : 1)
      .join("/"),
  );
}

/** The imports in `source` that reach an FSL part. */
function intoFsl(path: string, source: string): string[] {
  return [...source.matchAll(SPECIFIER)]
    .map(([, specifier]) => specifier ?? "")
    .filter((specifier) => {
      const reached = reachedBy(path, specifier);
      return reached !== undefined && !isApache(reached);
    });
}

describe("the licences", () => {
  it("are named in every package.json by the folder it is in", () => {
    const wrong = packages
      .map(({ folder, manifest }) => ({
        folder: folder === "" ? "(root)" : folder,
        license: manifest.license,
        want: isApache(folder) ? "Apache-2.0" : "FSL-1.1-ALv2",
      }))
      .filter(({ license, want }) => license !== want);
    expect(wrong).toEqual([]);
  });

  it("are in a LICENSE at the root and in each Apache-2.0 part", () => {
    expect(readFileSync(join(REPO, "LICENSE"), "utf8")).toMatch(
      /^# Functional Source License, Version 1\.1, ALv2 Future License\n/,
    );
    const folders = packages.map(({ folder }) => folder).filter((folder) => isApache(folder));
    expect(folders.length).toBeGreaterThan(0);
    for (const folder of folders) {
      expect(readFileSync(join(REPO, folder, "LICENSE"), "utf8"), folder).toMatch(
        /^\s*Apache License\s+Version 2\.0, January 2004/,
      );
    }
  });

  it("are named the same way in the Mac app, the phone's modules and the Homebrew formula", () => {
    const natives = tracked.filter((path) =>
      /(Cargo\.toml|\.podspec|^packaging\/.*\.rb)$/.test(path),
    );
    expect(natives.length).toBeGreaterThan(0);
    for (const path of natives) {
      const text = readFileSync(join(REPO, path), "utf8");
      expect(text, path).toMatch(/license\s*=?\s*["']FSL-1\.1-ALv2["']/);
    }
  });
});

describe("an Apache-2.0 part", () => {
  it("depends on no FSL part", () => {
    const wrong = packages
      .filter(({ folder }) => isApache(folder))
      .flatMap(({ folder, manifest }) =>
        Object.keys({
          ...manifest.dependencies,
          ...manifest.peerDependencies,
          ...manifest.optionalDependencies,
        })
          .filter((name) => folderOf.has(name) && !isApache(folderOf.get(name) ?? ""))
          .map((name) => `${folder} → ${name}`),
      );
    expect(wrong).toEqual([]);
  });

  it("imports nothing from an FSL part in what it ships", () => {
    expect(shipped.length).toBeGreaterThan(0);
    const wrong = shipped.flatMap((path) =>
      intoFsl(path, readFileSync(join(REPO, path), "utf8")).map((into) => `${path} → ${into}`),
    );
    expect(wrong).toEqual([]);
  });

  it("is caught reaching into an FSL part", () => {
    const fake = [
      'import { buildGateway } from "@chipschat/server";',
      'import "../../../server/src/x.js";',
      'export { createIdGenerator } from "@chipschat/protocol";',
      'import { fake } from "./testing/fake.js";',
    ].join("\n");
    expect(intoFsl("packages/sdk-ts/src/index.ts", fake)).toEqual([
      "@chipschat/server",
      "../../../server/src/x.js",
    ]);
  });
});
