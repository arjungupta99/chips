/**
 * What a Chips release is, apart from making one: the platforms, the names, the shim and the
 * bundle's settings. Pure, so it is tested (`tools/guardrails/release.test.ts`) without building
 * anything; `build.mjs` does the downloading, bundling and packing.
 *
 * A release is one tarball per platform that needs nothing on the machine: the CLI and server
 * bundled into one file, a pinned Node to run it, the two native modules built for that Node,
 * and the web app. See ADR 0119.
 */

/** The platforms a release is built for, in Node's own spelling. */
export const TARGETS = ["darwin-arm64", "darwin-x64", "linux-x64", "linux-arm64"];

/** The platform this machine is, in the same spelling, or undefined where Chips has no build. */
export function hostTarget(platform, arch) {
  const target = `${platform}-${arch}`;
  return TARGETS.includes(target) ? target : undefined;
}

/** `chips-0.2.0-darwin-arm64`: the directory inside the tarball, and the tarball's name. */
export function artifactName(version, target) {
  return `chips-${version}-${target}`;
}

/** Node's own build for a platform, from nodejs.org. */
export function nodeDist(version, target) {
  const base = `https://nodejs.org/dist/v${version}`;
  const file = `node-v${version}-${target}.tar.gz`;
  return { file, url: `${base}/${file}`, sums: `${base}/SHASUMS256.txt` };
}

/** The SHA-256 a `SHASUMS256.txt` gives for a file, or undefined. */
export function shasumFor(sums, file) {
  for (const line of sums.split("\n")) {
    const [hash, name] = line.trim().split(/\s+/);
    if (name === file && /^[0-9a-f]{64}$/.test(hash ?? "")) return hash;
  }
  return undefined;
}

/** A `SHA256SUMS` file for the artifacts, in the format `shasum -a 256 -c` reads. */
export function sumsFile(entries) {
  return `${entries.map(({ hash, file }) => `${hash}  ${file}`).join("\n")}\n`;
}

/**
 * `bin/chips`. A link to it (`~/.local/bin/chips`) is followed back to the install, so the
 * runtime and the bundle beside it are found from wherever it was called.
 */
export const SHIM = `#!/bin/sh
# chips: the Node inside this install runs the CLI bundled beside it.
self=$0
while [ -L "$self" ]; do
  link=$(readlink "$self")
  case $link in
    /*) self=$link ;;
    *) self=$(dirname "$self")/$link ;;
  esac
done
root=$(cd "$(dirname "$self")/.." && pwd -P)
exec "$root/runtime/node" "$root/lib/chips.mjs" "$@"
`;

/**
 * The three dependencies that are not JavaScript. They stay outside the bundle, installed beside
 * it by the release's own Node so their binaries match its ABI and its platform: SQLite, sharp,
 * and esbuild, which bundles a project page's modules (ADR 0223). The optional `ws` speed-ups are
 * left out on purpose; `ws` runs without them.
 */
export const EXTERNAL = ["better-sqlite3", "sharp", "esbuild", "bufferutil", "utf-8-validate"];
export const NATIVE = ["better-sqlite3", "sharp", "esbuild"];

/**
 * Lets the CommonJS inside an ESM bundle use `require`, `__filename` and `__dirname`, which
 * several dependencies do at load.
 */
export const BANNER = [
  'import { createRequire as __chipsRequire } from "node:module";',
  'import { fileURLToPath as __chipsPath } from "node:url";',
  'import { dirname as __chipsDir } from "node:path";',
  "const require = __chipsRequire(import.meta.url);",
  "const __filename = __chipsPath(import.meta.url);",
  "const __dirname = __chipsDir(__filename);",
].join("\n");

/** esbuild's settings for the bundle: one ESM file for Node 22, natives outside. */
export function bundleOptions({ entry, outfile, version }) {
  return {
    entryPoints: [entry],
    outfile,
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node22",
    external: EXTERNAL,
    banner: { js: BANNER },
    define: { __CHIPS_RELEASE__: JSON.stringify(version) },
    legalComments: "none",
    logLevel: "warning",
  };
}

/**
 * What the natives ship that this platform never loads: better-sqlite3's sources and its builds
 * for every other platform, and sharp's WebAssembly fallback for machines with no native build.
 */
export function prunable(modules, target) {
  const sqlite = `${modules}/better-sqlite3`;
  return [
    `${sqlite}/deps`,
    `${sqlite}/src`,
    ...PLATFORM_BUILDS.filter((each) => each !== target).map(
      (each) => `${sqlite}/prebuilds/${each}.node`,
    ),
    `${modules}/@img/sharp-wasm32`,
  ];
}

/** The builds better-sqlite3 carries for every platform at once. */
export const PLATFORM_BUILDS = [
  "darwin-arm64",
  "darwin-x64",
  "linux-arm64",
  "linux-x64",
  "linuxmusl-arm64",
  "linuxmusl-x64",
  "win32-arm64",
  "win32-x64",
];

/** The versions of the native modules the server is built and tested against. */
export function nativeVersions(serverManifest) {
  const deps = serverManifest.dependencies ?? {};
  const out = {};
  for (const name of NATIVE) {
    const version = deps[name];
    if (typeof version !== "string" || !/^\d+\.\d+\.\d+$/.test(version)) {
      throw new Error(`server/package.json must pin ${name} to an exact version`);
    }
    out[name] = version;
  }
  return out;
}

/**
 * Who signs a release's SHA256SUMS, and for what (SEC-36): the principal and the namespace
 * `ssh-keygen -Y` signs and checks under, as `packaging/install.sh` checks them.
 */
export const SIGNING = { principal: "release@chipschat.ai", namespace: "chips-release" };

/**
 * The release key's line as `packaging/install.sh` carries it, in `ssh-keygen`'s allowed-signers
 * shape, and the public key on it: the one place the key is written, which signing is held to.
 */
export function signerOf(installScript) {
  const line = /^SIGNER='([^']+)'$/m.exec(installScript)?.[1];
  const key = line === undefined ? undefined : /(ssh-ed25519 [A-Za-z0-9+/]+=*)$/.exec(line)?.[1];
  if (line === undefined || key === undefined) {
    throw new Error("packaging/install.sh carries no SIGNER='… ssh-ed25519 …' line");
  }
  return { line, key };
}

/** Where the natives' manifest and lock live, from the repository's root (SEC-36). */
export const RUNTIME = "tools/release/runtime";

/** The release's own `package.json` beside the bundle: the natives, at the server's versions. */
export function runtimeManifest(serverManifest) {
  return {
    name: "chips-runtime",
    private: true,
    type: "module",
    dependencies: nativeVersions(serverManifest),
  };
}

/**
 * Why the natives' lock is not the one to install from, or nothing (SEC-36). A release installs
 * the natives with `npm ci`, so it takes them and everything under them as npm resolved them when
 * the lock was written, each checked against the integrity written there, and nothing a registry
 * says later: the manifest has to name the server's versions, and the lock has to hold them, every
 * package from npm's registry with its integrity.
 */
export function lockFault(serverManifest, manifest, lock) {
  const wanted = nativeVersions(serverManifest);
  const again = "run `pnpm release:lock`";
  if (JSON.stringify(manifest.dependencies) !== JSON.stringify(wanted)) {
    return `${RUNTIME}/package.json names other natives than server/package.json pins: ${again}`;
  }
  if (lock.lockfileVersion !== 3) return `${RUNTIME}/package-lock.json is not npm's lock v3`;
  for (const [name, version] of Object.entries(wanted)) {
    if (lock.packages?.[`node_modules/${name}`]?.version !== version) {
      return `${RUNTIME}/package-lock.json does not hold ${name} ${version}: ${again}`;
    }
  }
  const loose = uncheckedPackage(lock);
  if (loose !== undefined) {
    return `${RUNTIME}/package-lock.json takes ${loose} from outside npm's registry, or unchecked`;
  }
  return undefined;
}

const REGISTRY = "https://registry.npmjs.org/";

/** The first package in a lock that comes from anywhere but npm's registry, or has no integrity. */
function uncheckedPackage(lock) {
  return Object.entries(lock.packages ?? {}).find(
    ([path, entry]) =>
      path !== "" &&
      entry.link !== true &&
      (typeof entry.integrity !== "string" || !entry.resolved?.startsWith(REGISTRY)),
  )?.[0];
}

/**
 * The package an esbuild input or an installed path belongs to: the folder after its last
 * `node_modules/`. The repository's own code has none, and is covered by `LICENSE` and
 * `LICENSE-APACHE` (ADR 0128).
 */
export function packageRoot(path) {
  const marker = "node_modules/";
  const at = path.lastIndexOf(marker);
  if (at === -1) return undefined;
  const rest = path.slice(at + marker.length).split("/");
  const length = rest[0]?.startsWith("@") ? 2 : 1;
  if (rest.length < length || rest[length - 1] === "") return undefined;
  return path.slice(0, at + marker.length) + rest.slice(0, length).join("/");
}

/** The files in a package's folder that carry its licence or its notices. */
export const LICENCE_FILE = /^(licen[cs]e|copying|notice)([.-][^/]*)?$/i;

/**
 * `THIRD-PARTY-NOTICES.md`: one section per package, by name, with its licence files as its
 * authors ship them. `entries` are `{ name, version, license, texts: [{ file, text }] }`.
 */
export function noticesFile(entries) {
  const unique = new Map(entries.map((entry) => [`${entry.name}@${entry.version}`, entry]));
  const sections = [...unique.values()]
    .sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version))
    .map(({ name, version, license, texts }) => {
      const head = `## ${name} ${version}\n\nLicence: ${license ?? "not stated"}\n`;
      if (texts.length === 0) return `${head}\nThe package ships no licence file.\n`;
      const bodies = texts.map(({ file, text }) => {
        const fence = "`".repeat(
          Math.max(3, ...[...text.matchAll(/`+/g)].map(([run]) => run.length + 1)),
        );
        return `\n${file}:\n\n${fence}text\n${text.trimEnd()}\n${fence}\n`;
      });
      return head + bodies.join("");
    });
  return [
    "# Third-party notices",
    "",
    "This release of Chips is three kinds of code:",
    "",
    "- Chips' server, CLI and web app: the Functional Source License 1.1, in `LICENSE`.",
    "- Chips' protocol and harness SDK, bundled into `lib/chips.mjs`: Apache-2.0, in `LICENSE-APACHE`.",
    "- The software below, each under its own licence, as its authors ship it.",
    "",
    ...sections,
  ].join("\n");
}

/**
 * A README's own "Licence" or "Licensing" section, for a package that ships no licence file:
 * sharp's libvips build keeps the licence of every library it carries there.
 */
export function licenceSection(readme) {
  const lines = readme.split("\n");
  const start = lines.findIndex((line) => /^#{1,6}\s+licen[cs]/i.test(line));
  if (start === -1) return undefined;
  const level = /^#+/.exec(lines[start] ?? "")?.[0].length ?? 1;
  const after = lines.slice(start + 1).findIndex((line) => {
    const heading = /^(#+)\s/.exec(line);
    return heading !== null && (heading[1]?.length ?? 0) <= level;
  });
  const end = after === -1 ? lines.length : start + 1 + after;
  return lines.slice(start, end).join("\n").trim();
}
