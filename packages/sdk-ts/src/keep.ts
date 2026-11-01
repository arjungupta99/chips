/**
 * Where a harness keeps the key it was handed when it joined (ADR 0122), so it asks once: the macOS
 * keychain, the Secret Service where `secret-tool` is installed, or else a file only its user can
 * read, in Chips's own config directory. The CLI's keychain does the same for the harnesses it
 * connects (`cli/src/keychain.ts`); this is that, for a harness on the SDK, which cannot depend on
 * the CLI.
 *
 * What is kept is what `join()` answers — the server's address, the harness's id, its key and its
 * room — under the server and the harness's name, so a second harness of another name on the same
 * machine asks for its own.
 */

import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export type Environment = Readonly<Record<string, string | undefined>>;

/** A place a secret is kept, by account. */
export interface KeyStore {
  readonly kind: "keychain" | "secret-service" | "file";
  readonly get: (account: string) => string | undefined;
  readonly set: (account: string, secret: string) => void;
  readonly remove: (account: string) => void;
}

/** The service name every Chips secret is kept under, as the CLI's are. */
const SERVICE = "chips";

/** A word as `security -i` reads it: in double quotes, its own quotes and backslashes escaped. */
function quoted(word: string): string {
  if (/[\r\n]/.test(word)) throw new Error("A keychain account or secret is one line.");
  return `"${word.replace(/[\\"]/g, "\\$&")}"`;
}

/**
 * The `add-generic-password` command as it is written to `security -i` (SEC-34): the secret
 * crosses on stdin, which nothing else of this user's can read, rather than on argv, which `ps`
 * shows every process of this user for the moment the tool runs. The CLI's keychain does the same.
 */
export function addPasswordCommand(account: string, secret: string): string {
  return `add-generic-password -U -a ${quoted(account)} -s ${quoted(SERVICE)} -w ${quoted(secret)}\n`;
}

/** Chips's config directory: `CHIPS_CONFIG_HOME`, else `$XDG_CONFIG_HOME/chips`, else `~/.config/chips`. */
export function configHome(env: Environment): string {
  const own = env["CHIPS_CONFIG_HOME"];
  if (own !== undefined && own !== "") return own;
  const xdg = env["XDG_CONFIG_HOME"];
  return join(
    xdg !== undefined && xdg !== "" ? xdg : join(env["HOME"] ?? homedir(), ".config"),
    "chips",
  );
}

function answers(command: string, args: readonly string[]): boolean {
  try {
    execFileSync(command, [...args], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function keychain(): KeyStore {
  const run = (args: readonly string[]) =>
    execFileSync("/usr/bin/security", [...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
  return {
    kind: "keychain",
    get(account) {
      try {
        return run(["find-generic-password", "-a", account, "-s", SERVICE, "-w"]).trim();
      } catch {
        return undefined;
      }
    },
    set(account, secret) {
      // On stdin, secret and all (SEC-34); the tool exits non-zero when the command inside fails.
      execFileSync("/usr/bin/security", ["-i"], {
        input: addPasswordCommand(account, secret),
        stdio: ["pipe", "ignore", "ignore"],
      });
    },
    remove(account) {
      try {
        run(["delete-generic-password", "-a", account, "-s", SERVICE]);
      } catch {
        // Nothing kept: nothing to remove.
      }
    },
  };
}

function secretService(): KeyStore {
  const attributes = (account: string) => ["service", SERVICE, "account", account];
  return {
    kind: "secret-service",
    get(account) {
      try {
        const kept = execFileSync("secret-tool", ["lookup", ...attributes(account)], {
          encoding: "utf8",
          stdio: ["ignore", "pipe", "ignore"],
        });
        return kept === "" ? undefined : kept;
      } catch {
        return undefined;
      }
    },
    set(account, secret) {
      execFileSync(
        "secret-tool",
        ["store", "--label", `Chips: ${account}`, ...attributes(account)],
        {
          input: secret,
          stdio: ["pipe", "ignore", "ignore"],
        },
      );
    },
    remove(account) {
      try {
        execFileSync("secret-tool", ["clear", ...attributes(account)], { stdio: "ignore" });
      } catch {
        // Nothing kept: nothing to remove.
      }
    },
  };
}

/** One JSON map, readable by this user alone, beside the CLI's own `secrets.json`. */
function file(path: string): KeyStore {
  const read = (): Record<string, string> => {
    if (!existsSync(path)) return {};
    try {
      return JSON.parse(readFileSync(path, "utf8")) as Record<string, string>;
    } catch {
      return {};
    }
  };
  const write = (kept: Record<string, string>) => {
    if (Object.keys(kept).length === 0) {
      rmSync(path, { force: true });
      return;
    }
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    writeFileSync(path, `${JSON.stringify(kept, null, 2)}\n`, { mode: 0o600 });
    chmodSync(path, 0o600);
  };
  return {
    kind: "file",
    get: (account) => read()[account],
    set(account, secret) {
      write({ ...read(), [account]: secret });
    },
    remove(account) {
      const { [account]: _gone, ...rest } = read();
      write(rest);
    },
  };
}

/**
 * The best place this machine has. `CHIPS_NO_KEYCHAIN=true` asks for the file, as it does of the
 * CLI: a test, a container, a server with no keyring unlocked.
 */
export function openKeyStore(env: Environment, platform: string = process.platform): KeyStore {
  const plain = file(join(configHome(env), "harness-keys.json"));
  if (env["CHIPS_NO_KEYCHAIN"] === "true") return plain;
  if (platform === "darwin" && answers("/usr/bin/security", ["list-keychains"])) return keychain();
  if (platform === "linux" && answers("sh", ["-c", "command -v secret-tool"]))
    return secretService();
  return plain;
}
