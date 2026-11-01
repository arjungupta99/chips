/**
 * `pnpm phone testflight` without Xcode (`tools/phone/testflight.mjs`, the first-run build plan's
 * FR7): a build number that rises, export options that send the archive to App Store Connect as
 * Xcode's account with that number kept, and a failed upload said in words that fix it.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  apiKeyFrom,
  archiveArgs,
  buildNumber,
  exportArgs,
  exportOptions,
  keyArgs,
  signedInToXcode,
  uploadFailure,
  uploadWords,
} from "../phone/testflight.mjs";

describe("pnpm phone testflight", () => {
  it("numbers a build from the clock, rising with every minute", () => {
    expect(buildNumber(new Date("2026-10-15T02:15:00Z"))).toBe("202610150215");
    expect(Number(buildNumber(new Date("2026-10-15T02:16:00Z")))).toBeGreaterThan(
      Number(buildNumber(new Date("2026-10-15T02:15:59Z"))),
    );
  });

  it("uploads to App Store Connect, signed by the team, keeping the stamped build number", () => {
    const options = exportOptions("W9K648WB82");
    expect(options).toContain("<string>app-store-connect</string>");
    expect(options).toContain("<key>destination</key>\n  <string>upload</string>");
    expect(options).toContain("<string>W9K648WB82</string>");
    expect(options).toContain("<key>manageAppVersionAndBuildNumber</key>\n  <false/>");
  });

  it("archives for any iPhone and exports that archive", () => {
    const archive = archiveArgs("/x/Chips.xcarchive");
    expect(archive.at(-1)).toBe("archive");
    expect(archive).toContain("generic/platform=iOS");
    expect(exportArgs("/x/Chips.xcarchive", "/x/o.plist", "/x")).toEqual(
      expect.arrayContaining(["-exportArchive", "-exportOptionsPlist", "/x/o.plist"]),
    );
  });

  it("signs and uploads with an App Store Connect API key when its config names one", () => {
    // 26 October 2026: Xcode dropped his Apple ID at each restart, so the key stands in for it.
    const config = JSON.stringify({
      keyId: "ABC123DEF4",
      issuerId: "69A6DE7E-1111-47E3-E053-5B8C7C11A4D1",
    });
    const key = apiKeyFrom(config, "/Users/a");
    expect(key).toEqual({
      keyId: "ABC123DEF4",
      issuerId: "69a6de7e-1111-47e3-e053-5b8c7c11a4d1",
      path: "/Users/a/.appstoreconnect/private_keys/AuthKey_ABC123DEF4.p8",
    });
    const args = keyArgs(key);
    expect(args).toEqual([
      "-authenticationKeyPath",
      "/Users/a/.appstoreconnect/private_keys/AuthKey_ABC123DEF4.p8",
      "-authenticationKeyID",
      "ABC123DEF4",
      "-authenticationKeyIssuerID",
      "69a6de7e-1111-47e3-e053-5b8c7c11a4d1",
    ]);
    expect(exportArgs("/x/Chips.xcarchive", "/x/o.plist", "/x", key)).toEqual(
      expect.arrayContaining(args),
    );
    const archive = archiveArgs("/x/Chips.xcarchive", key);
    expect(archive).toEqual(expect.arrayContaining(args));
    expect(archive.at(-1)).toBe("archive");
  });

  it("goes as Xcode's account when no key is named, or the config is not one", () => {
    expect(keyArgs(undefined)).toEqual([]);
    expect(exportArgs("/x/Chips.xcarchive", "/x/o.plist", "/x")).not.toContain(
      "-authenticationKeyPath",
    );
    expect(apiKeyFrom("not json", "/Users/a")).toBeUndefined();
    expect(apiKeyFrom("{}", "/Users/a")).toBeUndefined();
    expect(
      apiKeyFrom(
        JSON.stringify({ keyId: "abc", issuerId: "69a6de7e-1111-47e3-e053-5b8c7c11a4d1" }),
        "/h",
      ),
    ).toBeUndefined();
    expect(
      apiKeyFrom(JSON.stringify({ keyId: "ABC123DEF4", issuerId: "nope" }), "/h"),
    ).toBeUndefined();
  });

  it("says what the account holder does once, and runs nothing itself", () => {
    const words = uploadWords("202610150215").join("\n");
    expect(words).toContain("Build 202610150215 is uploaded");
    expect(words).toContain("Internal Testing");
    expect(words).toContain("TestFlight from the App Store");
    const source = readFileSync(new URL("../phone/testflight.mjs", import.meta.url), "utf8");
    expect(source).not.toMatch(/spawn|execFile/);
  });

  it("knows before the archive whether Xcode has an Apple ID to sign and upload as", () => {
    // As this Mac stood on 15 October 2026, when the export failed after the archive.
    expect(signedInToXcode('{\n    "IDE.Identifiers.Prod" =     (\n    );\n}')).toBe(false);
    const signedIn =
      '{\n    "IDE.Identifiers.Prod" =     (\n                {\n            identifier = "a@b.c";\n        }\n    );\n}';
    expect(signedInToXcode(signedIn)).toBe(true);
    expect(signedInToXcode("The domain/default pair does not exist")).toBe(false);
  });

  it("says a failed upload in words that fix it, the missing app record first", () => {
    // As xcodebuild said it on 17 October 2026, with no app for chat.chips.app in App Store Connect.
    const missing = uploadFailure(
      "** EXPORT FAILED **\nerror: exportArchive Error Downloading App Information",
    ).join("\n");
    expect(missing).toContain("New App");
    expect(missing).toContain("bundle ID chat.chips.app");
    expect(missing).toContain("pnpm phone testflight --export");
    expect(uploadFailure("error: exportArchive: No Accounts").join("\n")).toContain(
      "Xcode → Settings → Accounts",
    );
    // As xcodebuild said it on 26 October 2026, with Xcode holding no Apple ID: a key is the way out.
    const noAccount = uploadFailure("error: exportArchive Failed to Use Accounts").join("\n");
    expect(noAccount).toContain("Xcode → Settings → Accounts");
    expect(noAccount).toContain("~/.appstoreconnect/chips.json");
    expect(
      uploadFailure("NOT_AUTHORIZED: Authentication credentials are missing or invalid")[0],
    ).toBe("App Store Connect refused the API key. Check its Key ID and Issuer ID in");
    const other = uploadFailure("line 1\nerror: exportArchive: something new");
    expect(other).toContain("error: exportArchive: something new");
    expect(other.at(-1)).toContain("--export");
  });

  it("matches the profile eas.json names", () => {
    const eas = JSON.parse(
      readFileSync(new URL("../../apps/mobile/eas.json", import.meta.url), "utf8"),
    ) as { build: Record<string, unknown>; submit: Record<string, unknown> };
    expect(Object.keys(eas.build)).toEqual(["development", "preview", "production"]);
    expect(eas.submit).toHaveProperty("production");
  });
});
