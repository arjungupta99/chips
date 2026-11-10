/**
 * `pnpm phone`'s team check, without Xcode (`tools/phone/team.mjs`): whether the team is free, which
 * decides whether push is in the build. Xcode's preferences went on saying "Personal Team", free,
 * a month after Apple had made the team a paid one, and every build took push out.
 */

import { describe, expect, it } from "vitest";
import { freeTeamEntitlements, profileFacts, teamIds, teamOf } from "../phone/team.mjs";

/** Xcode's preferences as `plutil -p` prints them, as they stood on 11 October 2026. */
const PREFS = `
  "IDEProvisioningTeamByIdentifier" => {
    "58A947C9-60D9-4B4F-96F3-B23E80FB1314" => [
      0 => {
        "isFreeProvisioningTeam" => true
        "teamID" => "W9K648WB82"
        "teamName" => "Arjun Gupta (Personal Team)"
        "teamType" => "Personal Team"
      }
    ]
  }`;

/** A profile as `security cms -D` decodes it, with only the keys that matter here. */
function profile(team: string, created: string, expires: string, name = "Arjun Gupta") {
  return `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0">
<dict>
  <key>AppIDName</key>
  <string>Xcode iOS Wildcard App ID</string>
  <key>CreationDate</key>
  <date>${created}</date>
  <key>ExpirationDate</key>
  <date>${expires}</date>
  <key>TeamIdentifier</key>
  <array>
    <string>${team}</string>
  </array>
  <key>TeamName</key>
  <string>${name}</string>
</dict>
</plist>`;
}

const PAID = profile("W9K648WB82", "2026-09-11T02:30:23Z", "2027-09-11T02:30:23Z");
const FREE = profile("W9K648WB82", "2026-09-11T02:30:23Z", "2026-09-18T02:30:23Z");

describe("a provisioning profile", () => {
  it("gives its team, the team's name and how many days it lasts", () => {
    expect(profileFacts(PAID)).toEqual({ team: "W9K648WB82", name: "Arjun Gupta", days: 365 });
  });

  it("is nothing when it cannot be read", () => {
    expect(profileFacts("")).toBeUndefined();
    expect(profileFacts("<plist><dict></dict></plist>")).toBeUndefined();
  });
});

describe("the team Xcode signs with", () => {
  it("is paid when its profile lasts a year, whatever the preferences still say", () => {
    expect(teamOf(PREFS, [PAID])).toEqual({ id: "W9K648WB82", label: "Arjun Gupta", free: false });
  });

  it("is free when its profiles last a week", () => {
    expect(teamOf(PREFS, [FREE])?.free).toBe(true);
  });

  it("is judged by its own profiles, not another team's", () => {
    const other = profile("AAAAAAAAAA", "2026-01-01T00:00:00Z", "2027-01-01T00:00:00Z");
    expect(teamOf(PREFS, [other])).toEqual({
      id: "W9K648WB82",
      label: "Arjun Gupta (Personal Team)",
      free: true,
    });
  });

  it("falls back on the preferences when there are no profiles", () => {
    expect(teamOf(PREFS, [])?.free).toBe(true);
    expect(teamOf(PREFS.replace("=> true", "=> false"), [])?.free).toBe(false);
  });

  it("is nothing when Xcode lists no team and the build names none", () => {
    expect(teamOf("", [PAID])).toBeUndefined();
  });

  it("is the build's team, judged by its profiles, when Xcode lists none", () => {
    expect(teamOf("", [PAID], "W9K648WB82")).toEqual({
      id: "W9K648WB82",
      label: "Arjun Gupta",
      free: false,
    });
    expect(teamOf("", [FREE], "W9K648WB82")?.free).toBe(true);
    expect(teamOf("", [PAID], "AAAAAAAAAA")).toBeUndefined();
  });

  it("goes by Xcode's team over the build's when Xcode lists one", () => {
    expect(teamOf(PREFS, [FREE], "AAAAAAAAAA")?.id).toBe("W9K648WB82");
  });
});

describe("Xcode's teams", () => {
  it("are every team its preferences list, which the build's team has to be one of", () => {
    expect(teamIds(PREFS)).toEqual(["W9K648WB82"]);
    expect(
      teamIds(
        PREFS.replace(
          '"teamID" => "W9K648WB82"',
          '"teamID" => "ABCDE12345"\n        "teamID" => "W9K648WB82"',
        ),
      ),
    ).toEqual(["ABCDE12345", "W9K648WB82"]);
    expect(teamIds("")).toEqual([]);
  });
});

/** The app's entitlements as a prebuild writes them for a paid team. */
const ENTITLEMENTS = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>aps-environment</key>
    <string>development</string>
    <key>com.apple.developer.associated-domains</key>
    <array>
      <string>applinks:relay.chipschat.ai</string>
    </array>
    <key>keychain-access-groups</key>
    <array>
      <string>W9K648WB82.chat.chips.app</string>
      <string>W9K648WB82.chat.chips.app.shared</string>
    </array>
  </dict>
</plist>`;

describe("the entitlements a free team can sign", () => {
  it("are without push and the link domain, and keep the keychain groups", () => {
    const signable = freeTeamEntitlements(ENTITLEMENTS);
    expect(signable.gone).toEqual(["push", "the link domain"]);
    expect(signable.text).not.toMatch(/aps-environment|associated-domains|applinks/);
    expect(signable.text).toContain("<string>W9K648WB82.chat.chips.app.shared</string>");
    expect(freeTeamEntitlements(signable.text)).toEqual({ text: signable.text, gone: [] });
  });

  it("name only what was there", () => {
    const noLinks = ENTITLEMENTS.replace(/\s*<key>com\.apple[\s\S]*?<\/array>/, "");
    expect(freeTeamEntitlements(noLinks).gone).toEqual(["push"]);
  });
});
