/**
 * The web app, at `/`.
 *
 * `chips serve` prints a QR that opens `http://<this machine>:4431/#pair=…`, and a browser
 * that opens it needs a page to be there — on the port the API is on, so that everything the
 * page asks for is same-origin and a device signature covers a path this server recognises.
 * This serves the build Vite makes — `index.html` and the hashed files under `assets/` — and
 * answers every path that names no file with `index.html`, which is what a single-page app
 * needs for a link into a space to open the app rather than an error envelope.
 *
 * It serves files from one directory and nothing outside it, whatever the path says; and when
 * there is no build to serve, `/` says so in a sentence rather than answering `not_found`.
 */

import { readFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import type { Context, Hono } from "hono";
import type { GatewayDeps, GatewayEnv } from "../context.js";

const TYPES: Readonly<Record<string, string>> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".map": "application/json",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
};

/** Vite names every file under `assets/` by its content, so one can be cached for ever. */
const A_YEAR = "public, max-age=31536000, immutable";

/**
 * What the page may load, and from where (Gate 2, condition 2). Everything comes from this
 * origin — the scripts and styles Vite built, the attachments it fetches, the socket it opens;
 * `'self'` covers a WebSocket to the same host and port — but a picture in a message's words.
 * Inline styles are allowed because the windowed list sizes its spacers with them and a
 * rendered card carries a colour or two; inline scripts are not, and nothing else is loaded
 * from anywhere. A frame is refused here too, as `x-frame-options` already says.
 */
export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  // A picture a message draws in its words is fetched from where it lives (ADR 0068), as the
  // desktop shell already allows.
  "img-src 'self' data: blob: http: https:",
  // A voice note and a video play from an object URL of the bytes the device fetched (ADR 0053,
  // ADR 0054). Without this, `default-src` refuses it, and the page can play neither.
  "media-src 'self' blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "worker-src 'self' blob:",
  // A page a harness sent is drawn in a frame loaded from this origin's page door (ADR 0201),
  // which answers a policy of its own; nothing from anywhere else is framed.
  "frame-src 'self'",
  "manifest-src 'self'",
  // A PDF's first page is previewed in an <object> of an object URL, which only this page's own
  // script can make. No plugin, and nothing from any other address.
  "object-src blob:",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const NOT_BUILT_PAGE = `<!doctype html>
<html lang="en">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Chips</title>
<body style="font: 16px/1.5 system-ui, sans-serif; max-width: 40rem; margin: 4rem auto; padding: 0 1rem">
<h1>Chips is running.</h1>
<p>The web app is not built, so there is no page to show here yet. From the checkout, run</p>
<pre>pnpm web:build</pre>
<p>and reload. The API is answering on <code>/v1</code> meanwhile.</p>
</body>
</html>
`;

type Answer =
  | { readonly kind: "not_found" }
  | { readonly kind: "not_built" }
  | { readonly kind: "file"; readonly bytes: Uint8Array<ArrayBuffer>; readonly served: string };

const NOT_FOUND: Answer = { kind: "not_found" };
const NOT_BUILT: Answer = { kind: "not_built" };

export function registerWebRoutes(app: Hono<GatewayEnv>, deps: GatewayDeps): void {
  app.get("/*", async (c) => {
    const path = decodedPath(c.req.url);
    if (path === undefined || path === "/v1" || path.startsWith("/v1/")) return c.notFound();
    const answer = await answerFor(deps.webDir, path);
    if (answer.kind === "not_found") return c.notFound();
    if (answer.kind === "not_built") return notBuilt(c);
    return page(c, answer.bytes, answer.served);
  });
}

/**
 * What a path gets: the file it names, the page for a path that names none, and — when the
 * build is not there — a sentence for the page and `not_found` for a file.
 */
async function answerFor(webDir: string | undefined, path: string): Promise<Answer> {
  const wantsFile = extname(path) !== "";
  const missing = wantsFile ? NOT_FOUND : NOT_BUILT;
  if (webDir === undefined) return missing;
  const served = wantsFile ? path : "/index.html";
  const target = within(resolve(webDir), served);
  if (target === undefined) return NOT_FOUND;
  const bytes = await read(target);
  return bytes === undefined ? missing : { kind: "file", bytes, served };
}

/** The path as the client meant it; a request that cannot be decoded names nothing. */
function decodedPath(url: string): string | undefined {
  try {
    return decodeURIComponent(new URL(url).pathname);
  } catch {
    return undefined;
  }
}

/** The file a path names, or nothing when the path would leave the directory. */
function within(root: string, path: string): string | undefined {
  const target = resolve(root, `.${path}`);
  return target === root || target.startsWith(`${root}${sep}`) ? target : undefined;
}

async function read(target: string): Promise<Uint8Array<ArrayBuffer> | undefined> {
  try {
    return new Uint8Array(await readFile(target));
  } catch {
    return undefined;
  }
}

function page(c: Context<GatewayEnv>, bytes: Uint8Array<ArrayBuffer>, path: string): Response {
  const type = TYPES[extname(path).toLowerCase()] ?? "application/octet-stream";
  const headers: Record<string, string> = {
    "content-type": type,
    "cache-control": path.startsWith("/assets/") ? A_YEAR : "no-cache",
    "x-content-type-options": "nosniff",
  };
  // The page holds approvals; nobody gets to draw it inside a frame of their own, and nothing
  // it did not ship with gets to run in it.
  if (type.startsWith("text/html")) {
    headers["x-frame-options"] = "DENY";
    headers["content-security-policy"] = CONTENT_SECURITY_POLICY;
  }
  return c.body(bytes, 200, headers);
}

function notBuilt(c: Context<GatewayEnv>): Response {
  return c.html(NOT_BUILT_PAGE, 200, {
    "x-frame-options": "DENY",
    "content-security-policy": CONTENT_SECURITY_POLICY,
    "cache-control": "no-cache",
  });
}
