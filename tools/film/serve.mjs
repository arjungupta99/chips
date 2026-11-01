/**
 * Files served for the render (ADR 0217): a web build, with its routes falling back to its page,
 * or the scene and the frames the composer draws from. Each on a port of its own, chosen by the
 * system, on this machine only.
 */

import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ttf": "font/ttf",
  ".woff2": "font/woff2",
  ".wasm": "application/wasm",
};

/** The file a path names: a single file, or one in the folder mounted nearest, or that folder's page. */
function fileFor(path, mounts, files, fallback) {
  if (files[path] !== undefined) return files[path];
  const mounted = Object.entries(mounts)
    .filter(([prefix]) => path.startsWith(prefix))
    .sort((a, b) => b[0].length - a[0].length)[0];
  if (mounted === undefined) return undefined;
  const [at, dir] = mounted;
  const inside = join(dir, path.slice(at.length));
  if (inside.startsWith(dir) && existsSync(inside) && statSync(inside).isFile()) return inside;
  return fallback === undefined ? undefined : join(dir, fallback);
}

/**
 * Serve folders by the path they are mounted at (`{ "/": dir }` for a build, whose missing paths are
 * its page), and single files by their path. Answers the address and a way to stop.
 */
export async function serve(mounts, { files = {}, fallback } = {}) {
  const server = createServer((req, res) => {
    const path = normalize(decodeURIComponent(new URL(req.url ?? "/", "http://x").pathname));
    const file = fileFor(path, mounts, files, fallback);
    if (file === undefined || !existsSync(file)) {
      res.writeHead(404);
      res.end();
      return;
    }
    res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" });
    createReadStream(file).pipe(res);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  return { url: `http://127.0.0.1:${port}`, close: () => new Promise((r) => server.close(r)) };
}
