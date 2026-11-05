/**
 * Whose app the phone build is (`apps/mobile/app.config.js`, ADR 0260): `app.json`'s, Chips' own,
 * unless the environment names another team, bundle id, link domain or Expo project, which is how
 * a copy of this repository builds under its own Apple team. `pnpm phone` reads the same
 * `identity`, so the two name one app.
 *
 * Required as Node requires it: Expo loads the config that way, and it is CommonJS.
 */

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

type Config = {
  owner?: string;
  ios: { appleTeamId?: string; bundleIdentifier?: string; associatedDomains?: string[] };
  extra?: { eas?: { projectId?: string } };
};
type AppConfig = ((context: { config: Config }) => Config) & {
  identity: (config: Config, env: Record<string, string | undefined>) => Record<string, unknown>;
};

const appConfig = createRequire(import.meta.url)("../../apps/mobile/app.config.js") as AppConfig;
const appJson = (): Config =>
  JSON.parse(readFileSync(new URL("../../apps/mobile/app.json", import.meta.url), "utf8")).expo;

/** The config as Expo would make it, in an environment of `env` alone. */
function configIn(env: Record<string, string>): Config {
  const saved = { ...process.env };
  for (const name of Object.keys(process.env))
    if (name.startsWith("CHIPS_")) delete process.env[name];
  Object.assign(process.env, env);
  try {
    return appConfig({ config: appJson() });
  } finally {
    process.env = saved;
  }
}

const STRANGER = {
  CHIPS_APPLE_TEAM_ID: "ABCDE12345",
  CHIPS_IOS_BUNDLE_ID: "com.example.mychips",
  CHIPS_IOS_LINK_DOMAIN: "relay.example.com",
  CHIPS_EAS_OWNER: "someone",
  CHIPS_EAS_PROJECT_ID: "11111111-2222-3333-4444-555555555555",
};

describe("the phone app's config", () => {
  it("is app.json's with nothing set", () => {
    expect(JSON.stringify(configIn({}))).toBe(JSON.stringify(appJson()));
  });

  it("takes whose app it is from the environment", () => {
    const made = configIn(STRANGER);
    expect(made.owner).toBe("someone");
    expect(made.ios).toMatchObject({
      appleTeamId: "ABCDE12345",
      bundleIdentifier: "com.example.mychips",
      associatedDomains: ["applinks:relay.example.com"],
    });
    expect(made.extra?.eas?.projectId).toBe("11111111-2222-3333-4444-555555555555");
  });

  it("leaves out a link domain, an owner and a project set empty, which is what eas init needs", () => {
    const made = configIn({
      CHIPS_IOS_LINK_DOMAIN: "",
      CHIPS_EAS_OWNER: "",
      CHIPS_EAS_PROJECT_ID: "",
    });
    expect(made).not.toHaveProperty("owner");
    expect(made.ios).not.toHaveProperty("associatedDomains");
    expect(made.extra?.eas).toEqual({});
  });

  it("keeps app.json's team and bundle id when they are set empty", () => {
    const made = configIn({ CHIPS_APPLE_TEAM_ID: "", CHIPS_IOS_BUNDLE_ID: " " });
    expect(made.ios.appleTeamId).toBe(appJson().ios.appleTeamId);
    expect(made.ios.bundleIdentifier).toBe(appJson().ios.bundleIdentifier);
  });

  it("has no link domain for a free team, whatever else is set", () => {
    const app = appConfig.identity(appJson(), { ...STRANGER, CHIPS_IOS_FREE_TEAM: "1" });
    expect(app).toMatchObject({ team: "ABCDE12345", domains: [], free: true });
    expect(appConfig.identity(appJson(), { CHIPS_IOS_FREE_TEAM: "true" }).free).toBe(true);
    expect(appConfig.identity(appJson(), { CHIPS_IOS_FREE_TEAM: "0" }).free).toBe(false);
  });
});
