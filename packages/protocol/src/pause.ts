/**
 * What a pause leaves to a person (ADR 0300, and its addendum of 19 November 2026). A pause (Stop
 * asking, Let it work, For an hour: a `*` yes) answers what an agent asks, except a command that
 * deletes, acts as somebody else, leaves the machine, rewrites history or stops the machine.
 *
 * Every command in the line is found the way a shell finds it (`scanCommands`), and only its
 * program and its own words are matched against the list: a heredoc's text and quoted text are
 * not, unless a shell runs them. What runs another command is read through to it (`timeout 20 find
 * …` is `find …`; `bash -lc 'rm -rf x'` is `rm -rf x`). Where Chips can't tell what runs, the ask
 * goes to a person: a program held in a name the line didn't set, a string it can't read, a shell
 * run on what is piped to it.
 *
 * It reads what an agent writes. It is not a sandbox: a pause already lets `python3 -c` and
 * `node -e` run, so the shell's deliberate back doors to running code (an array index it
 * evaluates, a prompt string, a glob qualifier) are not followed either.
 */

import { listedIn } from "./commands.js";
import { FILLED, type ScannedCommand, scanCommands } from "./shell-scan.js";

/**
 * What a pause asks about: a shorter list than the never list (`NEVER_STANDING`), since a pause
 * already lets `python3 build.py` and `make` run. A `curl` or `wget` is on it only when it reaches
 * past this machine (`staysHere`).
 */
export const NEVER_FOR_A_WHILE: readonly (readonly string[])[] = [
  ["rm"],
  ["rmdir"],
  ["find", "-delete"],
  ["dd"],
  ["mkfs"],
  ["sudo"],
  ["su"],
  ["doas"],
  ["ssh"],
  ["scp"],
  ["rsync"],
  ["curl"],
  ["wget"],
  ["git", "push"],
  ["npm", "publish"],
  ["pnpm", "publish"],
  ["yarn", "publish"],
  ["gh", "api"],
  ["gh", "repo", "delete"],
  ["gh", "pr", "merge"],
  ["gh", "release", "delete"],
  ["kubectl", "delete"],
  ["git", "reset"],
  ["git", "clean"],
  ["shutdown"],
  ["reboot"],
];

/** Whether a pause must leave this command to a person. See `askedForAWhile`. */
export function neverForAWhile(command: string | readonly string[]): boolean {
  return askedForAWhile(command) !== undefined;
}

/**
 * What in a command a pause leaves to a person, in words (`rm`, `git push`, `curl`), or why it
 * can't tell; nothing for a command that goes ahead.
 */
export function askedForAWhile(command: string | readonly string[]): string | undefined {
  const reading: Reading = { depth: 0, elsewhere: false };
  if (typeof command === "string") return lineAsks(command, reading);
  return command.length === 0 ? undefined : commandAsks(alone(command), reading);
}

/** How deep a line is being read, and whether it sends a request somewhere else than it says. */
interface Reading {
  readonly depth: number;
  /** The line sets a proxy, or where `curl` and `wget` read their settings. */
  readonly elsewhere: boolean;
}

/** Past this, a line is not followed, and its ask goes to a person. */
const LONGEST_FOLLOWED = 200_000;
/** A string run by a string run by a string: past this depth it is not followed. */
const DEEPEST_STRING = 6;

const CANT_FOLLOW = "a command Chips can't follow";
const CANT_TELL = "a program Chips can't tell";
const PIPED_SHELL = "a shell run on what is piped to it";

/** A name that sends `curl` or `wget` somewhere else than its address: a proxy, a settings file. */
const ELSEWHERE = /(?:^|[^\w$])(?:[A-Za-z_]*proxy|CURL_HOME|WGETRC|HOME|XDG_CONFIG_HOME)\+?=/i;

/** A command given as words, with nothing fed to it. */
function alone(words: readonly string[]): ScannedCommand {
  return { words, fed: [], piped: false };
}

/** A line's first command a pause asks about. */
function lineAsks(line: string, outer: Reading): string | undefined {
  if (outer.depth > DEEPEST_STRING || line.length > LONGEST_FOLLOWED) return CANT_FOLLOW;
  const commands = scanCommands(line);
  if (commands === undefined) return CANT_FOLLOW;
  const reading = { depth: outer.depth + 1, elsewhere: outer.elsewhere || ELSEWHERE.test(line) };
  for (const command of commands) {
    const asks = commandAsks(command, reading);
    if (asks !== undefined) return asks;
  }
  return undefined;
}

/** The shell's words that stand before a program, and how many words each takes with it. */
const BEFORE_A_PROGRAM: ReadonlyMap<string, number> = new Map([
  ...["!", "if", "then", "else", "elif", "fi", "do", "done", "while", "until", "esac"].map(
    (word) => [word, 1] as const,
  ),
  // zsh's: `noglob rm`, `nocorrect rm`, `- rm`, `repeat 3 rm`, `{ … } always { … }`.
  ...["{", "}", "noglob", "nocorrect", "-", "always"].map((word) => [word, 1] as const),
  ["function", 2],
  ["repeat", 2],
]);

/** The shell's words whose part names no program: a loop's list, a test. */
const NO_PROGRAM: ReadonlySet<string> = new Set(["for", "case", "select", "[[", "in"]);

/** A name set before the program, `FOO=1` or `a[0]=1`. */
const SETS_A_NAME = /^[A-Za-z_][A-Za-z0-9_]*(?:\[[^\]]*\])?\+?=/;

/** A command's words from its program on: names set before it and the shell's own words dropped. */
function fromProgram(words: readonly string[]): readonly string[] {
  let at = 0;
  for (;;) {
    const word = words[at];
    if (word === undefined) return [];
    const skips = word === "coproc" ? coprocSkips(words, at) : BEFORE_A_PROGRAM.get(word);
    if (skips !== undefined) at += skips;
    else if (SETS_A_NAME.test(word)) at += 1;
    else return words.slice(at);
  }
}

/** `coproc rm x` runs `rm`; `coproc NAME { … }` names what it runs. */
function coprocSkips(words: readonly string[], at: number): number {
  const named = /^[A-Za-z_]\w*$/.test(words[at + 1] ?? "");
  return named && (words[at + 2] === "{" || words[at + 2] === undefined) ? 2 : 1;
}

/**
 * The program a word names, by its own name lower-cased (a Mac's disk doesn't tell `RM` from
 * `rm`); nothing where the shell fills in the name or spells it out of braces.
 */
function programName(word: string): string | undefined {
  if (BRACES.test(word)) return undefined;
  // zsh's `=rm` is the path of `rm`.
  const path = word.length > 1 && word.startsWith("=") ? word.slice(1) : word;
  const name = path.slice(path.lastIndexOf("/") + 1).toLowerCase();
  if (name === "" || name.includes(FILLED)) return undefined;
  return name.startsWith("mkfs.") ? "mkfs" : name;
}

/** Braces a shell expands into several words: `{a,b}`, `{1..3}`. */
const BRACES = /\{[^}]*(?:,|\.\.)[^}]*\}/;

/** Whether a pause asks about one command, read through to what it runs. */
function commandAsks(command: ScannedCommand, reading: Reading): string | undefined {
  const words = fromProgram(command.words);
  const [first, ...rest] = words;
  if (first === undefined || NO_PROGRAM.has(first)) return undefined;
  // zsh closes a group without a `;`: `{ true } always { rm -rf x }` is three commands.
  const group = rest.findIndex(
    (word, at) => word === "{" || word === "}" || (word === "always" && rest[at - 1] === "}"),
  );
  if (group !== -1) {
    const head = { ...command, words: [first, ...rest.slice(0, group)] };
    return commandAsks(head, reading) ?? commandAsks(alone(rest.slice(group + 1)), reading);
  }
  const program = programName(first);
  if (program === undefined) return CANT_TELL;
  const through = READ_THROUGH.get(program)?.({ ...command, words }, rest, reading);
  if (through !== undefined) return through;
  if (program === "curl" || program === "wget") {
    const before = command.words.slice(0, command.words.length - words.length);
    const routed = reading.elsewhere || before.some((word) => ELSEWHERE.test(word));
    return !routed && staysHere(program, rest) ? undefined : program;
  }
  return listedIn(NEVER_FOR_A_WHILE, program, rest.flatMap(expandBraces));
}

/** A word's brace expansions, `{push,}` as `push` and ``: a shell's, a few deep. */
function expandBraces(word: string, depth = 0): string[] {
  const match = /^(.*?)\{([^{}]*,[^{}]*)\}(.*)$/s.exec(word);
  if (match === null || depth > 3) return [word];
  const [, head = "", list = "", tail = ""] = match;
  return list.split(",").flatMap((part) => expandBraces(`${head}${part}${tail}`, depth + 1));
}

/** How a program that runs another command is read through to it. */
type Through = (
  command: ScannedCommand,
  rest: readonly string[],
  reading: Reading,
) => string | undefined;

/**
 * A wrapper's words, split where its command starts: its own flags and names set come first, then
 * `count` words it takes (`timeout`'s length of time), and the words left are the command it runs.
 * `takes` are its flags that have a value of their own after them.
 */
function wrapped(
  takes: readonly string[],
  rest: readonly string[],
  count = 0,
): { readonly own: readonly string[]; readonly run: readonly string[] } {
  let at = 0;
  while (at < rest.length) {
    const word = rest[at] as string;
    if (takes.includes(word)) at += 2;
    else if ((word.startsWith("-") && word !== "-") || SETS_A_NAME.test(word)) at += 1;
    else break;
  }
  return { own: rest.slice(0, at), run: rest.slice(at + count) };
}

/** A wrapper is read through to the command it runs, with the names it sets for it. */
function wrapper(takes: readonly string[] = [], count = 0): Through {
  return (command, rest, reading) => {
    const { own, run } = wrapped(takes, rest, count);
    const set = own.filter((word) => SETS_A_NAME.test(word));
    return commandAsks({ ...command, words: [...set, ...run] }, reading);
  };
}

/** `env -S` runs a string split into words, which is not followed. */
const env: Through = (command, rest, reading) => {
  const { own } = wrapped(["-u", "--unset", "-C", "--chdir", "-P"], rest);
  if (own.some((word) => /^(?:-[A-Za-z]*S|--split-string)/.test(word))) return CANT_FOLLOW;
  return wrapper(["-u", "--unset", "-C", "--chdir", "-P"])(command, rest, reading);
};

/** `command -v` only says where a program is. */
const commandBuiltin: Through = (command, rest, reading) => {
  const { own } = wrapped([], rest);
  if (own.some((word) => /^-[A-Za-z]*[vV]/.test(word))) return undefined;
  return wrapper()(command, rest, reading);
};

const XARGS_TAKES = ["-a", "-d", "-E", "-I", "-J", "-L", "-n", "-P", "-R", "-S", "-s"].concat([
  "--arg-file",
  "--delimiter",
  "--max-args",
  "--max-procs",
  "--max-chars",
  "--process-slot-var",
]);

/**
 * `xargs` runs the command it is given with what it reads: in place of the piece it swaps in
 * (`-I {}`), or after the command's words. What it reads is something Chips can't see, so `xargs
 * env` or `xargs sh -c` runs a program Chips can't tell.
 */
const xargs: Through = (command, rest, reading) => {
  const { own, run } = wrapped(XARGS_TAKES, rest);
  if (run.length === 0) return undefined;
  const swap = swappedIn(own);
  const words =
    swap === undefined || swap === ""
      ? [...run, FILLED]
      : run.map((word) => word.split(swap).join(FILLED));
  return commandAsks({ ...command, words }, reading);
};

/** The piece `xargs` swaps each thing in for: after `-I` or `-J`, or `{}` for a bare `-i`. */
function swappedIn(own: readonly string[]): string | undefined {
  const at = own.findIndex((word) => /^(?:-[IJi]|--replace)/.test(word));
  const flag = own[at];
  if (flag === undefined) return undefined;
  const attached = /^(?:-[IJi]|--replace=?)(.*)$/.exec(flag)?.[1] ?? "";
  if (attached !== "") return attached;
  return /^(?:-i|--replace)/.test(flag) ? "{}" : own[at + 1];
}

/** A shell's long flags that have a value of their own after them. */
const SHELL_TAKES: ReadonlySet<string> = new Set(["--rcfile", "--init-file", "--emulate"]);

/**
 * A shell: the string after `-c` is read as a line of its own. Without one it runs a script: one
 * it is fed, or a file it is given (see `scriptAsks`).
 */
const shell: Through = (command, rest, reading) => {
  const { string, operand } = shellHanded(rest);
  if (string) return operand === undefined ? undefined : lineAsks(operand, reading);
  return scriptAsks(command, operand, rest.includes("-s"), reading);
};

/**
 * What a shell was handed: whether `-c` stood among its flags, and its first word that is no flag.
 * Each `o` in a cluster of flags takes the next word (`-eo pipefail`, `-co errexit`).
 */
function shellHanded(rest: readonly string[]): { string: boolean; operand: string | undefined } {
  let string = false;
  for (let at = 0; at < rest.length; at += 1) {
    const word = rest[at] as string;
    if (word === "--") return { string, operand: rest[at + 1] };
    if (SHELL_TAKES.has(word)) at += 1;
    else if (/^[-+][A-Za-z]+$/.test(word)) {
      string ||= word.startsWith("-") && word.includes("c");
      at += word.replace(/[^oO]/g, "").length;
    } else if (!word.startsWith("--")) return { string, operand: word };
  }
  return { string, operand: undefined };
}

/**
 * A shell or `source` running a script. Reading its input (no file, `-s`, `-`, `/dev/stdin`), it
 * runs what it is fed, which is read; or what is piped to it, which Chips can't see. Given a file,
 * it runs it as `python3 build.py` does, unless Chips can't read the file's name.
 */
function scriptAsks(
  command: ScannedCommand,
  operand: string | undefined,
  stdin: boolean,
  reading: Reading,
): string | undefined {
  if (stdin || operand === undefined || /^(?:-|\/dev\/stdin|\/dev\/fd\/0)$/.test(operand)) {
    const fed = command.fed.map((text) => lineAsks(text, reading));
    const asks = fed.find((each) => each !== undefined);
    if (asks !== undefined || command.fed.length > 0) return asks;
    return command.piped ? PIPED_SHELL : undefined;
  }
  return programName(operand) === undefined || operand.startsWith("/dev/fd/")
    ? CANT_TELL
    : undefined;
}

/** `source file` and `. file` run a script in the shell itself. */
const sourced: Through = (command, rest, reading) => {
  const operand = rest.find((word) => !word.startsWith("-"));
  return operand === undefined ? undefined : scriptAsks(command, operand, false, reading);
};

/** `eval` runs its words as a line. */
const evaluated: Through = (_command, rest, reading) => lineAsks(rest.join(" "), reading);

/** `trap` keeps a string to run later: `trap 'rm -rf "$tmp"' EXIT`. `trap - EXIT` resets one. */
const trap: Through = (_command, rest, reading) => {
  const words = rest[0] === "--" ? rest.slice(1) : rest;
  const action = words[0];
  if (action === undefined || action === "-" || /^-[lp]$/.test(action)) return undefined;
  return lineAsks(action, reading);
};

/** `watch` runs its words as a line, over and over. */
const watch: Through = (_command, rest, reading) =>
  lineAsks(wrapped(["-n", "--interval"], rest).run.join(" "), reading);

/** `find -exec` runs the words up to its `;` or `+`, with what it finds in place of `{}`. */
const find: Through = (command, rest, reading) => {
  const words = rest.flatMap((word) => expandBraces(word));
  for (let at = 0; at < words.length; at += 1) {
    if (!/^-(?:exec|execdir|ok|okdir)$/.test(words[at] as string)) continue;
    const ends = words.findIndex((word, index) => index > at && (word === ";" || word === "+"));
    const stop = ends === -1 ? words.length : ends;
    const run = words.slice(at + 1, stop).map((word) => word.split("{}").join(FILLED));
    const asks = commandAsks({ ...command, words: run }, reading);
    if (asks !== undefined) return asks;
    at = stop;
  }
  return undefined;
};

/** `alias x='rm -rf'` makes `x` run its value. */
const alias: Through = (_command, rest, reading) => {
  for (const word of rest) {
    const equals = word.indexOf("=");
    const asks = equals > 0 ? lineAsks(word.slice(equals + 1), reading) : undefined;
    if (asks !== undefined) return asks;
  }
  return undefined;
};

/** `hash -p /bin/rm ls` (bash) and `hash ls=/bin/rm` (zsh) make a name run another program. */
const hash: Through = (command, rest, reading) => {
  const p = rest.indexOf("-p");
  const paths =
    p === -1
      ? rest.filter((word) => word.includes("=")).map((word) => word.slice(word.indexOf("=") + 1))
      : [rest[p + 1] ?? ""];
  for (const path of paths) {
    const asks = commandAsks({ ...command, words: [path] }, reading);
    if (asks !== undefined) return asks;
  }
  return undefined;
};

/** `mapfile -C callback` runs its callback as a line. */
const mapfile: Through = (_command, rest, reading) => {
  const at = rest.indexOf("-C");
  return at === -1 ? undefined : lineAsks(rest[at + 1] ?? "", reading);
};

/** `flock lockfile command…`, or `flock lockfile -c 'line'`. */
const flock: Through = (command, rest, reading) => {
  const { run } = wrapped(["-w", "--timeout", "-E", "--conflict-exit-code"], rest);
  const after = run.slice(1);
  if (after[0] === "-c" || after[0] === "--command") return lineAsks(after[1] ?? "", reading);
  return commandAsks({ ...command, words: after }, reading);
};

/** `script -c 'line' file` (Linux), or `script file command…` (a Mac). */
const script: Through = (command, rest, reading) => {
  const c = rest.findIndex((word) => word === "-c" || word === "--command");
  if (c !== -1) return lineAsks(rest[c + 1] ?? "", reading);
  const { run } = wrapped(["-t", "-T", "-I", "-O", "-B", "-E"], rest);
  return commandAsks({ ...command, words: run.slice(1) }, reading);
};

/** The flags of a program that runs another: those that take a value, and those known not to. */
interface Flags {
  readonly takes: readonly string[];
  readonly plain: readonly string[];
}

/**
 * Where a program's own flags may end and what it runs begin. After a flag it doesn't know, the
 * next word may be that flag's value or the start, so both are given, the start first.
 */
function starts(rest: readonly string[], flags: Flags): number[] {
  const found: number[] = [];
  let unsure = false;
  for (let at = 0; at < rest.length; at += 1) {
    const word = rest[at] as string;
    if (word === "--") return [...found, at + 1];
    if (flags.takes.includes(word)) at += 1;
    else if (word.startsWith("-") && word !== "-") unsure = unknownFlag(word, flags);
    else {
      found.push(at);
      if (!unsure) return found;
      unsure = false;
    }
  }
  return found;
}

/** A flag not known to stand alone, which may take the next word as its value. */
function unknownFlag(word: string, flags: Flags): boolean {
  return !word.includes("=") && !flags.plain.includes(word);
}

/**
 * What a package runner runs (`pnpm exec`, `npm exec`, `npx`, `uv run`): a command after its
 * flags, or with `-c`, `--call` or `--shell-mode` among them a line a shell runs.
 */
function execAsks(
  command: ScannedCommand,
  words: readonly string[],
  flags: Flags,
  reading: Reading,
): string | undefined {
  const line = shellLine(words, flags);
  if (line !== undefined) return lineAsks(line, reading);
  for (const at of starts(words, flags)) {
    const asks = commandAsks({ ...command, words: words.slice(at) }, reading);
    if (asks !== undefined) return asks;
  }
  return undefined;
}

/** The line a runner hands a shell, from its flags; nothing when it hands none. */
function shellLine(words: readonly string[], flags: Flags): string | undefined {
  let at = 0;
  while (at < words.length) {
    const word = words[at] as string;
    if (/^(?:-c|--call|--shell-mode)$/.test(word)) return words.slice(at + 1).join(" ");
    if (word.startsWith("--call=")) return [word.slice(7), ...words.slice(at + 1)].join(" ");
    if (word === "--" || !word.startsWith("-")) return undefined;
    at += flags.takes.includes(word) ? 2 : 1;
  }
  return undefined;
}

/** How a program with commands of its own (`git push`, `pnpm exec`) is read. */
interface Commanded {
  /** Its flags before its command. */
  readonly global: Flags;
  /** How many of its first words name its command: `gh repo delete` has two. */
  readonly naming?: number;
  /** Its commands that run another, each with its own flags. */
  readonly runs?: ReadonlyMap<string, Flags>;
  /** Whether a word that isn't one of its commands is a program it runs (pnpm's way). */
  readonly orRuns?: ReadonlySet<string>;
}

/**
 * A program with commands of its own: a command Chips can't read could be any of them; a command
 * that runs another is read through to it.
 */
function commanded(how: Commanded): Through {
  return (command, rest, reading) => {
    for (const at of starts(rest, how.global)) {
      const named = rest.slice(at, at + (how.naming ?? 1));
      if (named.some((word) => word.includes(FILLED))) return CANT_TELL;
      const asks = verbAsks(how, command, rest, at, reading);
      if (asks !== undefined) return asks;
    }
    return undefined;
  };
}

/** What a program's command at `at` runs: another command, or (pnpm's way) itself as a program. */
function verbAsks(
  how: Commanded,
  command: ScannedCommand,
  rest: readonly string[],
  at: number,
  reading: Reading,
): string | undefined {
  const verb = rest[at] ?? "";
  const flags = how.runs?.get(verb);
  if (flags !== undefined) return execAsks(command, rest.slice(at + 1), flags, reading);
  if (how.orRuns === undefined || how.orRuns.has(verb)) return undefined;
  return commandAsks({ ...command, words: rest.slice(at) }, reading);
}

const GIT_TAKES = ["-C", "-c", "--git-dir", "--work-tree", "--namespace", "--exec-path"].concat([
  "--config-env",
  "--super-prefix",
]);

/**
 * `git`: an alias set on the line could be any command; `submodule foreach`, `rebase --exec` and
 * `bisect run` run commands of their own.
 */
const git: Through = (_command, rest, reading) => {
  const { own, run } = wrapped(GIT_TAKES, rest);
  const config = own.filter((_, at) => own[at - 1] === "-c" || own[at - 1] === "--config-env");
  if (config.some((word) => /^(?:alias\.|help\.autocorrect)/i.test(word))) return CANT_TELL;
  const [sub, ...after] = run;
  if (sub === undefined) return undefined;
  if (sub.includes(FILLED)) return CANT_TELL;
  return GIT_RUNS.get(sub)?.(after, reading);
};

const GIT_RUNS: ReadonlyMap<
  string,
  (after: readonly string[], reading: Reading) => string | undefined
> = new Map([
  ["config", (after) => (after.some((word) => /^alias\./i.test(word)) ? CANT_TELL : undefined)],
  [
    "submodule",
    (after, reading) => {
      const at = after.indexOf("foreach");
      if (at === -1) return undefined;
      return lineAsks(wrapped([], after.slice(at + 1)).run.join(" "), reading);
    },
  ],
  [
    "rebase",
    (after, reading) => {
      const lines = after.flatMap((word, at) =>
        word === "-x" || word === "--exec"
          ? [after[at + 1] ?? ""]
          : word.startsWith("--exec=")
            ? [word.slice(7)]
            : [],
      );
      return lines.map((line) => lineAsks(line, reading)).find((asks) => asks !== undefined);
    },
  ],
  [
    "bisect",
    (after, reading) =>
      after[0] === "run" ? commandAsks(alone(after.slice(1)), reading) : undefined,
  ],
]);

/** pnpm's own commands; anything else it is given, it runs as a program. */
const PNPM_COMMANDS: ReadonlySet<string> = new Set(
  (
    "add install i update up upgrade remove rm uninstall un link ln unlink import rebuild rb " +
    "prune fetch patch patch-commit patch-remove audit list ls ll la outdated why licenses run " +
    "run-script test t tst start exec dlx create publish pack store root bin config c get set " +
    "setup init deploy env recursive multi m server doctor help self-update cat-file cat-index " +
    "find-hash approve-builds ignored-builds install-test it dedupe sbom version"
  ).split(" "),
);

const NPM_EXEC: Flags = {
  takes: ["--package", "-p", "-w", "--workspace", "--prefix", "-C"],
  plain: ["-y", "--yes", "--no", "-ws", "--workspaces", "--include-workspace-root", "-q", "-s"],
};

const UV_PLAIN = ["-q", "--quiet", "-v", "--verbose", "-n", "--no-cache", "--offline"].concat(
  ["--native-tls", "--no-progress", "--no-config", "--preview", "--isolated", "--frozen"],
  ["--locked", "--managed-python", "--no-managed-python", "--no-python-downloads"],
);
const UV_TAKES = ["--color", "--cache-dir", "--config-file", "--directory", "--project"].concat(
  ["--python-preference", "--allow-insecure-host", "--index-url", "--extra-index-url"],
  ["--find-links", "-f", "--index", "--default-index"],
);

/**
 * What runs another command, by its program. Each is read through to that command, so none is on
 * the pause's list itself.
 */
const READ_THROUGH: ReadonlyMap<string, Through> = new Map<string, Through>([
  ["timeout", wrapper(["-k", "--kill-after", "-s", "--signal"], 1)],
  ["gtimeout", wrapper(["-k", "--kill-after", "-s", "--signal"], 1)],
  ["env", env],
  ["nice", wrapper(["-n", "--adjustment"])],
  ["nohup", wrapper()],
  ["time", wrapper(["-o", "--output", "-f", "--format"])],
  ["command", commandBuiltin],
  ["builtin", wrapper()],
  ["exec", wrapper(["-a"])],
  ["caffeinate", wrapper(["-t", "-w"])],
  ["stdbuf", wrapper(["-i", "-o", "-e"])],
  ["arch", wrapper(["-arch", "-e", "-d"])],
  ["setsid", wrapper()],
  ["unbuffer", wrapper()],
  ["taskpolicy", wrapper(["-c", "-t", "-l", "-g", "-p"])],
  ["ionice", wrapper(["-c", "-n", "-p"])],
  ["xcrun", wrapper(["-sdk", "--sdk", "-toolchain", "--toolchain"])],
  ["flock", flock],
  ["script", script],
  ["xargs", xargs],
  ["sh", shell],
  ["bash", shell],
  ["zsh", shell],
  ["dash", shell],
  ["ksh", shell],
  ["source", sourced],
  [".", sourced],
  ["eval", evaluated],
  ["trap", trap],
  ["watch", watch],
  ["find", find],
  ["alias", alias],
  ["hash", hash],
  ["mapfile", mapfile],
  ["readarray", mapfile],
  ["git", git],
  ["gh", commanded({ global: { takes: ["-R", "--repo", "--hostname"], plain: [] }, naming: 2 })],
  [
    "kubectl",
    commanded({
      global: {
        takes: ["-n", "--namespace", "--context", "--cluster", "--kubeconfig", "-s", "--server"],
        plain: [],
      },
    }),
  ],
  [
    "npm",
    commanded({
      global: { takes: ["-C", "--prefix", "-w", "--workspace", "--userconfig"], plain: [] },
      runs: new Map([
        ["exec", NPM_EXEC],
        ["x", NPM_EXEC],
      ]),
    }),
  ],
  ["npx", (command, rest, reading) => execAsks(command, rest, NPM_EXEC, reading)],
  [
    "pnpm",
    commanded({
      global: {
        takes: ["-C", "--dir", "--filter", "-F", "--reporter", "--loglevel", "--filter-prod"],
        plain: ["-r", "--recursive", "-w", "--workspace-root", "--silent", "-s", "--parallel"],
      },
      runs: new Map([
        ["exec", { takes: ["--resume-from", "--filter", "-F", "-C", "--dir"], plain: ["-r"] }],
      ]),
      orRuns: PNPM_COMMANDS,
    }),
  ],
  [
    "yarn",
    commanded({
      global: { takes: ["--cwd"], plain: ["-s", "--silent"] },
      runs: new Map([["exec", { takes: [], plain: [] }]]),
    }),
  ],
  [
    "uv",
    commanded({
      global: { takes: UV_TAKES, plain: UV_PLAIN },
      runs: new Map([
        [
          "run",
          {
            takes: UV_TAKES.concat(["--with", "--with-editable", "--with-requirements"]).concat([
              "--python",
              "-p",
              "--env-file",
              "--group",
              "--extra",
              "--package",
              "--no-group",
            ]),
            plain: UV_PLAIN.concat([
              "--no-project",
              "--no-sync",
              "--active",
              "--all-extras",
            ]).concat([
              "--all-groups",
              "--no-dev",
              "--dev",
              "--script",
              "-s",
              "--module",
              "-m",
              "--exact",
            ]),
          },
        ],
      ]),
    }),
  ],
]);

/** A flag list as written, one word each. */
function flagSet(words: string): ReadonlySet<string> {
  return new Set(words.split(" "));
}

/** The flags that leave a `curl` going where its address says; `takes` have a value after them. */
const CURL = {
  plain: flagSet(
    "-s -S -f -i -I -L -v -k -g -N -G -O -J -# -4 -6 -q -n -Z --silent --show-error --fail " +
      "--fail-with-body --fail-early --include --head --location --verbose --insecure --globoff " +
      "--no-buffer --get --remote-name --remote-name-all --remote-header-name --compressed " +
      "--no-progress-meter --progress-bar --http1.0 --http1.1 --http2 --http2-prior-knowledge " +
      "--path-as-is --retry-connrefused --retry-all-errors --create-dirs --ipv4 --ipv6 --raw " +
      "--tcp-nodelay --digest --basic --anyauth --location-trusted --post301 --post302 " +
      "--post303 --styled-output --no-styled-output --disable --netrc --parallel",
  ),
  takes: flagSet(
    "-X -H -d -o -w -m -u -A -e -b -c -F -D -T -r -E -Y -y -z --request --header --data " +
      "--data-raw --data-binary --data-urlencode --json --output --write-out --max-time " +
      "--connect-timeout --retry --retry-delay --retry-max-time --user --user-agent --referer " +
      "--cookie --cookie-jar --form --dump-header --upload-file --range --max-redirs " +
      "--noproxy --limit-rate --max-filesize --trace --trace-ascii --stderr --cacert --cert " +
      "--key --keepalive-time --oauth2-bearer --speed-limit --speed-time --time-cond " +
      "--etag-save --etag-compare --url-query --unix-socket --netrc-file --expect100-timeout",
  ),
};

/** The same for `wget`. */
const WGET = {
  plain: flagSet(
    "-q -S -v -c -N -nv -nc --quiet --spider --server-response --verbose --no-verbose " +
      "--continue --no-check-certificate --no-clobber",
  ),
  takes: flagSet(
    "-O -T -t -o -P --output-document --timeout --tries --header --post-data --method " +
      "--body-data --output-file --directory-prefix",
  ),
};

/** An address on this machine: `localhost`, `127.x.x.x`, `0.0.0.0` or `[::1]`, any port and path. */
const ON_THIS_MACHINE = new RegExp(
  String.raw`^(?:https?:\/\/)?(?:localhost|127(?:\.\d{1,3}){3}|0\.0\.0\.0|\[::1\])` +
    String.raw`(?::[\d${FILLED}]+)?(?:[\/?#].*)?$`,
  "is",
);

/**
 * Whether a `curl` or `wget` stays on this machine: every address it names is this machine's own,
 * it names at least one, and every flag is one known to leave it going there. A flag it doesn't
 * know (`--proxy`, `--resolve`, `--connect-to`, `--config`) could send it anywhere.
 */
function staysHere(program: string, rest: readonly string[]): boolean {
  const known = program === "curl" ? CURL : WGET;
  let addresses = 0;
  for (let at = 0; at < rest.length; at += 1) {
    const word = rest[at] as string;
    if (!word.startsWith("-") || word === "-") {
      if (!ON_THIS_MACHINE.test(word)) return false;
      addresses += 1;
      continue;
    }
    const taken = flagTakes(known, word);
    if (taken === undefined) return false;
    at += taken;
  }
  return addresses > 0;
}

type KnownFlags = { readonly plain: ReadonlySet<string>; readonly takes: ReadonlySet<string> };

/** How many of the words after a flag are its value (0 or 1); nothing for a flag not known. */
function flagTakes(known: KnownFlags, word: string): number | undefined {
  const [name = "", value] = word.startsWith("--") ? word.split(/=(.*)/s) : [word];
  if (known.plain.has(name)) return 0;
  if (known.takes.has(name)) return value === undefined ? 1 : 0;
  return word.startsWith("--") ? undefined : shortFlagsTake(known, word);
}

/** The same for short flags written together: `-sS`, `-so file`, `-XPOST`. */
function shortFlagsTake(known: KnownFlags, word: string): number | undefined {
  for (let at = 1; at < word.length; at += 1) {
    const flag = `-${word[at] as string}`;
    if (known.takes.has(flag)) return at === word.length - 1 ? 1 : 0;
    if (!known.plain.has(flag)) return undefined;
  }
  return 0;
}
