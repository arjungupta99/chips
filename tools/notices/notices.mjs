#!/usr/bin/env node
/**
 * The open-source packages each app ships, with their licences, for About's Acknowledgements (ADR
 * 0295), and the helpers the computers' release uses for `THIRD-PARTY-NOTICES.md` (`build.mjs`).
 *
 * `pnpm notices` writes two lists:
 * - `apps/mobile/src/about/notices.json`, the iPhone and iPad app's: the packages in its iOS bundle,
 *   read from the source map of an `expo export` (so a package the app only builds with, a config
 *   plugin or the bundler, is not in it);
 * - `apps/web/src/app/you/notices.json`, the web app's and so the Mac's: its production dependencies,
 *   all the way down, as the release counts them.
 *
 * Chips' own packages (`@chipschat/*`) are left out: `LICENSE` and `LICENSING.md` cover them, and
 * Licence says so. `tools/guardrails/notices.test.ts` fails when a direct dependency of either app
 * is missing from its list or at another version, which is when to run this again.
 */

import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { LICENCE_FILE, licenceSection, packageRoot } from "../release/release.mjs";

const REPO = fileURLToPath(new URL("../../", import.meta.url));

/** Where each app's list is written, and what it calls the app. */
export const LISTS = {
  mobile: {
    file: join(REPO, "apps/mobile/src/about/notices.json"),
    app: "Chips for iPhone and iPad",
  },
  web: { file: join(REPO, "apps/web/src/app/you/notices.json"), app: "Chips for Mac and the web" },
};

/** What a package in `dir` is, as a notice says it: its name, version, licence and licence texts. */
export function describe(dir) {
  const manifest = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
  const license = typeof manifest.license === "string" ? manifest.license : manifest.license?.type;
  return { name: manifest.name, version: manifest.version, license, texts: licenceTexts(dir) };
}

/** The licence and notice files in a folder, as they are; else its README's licence section. */
export function licenceTexts(dir) {
  const files = readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && LICENCE_FILE.test(entry.name))
    .map((entry) => ({ file: entry.name, text: readFileSync(join(dir, entry.name), "utf8") }));
  if (files.length > 0 || !existsSync(join(dir, "README.md"))) return files;
  const section = licenceSection(readFileSync(join(dir, "README.md"), "utf8"));
  return section === undefined ? [] : [{ file: "README.md, its licence section", text: section }];
}

/** The folders of a workspace package's production dependencies, all the way down. */
export function prodPackages(filter) {
  const listed = JSON.parse(
    execFileSync("pnpm", ["--filter", filter, "list", "--prod", "--depth", "Infinity", "--json"], {
      cwd: REPO,
      encoding: "utf8",
      maxBuffer: 256 * 1024 * 1024,
    }),
  );
  const found = [];
  const walk = (deps = {}) => {
    for (const each of Object.values(deps)) {
      if (each.path?.includes("node_modules")) found.push(each.path);
      walk(each.dependencies);
    }
  };
  for (const project of listed) walk(project.dependencies);
  return found;
}

/**
 * The folders of the packages in the phone's iOS bundle: an `expo export` with external source
 * maps into a scratch folder, and every source's package (`packageRoot`).
 */
function bundledPackages() {
  const out = mkdtempSync(join(tmpdir(), "chips-notices-"));
  const app = join(REPO, "apps/mobile");
  try {
    execFileSync(
      "pnpm",
      [
        "exec",
        "expo",
        "export",
        "--platform",
        "ios",
        "--source-maps",
        "external",
        "--no-bytecode",
        "--max-workers",
        "2",
        "--output-dir",
        out,
      ],
      { cwd: app, stdio: ["ignore", "ignore", "inherit"], env: { ...process.env, CI: "1" } },
    );
    const maps = [];
    const look = (dir) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) look(path);
        else if (entry.name.endsWith(".map")) maps.push(path);
      }
    };
    look(out);
    if (maps.length === 0) throw new Error("expo export wrote no source map");
    const roots = new Set();
    for (const map of maps) {
      const { sources = [], sourceRoot = "" } = JSON.parse(readFileSync(map, "utf8"));
      for (const source of sources) {
        // Metro names a source from the workspace's root, as "/node_modules/.pnpm/…".
        const named = resolve(app, sourceRoot, source);
        const root = packageRoot(existsSync(named) ? named : join(REPO, source));
        if (root !== undefined && existsSync(join(root, "package.json"))) roots.add(root);
      }
    }
    return [...roots];
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
}

/** One list: each package once, Chips' own left out, by name. */
export function noticesOf(dirs) {
  const seen = new Map();
  for (const dir of dirs) {
    const notice = describe(realpathSync(dir));
    if (typeof notice.name !== "string" || notice.name.startsWith("@chipschat/")) continue;
    seen.set(`${notice.name}@${notice.version}`, notice);
  }
  return [...seen.values()].sort(
    (a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version),
  );
}

function write(list, packages) {
  writeFileSync(list.file, `${JSON.stringify({ app: list.app, packages }, null, 1)}\n`);
  console.log(`${list.file.slice(REPO.length)}: ${packages.length} packages`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const only = process.argv[2];
  if (only === undefined || only === "web")
    write(LISTS.web, noticesOf(prodPackages("@chipschat/web")));
  if (only === undefined || only === "mobile") write(LISTS.mobile, noticesOf(bundledPackages()));
}
