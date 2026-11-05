/**
 * The app's config: `app.json`, with whose app it is taken from the environment, so that a copy of
 * this repository builds under its own Apple team and Expo account (ADR 0260; "Under your own Apple
 * team" in `contribute/phone.md`). With none of these set, it is `app.json` as it stands: Chips'
 * own.
 *
 *   CHIPS_APPLE_TEAM_ID     the Apple team that signs the app
 *   CHIPS_IOS_BUNDLE_ID     the app's bundle id, which Apple lets only one team use
 *   CHIPS_IOS_LINK_DOMAIN   the domain whose links open the app: an invite at its `/join`
 *   CHIPS_EAS_OWNER         the Expo account that owns the app's project
 *   CHIPS_EAS_PROJECT_ID    that project, which push tokens are issued for
 *   CHIPS_IOS_FREE_TEAM=1   the team is a free one, which cannot sign push or a link domain, so
 *                           the build carries neither
 *
 * Set empty, the link domain, the owner and the project id are left out: no link domain, or no
 * Expo project, which is how `eas init` gets to make one.
 *
 * `tools/phone/phone.mjs` reads `identity` from here, so the tool and the build name one app.
 */

/** A free team's flag, as people write it. */
const YES = /^(1|true|yes)$/i;

/** The links that open the app: `app.json`'s, the environment's one domain, or none. */
function linkDomains(config, env, free) {
  if (free) return [];
  const domain = env.CHIPS_IOS_LINK_DOMAIN?.trim().replace(/^applinks:/, "");
  if (domain === undefined) return config.ios.associatedDomains ?? [];
  return domain === "" ? [] : [`applinks:${domain}`];
}

/** Whose app this build is: `app.json`'s, but for what the environment says. */
function identity(config, env = process.env) {
  // Set, the variable's value; set empty, ""; not set, `app.json`'s.
  const said = (name, own) => env[name]?.trim() ?? own;
  const free = YES.test(said("CHIPS_IOS_FREE_TEAM", ""));
  return {
    team: said("CHIPS_APPLE_TEAM_ID", "") || config.ios.appleTeamId,
    bundle: said("CHIPS_IOS_BUNDLE_ID", "") || config.ios.bundleIdentifier,
    domains: linkDomains(config, env, free),
    owner: said("CHIPS_EAS_OWNER", config.owner) || undefined,
    projectId: said("CHIPS_EAS_PROJECT_ID", config.extra?.eas?.projectId) || undefined,
    free,
  };
}

/**
 * No push entitlement, which `expo-notifications` adds at prebuild. A mod registered earlier runs
 * later, and this one is registered before any plugin in `plugins`, so it runs after theirs.
 */
function withoutPush(config) {
  const { withEntitlementsPlist } = require("expo/config-plugins");
  return withEntitlementsPlist(config, (mod) => {
    delete mod.modResults["aps-environment"];
    return mod;
  });
}

/** `config` as `identity` has it, each field it leaves out left out. */
function withIdentity(config, env = process.env) {
  const app = identity(config, env);
  const ios = {
    ...config.ios,
    bundleIdentifier: app.bundle,
    appleTeamId: app.team,
    associatedDomains: app.domains,
  };
  if (app.domains.length === 0) delete ios.associatedDomains;
  const eas = { ...config.extra?.eas, projectId: app.projectId };
  if (app.projectId === undefined) delete eas.projectId;
  const made = { ...config, owner: app.owner, ios, extra: { ...config.extra, eas } };
  if (app.owner === undefined) delete made.owner;
  return app.free ? withoutPush(made) : made;
}

module.exports = ({ config }) => withIdentity(config);
module.exports.identity = identity;
