/**
 * The phone app's web target, served for Playwright.
 *
 * Two jobs, and the second is the reason this file exists rather than a line in the config.
 * `expo start --web` would serve the app; it would not proxy `/v1` to `chipsd`, and `chipsd`
 * sends no CORS headers — deliberately, since every request it takes is same-origin and signed
 * (`routes/web.ts`). A browser on the bundler's origin calling the server's would be refused at
 * the preflight, so the suite would be testing the browser's security model rather than the app.
 *
 * So: the exported bundle is served, and `/v1` — requests and the socket both — is proxied to
 * the server on the same origin. The app then pairs with this address and reaches `chipsd`
 * exactly as it does on a phone, where the two really are different machines and the signature
 * is what stands in for an origin.
 *
 * Serving the export rather than the dev server also means the suite runs the bundle that would
 * ship, Hermes-minified and tree-shaken, rather than one Metro assembled for a developer.
 */

import { spawnSync } from "node:child_process";
import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer, request as httpRequest, type IncomingMessage } from "node:http";
import { connect } from "node:net";
import { extname, join, normalize } from "node:path";
import type { Duplex } from "node:stream";

const PORT = Number(process.env["CHIPS_MOBILE_E2E_PORT"] ?? "5198");
const SERVER_PORT = Number(process.env["CHIPS_E2E_SERVER_PORT"] ?? "4432");
const OUT = process.env["CHIPS_MOBILE_E2E_DIST"] ?? join(import.meta.dirname, "..", "dist-web");

type Respond = Parameters<Parameters<typeof createServer>[0]>[1];

const TYPES: Readonly<Record<string, string>> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ttf": "font/ttf",
  ".woff2": "font/woff2",
  ".wasm": "application/wasm",
  ".mp4": "video/mp4",
};

/** Build the web bundle, unless one is already there and the caller said to keep it. */
function build(): void {
  if (
    process.env["CHIPS_MOBILE_E2E_SKIP_EXPORT"] === "true" &&
    existsSync(join(OUT, "index.html"))
  ) {
    return;
  }
  const built = spawnSync(
    "pnpm",
    ["exec", "expo", "export", "--platform", "web", "--output-dir", OUT, "--clear"],
    { cwd: join(import.meta.dirname, ".."), stdio: "inherit" },
  );
  if (built.status !== 0) throw new Error("expo export failed");
}

/** A file under the export, or nothing when the path leaves it or names no file. */
function fileFor(url: string): string | undefined {
  const path = normalize(decodeURIComponent(url.split("?")[0] ?? "/")).replace(/^(\.\.[/\\])+/, "");
  const candidate = join(OUT, path);
  if (!candidate.startsWith(OUT)) return undefined;
  if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  return undefined;
}

/** The bytes a `Range` header asks of a file `size` long, from and to; none when it asks for none. */
function rangeOf(
  asked: string | undefined,
  size: number,
): { readonly start: number; readonly end: number } | "unsatisfiable" | undefined {
  const range = /^bytes=(\d*)-(\d*)$/.exec(asked ?? "");
  if (range === null) return undefined;
  const [, from = "", to = ""] = range;
  const start = from === "" ? size - Number(to) : Number(from);
  const end = from === "" || to === "" ? size - 1 : Math.min(Number(to), size - 1);
  return start <= end && start >= 0 ? { start, end } : "unsatisfiable";
}

/**
 * A file, whole, or the bytes its `Range` asks for: a video seeks by asking for them, and Chromium
 * will not seek one whose server never says it answers ranges (the film, ADR 0217).
 */
function send(file: string, asked: string | undefined, respond: Respond): void {
  const type = TYPES[extname(file)] ?? "application/octet-stream";
  const size = statSync(file).size;
  const range = rangeOf(asked, size);
  if (range === "unsatisfiable") {
    respond.writeHead(416, { "content-range": `bytes */${size}` }).end();
    return;
  }
  if (range === undefined) {
    respond.writeHead(200, {
      "content-type": type,
      "content-length": size,
      "accept-ranges": "bytes",
    });
    createReadStream(file).pipe(respond);
    return;
  }
  respond.writeHead(206, {
    "content-type": type,
    "content-length": range.end - range.start + 1,
    "content-range": `bytes ${range.start}-${range.end}/${size}`,
    "accept-ranges": "bytes",
  });
  createReadStream(file, range).pipe(respond);
}

/** Everything under `/v1` goes to the server, headers and body untouched. */
function proxy(incoming: IncomingMessage, respond: Respond): void {
  const upstream = httpRequest(
    {
      host: "127.0.0.1",
      port: SERVER_PORT,
      method: incoming.method ?? "GET",
      path: incoming.url ?? "/",
      headers: { ...incoming.headers, host: `127.0.0.1:${SERVER_PORT}` },
    },
    (answer) => {
      respond.writeHead(answer.statusCode ?? 502, answer.headers);
      answer.pipe(respond);
    },
  );
  upstream.on("error", () => {
    respond.writeHead(502).end("the server is not there");
  });
  incoming.pipe(upstream);
}

const server = createServer((incoming, respond) => {
  const url = incoming.url ?? "/";
  if (url.startsWith("/v1")) {
    proxy(incoming, respond);
    return;
  }
  const file = fileFor(url);
  if (file === undefined) {
    // Single-page: every other path is the app's own router's business.
    respond.writeHead(200, { "content-type": TYPES[".html"] as string });
    createReadStream(join(OUT, "index.html")).pipe(respond);
    return;
  }
  send(file, incoming.headers.range, respond);
});

/** The socket, raw: an upgrade is bytes both ways once the handshake is through. */
server.on("upgrade", (incoming: IncomingMessage, socket: Duplex, head: Buffer) => {
  const upstream = connect(SERVER_PORT, "127.0.0.1", () => {
    const lines = Object.entries(incoming.headers).map(
      ([name, value]) => `${name}: ${String(value)}`,
    );
    upstream.write(`GET ${incoming.url ?? "/"} HTTP/1.1\r\n${lines.join("\r\n")}\r\n\r\n`);
    if (head.length > 0) upstream.write(head);
    upstream.pipe(socket);
    socket.pipe(upstream);
  });
  const drop = () => {
    socket.destroy();
    upstream.destroy();
  };
  upstream.on("error", drop);
  socket.on("error", drop);
});

build();
server.listen(PORT, "127.0.0.1", () => {
  process.stdout.write(`the phone app's web target is on http://127.0.0.1:${PORT}\n`);
});
