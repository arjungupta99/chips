/**
 * What a run printed, read for Run (ADR 0230): the address the program says it listens on, which
 * Run opens, and, when it went wrong, what went wrong, in the words the person reads in its row.
 */

import { spawnSync } from "node:child_process";
import { basename } from "node:path";
import { opensShown } from "@chipschat/protocol";

/** A run's output as the person would read it: no colour codes, no carriage returns. */
export function plainOf(text: string): string {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: a terminal's colour codes are what is taken out.
  return text.replace(/\u001b\[[0-9;?]*[A-Za-z]/g, "").replace(/\r/g, "");
}

const ADDRESS =
  /https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1?\])(?::\d{2,5})?(?:\/[^\s"'<>)\]]*)?/i;

/**
 * The first address on this Mac the program printed, as a browser here reaches exactly it: where
 * it listens on every address, `0.0.0.0` as `127.0.0.1` and `[::]` as `[::1]`, since `localhost`
 * may reach another program on the other one (Sudoku listened on IPv6 8000 beside another
 * program's IPv4 8000); and no full stop from the end of a sentence.
 */
export function printedAddress(text: string): string | undefined {
  const found = ADDRESS.exec(plainOf(text))?.[0];
  if (found === undefined) return undefined;
  return found
    .replace("//0.0.0.0", "//127.0.0.1")
    .replace("//[::]", "//[::1]")
    .replace(/[.,;:]+$/, "");
}

/** The program holding a port on this Mac, by its own name, where the Mac can tell. */
export type Holder = (port: number) => Promise<string | undefined>;

export const holderOf: Holder = async (port) => {
  const listening = spawnSync("/usr/sbin/lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-t"], {
    encoding: "utf8",
  });
  const pid = listening.stdout?.split("\n")[0]?.trim();
  if (pid === undefined || pid === "") return undefined;
  const named = spawnSync("/bin/ps", ["-o", "comm=", "-p", pid], { encoding: "utf8" });
  const name = named.stdout?.trim();
  return name === undefined || name === "" ? undefined : basename(name);
};

/** What to install for a program the Mac didn't have, by the name it was called as. */
const INSTALLS: Readonly<Record<string, string>> = {
  node: "Node.js",
  npm: "Node.js",
  npx: "Node.js",
  python: "Python",
  python3: "Python",
  pip: "Python",
  pip3: "Python",
  ruby: "Ruby",
  go: "Go",
  cargo: "Rust",
  deno: "Deno",
  bun: "Bun",
};

const TAKEN = /EADDRINUSE|address already in use/i;

/** The port a program said was taken, from the line that said so, else from where it opens. */
function takenPort(text: string, expects: string | undefined): number | undefined {
  const line = text.split("\n").find((at) => TAKEN.test(at)) ?? "";
  const said = /(?::|port\s+)(\d{2,5})\b/i.exec(line)?.[1];
  const from =
    said ?? (expects === undefined ? undefined : /:(\d{2,5})(?:\/|$)/.exec(expects)?.[1]);
  return from === undefined ? undefined : Number(from);
}

/**
 * What went wrong with a run that ended badly, in plain words, from what it printed and how it
 * ended: Apple's command line tools missing, a program the Mac doesn't have, or a port somebody
 * else holds. Nothing for a crash of any other kind, whose code and last lines say it.
 */
export async function troubleOf(
  log: string,
  code: number | undefined,
  expects: string | undefined,
  holder: Holder,
): Promise<string | undefined> {
  const text = plainOf(log);
  if (/No developer tools were found|invalid active developer path/i.test(text)) {
    return "This needs Apple's command line tools. Install them when your Mac asks, then press Run again.";
  }
  const missing = missingWords(text, code);
  if (missing !== undefined) return missing;
  return TAKEN.test(text) ? await takenWords(text, expects, holder) : undefined;
}

/** A program the Mac doesn't have (or whose shell can't find it), and what to install. */
function missingWords(text: string, code: number | undefined): string | undefined {
  // zsh says "command not found: X", bash "X: command not found", and dash, Linux's sh, "sh: 1: X: not found".
  const tool =
    /command not found:\s*(\S+)/i.exec(text)?.[1] ??
    /(\S+): command not found/i.exec(text)?.[1] ??
    /^\S+: \d+: (\S+): not found$/m.exec(text)?.[1];
  const after = "so the program couldn't start.";
  if (tool !== undefined) {
    return `Chips couldn't find ${tool} on your Mac, ${after} Install ${INSTALLS[tool] ?? tool}, or ask the agents for a version that needs nothing installed.`;
  }
  return code === 127
    ? `Chips couldn't find a program it needs on your Mac, ${after} Ask the agents what to install, or for a version that needs nothing installed.`
    : undefined;
}

/** A port somebody else holds: which, and whose, where the Mac can tell. */
async function takenWords(
  text: string,
  expects: string | undefined,
  holder: Holder,
): Promise<string> {
  const port = takenPort(text, expects);
  const by = port === undefined ? undefined : await holder(port);
  const which = port === undefined ? "Its port" : `Port ${port}`;
  return `${which} is already in use${by === undefined ? "" : ` by ${by}`}, so the program couldn't start. Quit that program, or ask the agents to have it pick a free port.`;
}

/** A running program that never answered where Run waited for it, after how long. */
export function unansweredWords(address: string, waitedMs: number): string {
  const seconds = Math.max(1, Math.round(waitedMs / 1000));
  return `It's running, but nothing answered at ${opensShown(address)} after ${seconds} second${seconds === 1 ? "" : "s"}.`;
}

/**
 * A running program that printed no address, where what the run file opens was somebody else's
 * before Run started anything: Run opened nothing rather than the other program.
 */
export function heldElsewhereWords(opens: string): string {
  return `It's running, but it didn't print an address, and another program already answers at ${opensShown(opens)}, so Run opened nothing. Ask the agents to have it pick a free port and print its address.`;
}
