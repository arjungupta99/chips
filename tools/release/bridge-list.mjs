/**
 * What goes in `bridges.json`, the signed list of bridge releases a computer may take on its own
 * (`docs/proposals/bridges-keep-current.md`, rule 6), worked out from what npm lists and the marks
 * kept from the list before. Apart from the script that fetches, writes and signs
 * (`sign-bridges.mjs`), so it can be tested without npm or the release key.
 */

/** The most releases of each major listed: plenty for any computer away a while. */
export const KEEP = 20;

/** The bridges the gallery's cards name (`package`, `@chipschat/<name>@<major>`). */
export function packagesOf(cards) {
  const list = Array.isArray(cards) ? cards : (cards?.connectors ?? []);
  return [
    ...new Set(
      list
        .map((card) => /^(@[a-z0-9-]+\/[a-z0-9-]+)@\d+$/.exec(card?.package ?? "")?.[1])
        .filter((name) => name !== undefined),
    ),
  ];
}

/** `@chipschat/acp@1.0.31` as its package and version. */
export function named(spec) {
  const found = /^(@[a-z0-9-]+\/[a-z0-9-]+)@(\d+\.\d+\.\d+)$/.exec(spec);
  if (found === null) throw new Error(`${spec} is not <package>@<version>`);
  return { name: found[1], version: found[2] };
}

/** The oldest computer a release names in `engines.chips` (`>=1.3.0`), if it names one. */
const floorOf = (manifest) => /^>=\s*(\d+\.\d+\.\d+)$/.exec(manifest.engines?.chips ?? "")?.[1];

/** What `engines` names that isn't a harness: what runs the bridge, and the computer it talks to. */
const NOT_A_HARNESS = new Set(["node", "npm", "chips"]);

/** The ids of the cards kept on a package (`hermes`; `claude-code` and `codex` on the ACP bridge). */
export function cardsOn(cards, name) {
  const list = Array.isArray(cards) ? cards : (cards?.connectors ?? []);
  return list
    .filter((card) => typeof card?.package === "string" && card.package.startsWith(`${name}@`))
    .map((card) => card.id);
}

/**
 * The oldest release of the harness behind it that a bridge release names in `engines`, by the
 * card it is kept for (`"hermes": ">=0.9.0"`): rule 13. A floor written any other way, or for a
 * card that isn't kept on the package, is a slip of the hand: listed without the floor it meant,
 * the release would reach computers whose harness it can't work with.
 */
/** The floor an `engines` range names, written the one way a computer reads it: `>=1.2.3`. */
const floorIn = (range) =>
  /^>=\s*(\d+\.\d+\.\d+)$/.exec(typeof range === "string" ? range : "")?.[1];

function needsOf(name, version, manifest, ids) {
  const harnesses = Object.entries(manifest.engines ?? {}).filter(
    ([engine]) => !NOT_A_HARNESS.has(engine),
  );
  for (const [engine, range] of harnesses) {
    if (floorIn(range) === undefined) {
      throw new Error(
        `${name} ${version} names engines.${engine} as ${JSON.stringify(range)}: write the oldest it works with as ">=1.2.3", or deprecate the release`,
      );
    }
    if (ids !== undefined && !ids.includes(engine)) {
      throw new Error(
        `${name} ${version} names engines.${engine}, and no card kept on ${name} is called ${engine} (${ids.join(", ") || "none"})`,
      );
    }
  }
  return harnesses.length === 0
    ? undefined
    : Object.fromEntries(harnesses.map(([engine, range]) => [engine, floorIn(range)]));
}

/**
 * A mark asked for on the command line, checked before anything is signed: a package the cards
 * don't name, or a version npm doesn't list, is a slip of the hand, and a mark that silently did
 * nothing would leave a bad release out there.
 */
function marked(specs, packuments, what) {
  return specs.map((spec) => {
    const { name, version } = named(spec);
    if (packuments[name] === undefined) {
      throw new Error(`${what} ${spec}: the cards name no bridge ${name}`);
    }
    if (packuments[name].versions?.[version] === undefined) {
      throw new Error(`${what} ${spec}: npm lists no ${name} ${version}`);
    }
    return { name, version };
  });
}

/** One package's releases as the list has them, newest first, `KEEP` of each major. */
function releasesOf(name, packument, urgent, ids) {
  const releases = Object.entries(packument.versions ?? {})
    .filter(([version, manifest]) => /^\d+\.\d+\.\d+$/.test(version) && !manifest.deprecated)
    .filter(([, manifest]) => /(^|\s)sha512-/.test(manifest.dist?.integrity ?? ""))
    .map(([version, manifest]) => ({
      version,
      integrity: manifest.dist.integrity.split(/\s+/).find((each) => each.startsWith("sha512-")),
      published: packument.time?.[version],
      ...(floorOf(manifest) === undefined ? {} : { computer: floorOf(manifest) }),
      ...(urgent.has(version) ? { urgent: true } : {}),
    }))
    .filter((each) => typeof each.published === "string")
    .sort((a, b) => b.published.localeCompare(a.published));
  const byMajor = new Map();
  for (const each of releases) {
    const major = each.version.split(".")[0];
    const list = byMajor.get(major) ?? [];
    if (list.length < KEEP) list.push(each);
    byMajor.set(major, list);
  }
  // Only the releases listed are read for what they need: an old one left out holds nothing up.
  return [...byMajor.values()].flat().map((each) => {
    const needs = needsOf(name, each.version, packument.versions[each.version], ids);
    const { urgent: rushed, ...rest } = each;
    return {
      ...rest,
      ...(needs === undefined ? {} : { needs }),
      ...(rushed === true ? { urgent: true } : {}),
    };
  });
}

/**
 * The list: for each package, the releases npm lists that may arrive on their own, and the ones
 * taken back. `kept` is the list signed before, whose marks stay: a release withdrawn once is
 * withdrawn until someone edits the file by hand, and a release npm has deprecated is withdrawn
 * too. `signed` is when this list was made, so a computer never takes an older list over a newer.
 * `cards`, when given, are the gallery's: a harness a release names must be one kept on its package.
 */
export function bridgeListOf({ packuments, kept, withdraw = [], urgent = [], signed, cards }) {
  const taken = marked(withdraw, packuments, "--withdraw");
  const rushed = marked(urgent, packuments, "--urgent");
  const packages = {};
  for (const [name, packument] of Object.entries(packuments)) {
    const before = kept?.packages?.[name];
    const withdrawn = new Set([
      ...(before?.withdrawn ?? []),
      ...taken.filter((each) => each.name === name).map((each) => each.version),
      ...Object.entries(packument.versions ?? {})
        .filter(([, manifest]) => manifest.deprecated)
        .map(([version]) => version),
    ]);
    const hurried = new Set([
      ...(before?.releases ?? [])
        .filter((each) => each.urgent === true)
        .map((each) => each.version),
      ...rushed.filter((each) => each.name === name).map((each) => each.version),
    ]);
    packages[name] = {
      releases: releasesOf(
        name,
        packument,
        hurried,
        cards === undefined ? undefined : cardsOn(cards, name),
      ),
      withdrawn: [...withdrawn].sort(),
    };
  }
  return { format: 1, signed, packages };
}
