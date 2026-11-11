/**
 * Join a Chips (ADR 0122): find the server, ask to join, and come back with the four things
 * `connect()` and a harness need — its address, the harness's id, its key and its room — with no
 * token copied by hand.
 *
 * ```ts
 * const me = await join({ link, name: "Tide" });
 * const chips = await connect(me);
 * ```
 *
 * Two ways in. With a link a person made in Chips (`<address>/j/<secret>`), it is allowed already
 * and is taken up at once. With only an address, it asks: the server answers with a code, which
 * `onCode` shows, and a person compares it and allows it; `join()` asks every few seconds until
 * they do. Either way what it is handed is kept — in the keychain, the Secret Service, or a file
 * only its user can read — and the next `join()` of the same name at the same server returns it
 * without asking again. A link it wasn't handed that key by is taken up all the same, and its key
 * kept in place of the old one: a person makes a new link when the old key is no good (the
 * harness removed, Chips started afresh). A link already used or lapsed gives the kept key back,
 * so a command run again as it was first written still starts.
 *
 * The server is found from the link, then `url`, then `CHIPS_URL`, then the `server.json` that
 * `chips up` writes on its own machine. A link to the server on this very machine is taken up at the
 * address `server.json` gives, its loopback one, and that is the address handed back and kept: the
 * address in the link is the machine's on its Wi-Fi, which changes with the network, and a harness
 * that kept it would go quiet the next time it did (the onboarding audit, Part 2, item 2).
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { hostname, networkInterfaces } from "node:os";
import { join as joinPath } from "node:path";
import {
  HARNESS_CAPABILITIES,
  JOIN_POLL_SECONDS,
  type JoinedHarness,
  parseJoinLink,
} from "@chipschat/protocol";
import { configHome, type Environment, type KeyStore, openKeyStore } from "./keep.js";
import { reportStep } from "./steps.js";

export interface JoinOptions {
  /** A link a person made in Chips: allowed already, good once, for fifteen minutes. */
  readonly link?: string | undefined;
  /** Where Chips is, to ask with a code when there is no link. */
  readonly url?: string | undefined;
  /** What the harness is called: what a person sees, and what its key is kept under. */
  readonly name: string;
  /** Its software and version, as a person allowing it is shown. */
  readonly software?: string | undefined;
  /** The machine it runs on; this machine's name unless said. */
  readonly machine?: string | undefined;
  /**
   * What it asks to be allowed (ADR 0046), when it asks with a code: `autonomy` unless said, since
   * a harness on this SDK reads the dial. A link carries what the person chose instead.
   */
  readonly wants?: readonly string[] | undefined;
  /** Shown the code to compare, when it asks; to standard error unless given. */
  readonly onCode?: ((code: string, url: string) => void) | undefined;
  /** Where the key is kept. `false` keeps nothing, and asks every time. */
  readonly keep?: KeyStore | false | undefined;
  /** `CHIPS_URL`, `CHIPS_CONFIG_HOME`, `CHIPS_NO_KEYCHAIN`, `HOME`: `process.env` unless given. */
  readonly env?: Environment | undefined;
  readonly fetch?: typeof fetch | undefined;
  /** Stops the asking. */
  readonly signal?: AbortSignal | undefined;
}

/** What `join()` comes back with: everything `connect()` takes, and the room it speaks in first. */
export interface Joined {
  readonly url: string;
  readonly harnessId: string;
  readonly token: string;
  readonly spaceId?: string | undefined;
  readonly capabilities: readonly string[];
}

/** Why it did not join, with the rule that refused it: `spent`, `expired`, `denied`, `too_many`… */
export class JoinError extends Error {
  override readonly name = "JoinError";
  constructor(
    readonly refusal: string,
    message: string,
  ) {
    super(message);
  }
}

/** Where `chips up` says the server on this machine is. */
function serverJsonUrl(env: Environment): string | undefined {
  try {
    const said = JSON.parse(readFileSync(joinPath(configHome(env), "server.json"), "utf8")) as {
      url?: unknown;
    };
    return typeof said.url === "string" && said.url !== "" ? said.url : undefined;
  } catch {
    return undefined;
  }
}

/** The server `chips up` runs on this machine: its own address, and the hosts that are this machine. */
function serverHere(
  env: Environment,
):
  | { readonly url: string; readonly port: string; readonly hosts: ReadonlySet<string> }
  | undefined {
  const url = serverJsonUrl(env);
  if (url === undefined) return undefined;
  let port: string;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:") return undefined;
    port = parsed.port;
  } catch {
    return undefined;
  }
  const hosts = new Set(["localhost", "127.0.0.1", "[::1]", hostname().toLowerCase()]);
  for (const each of Object.values(networkInterfaces()).flat()) {
    if (each === undefined) continue;
    hosts.add(each.family === "IPv6" ? `[${each.address}]` : each.address);
  }
  return { url: url.replace(/\/$/, ""), port, hosts };
}

/**
 * The address to reach a server at from here, when `url` is the server on this machine at another of
 * its addresses (its Wi-Fi one, say): `server.json`'s, which stays the same whatever network the
 * machine is on. Nothing when `url` is somewhere else.
 */
export function hereInstead(url: string, env: Environment): string | undefined {
  const here = serverHere(env);
  if (here === undefined) return undefined;
  try {
    const parsed = new URL(url);
    const same =
      parsed.protocol === "http:" &&
      parsed.port === here.port &&
      here.hosts.has(parsed.hostname.toLowerCase());
    return same ? here.url : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The accounts a key for the server on this machine may be kept under, after `url`'s own: one at
 * each of the machine's addresses, where a harness joined from a link before links to this machine
 * were taken up at its loopback address.
 */
function accountsHere(url: string, name: string, env: Environment): readonly string[] {
  const here = serverHere(env);
  if (here === undefined || here.url !== url.replace(/\/$/, "")) return [];
  return [...here.hosts]
    .filter((host) => /^\d+\.\d+\.\d+\.\d+$/.test(host) && host !== "127.0.0.1")
    .map((host) => accountOf(`http://${host}${here.port === "" ? "" : `:${here.port}`}`, name));
}

/** The server, and the link's secret when there is one. */
export function findServer(
  options: Pick<JoinOptions, "link" | "url">,
  env: Environment,
): { readonly url: string; readonly secret?: string } {
  if (options.link !== undefined) {
    const parsed = parseJoinLink(options.link);
    if (parsed === undefined) {
      throw new JoinError(
        "invalid",
        "That is not a join link: it looks like <address>/j/<secret>.",
      );
    }
    const here = hereInstead(parsed.url, env);
    return here === undefined ? parsed : { url: here, secret: parsed.secret };
  }
  const url = options.url ?? env["CHIPS_URL"] ?? serverJsonUrl(env);
  if (url === undefined || url === "") {
    throw new JoinError(
      "nowhere",
      "Where is Chips? Pass a link or url, set CHIPS_URL, or run chips up on this machine.",
    );
  }
  return { url: url.replace(/\/$/, "") };
}

/** The account a key is kept under: the harness's name, at its server. */
export function accountOf(url: string, name: string): string {
  return `harness:${name}@${url.replace(/\/$/, "")}`;
}

function joinedOf(answer: JoinedHarness): Joined {
  return {
    url: answer.url,
    harnessId: answer.harness_id,
    token: answer.token,
    ...(answer.space_id === undefined ? {} : { spaceId: answer.space_id }),
    capabilities: answer.capabilities,
  };
}

/** What is kept: the harness's four things, and which link handed them over, by its hash. */
interface Kept {
  readonly joined: Joined;
  readonly from?: string | undefined;
}

/** A link's secret as it is kept beside the key: hashed, since a key store is no place for it. */
function linkHash(secret: string): string {
  return createHash("sha256").update(secret).digest("base64url");
}

/** The first of `accounts` a key is kept under, and which. */
function keptAtAny(
  store: KeyStore | false,
  accounts: readonly string[],
): { readonly account: string; readonly kept: Kept } | undefined {
  for (const account of accounts) {
    const kept = keptAt(store, account);
    if (kept !== undefined) return { account, kept };
  }
  return undefined;
}

/**
 * A kept key whose server is this machine at an address that changes with the network, pointed at
 * the machine's own address instead, and kept so: a bridge whose service still names the old address
 * (`CHIPS_URL`) finds a key that reaches its server wherever the machine is.
 */
function rehomed(
  store: KeyStore | false,
  account: string,
  joined: Joined,
  env: Environment,
): Joined {
  const here = hereInstead(joined.url, env);
  if (here === undefined || here === joined.url) return joined;
  if (store !== false) {
    try {
      const record = JSON.parse(store.get(account) ?? "{}") as Record<string, unknown>;
      store.set(account, JSON.stringify({ ...record, url: here }));
    } catch {
      // Kept as it was: the address comes back changed all the same.
    }
  }
  return { ...joined, url: here };
}

function keptAt(store: KeyStore | false, account: string): Kept | undefined {
  if (store === false) return undefined;
  try {
    const kept = store.get(account);
    if (kept === undefined) return undefined;
    const { from, hello, ...parsed } = JSON.parse(kept) as Partial<Joined> & {
      from?: unknown;
      hello?: unknown;
    };
    if (typeof parsed.token !== "string" || typeof parsed.harnessId !== "string") return undefined;
    if (typeof parsed.url !== "string") return undefined;
    return {
      joined: { capabilities: [], ...parsed } as Joined,
      from: typeof from === "string" ? from : undefined,
    };
  } catch {
    return undefined;
  }
}

/**
 * The key `join()` takes up for a harness of this name when it has no link, at the server it would
 * find (`url`, `CHIPS_URL`, then `server.json`): what `chips connect <id>` with no link joins with,
 * so the harness keeps its rooms (ADR 0218's addendum of 24 October 2026). The server's address
 * comes back as well where one is found, kept key or not.
 */
export function keptJoin(
  name: string,
  options: Pick<JoinOptions, "url" | "keep" | "env"> = {},
): { readonly url?: string; readonly joined?: Joined } {
  // biome-ignore lint/style/noProcessEnv: as `join()`.
  const env = options.env ?? process.env;
  let url: string;
  try {
    url = findServer(options.url === undefined ? {} : { url: options.url }, env).url;
  } catch {
    return {};
  }
  const store = options.keep ?? openKeyStore(env);
  const found = keptAtAny(store, [accountOf(url, name), ...accountsHere(url, name, env)]);
  if (found === undefined) return { url };
  return { url, joined: rehomed(store, found.account, found.kept.joined, env) };
}

/** The refusals that mean a link was already taken up or has lapsed: the kept key still stands. */
const USED_UP: ReadonlySet<string> = new Set(["spent", "expired"]);

/** A refusal off the wire, as a `JoinError`. */
async function refused(response: Response): Promise<JoinError> {
  const body = (await response.json().catch(() => ({}))) as {
    error?: { message?: string; refusal?: string; code?: string };
  };
  return new JoinError(
    body.error?.refusal ?? body.error?.code ?? `http_${response.status}`,
    body.error?.message ?? `Chips answered ${response.status}.`,
  );
}

const wait = (ms: number, signal: AbortSignal | undefined) =>
  new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(new JoinError("stopped", "Stopped before a person decided."));
      },
      { once: true },
    );
  });

/** Ask with a code, and wait for a person. */
async function ask(
  url: string,
  options: JoinOptions,
  send: typeof fetch,
  machine: string,
): Promise<JoinedHarness> {
  const asked = await send(`${url}/v1/join`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      kind: "harness",
      name: options.name,
      machine,
      ...(options.software === undefined ? {} : { software: options.software }),
      wants: [...(options.wants ?? [HARNESS_CAPABILITIES.autonomy])],
    }),
  });
  if (asked.status !== 201) throw await refused(asked);
  const { request_id, secret, code, interval } = (await asked.json()) as {
    request_id: string;
    secret: string;
    code: string;
    interval?: number;
  };
  const show =
    options.onCode ??
    ((shown: string, where: string) =>
      process.stderr.write(`Allow ${options.name} in Chips at ${where}. Its code is ${shown}.\n`));
  show(code, url);
  for (;;) {
    await wait((interval ?? JOIN_POLL_SECONDS) * 1000, options.signal);
    const polled = await send(`${url}/v1/join/${request_id}/redeem`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ secret }),
    });
    if (polled.status === 202) continue;
    if (polled.status === 200) return (await polled.json()) as JoinedHarness;
    throw await refused(polled);
  }
}

/** Take up a link: allowed already, so the answer is the harness's at once. */
async function redeem(
  url: string,
  secret: string,
  options: JoinOptions,
  send: typeof fetch,
  machine: string,
): Promise<JoinedHarness> {
  const answered = await send(`${url}/v1/join/redeem`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      secret,
      name: options.name,
      machine,
      ...(options.software === undefined ? {} : { software: options.software }),
    }),
  });
  if (answered.status !== 200) throw await refused(answered);
  return (await answered.json()) as JoinedHarness;
}

/**
 * A request that never reached Chips, said in one line rather than a stack (the new-person
 * sweep's finding 3): a link made on Chips's own address, opened on a computer that can't reach
 * that address, which no answer from the server would ever explain. A cancel is still a cancel.
 */
function reaching(send: typeof fetch, url: string): typeof fetch {
  return async (input, init) => {
    try {
      return await send(input, init);
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") throw error;
      throw new JoinError(
        "unreachable",
        `Can't reach Chips at ${url} from this computer. It has to be on the same network as Chips, on its tailnet, or Chips has to be at an address this computer can reach.`,
      );
    }
  };
}

/** Take up the link, or ask with a code when there is none. */
function askOrRedeem(
  server: { readonly url: string; readonly secret?: string },
  options: JoinOptions,
): Promise<JoinedHarness> {
  const send = reaching(options.fetch ?? fetch, server.url);
  const machine = options.machine ?? hostname();
  return server.secret === undefined
    ? ask(server.url, options, send, machine)
    : redeem(server.url, server.secret, options, send, machine);
}

const usedUp = (error: unknown) => error instanceof JoinError && USED_UP.has(error.refusal);

export async function join(options: JoinOptions): Promise<Joined> {
  // biome-ignore lint/style/noProcessEnv: the environment is where a harness is told where Chips is.
  const env = options.env ?? process.env;
  reportStep("joining", {}, env);
  const server = findServer(options, env);
  const store = options.keep ?? openKeyStore(env);
  const account = accountOf(server.url, options.name);
  const found = keptAtAny(store, [account, ...accountsHere(server.url, options.name, env)]);
  const from = server.secret === undefined ? undefined : linkHash(server.secret);
  // No link, or the very link it was handed this key by: the key, and nothing asked.
  if (found !== undefined && (from === undefined || found.kept.from === from))
    return rehomed(store, found.account, found.kept.joined, env);

  let answer: JoinedHarness;
  try {
    answer = await askOrRedeem(server, options);
  } catch (error) {
    if (found !== undefined && usedUp(error))
      return rehomed(store, found.account, found.kept.joined, env);
    throw error;
  }
  const answered = joinedOf(answer);
  const joined = { ...answered, url: hereInstead(answered.url, env) ?? answered.url };
  // Handed over now, so its first words are due (`helloOnce`).
  if (store !== false) keepTheKey(store, account, { ...joined, from, hello: "due" });
  return joined;
}

/**
 * Keep what the link was spent for. Nowhere to keep it is said, not thrown: the key in hand still
 * connects, and the link is gone (the onboarding audit, Part 2, item 9).
 */
function keepTheKey(store: KeyStore, account: string, record: Record<string, unknown>): void {
  try {
    store.set(account, JSON.stringify(record));
  } catch (error) {
    const why = error instanceof Error ? error.message.split("\n")[0] : String(error);
    process.stderr.write(
      `Its key couldn't be kept here (${why}). It works while this runs. Once it stops, it needs a new link from Chips.\n`,
    );
  }
}

/**
 * Say a harness's first words in the room it joined, once: the card that followed its link waits
 * for them ("Said hello", ADR 0122), and a harness that only answers would leave it waiting. They
 * are due when `join()` is handed a key, and noted as said beside it, so a restart says nothing
 * again, a new link (a new key and room) says them again there, and a key kept from before says
 * none. `say` posts the words, as the harness or its Main agent; nothing is said when Chips gave it
 * no room. Whether it spoke comes back.
 */
export async function helloOnce(
  joined: Joined,
  options: Pick<JoinOptions, "name" | "keep" | "env"> & {
    readonly say: (spaceId: string) => Promise<unknown>;
  },
): Promise<boolean> {
  const { spaceId } = joined;
  if (spaceId === undefined) return false;
  // biome-ignore lint/style/noProcessEnv: as `join()`.
  const store = options.keep ?? openKeyStore(options.env ?? process.env);
  const account = accountOf(joined.url, options.name);
  let record: Record<string, unknown> | undefined;
  try {
    const kept = store === false ? undefined : store.get(account);
    record = kept === undefined ? undefined : (JSON.parse(kept) as Record<string, unknown>);
  } catch {
    record = undefined;
  }
  // Nothing kept means it asks every time, so every start is a first.
  const due = store === false || (record?.["hello"] === "due" && record["token"] === joined.token);
  if (!due) return false;
  await options.say(spaceId);
  if (store !== false) store.set(account, JSON.stringify({ ...record, hello: "said" }));
  return true;
}

/**
 * Whether a value was filled in, rather than left as the placeholder a command was copied with
 * (`API_SERVER_KEY=…`): a harness checks what it needs before it takes up a link, which works once.
 */
export function filledIn(value: string | undefined): value is string {
  if (value === undefined) return false;
  const given = value.trim();
  return given !== "" && !/^(?:…|\.\.\.|<[^>]*>)$/.test(given);
}

/** Forget what a harness was handed, so the next `join()` asks again: a key withdrawn, say. */
export function forgetJoin(
  options: Pick<JoinOptions, "link" | "url" | "name" | "keep" | "env">,
): void {
  // biome-ignore lint/style/noProcessEnv: as `join()`.
  const env = options.env ?? process.env;
  const store = options.keep ?? openKeyStore(env);
  if (store === false) return;
  store.remove(accountOf(findServer(options, env).url, options.name));
}
