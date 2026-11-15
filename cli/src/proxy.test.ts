/**
 * The machine's proxy, for what a release's Chips fetches on its own (bridges-keep-current.md,
 * rule 8): where it is found, and that a fetch really goes through it, plain and tunnelled.
 */

import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  fetchThrough,
  machineFetch,
  machineProxy,
  PROXY_KEPT_MS,
  proxyFromEnv,
  proxyFromScutil,
} from "./proxy.js";

const HERE = "localhost,127.0.0.1,::1";

describe("the proxy the environment names", () => {
  it("is none when it names none, or names one as nothing", () => {
    expect(proxyFromEnv({})).toBeUndefined();
    expect(proxyFromEnv({ HTTPS_PROXY: "", http_proxy: "  ", NO_PROXY: "example.com" })).toBe(
      undefined,
    );
  });

  it("is read in either case, with or without http:// in front, as curl reads it", () => {
    expect(proxyFromEnv({ HTTPS_PROXY: "http://proxy.example:8080" })).toEqual({
      HTTPS_PROXY: "http://proxy.example:8080/",
      NO_PROXY: HERE,
    });
    expect(
      proxyFromEnv({ https_proxy: "proxy.example:3128", http_proxy: "other.example" }),
    ).toEqual({
      HTTPS_PROXY: "http://proxy.example:3128/",
      HTTP_PROXY: "http://other.example/",
      NO_PROXY: HERE,
    });
    // A name and a password in it are kept: the proxy asks for them.
    expect(proxyFromEnv({ HTTPS_PROXY: "http://me:secret@proxy.example:8080" })?.HTTPS_PROXY).toBe(
      "http://me:secret@proxy.example:8080/",
    );
  });

  it("takes ALL_PROXY for whichever kind names none of its own", () => {
    expect(
      proxyFromEnv({ ALL_PROXY: "http://all.example:1", HTTP_PROXY: "http://plain.example:2" }),
    ).toEqual({
      HTTPS_PROXY: "http://all.example:1/",
      HTTP_PROXY: "http://plain.example:2/",
      NO_PROXY: HERE,
    });
  });

  it("leaves out a proxy Node's agents can't speak to, or one that isn't an address", () => {
    expect(proxyFromEnv({ ALL_PROXY: "socks5://proxy.example:1080" })).toBeUndefined();
    expect(proxyFromEnv({ HTTPS_PROXY: "http://[not an address" })).toBeUndefined();
  });

  it("never sends this machine through it, whatever NO_PROXY says", () => {
    expect(
      proxyFromEnv({ HTTPS_PROXY: "http://p:1", no_proxy: " .corp.example , localhost ,," })
        ?.NO_PROXY,
    ).toBe(".corp.example,localhost,127.0.0.1,::1");
  });
});

describe("the proxy System Settings names", () => {
  const printed = (lines: string[]) => `<dictionary> {\n${lines.join("\n")}\n}\n`;
  const EXCEPTIONS = [
    "  ExceptionsList : <array> {",
    "    0 : *.local",
    "    1 : 169.254/16",
    "    2 : intranet.example",
    "  }",
  ];

  it("is none on a Mac with no proxy set, as `scutil --proxy` prints one", () => {
    expect(proxyFromScutil(printed([...EXCEPTIONS, "  FTPPassive : 1"]))).toBeUndefined();
    expect(proxyFromScutil("")).toBeUndefined();
  });

  it("is each kind that is on, with its port, and the exceptions as hosts not to send through it", () => {
    expect(
      proxyFromScutil(
        printed([
          ...EXCEPTIONS,
          "  HTTPEnable : 1",
          "  HTTPPort : 8080",
          "  HTTPProxy : proxy.example",
          "  HTTPSEnable : 1",
          "  HTTPSPort : 8443",
          "  HTTPSProxy : secure.example",
        ]),
      ),
    ).toEqual({
      HTTPS_PROXY: "http://secure.example:8443/",
      HTTP_PROXY: "http://proxy.example:8080/",
      // `*.local` as Node writes it; the address range names no host, and is left out.
      NO_PROXY: `.local,intranet.example,${HERE}`,
    });
  });

  it("leaves out a kind that is set and switched off, or on with no host", () => {
    expect(
      proxyFromScutil(
        printed([
          "  HTTPEnable : 0",
          "  HTTPPort : 8080",
          "  HTTPProxy : proxy.example",
          "  HTTPSEnable : 1",
          "  HTTPSProxy : secure.example",
        ]),
      ),
    ).toEqual({ HTTPS_PROXY: "http://secure.example/", NO_PROXY: HERE });
    expect(proxyFromScutil(printed(["  HTTPSEnable : 1", "  HTTPSPort : 8443"]))).toBeUndefined();
  });

  it("reads nothing from a proxy chosen by a script", () => {
    expect(
      proxyFromScutil(
        printed(["  ProxyAutoConfigEnable : 1", "  ProxyAutoConfigURLString : http://wpad/x.pac"]),
      ),
    ).toBeUndefined();
  });
});

describe("the machine's proxy", () => {
  it("is the environment's first, and System Settings' only on a Mac with none there", async () => {
    let asked = 0;
    const scutil = async () => {
      asked += 1;
      return "<dictionary> {\n  HTTPSEnable : 1\n  HTTPSPort : 8443\n  HTTPSProxy : mac.example\n}\n";
    };
    const env = { HTTPS_PROXY: "http://env.example:1" };
    expect((await machineProxy({ env, platform: "darwin", scutil }))?.HTTPS_PROXY).toBe(
      "http://env.example:1/",
    );
    expect(asked).toBe(0);
    expect((await machineProxy({ env: {}, platform: "darwin", scutil }))?.HTTPS_PROXY).toBe(
      "http://mac.example:8443/",
    );
    expect(await machineProxy({ env: {}, platform: "linux", scutil })).toBeUndefined();
    expect(asked).toBe(1);
    // `scutil` that can't be run says nothing.
    expect(
      await machineProxy({ env: {}, platform: "darwin", scutil: async () => undefined }),
    ).toBeUndefined();
  });
});

const closing: (() => Promise<unknown>)[] = [];
afterEach(async () => {
  for (const close of closing.splice(0)) await close();
});

const listening = (server: net.Server) =>
  new Promise<number>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve((server.address() as net.AddressInfo).port));
    closing.push(
      () =>
        new Promise((done) => {
          // A request left open by a test (one that never answers) mustn't hold the close up.
          if (server instanceof http.Server) server.closeAllConnections();
          server.close(done);
        }),
    );
  });

/**
 * A proxy as a machine behind one has: a plain request for `http://registry.test/…` is answered
 * from `origin`, and a CONNECT is tunnelled to `tunnelTo`. Everything asked of it is kept.
 */
async function proxyTo(origin: number | undefined, tunnelTo?: number) {
  const asked: string[] = [];
  const sockets = new Set<net.Socket>();
  const server = http.createServer((request, response) => {
    asked.push(`${request.method} ${request.url}`);
    const path = new URL(request.url ?? "/").pathname;
    const onward = http.get(
      { host: "127.0.0.1", port: origin, path, headers: request.headers },
      (answer) => {
        response.writeHead(answer.statusCode ?? 502, answer.headers);
        answer.pipe(response);
      },
    );
    // An origin closed under a request it never answered (a test's own end) ends the answer too.
    onward.on("error", () => response.destroy());
  });
  server.on("connect", (request, client: net.Socket) => {
    asked.push(`CONNECT ${request.url}`);
    if (tunnelTo === undefined) {
      client.end("HTTP/1.1 502 Bad Gateway\r\n\r\n");
      return;
    }
    const upstream = net.connect(tunnelTo, "127.0.0.1", () => {
      client.write("HTTP/1.1 200 Connection Established\r\n\r\n");
      upstream.pipe(client);
      client.pipe(upstream);
    });
    for (const each of [client, upstream]) {
      sockets.add(each);
      each.on("error", () => undefined);
    }
  });
  const port = await listening(server);
  closing.unshift(async () => {
    for (const each of sockets) each.destroy();
    server.closeAllConnections();
  });
  return { url: `http://127.0.0.1:${port}`, asked };
}

/** An origin that says what it was asked, as JSON, and redirects, and answers with nothing. */
function originHandler(request: http.IncomingMessage, response: http.ServerResponse) {
  if (request.url === "/moved") {
    response.writeHead(302, { location: "/pkg" }).end();
    return;
  }
  if (request.url === "/round") {
    response.writeHead(302, { location: "/round" }).end();
    return;
  }
  if (request.url === "/nothing") {
    response.writeHead(204).end();
    return;
  }
  if (request.url === "/slow") return;
  response.writeHead(request.url === "/missing" ? 404 : 200, {
    "content-type": "application/json",
    date: "Fri, 20 Nov 2026 10:00:00 GMT",
  });
  response.end(JSON.stringify({ path: request.url, accept: request.headers.accept ?? null }));
}

describe("a fetch through the proxy", () => {
  it("asks the proxy for a plain address whole, and answers as fetch does", async () => {
    const origin = http.createServer(originHandler);
    const proxy = await proxyTo(await listening(origin));
    const fetching = fetchThrough({ HTTP_PROXY: proxy.url, NO_PROXY: HERE });
    const answer = await fetching("http://registry.test/pkg", {
      headers: { accept: "application/vnd.npm.install-v1+json" },
      signal: AbortSignal.timeout(5000),
    });
    expect(answer.ok).toBe(true);
    expect(answer.status).toBe(200);
    expect(answer.headers.get("date")).toBe("Fri, 20 Nov 2026 10:00:00 GMT");
    expect(await answer.json()).toEqual({
      path: "/pkg",
      accept: "application/vnd.npm.install-v1+json",
    });
    expect(proxy.asked).toEqual(["GET http://registry.test/pkg"]);

    // Bytes, as a download is read; an answer that isn't a success is still an answer.
    const bytes = new Uint8Array(await (await fetching("http://registry.test/pkg")).arrayBuffer());
    expect(JSON.parse(new TextDecoder().decode(bytes))).toMatchObject({ path: "/pkg" });
    const missing = await fetching(new URL("http://registry.test/missing"));
    expect([missing.ok, missing.status]).toEqual([false, 404]);
    await missing.arrayBuffer();
  });

  it("follows a redirect as fetch does, stops at one that goes round, and reads an empty answer", async () => {
    const origin = http.createServer(originHandler);
    const proxy = await proxyTo(await listening(origin));
    const fetching = fetchThrough({ HTTP_PROXY: proxy.url, NO_PROXY: HERE });
    expect(await (await fetching("http://registry.test/moved")).json()).toMatchObject({
      path: "/pkg",
    });
    await expect(fetching("http://registry.test/round")).rejects.toThrow("redirects");
    const nothing = await fetching("http://registry.test/nothing");
    expect([nothing.status, await nothing.text()]).toEqual([204, ""]);
  });

  it("reaches this machine itself without the proxy", async () => {
    const origin = http.createServer(originHandler);
    const port = await listening(origin);
    const proxy = await proxyTo(port);
    const fetching = fetchThrough({ HTTP_PROXY: proxy.url, NO_PROXY: HERE });
    expect(await (await fetching(`http://127.0.0.1:${port}/pkg`)).json()).toMatchObject({
      path: "/pkg",
    });
    expect(proxy.asked).toEqual([]);
  });

  it("says a failure as fetch says it, and stops at the signal it is given", async () => {
    const origin = http.createServer(originHandler);
    const proxy = await proxyTo(await listening(origin));
    // Nothing listens where this proxy is said to be.
    const dead = net.createServer();
    const port = await listening(dead);
    await new Promise((done) => dead.close(done));
    const nowhere = fetchThrough({ HTTP_PROXY: `http://127.0.0.1:${port}`, NO_PROXY: HERE });
    await expect(nowhere("http://registry.test/pkg")).rejects.toThrow(TypeError);
    await expect(nowhere("http://registry.test/pkg")).rejects.toThrow("fetch failed");

    const fetching = fetchThrough({ HTTP_PROXY: proxy.url, NO_PROXY: HERE });
    const began = Date.now();
    await expect(
      fetching("http://registry.test/slow", { signal: AbortSignal.timeout(150) }),
    ).rejects.toMatchObject({ name: expect.stringMatching(/^(Abort|Timeout)Error$/) });
    expect(Date.now() - began).toBeLessThan(3000);
  });

  it("sends nothing but a GET with no body", async () => {
    const fetching = fetchThrough({ HTTP_PROXY: "http://127.0.0.1:9", NO_PROXY: HERE });
    await expect(
      fetching("http://registry.test/x", { method: "POST", body: "{}" }),
    ).rejects.toThrow("Only a GET with no body");
    await expect(fetching("http://registry.test/x", { method: "DELETE" })).rejects.toThrow(
      "Only a GET with no body",
    );
  });

  /** A key and a certificate for `registry.test`, made by this machine's openssl, if it has one. */
  function certificate(): { key: string; cert: string } | undefined {
    const folder = mkdtempSync(join(tmpdir(), "chips-proxy-cert-"));
    try {
      execFileSync(
        "openssl",
        [
          "req",
          "-x509",
          "-newkey",
          "rsa:2048",
          "-nodes",
          "-days",
          "2",
          "-subj",
          "/CN=registry.test",
          "-addext",
          "subjectAltName=DNS:registry.test",
          "-keyout",
          join(folder, "key.pem"),
          "-out",
          join(folder, "cert.pem"),
        ],
        { stdio: "ignore" },
      );
      return {
        key: readFileSync(join(folder, "key.pem"), "utf8"),
        cert: readFileSync(join(folder, "cert.pem"), "utf8"),
      };
    } catch {
      return undefined;
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  }

  it("tunnels a secure address through it, and checks the certificate of the far end, not the proxy's", async (test) => {
    const made = certificate();
    if (made === undefined) {
      test.skip();
      return;
    }
    const origin = https.createServer(made, originHandler);
    const proxy = await proxyTo(undefined, await listening(origin));
    const env = { HTTPS_PROXY: proxy.url, NO_PROXY: HERE };
    const answer = await fetchThrough(env, { ca: made.cert })("https://registry.test/pkg");
    expect(await answer.json()).toMatchObject({ path: "/pkg" });
    expect(proxy.asked).toEqual(["CONNECT registry.test:443"]);
    // A certificate nobody this machine trusts signed is refused, tunnel or no tunnel.
    await expect(fetchThrough(env)("https://registry.test/pkg")).rejects.toThrow("fetch failed");
  });
});

describe("the machine's fetch", () => {
  it("is Node's own with no proxy, and goes through one that is set, looked up every ten minutes", async () => {
    const origin = http.createServer(originHandler);
    const proxy = await proxyTo(await listening(origin));
    const plainAsked: string[] = [];
    const plain = (async (input: Parameters<typeof fetch>[0]) => {
      plainAsked.push(String(input));
      return new Response("plain");
    }) as typeof fetch;
    let now = 0;
    let lookups = 0;
    const env: Record<string, string | undefined> = {};
    const fetching = machineFetch({
      env,
      platform: "darwin",
      scutil: async () => {
        lookups += 1;
        return "";
      },
      now: () => now,
      plain,
    });
    expect(await (await fetching("http://registry.test/pkg")).text()).toBe("plain");
    expect(await (await fetching("http://registry.test/pkg")).text()).toBe("plain");
    expect([plainAsked.length, lookups]).toEqual([2, 1]);

    // A proxy is set: not followed before the ten minutes are up, then it is.
    env["HTTP_PROXY"] = proxy.url;
    now = PROXY_KEPT_MS - 1;
    expect(await (await fetching("http://registry.test/pkg")).text()).toBe("plain");
    now = PROXY_KEPT_MS;
    expect(await (await fetching("http://registry.test/pkg")).json()).toMatchObject({
      path: "/pkg",
    });
    expect(proxy.asked).toEqual(["GET http://registry.test/pkg"]);

    // And taken away again.
    delete env["HTTP_PROXY"];
    now = 2 * PROXY_KEPT_MS;
    expect(await (await fetching("http://registry.test/pkg")).text()).toBe("plain");
  });
});
