/**
 * A command an ask carries, read the way a shell would read it (ADR 0239), so that a standing yes
 * remembers how each part of it starts rather than the whole kind of action. Here, so the server,
 * the conformance kit's fake and the apps read a command the same way.
 *
 * A command is the ask's `input.command`: a string a shell runs, or an array of words a program
 * runs as given. A string is split into parts at `&&`, `||`, `;`, `|` and new lines outside
 * quotes, and each part into words, quotes taken off. A command that does more than this reader
 * can follow is not read at all: a redirection (`>`, `<`), something run inside it (`$(`,
 * backticks, `$`, parentheses, braces), a part run in the background (`&`), a variable set before
 * the program (`FOO=1 node`), a comment, or an empty part. Its ask is answered each time.
 *
 * Chips still never sees the tool call itself; it reads the words the harness sent in its ask.
 */

/** The parts of a command, each as its words; nothing for one this reader can't follow. */
export type CommandParts = readonly (readonly string[])[];

/** Past this, a command is not read: a standing yes is for the commands a person reads. */
const LONGEST = 10_000;

/** What a command is, from an ask's input: its string or its words, or nothing. */
export function askedCommand(input: unknown): string | readonly string[] | undefined {
  if (typeof input !== "object" || input === null) return undefined;
  const command = (input as Record<string, unknown>)["command"];
  if (typeof command === "string") return command.trim() === "" ? undefined : command;
  if (
    Array.isArray(command) &&
    command.length > 0 &&
    command.every((word) => typeof word === "string" && word !== "")
  ) {
    return command as readonly string[];
  }
  return undefined;
}

/** The command's parts, each as its words; nothing for a command this reader can't follow. */
export function commandParts(command: string | readonly string[]): CommandParts | undefined {
  if (typeof command !== "string") return command.length === 0 ? undefined : [[...command]];
  if (command.length > LONGEST) return undefined;
  const reader = new Reader(command);
  const parts = reader.read();
  // A variable set before the program changes what runs, and a shell's own word (`if`, `!`)
  // runs the words after it, which the parts would not show as a program.
  const unread = parts?.some(
    (part) => /^[A-Za-z_][A-Za-z0-9_]*=/.test(part[0] ?? "") || KEYWORDS.has(part[0] ?? ""),
  );
  return unread === false ? parts : undefined;
}

/** One pass over a command's characters: `false` from a step means it can't be read. */
class Reader {
  private readonly parts: string[][] = [];
  private words: string[] = [];
  private word: string | undefined;
  private quote: "'" | '"' | undefined;
  private at = 0;

  constructor(private readonly command: string) {}

  read(): string[][] | undefined {
    for (; this.at < this.command.length; this.at += 1) {
      const char = this.command[this.at] as string;
      const fine =
        this.quote === "'"
          ? this.single(char)
          : this.quote === '"'
            ? this.double(char)
            : this.bare(char);
      if (!fine) return undefined;
    }
    if (this.quote !== undefined) return undefined;
    this.endWord();
    if (this.words.length > 0) this.parts.push(this.words);
    // A chain left open (`ls &&`, `ls |`) is not a command; a last `;` or new line is.
    else if (this.parts.length === 0 || !/[;\n]\s*$/.test(this.command)) return undefined;
    return this.parts;
  }

  /** Inside single quotes everything is itself, up to the closing quote. */
  private single(char: string): boolean {
    if (char === "'") this.quote = undefined;
    else this.word += char;
    return true;
  }

  /** Inside double quotes a shell still runs `$` and backticks, so those can't be read. */
  private double(char: string): boolean {
    if (char === '"') this.quote = undefined;
    else if (char === "$" || char === "`") return false;
    else if (char === "\\" && '"\\$`'.includes(this.command[this.at + 1] ?? "")) {
      this.at += 1;
      this.word += this.command[this.at] as string;
    } else this.word += char;
    return true;
  }

  private bare(char: string): boolean {
    if (char === "'" || char === '"') {
      this.quote = char;
      this.word ??= "";
      return true;
    }
    if (char === "\\") return this.escaped();
    if (char === " " || char === "\t") {
      this.endWord();
      return true;
    }
    const between = this.between(char);
    if (between !== undefined) return between;
    if ("<>()&$`{}".includes(char) || (char === "#" && this.word === undefined)) return false;
    this.word = (this.word ?? "") + char;
    return true;
  }

  /** Where one part ends and the next starts, if it does here: `&&`, `||`, `;`, `|`, a new line. */
  private between(char: string): boolean | undefined {
    const pair = this.command.slice(this.at, this.at + 2);
    if (pair === "&&" || pair === "||") {
      this.at += 1;
      return this.endPart();
    }
    return char === ";" || char === "|" || char === "\n" ? this.endPart() : undefined;
  }

  /** A backslash outside quotes makes the next character itself; at the end it continues a line. */
  private escaped(): boolean {
    const next = this.command[this.at + 1];
    if (next === undefined || next === "\n") return false;
    this.word = (this.word ?? "") + next;
    this.at += 1;
    return true;
  }

  private endWord(): void {
    if (this.word !== undefined) this.words.push(this.word);
    this.word = undefined;
  }

  /** A part ends at `&&`, `||`, `;`, `|` or a new line; an empty one can't be read. */
  private endPart(): boolean {
    this.endWord();
    if (this.words.length === 0) return false;
    this.parts.push(this.words);
    this.words = [];
    return true;
  }
}

/** The shell's own words, which run what follows them rather than being a program. */
const KEYWORDS: ReadonlySet<string> = new Set([
  "!",
  "if",
  "then",
  "else",
  "elif",
  "fi",
  "for",
  "while",
  "until",
  "do",
  "done",
  "case",
  "esac",
  "select",
  "function",
  "coproc",
  "[[",
  "]]",
]);

/**
 * The commands a standing yes is never given for (ADR 0239): they can't be undone, leave the
 * machine, act as somebody else, or run whatever code or command they are given. A part matches
 * an entry of one word when its program is that word, and an entry of two when its program is the
 * first and the second is among its words, wherever it stands (`git -C dir push`).
 */
export const NEVER_STANDING: readonly (readonly string[])[] = [
  ["rm"],
  ["rmdir"],
  ["sudo"],
  ["su"],
  ["doas"],
  ["chmod"],
  ["chown"],
  ["dd"],
  ["mkfs"],
  ["kill"],
  ["killall"],
  ["pkill"],
  ["shutdown"],
  ["reboot"],
  ["curl"],
  ["wget"],
  ["ssh"],
  ["scp"],
  ["rsync"],
  ["git", "push"],
  ["git", "reset"],
  ["git", "clean"],
  ["find", "-exec"],
  ["find", "-execdir"],
  ["find", "-ok"],
  ["find", "-delete"],
  ["sh", "-c"],
  ["bash", "-c"],
  ["zsh", "-c"],
  ["eval"],
  ["exec"],
  ["xargs"],
  ["env"],
  ["command"],
  ["builtin"],
  ["nohup"],
  ["time"],
  ["timeout"],
  ["nice"],
  ["watch"],
  ["node", "-e"],
  ["node", "--eval"],
  ["python", "-c"],
  ["python3", "-c"],
  ["perl", "-e"],
  ["ruby", "-e"],
];

/** A program's own name, from a path to it: `/bin/rm` is `rm`. */
function programOf(word: string): string {
  return word.slice(word.lastIndexOf("/") + 1);
}

/** The listed command a part uses, in words (`rm`, `git push`); nothing for one not listed. */
export function neverStanding(parts: CommandParts): string | undefined {
  for (const part of parts) {
    const program = programOf(part[0] ?? "");
    const rest = part.slice(1);
    const listed = NEVER_STANDING.find(
      ([first, second]) => first === program && (second === undefined || rest.includes(second)),
    );
    if (listed !== undefined) return listed.join(" ");
  }
  return undefined;
}

/** How a part starts, as a standing yes remembers it: its first two words, or its one. */
export function startOf(part: readonly string[]): readonly string[] {
  return part.slice(0, 2);
}

/** Each part's start, once each, in the command's order. */
export function commandStarts(parts: CommandParts): readonly (readonly string[])[] {
  const starts: (readonly string[])[] = [];
  for (const part of parts) {
    const start = startOf(part);
    if (!starts.some((kept) => sameWords(kept, start))) starts.push(start);
  }
  return starts;
}

/** Whether the part begins with these words, each exactly. */
export function startsWith(part: readonly string[], start: readonly string[]): boolean {
  return start.length > 0 && start.length <= part.length && start.every((w, i) => part[i] === w);
}

function sameWords(one: readonly string[], other: readonly string[]): boolean {
  return one.length === other.length && one.every((w, i) => other[i] === w);
}

/**
 * What a standing yes on this ask would remember, or why there is none: the starts, or that the
 * command can't be read, or the listed command it uses. Nothing for an ask with no command.
 */
export type StandingOffer =
  | { readonly kind: "starts"; readonly starts: readonly (readonly string[])[] }
  | { readonly kind: "unreadable" }
  | { readonly kind: "never"; readonly command: string };

export function standingOffer(input: unknown): StandingOffer | undefined {
  const command = askedCommand(input);
  if (command === undefined) return undefined;
  const parts = commandParts(command);
  if (parts === undefined) return { kind: "unreadable" };
  const never = neverStanding(parts);
  if (never !== undefined) return { kind: "never", command: never };
  return { kind: "starts", starts: commandStarts(parts) };
}
