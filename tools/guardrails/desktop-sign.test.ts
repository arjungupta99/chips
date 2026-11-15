/**
 * `pnpm desktop`'s signing of what the app carries (`tools/desktop/sign.mjs`, ADR 0218's
 * addendum): its words for `codesign` and `notarytool`, the entitlements Node needs under the
 * hardened runtime, and the team a signature names. On a Mac it signs a scratch binary ad hoc with those words, so the
 * entitlements file is one `codesign` takes; a certificate's signature is `pnpm desktop`'s alone.
 */

import { execFileSync, spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  archiveArgs,
  isDeveloperId,
  keyIdOf,
  NODE_ENTITLEMENTS,
  notarizeArgs,
  signArgs,
  signedByUpdaterKey,
  teamOf,
  UPDATE_FEED_URL,
  updateFeed,
  updateUrl,
} from "../desktop/sign.mjs";

const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
const TAURI_CONFIG = JSON.parse(read("apps/desktop/src-tauri/tauri.conf.json"));
// A key made for this test with `tauri signer generate` and thrown away: its public half, and
// its signature of a scratch file, as `tauri signer sign` writes one.
const TEST_KEY =
  "dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk6IDY0RjZERjg3RTg4N0E2NzgKUldSNHBvZm9oOS8yWkVxWkY1YlFVQ2M3RXoxUmRkUldRNzY1VVh3N2dBV2tqWmd1c2JIRUxFMk0K";
const TEST_SIGNATURE =
  "dW50cnVzdGVkIGNvbW1lbnQ6IHNpZ25hdHVyZSBmcm9tIHRhdXJpIHNlY3JldCBrZXkKUlVSNHBvZm9oOS8yWkt2U0RxeHN5Q3FNMGw2a1RHVjlOWmZzeS81MGtSK0twRk5XUFY2aitVWEEwbHVwTlp0WEpYd0p2ZHltL0RzZjZiRGdUVUJ2VmJCb1Fpc2tJbEN3cWdrPQp0cnVzdGVkIGNvbW1lbnQ6IHRpbWVzdGFtcDoxNzk0NjAzOTk1CWZpbGU6ZmlsZS50YXIuZ3oKclVkd2dXd3ZvQWQ5MjN5ZVExRXRFcFV6WFNHZnhLTUczTE9aYkU1UlByNDNQa0ZKQU9qZU5SUEtIYW1kZzdMRkJ5bHFDSDBlMitqVXJlbVpGZ255RHc9PQo=";

const NEEDED = [
  "com.apple.security.cs.allow-jit",
  "com.apple.security.cs.allow-unsigned-executable-memory",
  "com.apple.security.cs.disable-library-validation",
];

describe("the Node Chips for Mac carries", () => {
  it("is signed in place of Node's own signature, under the hardened runtime, with Node's entitlements", () => {
    expect(
      signArgs("/x/runtime/node", "Apple Development: Ada (TEAM)", {
        entitlements: NODE_ENTITLEMENTS,
      }),
    ).toEqual([
      "--force",
      "--sign",
      "Apple Development: Ada (TEAM)",
      "--options",
      "runtime",
      "--entitlements",
      NODE_ENTITLEMENTS,
      "/x/runtime/node",
    ]);
    const claims = readFileSync(NODE_ENTITLEMENTS, "utf8");
    for (const key of NEEDED) expect(claims).toContain(`<key>${key}</key>\n\t<true/>`);
    // A debugger's entitlement would keep a notarized build from being accepted.
    expect(claims).not.toContain("<key>com.apple.security.get-task-allow</key>");
  });

  it("signs a native beside Node with no entitlements, and a build to hand out with a timestamp", () => {
    expect(
      signArgs("/x/better_sqlite3.node", "Developer ID Application: Ada (TEAM)", {
        timestamp: true,
      }),
    ).toEqual([
      "--force",
      "--sign",
      "Developer ID Application: Ada (TEAM)",
      "--timestamp",
      "--options",
      "runtime",
      "/x/better_sqlite3.node",
    ]);
    expect(isDeveloperId("Developer ID Application: Ada (TEAM)")).toBe(true);
    expect(isDeveloperId("Apple Development: Ada (TEAM)")).toBe(false);
  });

  it("sends a build to Apple with the App Store Connect key, and waits for the answer", () => {
    expect(
      notarizeArgs("/x/Chips.zip", { keyPath: "/k/AuthKey_K.p8", keyId: "K", issuerId: "I" }),
    ).toEqual([
      "notarytool",
      "submit",
      "/x/Chips.zip",
      "--key",
      "/k/AuthKey_K.p8",
      "--key-id",
      "K",
      "--issuer",
      "I",
      "--wait",
      "--output-format",
      "json",
    ]);
  });

  it("is known by the team its signature names, and an ad-hoc one names none", () => {
    expect(teamOf("Identifier=node\nTeamIdentifier=W9K648WB82\nSealed Resources=none\n")).toBe(
      "W9K648WB82",
    );
    expect(teamOf("Signature=adhoc\nTeamIdentifier=not set\n")).toBeUndefined();
    expect(teamOf("code object is not signed at all")).toBeUndefined();
  });

  it.runIf(process.platform === "darwin")(
    "takes the signature codesign makes from those words",
    () => {
      const folder = mkdtempSync(join(tmpdir(), "chips-sign-"));
      try {
        const program = join(folder, "node");
        copyFileSync("/usr/bin/true", program);
        execFileSync("codesign", signArgs(program, "-", { entitlements: NODE_ENTITLEMENTS }), {
          stdio: "ignore",
        });
        // `codesign -dv` describes a signature on standard error.
        const described = spawnSync("codesign", ["-dv", program], { encoding: "utf8" }).stderr;
        expect(described).toMatch(/flags=0x\w+\(adhoc,runtime\)/);
        expect(teamOf(described)).toBeUndefined();
        const entitlements = execFileSync(
          "codesign",
          ["-d", "--entitlements", "-", "--xml", program],
          { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
        );
        for (const key of NEEDED) expect(entitlements).toContain(key);
      } finally {
        rmSync(folder, { recursive: true, force: true });
      }
    },
  );
});

describe("Chips for Mac's own update (ADR 0298)", () => {
  it("names the archive on its release, for Apple silicon, with its signature", () => {
    expect(updateUrl("1.2.6")).toBe(
      "https://github.com/arjungupta99/chips/releases/download/v1.2.6/Chips.app.tar.gz",
    );
    expect(
      updateFeed({ version: "1.2.6", signature: "c2ln", at: new Date("2026-11-20T08:00:00Z") }),
    ).toEqual({
      version: "1.2.6",
      notes: "Chips 1.2.6",
      pub_date: "2026-11-20T08:00:00.000Z",
      platforms: {
        "darwin-aarch64": {
          signature: "c2ln",
          url: "https://github.com/arjungupta99/chips/releases/download/v1.2.6/Chips.app.tar.gz",
        },
      },
    });
  });

  it("writes the feed the updater reads: the one file both sides are held to", () => {
    // `apps/desktop/src-tauri/src/update.rs` parses the same file as the updater does.
    expect(
      `${JSON.stringify(
        updateFeed({
          version: "1.2.6",
          signature: "dW50cnVzdGVkIGNvbW1lbnQ6IHNpZ25hdHVyZQ==",
          at: new Date("2026-11-13T12:00:00.000Z"),
        }),
        null,
        2,
      )}\n`,
    ).toBe(read("tools/desktop/fixtures/latest.json"));
  });

  it("is read from the feed the release tool uploads to, over https", () => {
    expect(TAURI_CONFIG.plugins.updater.endpoints).toEqual([UPDATE_FEED_URL]);
    expect(UPDATE_FEED_URL).toBe(
      "https://github.com/arjungupta99/chips/releases/latest/download/latest.json",
    );
  });

  it("is one version everywhere a build reads it", () => {
    // The feed names the root package's version and the app compares its own, from the Tauri
    // config: apart, a release would go in and still be older than the feed, every night.
    const version = JSON.parse(read("package.json")).version;
    expect(TAURI_CONFIG.version).toBe(version);
    expect(JSON.parse(read("apps/desktop/package.json")).version).toBe(version);
    expect(/^version = "(.+)"$/m.exec(read("apps/desktop/src-tauri/Cargo.toml"))?.[1]).toBe(
      version,
    );
    const locked = /name = "chips-desktop"\nversion = "(.+)"/.exec(
      read("apps/desktop/src-tauri/Cargo.lock"),
    )?.[1];
    expect(locked).toBe(version);
  });

  it("knows the key a signature was made with, so one from another key never leaves the Mac", () => {
    expect(keyIdOf(TEST_KEY)).toBe("78a687e887dff664");
    expect(keyIdOf(TEST_SIGNATURE)).toBe("78a687e887dff664");
    expect(signedByUpdaterKey(TEST_SIGNATURE, TEST_KEY)).toBe(true);
    // The key every copy carries is another: a signature from the test's key isn't its.
    const carried = TAURI_CONFIG.plugins.updater.pubkey;
    expect(keyIdOf(carried)).toBe("629e5087187f0bce");
    expect(signedByUpdaterKey(TEST_SIGNATURE, carried)).toBe(false);
    // The id is the one minisign prints in the key's first line, low byte first.
    const named = Buffer.from(carried, "base64").toString("utf8").split("\n")[0];
    expect(named).toBe("untrusted comment: minisign public key: CE0B7F1887509E62");
    // Text that is no key and no signature names none, and matches nothing.
    for (const not of ["", "c2ln", "not base64 at all", undefined]) {
      expect(keyIdOf(not)).toBeUndefined();
      expect(signedByUpdaterKey(not, carried)).toBe(false);
      expect(signedByUpdaterKey(TEST_SIGNATURE, not)).toBe(false);
    }
  });

  it("packs a real app so the updater finds it under one top folder, with nothing beside", () => {
    const scratch = mkdtempSync(join(tmpdir(), "chips-update-archive-"));
    try {
      const app = join(scratch, "built", "Chips.app");
      mkdirSync(join(app, "Contents", "MacOS"), { recursive: true });
      writeFileSync(join(app, "Contents", "Info.plist"), "<plist/>");
      writeFileSync(join(app, "Contents", "MacOS", "chips-desktop"), "program");
      const archive = join(scratch, "Chips.app.tar.gz");
      execFileSync("tar", archiveArgs(archive, app), {
        env: { PATH: "/usr/bin:/bin", COPYFILE_DISABLE: "1" },
      });
      const listed = execFileSync("tar", ["-tzf", archive], { encoding: "utf8" })
        .trim()
        .split("\n");
      // The updater drops each entry's first folder and unpacks the rest as the app.
      expect(listed.every((entry) => entry.startsWith("Chips.app/"))).toBe(true);
      expect(listed).toContain("Chips.app/Contents/Info.plist");
      expect(listed).toContain("Chips.app/Contents/MacOS/chips-desktop");
      expect(listed.some((entry) => entry.includes("/._"))).toBe(false);
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  });

  it("packs the app as the archive's one top folder", () => {
    expect(archiveArgs("/r/dist/Chips.app.tar.gz", "/r/target/bundle/macos/Chips.app")).toEqual([
      "-czf",
      "/r/dist/Chips.app.tar.gz",
      "-C",
      "/r/target/bundle/macos",
      "Chips.app",
    ]);
  });
});
