/**
 * The words after `chips`: the command, the flags, and the words that are neither.
 *
 * `--server http://…` and `--server=http://…` are the same flag. The second used to be ignored
 * without a word, and `chips pair` then fell back to the server on this machine (the onboarding
 * audit, item 37). A flag `chips` doesn't know is refused rather than ignored, and so is a flag
 * that takes a value and was given none, or a port that is not one. The words that are not flags
 * are found wherever they stand, so `chips pair --server <address> <code>`, the order the guides
 * give, reads the code as the code (item 6).
 */

/** The flags that take the word after them, or the word after `=`. */
const VALUED = ["--reach", "--name", "--server", "--port", "--timeout", "--capabilities"] as const;

/** The flags that are on when given. */
const SWITCHES = [
  "--yes",
  "-y",
  "--no-service",
  "--no-open",
  "--remove-data",
  "--issue",
  "--rotate",
  "--no-dial",
  "--json",
  "--update",
  "--help",
  "-h",
] as const;

type Valued = (typeof VALUED)[number];

export interface Flags {
  readonly yes: boolean;
  readonly noService: boolean;
  readonly noOpen: boolean;
  readonly removeData: boolean;
  readonly reach: string | undefined;
  readonly issue: boolean;
  readonly rotate: boolean;
  readonly noDial: boolean;
  readonly json: boolean;
  readonly update: boolean;
  /** `--help` anywhere: the usage, and nothing run. */
  readonly help: boolean;
  readonly name: string | undefined;
  readonly server: string | undefined;
  readonly port: number | undefined;
  readonly timeout: number | undefined;
  readonly capabilities: readonly string[] | undefined;
}

export type Args =
  | {
      readonly ok: true;
      readonly command: string;
      readonly flags: Flags;
      /** The words after the command that are not flags or a flag's value: `<code>`, `<id>`, `<link>`. */
      readonly words: readonly string[];
    }
  | { readonly ok: false; readonly problem: string };

const isValued = (flag: string): flag is Valued => (VALUED as readonly string[]).includes(flag);
const isSwitch = (flag: string): boolean => (SWITCHES as readonly string[]).includes(flag);

/** `chips <command> [words and flags]`, read; or what was wrong with it. */
export function readArgs(argv: readonly string[]): Args {
  const read = readWords(argv.slice(1));
  if ("problem" in read) return { ok: false, problem: read.problem };
  const port = numberOf(read.values.get("--port"));
  if (read.values.has("--port") && port === undefined) {
    return { ok: false, problem: "`--port` takes a port, a number from 1 to 65535." };
  }
  const timeout = numberOf(read.values.get("--timeout"));
  if (read.values.has("--timeout") && timeout === undefined) {
    return { ok: false, problem: "`--timeout` takes a number of seconds." };
  }
  const on = (...names: string[]) => names.some((name) => read.switches.has(name));
  const { values } = read;
  return {
    ok: true,
    command: argv[0] ?? "help",
    words: read.words,
    flags: {
      yes: on("--yes", "-y"),
      noService: on("--no-service"),
      noOpen: on("--no-open"),
      removeData: on("--remove-data"),
      issue: on("--issue"),
      rotate: on("--rotate"),
      noDial: on("--no-dial"),
      json: on("--json"),
      update: on("--update"),
      help: on("--help", "-h"),
      reach: values.get("--reach"),
      name: values.get("--name"),
      server: values.get("--server"),
      port,
      timeout,
      capabilities: listOf(values.get("--capabilities")),
    },
  };
}

interface Read {
  readonly words: string[];
  readonly values: Map<Valued, string>;
  readonly switches: Set<string>;
}

/** The words after the command, sorted into words, flags with values, and switches. */
function readWords(rest: readonly string[]): Read | { readonly problem: string } {
  const read: Read = { words: [], values: new Map(), switches: new Set() };
  for (let at = 0; at < rest.length; at += 1) {
    const word = rest[at] ?? "";
    if (!word.startsWith("-") || word === "-") {
      read.words.push(word);
      continue;
    }
    const taken = takeFlag(word, rest[at + 1]);
    if ("problem" in taken) return taken;
    if (taken.value === undefined) read.switches.add(taken.flag);
    else read.values.set(taken.flag as Valued, taken.value);
    at += taken.used;
  }
  return read;
}

type Taken =
  | { readonly flag: string; readonly value?: string | undefined; readonly used: number }
  | { readonly problem: string };

/** One flag: `--flag`, `--flag value` or `--flag=value`, and how many words after it it used. */
function takeFlag(word: string, next: string | undefined): Taken {
  const equals = word.indexOf("=");
  const flag = equals === -1 ? word : word.slice(0, equals);
  const inline = equals === -1 ? undefined : word.slice(equals + 1);
  if (isValued(flag)) return valued(flag, inline, next);
  if (!isSwitch(flag))
    return { problem: `\`chips\` has no flag \`${flag}\`. \`chips help\` lists them.` };
  return inline === undefined ? { flag, used: 0 } : { problem: `\`${flag}\` takes no value.` };
}

/** A valued flag's value, after `=` or as the next word; a flag given none is refused. */
function valued(flag: Valued, inline: string | undefined, next: string | undefined): Taken {
  const value = inline ?? next;
  if (value === undefined || value === "" || (inline === undefined && value.startsWith("--"))) {
    return { problem: `\`${flag}\` takes a value: \`${flag} <${nameOf(flag)}>\`.` };
  }
  return { flag, value, used: inline === undefined ? 1 : 0 };
}

/** What a valued flag's value is called, for the line that says it is missing. */
function nameOf(flag: Valued): string {
  if (flag === "--server") return "address";
  if (flag === "--timeout") return "seconds";
  if (flag === "--capabilities") return "a,b";
  return flag.slice(2);
}

/** `a,b, c` as `["a", "b", "c"]`; nothing when the flag was not given. */
function listOf(raw: string | undefined): readonly string[] | undefined {
  if (raw === undefined) return undefined;
  return raw
    .split(",")
    .map((each) => each.trim())
    .filter((each) => each !== "");
}

function numberOf(raw: string | undefined): number | undefined {
  if (raw === undefined || !/^\d+$/.test(raw.trim())) return undefined;
  const parsed = Number.parseInt(raw, 10);
  return parsed > 0 && parsed < 65_536 ? parsed : undefined;
}

/**
 * A server's address as somebody typed it: `192.168.1.20:4431` gets its `http://`, and a slash at
 * the end goes. Undefined for what is no address at all.
 */
export function serverAddress(typed: string): string | undefined {
  const trimmed = typed.trim().replace(/\/+$/, "");
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
  try {
    const url = new URL(withScheme);
    if (url.protocol !== "http:" && url.protocol !== "https:") return undefined;
    return url.origin;
  } catch {
    return undefined;
  }
}
