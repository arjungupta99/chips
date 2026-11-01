#!/usr/bin/env node
/**
 * Builds a Chips release for this machine's platform: `dist/release/chips-<version>-<target>/`
 * and its `.tar.gz`, with a `SHA256SUMS` beside them.
 *
 *   node tools/release/build.mjs            the web app, the bundle, the runtime, the tarball
 *   node tools/release/build.mjs --skip-web use apps/web/dist as it is
 *   node tools/release/build.mjs --web <dir> use a web app built elsewhere: `pnpm desktop`'s copy,
 *                                           so the app's Chips is made without touching apps/web/dist
 *
 * Native only: the natives are installed by the release's own Node, which has to run here. CI
 * builds each platform on a runner of that platform (`.github/workflows/release.yml`).
 */

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import {
  artifactName,
  bundleOptions,
  hostTarget,
  LICENCE_FILE,
  licenceSection,
  lockFault,
  nodeDist,
  noticesFile,
  packageRoot,
  prunable,
  RUNTIME,
  SHIM,
  shasumFor,
  sumsFile,
} from "./release.mjs";

const REPO = fileURLToPath(new URL("../../", import.meta.url));
const argv = process.argv.slice(2);
const webAt = argv.indexOf("--web");
const givenWeb = webAt === -1 ? undefined : resolve(argv[webAt + 1] ?? "");
const skipWeb = argv.includes("--skip-web") || givenWeb !== undefined;
const outRoot = join(REPO, "dist", "release");
const cache = join(process.env.XDG_CACHE_HOME ?? join(homedir(), ".cache"), "chips-release");

const say = (line) => process.stdout.write(`${line}\n`);
const read = (path) => readFileSync(join(REPO, path), "utf8");

const version = JSON.parse(read("package.json")).version;
const nodeVersion = read(".node-version").trim();
const target = hostTarget(process.platform, process.arch);
if (target === undefined) {
  throw new Error(`Chips has no release for ${process.platform}-${process.arch}.`);
}
const name = artifactName(version, target);
const root = join(outRoot, name);

say(`Building ${name} (Node ${nodeVersion})`);
rmSync(root, { recursive: true, force: true });
mkdirSync(join(root, "bin"), { recursive: true });
mkdirSync(join(root, "lib"), { recursive: true });
mkdirSync(join(root, "runtime"), { recursive: true });

// 1. The web app chipsd serves.
if (!skipWeb) {
  say("  web app");
  execFileSync("pnpm", ["web:build"], { cwd: REPO, stdio: "inherit" });
}
const web = givenWeb ?? join(REPO, "apps", "web", "dist");
if (!existsSync(join(web, "index.html"))) {
  throw new Error(`${web} has no index.html: run \`pnpm web:build\`.`);
}
// Source maps stay behind: 4 MB nobody running Chips reads.
cpSync(web, join(root, "web"), { recursive: true, filter: (from) => !from.endsWith(".map") });

// The gallery's cards (ADRs 0171, 0218): the docs' own, so a server this release starts has them
// from its first start, and `chips connect <id>` finds each harness's bridge.
mkdirSync(join(root, "connectors"));
copyFileSync(
  join(REPO, "apps", "docs", "public", "connectors.json"),
  join(root, "connectors", "connectors.json"),
);

// 2. Node, checked against nodejs.org's own sums.
const node = await fetchNode(nodeVersion, target);
copyFileSync(join(node, "bin", "node"), join(root, "runtime", "node"));
chmodSync(join(root, "runtime", "node"), 0o755);

// 3. The natives, installed by that Node's own npm from their lock (SEC-36), so they are the
// ones the lock names, each checked against its integrity, built for that Node's ABI.
say("  native modules");
const manifest = JSON.parse(read(`${RUNTIME}/package.json`));
const lock = JSON.parse(read(`${RUNTIME}/package-lock.json`));
const fault = lockFault(JSON.parse(read("server/package.json")), manifest, lock);
if (fault !== undefined) throw new Error(fault);
copyFileSync(join(REPO, RUNTIME, "package.json"), join(root, "lib", "package.json"));
copyFileSync(join(REPO, RUNTIME, "package-lock.json"), join(root, "lib", "package-lock.json"));
execFileSync(
  join(node, "bin", "node"),
  [
    join(node, "lib", "node_modules", "npm", "bin", "npm-cli.js"),
    "ci",
    "--omit=dev",
    "--no-audit",
    "--no-fund",
    "--loglevel=error",
  ],
  {
    cwd: join(root, "lib"),
    stdio: "inherit",
    env: { ...process.env, PATH: `${join(node, "bin")}:${process.env.PATH}` },
  },
);

// Only what this platform loads: SQLite's build for it, and sharp without its wasm fallback.
for (const path of prunable(join(root, "lib", "node_modules"), target)) {
  rmSync(path, { recursive: true, force: true });
}

// 4. The CLI and server, one file.
say("  bundle");
const bundled = await build({
  ...bundleOptions({
    entry: join(REPO, "cli", "bin", "chips.ts"),
    outfile: join(root, "lib", "chips.mjs"),
    version,
  }),
  absWorkingDir: REPO,
  metafile: true,
});

// 5. The shim, the version, the two licences (ADR 0128) and the notices for what it carries.
writeFileSync(join(root, "bin", "chips"), SHIM);
chmodSync(join(root, "bin", "chips"), 0o755);
writeFileSync(join(root, "VERSION"), `${version}\n`);
copyFileSync(join(REPO, "LICENSE"), join(root, "LICENSE"));
copyFileSync(join(REPO, "packages", "protocol", "LICENSE"), join(root, "LICENSE-APACHE"));
say("  notices");
const carried = [
  ...Object.keys(bundled.metafile.inputs).map((input) => packageRoot(input)),
  ...installed(join(root, "lib", "node_modules")),
  ...webPackages(),
].filter((dir) => dir !== undefined);
writeFileSync(
  join(root, "THIRD-PARTY-NOTICES.md"),
  noticesFile([
    { name: "Node.js", version: nodeVersion, license: "MIT", texts: licenceTexts(node) },
    ...[...new Set(carried.map((dir) => resolve(REPO, dir)))].map(describe),
  ]),
);

// 6. The tarball and the sums of every tarball here.
say("  tarball");
const tarball = `${name}.tar.gz`;
execFileSync("tar", ["-czf", tarball, name], { cwd: outRoot });
const entries = readdirSync(outRoot)
  .filter((file) => file.endsWith(".tar.gz"))
  .sort()
  .map((file) => ({ file, hash: sha256(join(outRoot, file)) }));
writeFileSync(join(outRoot, "SHA256SUMS"), sumsFile(entries));

const size = (path) => Math.round(readFileSync(path).length / 1e5) / 10;
say(`Built ${join("dist", "release", tarball)} (${size(join(outRoot, tarball))} MB)`);

async function fetchNode(nodeVersion, target) {
  const dist = nodeDist(nodeVersion, target);
  const dir = join(cache, `node-v${nodeVersion}-${target}`);
  if (existsSync(join(dir, "bin", "node"))) return dir;
  mkdirSync(cache, { recursive: true });
  say(`  Node ${nodeVersion} from nodejs.org`);
  const sums = await (await fetch(dist.sums)).text();
  const expected = shasumFor(sums, dist.file);
  if (expected === undefined) throw new Error(`nodejs.org lists no sum for ${dist.file}`);
  const bytes = Buffer.from(await (await fetch(dist.url)).arrayBuffer());
  const got = createHash("sha256").update(bytes).digest("hex");
  if (got !== expected) throw new Error(`${dist.file}: sha256 ${got}, expected ${expected}`);
  const archive = join(tmpdir(), dist.file);
  writeFileSync(archive, bytes);
  execFileSync("tar", ["-xzf", archive, "-C", cache]);
  rmSync(archive);
  return dir;
}

/** The packages npm installed into a folder, scoped ones included. */
function installed(modules) {
  return readdirSync(modules)
    .filter((name) => !name.startsWith("."))
    .flatMap((name) =>
      name.startsWith("@")
        ? readdirSync(join(modules, name)).map((inner) => join(modules, name, inner))
        : [join(modules, name)],
    );
}

/** The packages the web app is built from: its production dependencies, all the way down. */
function webPackages() {
  const listed = JSON.parse(
    execFileSync(
      "pnpm",
      ["--filter", "@chipschat/web", "list", "--prod", "--depth", "Infinity", "--json"],
      {
        cwd: REPO,
        encoding: "utf8",
      },
    ),
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

/** What `noticesFile` says of the package in `dir`. */
function describe(dir) {
  const manifest = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
  const license = typeof manifest.license === "string" ? manifest.license : manifest.license?.type;
  return { name: manifest.name, version: manifest.version, license, texts: licenceTexts(dir) };
}

/** The licence and notice files in a folder, as they are; else its README's licence section. */
function licenceTexts(dir) {
  const files = readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && LICENCE_FILE.test(entry.name))
    .map((entry) => ({ file: entry.name, text: readFileSync(join(dir, entry.name), "utf8") }));
  if (files.length > 0 || !existsSync(join(dir, "README.md"))) return files;
  const section = licenceSection(readFileSync(join(dir, "README.md"), "utf8"));
  return section === undefined ? [] : [{ file: "README.md, its licence section", text: section }];
}

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}
