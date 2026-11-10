/**
 * Where a secret goes.
 *
 * On macOS that is the login keychain, through `/usr/bin/security`, which is what M2.1 asks
 * for: a token in the keychain rather than in a file. Shelling out to the tool Apple ships
 * beats a native module — `keytar` needs a compiler on every machine that installs Chips, and
 * this needs none.
 *
 * Everywhere else, and when the keychain refuses, the fallback is a file under the config home
 * with owner-only permissions, and `chips doctor` says which one is in use. That is honest: a
 * secret in a 0600 file is what most Linux setups have anyway, and pretending otherwise would
 * hide it.
 */

import { execFileSync } from "node:child_process";
import { chmodSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { type Environment, processEnvironment } from "@chipschat/platform";
import { configHome } from "./home.js";

export type SecretStore = "keychain" | "file";

export interface Keychain {
  /** Which store this is, so `doctor` and `connect` can say where a secret went. */
  readonly kind: SecretStore;
  readonly set: (account: string, secret: string) => void;
  readonly get: (account: string) => string | undefined;
  readonly remove: (account: string) => void;
}

const SERVICE = "chips";

/** A word as `security -i` reads it: in double quotes, its own quotes and backslashes escaped. */
function quoted(word: string): string {
  if (/[\r\n]/.test(word)) throw new Error("A keychain account or secret is one line.");
  return `"${word.replace(/[\\"]/g, "\\$&")}"`;
}

/**
 * The `add-generic-password` command as it is written to `security -i` (SEC-34): the secret
 * crosses on stdin, which nothing else of this user's can read, rather than on argv, which `ps`
 * shows every process of this user for the moment the tool runs.
 */
export function addPasswordCommand(account: string, secret: string): string {
  return `add-generic-password -U -a ${quoted(account)} -s ${quoted(SERVICE)} -w ${quoted(secret)}\n`;
}

/** The keychain when this machine has one and it answers; a 0600 file when it does not. */
export function openKeychain(environment: Environment = processEnvironment()): Keychain {
  if (process.platform === "darwin" && environment["CHIPS_NO_KEYCHAIN"] !== "true") {
    const keychain = macKeychain();
    if (keychain !== undefined) return keychain;
  }
  return fileStore(environment);
}

function macKeychain(): Keychain | undefined {
  try {
    execFileSync("/usr/bin/security", ["list-keychains"], { stdio: "ignore" });
  } catch {
    return undefined;
  }
  return {
    kind: "keychain",
    set(account, secret) {
      // `-U` updates in place, so rotating a token does not leave the old one behind under the
      // same account. The command goes to `security -i` on stdin, secret and all (SEC-34); the
      // tool exits non-zero when the command inside fails, so a refusal still throws here.
      execFileSync("/usr/bin/security", ["-i"], {
        input: addPasswordCommand(account, secret),
        stdio: ["pipe", "ignore", "ignore"],
      });
    },
    get(account) {
      try {
        return execFileSync(
          "/usr/bin/security",
          ["find-generic-password", "-a", account, "-s", SERVICE, "-w"],
          { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
        ).trim();
      } catch {
        return undefined;
      }
    },
    remove(account) {
      try {
        execFileSync(
          "/usr/bin/security",
          ["delete-generic-password", "-a", account, "-s", SERVICE],
          { stdio: "ignore" },
        );
      } catch {
        // Nothing there to remove, which is the state the caller wanted.
      }
    },
  };
}

/**
 * Every key Chips and its bridges kept in the login keychain removed, for `chips uninstall` with
 * the workspace (the onboarding audit, Part 2, item 25): each is under the service `chips`, and
 * `security` removes one a call until none is left. A file store goes with the config folder.
 */
export function forgetEverySecret(): void {
  for (let removed = 0; removed < 10_000; removed += 1) {
    try {
      execFileSync("/usr/bin/security", ["delete-generic-password", "-s", SERVICE], {
        stdio: "ignore",
      });
    } catch {
      return;
    }
  }
}

/** One JSON file, owner-only. Not as good as a keychain, and it says so. */
function fileStore(environment: Environment): Keychain {
  const path = join(configHome(environment), "secrets.json");
  const read = (): Record<string, string> => {
    try {
      return JSON.parse(readFileSync(path, "utf8")) as Record<string, string>;
    } catch {
      return {};
    }
  };
  const write = (secrets: Record<string, string>): void => {
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    writeFileSync(path, `${JSON.stringify(secrets, null, 2)}\n`, { mode: 0o600 });
    chmodSync(path, 0o600);
  };
  return {
    kind: "file",
    set(account, secret) {
      write({ ...read(), [account]: secret });
    },
    get(account) {
      return read()[account];
    },
    remove(account) {
      const secrets = read();
      if (!(account in secrets)) return;
      delete secrets[account];
      if (Object.keys(secrets).length === 0) rmSync(path, { force: true });
      else write(secrets);
    },
  };
}
