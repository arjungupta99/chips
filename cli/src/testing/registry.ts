/**
 * A stand-in npm registry in memory, and tarballs packed as npm packs them, for the tests of
 * `chips connect` (ADR 0218). Each package's versions are listed as the registry lists them, with
 * a tarball address and the SHA-512 it must match.
 */

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/** A package's tarball as npm packs it: everything under `package/`. */
export function packed(
  dir: string,
  manifest: Record<string, unknown>,
  files: Record<string, string>,
): Uint8Array {
  const root = mkdtempSync(join(dir, "pack-"));
  mkdirSync(join(root, "package", "dist"), { recursive: true });
  writeFileSync(join(root, "package", "package.json"), JSON.stringify(manifest));
  for (const [path, text] of Object.entries(files))
    writeFileSync(join(root, "package", path), text);
  execFileSync("tar", ["-czf", join(root, "out.tgz"), "-C", root, "package"]);
  return new Uint8Array(readFileSync(join(root, "out.tgz")));
}

export const sriOf = (bytes: Uint8Array) =>
  `sha512-${createHash("sha512").update(bytes).digest("base64")}`;

/** A registry in memory: each package's versions, their tarballs, and what was asked of it. */
export function standIn(
  packages: Record<
    string,
    Record<string, { bytes: Uint8Array; integrity?: string; deprecated?: string }>
  >,
) {
  const asked: string[] = [];
  const fetching = (async (input: string | URL) => {
    const url = String(input);
    asked.push(url);
    for (const [name, versions] of Object.entries(packages)) {
      const encoded = `@${encodeURIComponent(name.slice(1))}`;
      if (url === `https://registry.test/${encoded}`) {
        const listed = Object.fromEntries(
          Object.entries(versions).map(([version, each]) => [
            version,
            {
              version,
              ...(each.deprecated === undefined ? {} : { deprecated: each.deprecated }),
              dist: {
                tarball: `https://registry.test/${name}/-/${version}.tgz`,
                integrity: each.integrity ?? sriOf(each.bytes),
              },
            },
          ]),
        );
        return Response.json({ name, versions: listed });
      }
      for (const [version, each] of Object.entries(versions)) {
        if (url === `https://registry.test/${name}/-/${version}.tgz`)
          return new Response(Buffer.from(each.bytes));
      }
    }
    return new Response("not found", { status: 404 });
  }) as typeof fetch;
  return { fetch: fetching, asked };
}
