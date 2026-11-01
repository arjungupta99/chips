/**
 * A stand-in npm registry (ADR 0218): the packages in the tarballs it is handed, listed and served
 * as npm's registry lists and serves them, each with the SHA-512 `chips connect` checks. The connect
 * kit serves a bridge's freshly packed tarball from it, and journeys J7 and J8 serve all four, so
 * what is tested is the real download path with nothing sent to npm.
 *
 * ```ts
 * const registry = await standInRegistry(["chipschat-hermes-1.0.0.tgz"]);
 * // CHIPS_NPM_REGISTRY=registry.url chips connect hermes '<link>'
 * await registry.stop();
 * ```
 */

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { basename } from "node:path";

export interface StandInRegistry {
  /** What `CHIPS_NPM_REGISTRY` is set to. */
  readonly url: string;
  /** The packages it serves, by name: each one's versions. */
  readonly packages: ReadonlyMap<string, readonly string[]>;
  /** The paths it was asked for, oldest first. */
  readonly asked: () => readonly string[];
  /** Another tarball served from now on: a bridge packed once the registry is up. */
  add: (tarball: string) => void;
  stop: () => Promise<void>;
}

interface Held {
  readonly bytes: Buffer;
  readonly file: string;
  readonly integrity: string;
  readonly shasum: string;
}

/** A tarball's `package/package.json`, as npm packed it. */
function manifestOf(tarball: string): { readonly name: string; readonly version: string } {
  const text = execFileSync("tar", ["-xzOf", tarball, "package/package.json"], {
    encoding: "utf8",
  });
  return JSON.parse(text) as { name: string; version: string };
}

export async function standInRegistry(tarballs: readonly string[] = []): Promise<StandInRegistry> {
  const held = new Map<string, Map<string, Held>>();
  const add = (tarball: string) => {
    const { name, version } = manifestOf(tarball);
    const bytes = readFileSync(tarball);
    const versions = held.get(name) ?? new Map<string, Held>();
    versions.set(version, {
      bytes,
      file: basename(tarball),
      integrity: `sha512-${createHash("sha512").update(bytes).digest("base64")}`,
      shasum: createHash("sha1").update(bytes).digest("hex"),
    });
    held.set(name, versions);
  };
  for (const tarball of tarballs) add(tarball);

  const asked: string[] = [];
  let base = "";
  const server = createServer((request, response) => {
    const path = decodeURIComponent(new URL(request.url ?? "/", "http://registry").pathname);
    asked.push(path);
    const [name, file] = path.slice(1).split("/-/");
    const versions = held.get(name ?? "");
    if (versions === undefined) {
      response.writeHead(404, { "content-type": "application/json" }).end('{"error":"Not found"}');
      return;
    }
    if (file !== undefined) {
      const found = [...versions.values()].find((each) => each.file === file);
      if (found === undefined) response.writeHead(404).end();
      else response.writeHead(200, { "content-type": "application/octet-stream" }).end(found.bytes);
      return;
    }
    const listed = Object.fromEntries(
      [...versions.entries()].map(([version, each]) => [
        version,
        {
          name,
          version,
          dist: {
            tarball: `${base}/${name}/-/${each.file}`,
            integrity: each.integrity,
            shasum: each.shasum,
          },
        },
      ]),
    );
    const latest = [...versions.keys()].at(-1) ?? "";
    response
      .writeHead(200, { "content-type": "application/json" })
      .end(JSON.stringify({ name, "dist-tags": { latest }, versions: listed }));
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const address = server.address();
  base = `http://127.0.0.1:${typeof address === "object" && address !== null ? address.port : 0}`;

  return {
    url: base,
    get packages() {
      return new Map([...held.entries()].map(([name, versions]) => [name, [...versions.keys()]]));
    },
    asked: () => [...asked],
    add,
    stop: () => new Promise((done) => server.close(() => done())),
  };
}
