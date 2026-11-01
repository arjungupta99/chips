/**
 * `pnpm desktop`'s signing of what the app carries (`tools/desktop/sign.mjs`, ADR 0218's
 * addendum): its words for `codesign` and `notarytool`, the entitlements Node needs under the
 * hardened runtime, and the team a signature names. On a Mac it signs a scratch binary ad hoc with those words, so the
 * entitlements file is one `codesign` takes; a certificate's signature is `pnpm desktop`'s alone.
 */

import { execFileSync, spawnSync } from "node:child_process";
import { copyFileSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  isDeveloperId,
  NODE_ENTITLEMENTS,
  notarizeArgs,
  signArgs,
  teamOf,
} from "../desktop/sign.mjs";

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
