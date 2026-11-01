/**
 * Finding Chips for Mac on the server's machine and opening it at a room (ADR 0227's second
 * addendum): where its login item says it runs from, else /Applications, else nowhere.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { createLogger } from "@chipschat/platform";
import { afterEach, describe, expect, it } from "vitest";
import { appOfLoginItem, createMacApp, LOGIN_ITEM, macAppHere } from "./mac-app.js";

const PLIST = (program: string) => `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>chat.chips.desktop</string>
  <key>ProgramArguments</key>
  <array>
    <string>${program}</string>
    <string>--background</string>
  </array>
</dict>
</plist>`;

let home: string | undefined;
afterEach(() => {
  if (home !== undefined) rmSync(home, { recursive: true, force: true });
  home = undefined;
});

const logger = createLogger({ level: "silent" });

describe("Chips for Mac on this machine (ADR 0227)", () => {
  it("reads the app from its login item's program", () => {
    expect(appOfLoginItem(PLIST("/Applications/Chips.app/Contents/MacOS/chips-desktop"))).toBe(
      "/Applications/Chips.app",
    );
    expect(appOfLoginItem(PLIST("/Users/a/Apps/Chips Beta.app/Contents/MacOS/chips-desktop"))).toBe(
      "/Users/a/Apps/Chips Beta.app",
    );
    expect(appOfLoginItem("<plist></plist>")).toBeUndefined();
  });

  it("opens the app its login item names, at the room, in the background", async () => {
    home = mkdtempSync(join(tmpdir(), "chips-mac-app-"));
    const app = join(home, "Apps", "Chips.app");
    mkdirSync(join(app, "Contents", "MacOS"), { recursive: true });
    mkdirSync(dirname(join(home, LOGIN_ITEM)), { recursive: true });
    writeFileSync(join(home, LOGIN_ITEM), PLIST(join(app, "Contents", "MacOS", "chips-desktop")));
    const ran: (readonly string[])[] = [];
    const macApp = createMacApp({
      logger,
      home,
      run: async (file, args) => {
        ran.push([file, ...args]);
      },
    });
    expect(await macApp.open("spc_1")).toBe(true);
    expect(ran).toEqual([["/usr/bin/open", "-g", "-a", app, "chips://space/spc_1"]]);
  });

  it("says there is none when the login item's app is gone and nothing is installed", async () => {
    home = mkdtempSync(join(tmpdir(), "chips-mac-app-"));
    mkdirSync(dirname(join(home, LOGIN_ITEM)), { recursive: true });
    writeFileSync(join(home, LOGIN_ITEM), PLIST(join(home, "Gone.app", "Contents", "MacOS", "x")));
    const ran: (readonly string[])[] = [];
    const macApp = createMacApp({
      logger,
      home,
      run: async (file, args) => {
        ran.push([file, ...args]);
      },
    });
    // /Applications/Chips.app may be installed where the tests run; only the gone one is ruled out.
    const opened = await macApp.open("spc_1");
    expect(ran.every((each) => !each.includes(join(home ?? "", "Gone.app")))).toBe(true);
    expect(opened).toBe(ran.length > 0);
  });

  it("says it could not when open refuses", async () => {
    home = mkdtempSync(join(tmpdir(), "chips-mac-app-"));
    const app = join(home, "Chips.app");
    mkdirSync(app);
    mkdirSync(dirname(join(home, LOGIN_ITEM)), { recursive: true });
    writeFileSync(join(home, LOGIN_ITEM), PLIST(join(app, "Contents", "MacOS", "chips-desktop")));
    const macApp = createMacApp({
      logger,
      home,
      run: async () => {
        throw new Error("LSOpenURLsWithRole() failed");
      },
    });
    expect(await macApp.open("spc_1")).toBe(false);
  });
});

describe("which servers open it", () => {
  it("is a server's on a Mac outside dev mode, and never a dev one's", () => {
    expect(macAppHere({ devMode: true, logger })).toBeUndefined();
    expect(macAppHere({ devMode: false, logger }) === undefined).toBe(
      process.platform !== "darwin",
    );
  });
});
