/**
 * The machine as `chips up`, `chips down` and `chips uninstall` touch it: files, commands, the
 * network, the browser and the person at the terminal. Kept apart from the commands so their
 * tests pass fakes, and so this file is the one place that reaches into the system.
 */

import { execFile, spawn } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { networkInterfaces } from "node:os";
import { basename, dirname, join } from "node:path";
import { createInterface } from "node:readline";
import { appHolding, nodeOnPath } from "@chipschat/harness";
import type { Environment, Machine } from "@chipschat/platform";
import { requestPairingCode } from "./commands/pair.js";
import { serve } from "./commands/serve.js";
import type { Health, UpDeps } from "./commands/up.js";
import { configHome } from "./home.js";
import { lanAddress, type Networks, tailnetAddress } from "./reach.js";
import type { Release } from "./release.js";
import type { Command } from "./service.js";

/** Runs a command and says whether it worked, with what it printed. Never throws. */
export function run(command: Command): Promise<{ ok: boolean; output: string }> {
  const [file, ...args] = command;
  return new Promise((resolve) => {
    execFile(file, args, { timeout: 30_000 }, (error, stdout, stderr) => {
      resolve({ ok: error === null, output: `${stdout}${stderr}` });
    });
  });
}

/** What answers at an address: Chips, something else, or nothing. */
export async function health(url: string): Promise<Health> {
  try {
    const response = await fetch(`${url}/v1/health`, { signal: AbortSignal.timeout(2000) });
    if (!response.ok) return "other";
    const body = (await response.json()) as { name?: unknown };
    return body.name === "chipsd" ? "chips" : "other";
  } catch (error) {
    // Refused is nothing there; anything that answered and was not Chips is something else.
    const cause = (error as { cause?: { code?: string } }).cause?.code;
    return cause === "ECONNREFUSED" || cause === undefined ? "none" : "other";
  }
}

/** Tailscale's own CLI, on the PATH or inside the Mac app. */
const TAILSCALE = ["tailscale", "/Applications/Tailscale.app/Contents/MacOS/Tailscale"];

export async function networks(): Promise<Networks> {
  let tailnet: string | undefined;
  for (const binary of TAILSCALE) {
    const ran = await run([binary, "ip", "-4"]);
    tailnet = ran.ok ? tailnetAddress(ran.output) : undefined;
    if (tailnet !== undefined) break;
  }
  return { tailnet, lan: lanAddress(networkInterfaces()) };
}

export function readText(path: string): string | undefined {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return undefined;
  }
}

/**
 * Readable by this user alone: the service's file carries the settings Chips runs with, push's
 * token and the attachment secret among them.
 */
export function writeText(path: string, contents: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents, { mode: 0o600 });
  chmodSync(path, 0o600);
}

export function removePath(path: string): void {
  rmSync(path, { recursive: true, force: true });
}

/** Opens a link in the default browser, and says whether that was even tried. */
export async function openUrl(url: string, platform: string): Promise<boolean> {
  const opener = platform === "darwin" ? "open" : platform === "linux" ? "xdg-open" : undefined;
  if (opener === undefined) return false;
  return new Promise((resolve) => {
    const child = spawn(opener, [url], { stdio: "ignore", detached: true });
    child.once("error", () => resolve(false));
    child.once("spawn", () => {
      child.unref();
      resolve(true);
    });
  });
}

/** A numbered question; Enter takes the first answer. */
export async function choose(question: string, choices: readonly string[]): Promise<number> {
  process.stdout.write(`  ${question}\n`);
  for (const [at, choice] of choices.entries()) {
    process.stdout.write(`    ${at + 1}  ${choice}\n`);
  }
  const lines = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise<string>((resolve) => lines.question("  Choose [1]: ", resolve));
  lines.close();
  const picked = Number.parseInt(answer.trim() || "1", 10);
  return Number.isInteger(picked) && picked >= 1 && picked <= choices.length ? picked - 1 : 0;
}

export async function waitFor(check: () => Promise<boolean>, timeoutMs: number): Promise<boolean> {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    if (await check()) return true;
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  return check();
}

/**
 * The install a service should run from: its `current` link when there is one and it points here,
 * so an update that moves `current` moves the service with it.
 */
function stableRoot(release: Release): string {
  const current = join(dirname(release.root), "current");
  try {
    if (realpathSync(current) === realpathSync(release.root)) return current;
  } catch {
    // No `current` beside it: an unpacked tarball, or Chips.app's own, run where it is.
  }
  return release.root;
}

/**
 * What the server's service runs `serve` with: the install's Node and the CLI bundled beside it,
 * as `bin/chips` runs them. Node is named itself so that macOS names the service after a signed
 * program, Chips.app's where the app carries it (ADR 0218's addendum).
 */
export function stableCommand(release: Release): readonly [string, string] {
  const root = stableRoot(release);
  return [join(root, "runtime", "node"), join(root, "lib", "chips.mjs")];
}

/**
 * The Node a harness's bridge is kept on (ADR 0218): the install's `current` one when `current`
 * points here, so an upgrade moves the bridge with it; the Mac app's own, inside Chips.app, which
 * an update of the app replaces in place. From a checkout, the PATH's, which is the link a package
 * manager keeps: this process's own is the version's folder, which `brew upgrade node` removes.
 */
export function stableNode(release: Release | undefined, environment: Environment): string {
  return release === undefined ? nodeOnPath(environment) : stableCommand(release)[0];
}

/**
 * Where `install.sh` put things, when this release is one it installed: `~/.local/lib/chips`
 * holding versions and `current`, and the link on the PATH. Undefined for a tarball unpacked
 * anywhere else, which is removed as the one directory it is.
 */
export function installOf(
  release: Release,
  machine: Machine,
): { readonly lib: string; readonly link: string | undefined } {
  const parent = dirname(release.root);
  const installed = basename(parent) === "chips" && existsSync(join(parent, "current"));
  const link = join(machine.home, ".local", "bin", "chips");
  let linked: string | undefined;
  try {
    linked = realpathSync(link).startsWith(installed ? realpathSync(parent) : release.root)
      ? link
      : undefined;
  } catch {
    linked = undefined;
  }
  return { lib: installed ? parent : release.root, link: linked };
}

export function systemUpDeps(machine: Machine, release: Release | undefined): UpDeps {
  const command = release === undefined ? undefined : stableCommand(release);
  return {
    machine,
    configHome: configHome(machine.environment),
    release,
    command,
    app: command === undefined ? undefined : appHolding(command[0]),
    uid: process.getuid?.() ?? 0,
    health,
    networks,
    readFile: readText,
    writeFile: writeText,
    makeDirectory: (path) => mkdirSync(path, { recursive: true }),
    exists: existsSync,
    run,
    serve,
    requestCode: (operator) => requestPairingCode({ operator, operatorFirst: true }),
    open: (url) => openUrl(url, machine.platform),
    choose,
    waitFor,
  };
}
