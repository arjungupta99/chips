/**
 * Chips for Mac on the machine this server runs on (ADR 0227's second addendum). It is found where
 * its login item says it runs from (ADR 0215), else in /Applications, and opened at a room with
 * `open`, as a `chips://` link from anywhere else opens it: the window comes forward, made if the
 * app was opened at login with none, and its page connects and says `folders`.
 *
 * Only a server that serves for a person, on a Mac and outside dev mode, has one (`macAppHere`): a
 * scratch server or a test that opened the person's own Chips for Mac would show them a room it
 * could not find.
 */

import { execFile } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { Logger } from "@chipschat/platform";
import type { MacApp } from "../application/ports/mac-app.js";

/** The login item Chips for Mac writes for itself (ADR 0215), under the person's home. */
export const LOGIN_ITEM = join("Library", "LaunchAgents", "chat.chips.desktop.plist");

/** Where the installer puts it, for a Mac whose login item was turned off. */
export const INSTALLED = "/Applications/Chips.app";

/** How long `open` may take to hand the link over before the ask is told there is no app. */
const OPEN_MS = 10_000;

/**
 * The app a login item runs: its first program argument is the binary inside the bundle,
 * `…/Chips.app/Contents/MacOS/chips-desktop`, and the bundle is what `open` takes.
 */
export function appOfLoginItem(plist: string): string | undefined {
  const program = /<key>ProgramArguments<\/key>\s*<array>\s*<string>([^<]+)<\/string>/.exec(
    plist,
  )?.[1];
  return program === undefined ? undefined : /^(\/.+?\.app)\//.exec(program)?.[1];
}

/** Runs a program with no shell, and settles when it has ended. */
export type Run = (file: string, args: readonly string[]) => Promise<void>;

const run: Run = (file, args) =>
  new Promise((resolve, reject) => {
    execFile(file, [...args], { timeout: OPEN_MS }, (error) => (error ? reject(error) : resolve()));
  });

/**
 * The Chips for Mac a server serving for the person opens (`chipsd serve`, `chips serve`, `chips
 * up`): on a Mac, outside dev mode, and none anywhere else.
 */
export function macAppHere(options: {
  readonly devMode: boolean;
  readonly logger: Logger;
}): MacApp | undefined {
  return process.platform === "darwin" && !options.devMode
    ? createMacApp({ logger: options.logger })
    : undefined;
}

export function createMacApp(options: {
  readonly logger: Logger;
  readonly home?: string;
  readonly run?: Run;
}): MacApp {
  const home = options.home ?? homedir();
  const opens = options.run ?? run;

  /** Where Chips for Mac is now: looked for at each ask, since it may be installed or moved. */
  const where = async (): Promise<string | undefined> => {
    const plist = await readFile(join(home, LOGIN_ITEM), "utf8").catch(() => undefined);
    const fromLogin = plist === undefined ? undefined : appOfLoginItem(plist);
    for (const app of [fromLogin, INSTALLED]) {
      if (app === undefined) continue;
      const found = await stat(app).catch(() => undefined);
      if (found?.isDirectory() === true) return app;
    }
    return undefined;
  };

  return {
    async open(spaceId) {
      const app = await where();
      if (app === undefined) {
        options.logger.info({ spaceId }, "no Chips for Mac on this machine to open");
        return false;
      }
      try {
        await opens("/usr/bin/open", ["-g", "-a", app, `chips://space/${spaceId}`]);
        options.logger.info({ spaceId, app }, "opened Chips for Mac for an ask from the phone");
        return true;
      } catch (error) {
        options.logger.warn({ err: error, spaceId, app }, "Chips for Mac would not open");
        return false;
      }
    },
  };
}
