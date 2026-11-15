/**
 * Which bridge releases may arrive on their own (bridges-keep-current.md, rules 2, 6 and 9): the
 * site's `bridges.json`, signed with Chips's release key beside it as `bridges.json.sig`, written by
 * `tools/release/sign-bridges.mjs` on the machine that holds the key after each bridge release.
 *
 * Read once a day riding the sweep, as the release feed is; a failed read is tried again after ten
 * minutes, doubling up to a day, keeping the last good list for a week. A list whose signature
 * doesn't verify is no list: nothing is taken from it. Nor is one signed before the list this
 * server already read, which is an older list served again (kept in memory: a server that starts
 * again has read none). The time it was read is the site's (its answer's `Date`), not this
 * machine's, so a wrong clock here neither rushes a release nor holds it.
 */

import type { Clock, Logger } from "@chipschat/platform";
import { retryAfterMs, UPDATES_FIRST_MS, UPDATES_KEPT_MS } from "./releases.js";
import { BRIDGES_NAMESPACE, RELEASE_KEY, sshsigVerifies } from "./sshsig.js";

/** One release of a bridge the list allows. */
export interface ListedRelease {
  readonly version: string;
  /** npm's `dist.integrity` for it: the SHA-512 the bytes must have. */
  readonly integrity: string;
  /** When npm published it, as the registry's `time` said when the list was signed. */
  readonly published: string;
  /** The oldest computer it works with, from its `engines.chips`; none, any. */
  readonly computer?: string | undefined;
  /**
   * The oldest release of the harness behind it that it works with, by the card it is kept for
   * (`hermes`, `claude-code`), from its `engines` under that name (rule 13); none, any.
   */
  readonly needs?: Readonly<Record<string, string>> | undefined;
  /** Taken without the wait. */
  readonly urgent?: true | undefined;
}

export interface ListedPackage {
  readonly releases: readonly ListedRelease[];
  /** Releases taken back: a computer running one goes to the newest allowed, without the wait. */
  readonly withdrawn: readonly string[];
}

export interface BridgeList {
  readonly packages: Readonly<Record<string, ListedPackage>>;
  /** When it was signed, as it says itself; none in a list from before lists said. */
  readonly signed?: string | undefined;
  /** When it was read, by the site's clock. */
  readonly at: string;
  /** When it was read, by this machine's. */
  readonly heardAt: number;
}

export interface BridgeListReader {
  readonly read: () => BridgeList | undefined;
  readonly tick: () => void;
}

/** The most of either file read: the list is a few kilobytes. */
export const BRIDGES_MAX_BYTES = 256 * 1024;
/**
 * How long a list goes on being acted on after it was last read. Past it nothing new is taken: a
 * computer that can reach npm but not the site would otherwise go on taking releases from a list a
 * withdrawal can no longer reach.
 */
export const BRIDGES_KEPT_FOR_MS = 7 * 24 * 60 * 60 * 1000;

const VERSION = /^\d+\.\d+\.\d+$/;
const INTEGRITY = /^sha512-[A-Za-z0-9+/]+=*$/;

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const CARD = /^[a-z0-9][a-z0-9-]{0,40}$/;

/** The harness floors a release names, each a card's id and a release number; none, none. */
function needsOf(value: unknown): Record<string, string> | undefined {
  if (!isObject(value)) return undefined;
  const floors = Object.entries(value).filter(
    (entry): entry is [string, string] =>
      CARD.test(entry[0]) && typeof entry[1] === "string" && VERSION.test(entry[1]),
  );
  return floors.length === 0 ? undefined : Object.fromEntries(floors);
}

function releaseOf(value: unknown): ListedRelease | undefined {
  if (!isObject(value)) return undefined;
  const { version, integrity, published, computer, urgent } = value;
  const needs = needsOf(value["needs"]);
  if (typeof version !== "string" || !VERSION.test(version)) return undefined;
  if (typeof integrity !== "string" || !INTEGRITY.test(integrity)) return undefined;
  if (typeof published !== "string" || Number.isNaN(Date.parse(published))) return undefined;
  return {
    version,
    integrity,
    published,
    ...(typeof computer === "string" && VERSION.test(computer) ? { computer } : {}),
    ...(needs === undefined ? {} : { needs }),
    ...(urgent === true ? { urgent: true as const } : {}),
  };
}

/** The packages in a `bridges.json`, each release checked; one that isn't a release is left out. */
export function readBridgeList(body: unknown, at: string, heardAt: number): BridgeList {
  if (!isObject(body) || body["format"] !== 1 || !isObject(body["packages"])) {
    throw new Error("not a bridge list");
  }
  const packages: Record<string, ListedPackage> = {};
  for (const [name, each] of Object.entries(body["packages"])) {
    if (!isObject(each)) continue;
    const releases = Array.isArray(each["releases"])
      ? each["releases"].flatMap((one) => releaseOf(one) ?? [])
      : [];
    const withdrawn = Array.isArray(each["withdrawn"])
      ? each["withdrawn"].filter((one): one is string => typeof one === "string")
      : [];
    packages[name] = { releases, withdrawn };
  }
  const signed = body["signed"];
  const when = typeof signed === "string" && !Number.isNaN(Date.parse(signed)) ? signed : undefined;
  return { packages, at, heardAt, ...(when === undefined ? {} : { signed: when }) };
}

/**
 * Whether `next` was signed before the list held: an older list served again, which would let out
 * a release since taken back. A list from before lists said when they were signed is older than
 * any that says.
 */
export function signedBefore(next: BridgeList, held: BridgeList | undefined): boolean {
  if (held?.signed === undefined) return false;
  return next.signed === undefined || Date.parse(next.signed) < Date.parse(held.signed);
}

async function bytesOf(answer: Response): Promise<Uint8Array> {
  const bytes = new Uint8Array(await answer.arrayBuffer());
  if (bytes.length > BRIDGES_MAX_BYTES) throw new Error("too big");
  return bytes;
}

export function bridgeList(deps: {
  /** `CHIPS_BRIDGES`: the URL of `bridges.json`. Absent or `off`, nothing is read. */
  readonly source: string | undefined;
  readonly clock: Clock;
  readonly logger: Logger;
  readonly fetch?: typeof fetch;
  readonly key?: string;
}): BridgeListReader {
  const source = deps.source === "off" ? undefined : deps.source;
  const fetching = deps.fetch ?? fetch;
  const startedAt = deps.clock.nowMs();
  let list: BridgeList | undefined;
  let dueAt = startedAt + UPDATES_FIRST_MS;
  let reading = false;
  let failures = 0;

  const key = deps.key ?? RELEASE_KEY;
  /** When the site answered, by its own clock; this machine's when it didn't say. */
  const siteTime = (answer: Response): string => {
    const said = Date.parse(answer.headers.get("date") ?? "");
    return new Date(Number.isNaN(said) ? deps.clock.nowMs() : said).toISOString();
  };

  const readNow = async () => {
    if (source === undefined) return;
    const [answer, signature] = await Promise.all([
      fetching(source, { signal: AbortSignal.timeout(20_000) }),
      fetching(`${source}.sig`, { signal: AbortSignal.timeout(20_000) }),
    ]);
    if (!answer.ok || !signature.ok) {
      throw new Error(`answered ${answer.status} and ${signature.status}`);
    }
    const bytes = await bytesOf(answer);
    const armoured = new TextDecoder().decode(await bytesOf(signature));
    if (!sshsigVerifies(bytes, armoured, BRIDGES_NAMESPACE, key)) {
      throw new Error("its signature isn't the release key's");
    }
    const next = readBridgeList(
      JSON.parse(new TextDecoder().decode(bytes)),
      siteTime(answer),
      deps.clock.nowMs(),
    );
    if (signedBefore(next, list)) throw new Error("it was signed before the list already read");
    list = next;
  };

  return {
    // A list not read again for a week is acted on no more, until it is.
    read: () =>
      list !== undefined && deps.clock.nowMs() - list.heardAt <= BRIDGES_KEPT_FOR_MS
        ? list
        : undefined,
    tick: () => {
      if (source === undefined || reading || deps.clock.nowMs() < dueAt) return;
      reading = true;
      readNow()
        .then(() => {
          failures = 0;
          dueAt = deps.clock.nowMs() + UPDATES_KEPT_MS;
        })
        .catch((error: unknown) => {
          failures += 1;
          dueAt = deps.clock.nowMs() + retryAfterMs(failures);
          deps.logger.warn({ err: error, source }, "bridge list not read");
        })
        .finally(() => {
          reading = false;
        });
    },
  };
}
