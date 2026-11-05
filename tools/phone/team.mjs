/**
 * Whether the team Xcode signs with is a free one, which decides whether push and a link domain can
 * be in the build at all. Pure, so it is tested (`tools/guardrails/phone-team.test.ts`) without
 * Xcode.
 *
 * Why it exists: Xcode's preferences keep `isFreeProvisioningTeam` from the day the Apple ID was
 * added, and do not change it when the person enrols in the Apple Developer Program. On 11 October
 * 2026 they still said "Arjun Gupta (Personal Team)", free, for a team Apple had called
 * "Arjun Gupta (Individual)" since at least 11 September — so every `pnpm phone` took push out of
 * the build for a month, and *Notify me on this phone* refused. The team's own provisioning
 * profiles say what Apple thinks: a free team's last seven days, a paid team's a year.
 */

/**
 * What a free team cannot sign: push, and a domain whose links open the app. `app.config.js`
 * leaves both out when `CHIPS_IOS_FREE_TEAM` says the team is free; these are for when it did not.
 */
const PAID_ONLY = [
  { name: "push", key: /\s*<key>aps-environment<\/key>\s*<string>[^<]*<\/string>/ },
  {
    name: "the link domain",
    key: /\s*<key>com\.apple\.developer\.associated-domains<\/key>\s*<array>[\s\S]*?<\/array>/,
  },
];

/** An app's entitlements as a free team can sign them, and the names of what that took out. */
export function freeTeamEntitlements(text) {
  const there = PAID_ONLY.filter(({ key }) => key.test(text));
  return {
    text: there.reduce((left, { key }) => left.replace(key, ""), text),
    gone: there.map(({ name }) => name),
  };
}

/** Longer than this and Apple did not issue the profile to a free team. */
const FREE_PROFILE_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

/** One decoded profile (`security cms -D`): its team, the team's name and how long it lasts. */
export function profileFacts(xml) {
  const date = (key) => new RegExp(`<key>${key}</key>\\s*<date>([^<]+)</date>`).exec(xml)?.[1];
  const team = /<key>TeamIdentifier<\/key>\s*<array>\s*<string>([^<]+)<\/string>/.exec(xml)?.[1];
  const from = Date.parse(date("CreationDate") ?? "");
  const to = Date.parse(date("ExpirationDate") ?? "");
  if (team === undefined || Number.isNaN(from) || Number.isNaN(to)) return undefined;
  const name = /<key>TeamName<\/key>\s*<string>([^<]+)<\/string>/.exec(xml)?.[1];
  return { team, name, days: (to - from) / DAY_MS };
}

/** Every team Xcode's preferences list, by its ID. */
export function teamIds(prefsText) {
  return [...prefsText.matchAll(/"teamID"\s*=>\s*"([^"]+)"/g)].map((found) => found[1]);
}

/**
 * The team, and whether it is free: `{ id, label, free }`, or nothing when Xcode lists none.
 * Xcode's preferences say which team; its profiles, when there are any, say what it is called now
 * and whether it is paid — the preferences' "(Personal Team)" is as old as their flag.
 */
export function teamOf(prefsText, profileXmls) {
  const id = /"teamID"\s*=>\s*"([^"]+)"/.exec(prefsText)?.[1];
  if (id === undefined) return undefined;
  const label = /"teamName"\s*=>\s*"([^"]+)"/.exec(prefsText)?.[1];
  const ours = profileXmls.map(profileFacts).filter((facts) => facts?.team === id);
  if (ours.length > 0) {
    const free = ours.every((facts) => facts.days <= FREE_PROFILE_DAYS);
    return { id, label: ours.find((facts) => facts.name)?.name ?? label, free };
  }
  const free = /"isFreeProvisioningTeam"\s*=>\s*(1|true)/.test(prefsText);
  return { id, label, free };
}
