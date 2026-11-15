/**
 * The machine's proxy, for what a release's Chips fetches on its own: the site's list of releases,
 * its signed list of bridge releases, and a bridge release from npm (bridges-keep-current.md,
 * rule 8). Node's `fetch` reads no proxy, so behind one that every request must go through, a
 * computer would read no list and take no release, and say only that npm couldn't be reached.
 *
 * Where it is found:
 * - the environment: `HTTPS_PROXY`, `HTTP_PROXY`, `ALL_PROXY` and `NO_PROXY`, in either case, as
 *   curl reads them. `chips up` carries them from the shell it is run in into the service's file,
 *   since launchd and systemd read no shell profile;
 * - on a Mac with none of those, the proxy set in System Settings, as `scutil --proxy` prints it.
 *   A proxy chosen by a script (a PAC file) is not read: Chips runs no script from the network.
 *
 * This machine itself is never reached through it. With no proxy, the fetch is Node's own, as
 * before.
 */

import { execFile } from "node:child_process";
import http from "node:http";
import https from "node:https";
import { Readable } from "node:stream";

/** The proxy as Node's agents take it (`proxyEnv`): the same names the environment uses. */
export interface ProxyEnv {
  readonly HTTPS_PROXY?: string;
  readonly HTTP_PROXY?: string;
  readonly NO_PROXY: string;
}

type Env = Readonly<Record<string, string | undefined>>;

/** What is never reached through a proxy: this machine. */
const HERE = ["localhost", "127.0.0.1", "::1"];

const said = (env: Env, name: string): string | undefined => {
  const value = env[name] ?? env[name.toLowerCase()];
  return value === undefined || value.trim() === "" ? undefined : value.trim();
};

/** A proxy's address as a URL: `proxy.example:8080` is `http://proxy.example:8080`. */
function proxyUrl(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const whole = /^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? value : `http://${value}`;
  try {
    const url = new URL(whole);
    // Node's agents speak to a proxy over HTTP or HTTPS, not SOCKS.
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : undefined;
  } catch {
    return undefined;
  }
}

const without = (list: readonly string[]) =>
  [...new Set([...list.map((each) => each.trim()).filter((each) => each !== ""), ...HERE])].join(
    ",",
  );

/** The proxy the environment names, or none. */
export function proxyFromEnv(env: Env): ProxyEnv | undefined {
  const all = proxyUrl(said(env, "ALL_PROXY"));
  const secure = proxyUrl(said(env, "HTTPS_PROXY")) ?? all;
  const plain = proxyUrl(said(env, "HTTP_PROXY")) ?? all;
  if (secure === undefined && plain === undefined) return undefined;
  return {
    ...(secure === undefined ? {} : { HTTPS_PROXY: secure }),
    ...(plain === undefined ? {} : { HTTP_PROXY: plain }),
    NO_PROXY: without((said(env, "NO_PROXY") ?? "").split(",")),
  };
}

/** One kind of proxy in what `scutil --proxy` printed: on, with a host, and its port if it says. */
function scutilProxy(printed: string, kind: "HTTP" | "HTTPS"): string | undefined {
  const value = (key: string) =>
    new RegExp(`^\\s*${kind}${key}\\s*:\\s*(\\S+)\\s*$`, "m").exec(printed)?.[1];
  if (value("Enable") !== "1") return undefined;
  const host = value("Proxy");
  if (host === undefined) return undefined;
  const port = value("Port");
  return proxyUrl(port === undefined ? host : `${host}:${port}`);
}

/**
 * The proxy System Settings names, from what `scutil --proxy` printed, or none. Its exceptions are
 * the hosts not to go through it: `*.local` is `.local` to Node, and an address range
 * (`169.254/16`) names no host Chips fetches from, so it is left out.
 */
export function proxyFromScutil(printed: string): ProxyEnv | undefined {
  const secure = scutilProxy(printed, "HTTPS");
  const plain = scutilProxy(printed, "HTTP");
  if (secure === undefined && plain === undefined) return undefined;
  const list = /ExceptionsList\s*:\s*<array>\s*\{([^}]*)\}/.exec(printed)?.[1] ?? "";
  const exceptions = [...list.matchAll(/^\s*\d+\s*:\s*(\S+)\s*$/gm)]
    .map((found) => found[1] ?? "")
    .filter((each) => !each.includes("/"))
    .map((each) => each.replace(/^\*\./, "."));
  return {
    ...(secure === undefined ? {} : { HTTPS_PROXY: secure }),
    ...(plain === undefined ? {} : { HTTP_PROXY: plain }),
    NO_PROXY: without(exceptions),
  };
}

/** `scutil --proxy`, and what it printed; nothing when it couldn't be run. */
const scutil = (): Promise<string | undefined> =>
  new Promise((resolve) => {
    execFile("/usr/sbin/scutil", ["--proxy"], { timeout: 5000 }, (error, stdout) =>
      resolve(error === null ? stdout : undefined),
    );
  });

/** The machine's proxy now: the environment's, else on a Mac the one System Settings names. */
export async function machineProxy(machine: {
  readonly env: Env;
  readonly platform: string;
  readonly scutil?: () => Promise<string | undefined>;
}): Promise<ProxyEnv | undefined> {
  const named = proxyFromEnv(machine.env);
  if (named !== undefined || machine.platform !== "darwin") return named;
  const printed = await (machine.scutil ?? scutil)();
  return printed === undefined ? undefined : proxyFromScutil(printed);
}

/** How many redirects are followed, as `fetch` follows them. */
const REDIRECTS_MOST = 5;

const headersOf = (given: unknown): Record<string, string> =>
  given === undefined ? {} : Object.fromEntries(new Headers(given as never).entries());

/** What a request is made with, again for each redirect it follows. */
interface Asking {
  readonly agents: { readonly http: http.Agent; readonly https: https.Agent };
  readonly headers: Record<string, string>;
  readonly signal: AbortSignal | undefined;
}

/** Where an answer sends the request on to, when it is a redirect that names somewhere. */
function movedTo(answer: http.IncomingMessage, from: URL): URL | undefined {
  const status = answer.statusCode ?? 0;
  const to = answer.headers.location;
  return status >= 300 && status < 400 && to !== undefined ? new URL(to, from) : undefined;
}

/** Node's answer as the `Response` a `fetch` gives: its status, its headers, its body as it comes. */
function responseOf(answer: http.IncomingMessage): Response {
  const status = answer.statusCode ?? 0;
  const headers = new Headers();
  for (const [name, value] of Object.entries(answer.headers)) {
    for (const each of Array.isArray(value) ? value : [value ?? ""]) headers.append(name, each);
  }
  // An answer with nothing in it takes no body, and its socket is let go.
  const empty = status === 204 || status === 304;
  if (empty) answer.resume();
  return new Response(empty ? null : (Readable.toWeb(answer) as ReadableStream<Uint8Array>), {
    status,
    statusText: answer.statusMessage ?? "",
    headers,
  });
}

/** A failure as `fetch` says it: a TypeError with the cause, or the signal's own error. */
const failureOf = (error: Error): Error =>
  error.name === "AbortError" || error.name === "TimeoutError"
    ? error
    : new TypeError("fetch failed", { cause: error });

/** One request through Node's own agent for the proxy, answered as `fetch` answers. */
function requestThrough(asking: Asking, url: URL, redirects: number): Promise<Response> {
  return new Promise((resolve, reject) => {
    const secure = url.protocol === "https:";
    const request = (secure ? https : http).request(
      url,
      {
        method: "GET",
        headers: asking.headers,
        agent: secure ? asking.agents.https : asking.agents.http,
        ...(asking.signal === undefined ? {} : { signal: asking.signal }),
      },
      (answer) => {
        const moved = movedTo(answer, url);
        if (moved === undefined) {
          resolve(responseOf(answer));
          return;
        }
        answer.resume();
        if (redirects >= REDIRECTS_MOST) {
          reject(new TypeError(`fetch failed: more than ${REDIRECTS_MOST} redirects`));
          return;
        }
        requestThrough(asking, moved, redirects + 1).then(resolve, reject);
      },
    );
    request.on("error", (error) => reject(failureOf(error)));
    request.end();
  });
}

/**
 * A `fetch` for reading, through the proxy: every request Chips makes on its own is a GET with no
 * body, so that is all it sends. Anything else is refused rather than sent some other way.
 * `trust`: a certificate authority of a test's own, beside the machine's.
 */
export function fetchThrough(proxy: ProxyEnv, trust: { readonly ca?: string } = {}): typeof fetch {
  // `proxyEnv` is Node's own since 22.21 and 24.5; the types this builds against are older.
  const through = { proxyEnv: { ...proxy } } as http.AgentOptions;
  const agents = {
    http: new http.Agent(through),
    https: new https.Agent({ ...through, ...(trust.ca === undefined ? {} : { ca: trust.ca }) }),
  };
  return async (input, init) => {
    const method = (init?.method ?? "GET").toUpperCase();
    if (method !== "GET" || (init?.body !== undefined && init.body !== null)) {
      throw new TypeError("Only a GET with no body is sent through the machine's proxy.");
    }
    const address = typeof input === "string" || input instanceof URL ? input : input.url;
    const asking = { agents, headers: headersOf(init?.headers), signal: init?.signal ?? undefined };
    return await requestThrough(asking, new URL(address), 0);
  };
}

/** How long the machine's proxy is taken as read before it is looked up again. */
export const PROXY_KEPT_MS = 10 * 60_000;

/**
 * A `fetch` that goes through the machine's proxy when it has one and is Node's own when it has
 * none, looked up again every ten minutes: a proxy turned on in System Settings is followed
 * without Chips being started again.
 */
export function machineFetch(machine: {
  readonly env: Env;
  readonly platform: string;
  readonly scutil?: () => Promise<string | undefined>;
  readonly now?: () => number;
  readonly plain?: typeof fetch;
}): typeof fetch {
  const now = machine.now ?? Date.now;
  let known:
    | { readonly at: number; readonly key: string; readonly fetch: typeof fetch }
    | undefined;
  return async (input, init) => {
    if (known === undefined || now() - known.at >= PROXY_KEPT_MS) {
      const proxy = await machineProxy(machine);
      const key = JSON.stringify(proxy ?? null);
      // The same proxy as before keeps its agents, and the connections they hold.
      known = {
        at: now(),
        key,
        fetch:
          known?.key === key
            ? known.fetch
            : proxy === undefined
              ? (machine.plain ?? fetch)
              : fetchThrough(proxy),
      };
    }
    return await known.fetch(input, init);
  };
}
