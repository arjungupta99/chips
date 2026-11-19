/**
 * Every command in a line a shell would run, found the way a shell finds it (ADR 0300, addendum of
 * 19 November 2026): in a chain, a loop, an `if`, `$(…)`, backticks, `<(…)`, a function's body.
 * For a pause, which must tell `rm` the program from `rm` the word in a script's text.
 *
 * This is not the reader a standing yes uses (`commandParts`), which refuses whatever it can't
 * follow. This one refuses nothing and follows as far as it can:
 *
 * - Quotes are taken off, so `r''m`, `"rm"`, `\rm` and `$'\x72m'` are all `rm`.
 * - A redirection's file is not one of the command's words. A heredoc's text is kept apart, as
 *   what the command is fed, and is not read as commands here; its closing word is read as
 *   written, as a shell reads it.
 * - What a shell fills in when it runs (`$NAME`, `$(…)`, a glob) is marked in the word with
 *   `FILLED`, unless the line sets the name once and nowhere else touches it: after
 *   `U=http://localhost:3000;`, `"$U/api"` is read whole. Unquoted, a name set where the setting
 *   might not run is not read, since an empty name drops out and the next word takes its place.
 *
 * It reads what an agent writes, with whatever quoting, wrapping and chaining a shell allows. It
 * is not a sandbox: a pause already lets `python3 -c` run, so ways of running code that only a
 * deliberate trick would use (an array index a shell evaluates, a prompt string) are not followed.
 */

/** Stands in a word where a shell fills something in that this scan can't know. */
export const FILLED = "\u0000";

/** One command of the line: its words with quotes off, and what reaches its input. */
export interface ScannedCommand {
  readonly words: readonly string[];
  /** The text a heredoc or a here-string feeds it. */
  readonly fed: readonly string[];
  /** Whether its input is another command's output, or anything else Chips can't read. */
  readonly piped: boolean;
}

/** Deeper than this inside `$(…)` is not followed. */
const DEEPEST = 12;

/** What one scan of a line gathers, shared with the scans of what runs inside it. */
interface Found {
  readonly commands: ScannedCommand[];
  /** The names the line sets, with their values as written, and whether it surely set them. */
  readonly names: Map<string, Named>;
  /** Whether a name's value may be read: the line sets it once and touches it nowhere else. */
  readonly knowable: (name: string) => boolean;
  /** Whether the parts so far only set names, each ended by `;` or a new line. */
  leading: boolean;
  /** Whether something ran deeper inside than is followed. */
  lost: boolean;
}

/** The line's commands, in the order they stand; nothing when it nests deeper than is followed. */
export function scanCommands(line: string): readonly ScannedCommand[] | undefined {
  const found: Found = {
    commands: [],
    names: new Map(),
    knowable: knowable(line),
    leading: true,
    lost: false,
  };
  new Scan(line, found, 0, false).run();
  return found.lost ? undefined : found.commands;
}

/**
 * Which names' values a line lets be read: none where it sets `IFS`, which changes how a value
 * splits; else a name that stands bare only once (its own `NAME=`), so nothing unsets, appends to,
 * reads into or loops over it, and no `${NAME:=…}` gives it another value.
 */
function knowable(line: string): (name: string) => boolean {
  if (/(?:^|[^\w$])IFS\+?=/.test(line)) return () => false;
  const bare = new Map<string, number>();
  for (const [name] of line.matchAll(/(?<![\w$])(?<!\$\{)[A-Za-z_]\w*/g)) {
    bare.set(name, (bare.get(name) ?? 0) + 1);
  }
  const given = new Set([...line.matchAll(/\$\{([A-Za-z_]\w*):?=/g)].map((match) => match[1]));
  return (name) => bare.get(name) === 1 && !given.has(name);
}

/**
 * A name the line sets once and touches nowhere else. Where it is used, it holds this value, or
 * nothing at all if the setting didn't run (it stood after `&&`, in a subshell, in a function).
 * `sure` where nothing could keep the setting from running: it stood in the line's opening parts.
 */
interface Named {
  readonly value: string;
  readonly sure: boolean;
}

/** A heredoc opened on this line, whose text starts on the next. */
interface Heredoc {
  readonly closes: string;
  /** `<<-`: tabs before the closing word are dropped. */
  readonly tabs: boolean;
  /** Its closing word was quoted, so the shell fills nothing in. */
  readonly literal: boolean;
  /** Where its text goes: the place it holds in what its command is fed. */
  readonly into: string[];
  readonly at: number;
}

const NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;
const SETS = /^[A-Za-z_][A-Za-z0-9_]*=/;
/** Words that set a name for the rest of the line when they stand first. */
const SETTERS: ReadonlySet<string> = new Set(["export", "local", "readonly", "declare", "typeset"]);
/** Where the word a redirection points at ends. */
const ENDS_TARGET = " \t\n;|&()<>";
/** The characters before which a word starts. */
const BEFORE_A_WORD = " \t\n;&|()";
/** What a backslash stands for in `$'…'`, by the letter after it. */
const ANSI: Readonly<Record<string, string>> = {
  a: "\u0007",
  b: "\b",
  e: "\u001b",
  E: "\u001b",
  f: "\f",
  n: "\n",
  r: "\r",
  t: "\t",
  v: "\v",
  "\\": "\\",
  "'": "'",
  '"': '"',
  "?": "?",
};

class Scan {
  private at = 0;
  private words: string[] = [];
  private word: string | undefined;
  private fed: string[] = [];
  private unseen = false;
  private waiting: Heredoc[] = [];

  constructor(
    private readonly text: string,
    private readonly found: Found,
    private readonly depth: number,
    /** Whether the first command's input comes from outside: `>(…)`. */
    private piped: boolean,
  ) {}

  /** What each character outside quotes does; any other is part of a word. */
  private static readonly STEPS: Readonly<Record<string, (this: Scan) => void>> = {
    " ": Scan.prototype.endWord,
    "\t": Scan.prototype.endWord,
    "\n": Scan.prototype.newLine,
    "\\": Scan.prototype.escaped,
    "'": Scan.prototype.single,
    '"': Scan.prototype.double,
    $: Scan.prototype.dollar,
    "`": Scan.prototype.backticks,
    "#": Scan.prototype.comment,
    "&": Scan.prototype.ampersand,
    "|": Scan.prototype.bar,
    ";": Scan.prototype.semicolon,
    "(": Scan.prototype.opens,
    ")": Scan.prototype.endCommand,
    "<": Scan.prototype.redirect,
    ">": Scan.prototype.redirect,
    "*": Scan.prototype.glob,
    "?": Scan.prototype.glob,
    "[": Scan.prototype.bracket,
  };

  run(): void {
    while (this.at < this.text.length) this.step();
    this.endCommand();
  }

  /** One character, or the whole of what it opens; leaves `at` on the next to read. */
  private step(): void {
    const char = this.text[this.at] as string;
    const does = Scan.STEPS[char];
    if (does === undefined) this.add(char);
    else does.call(this);
    this.at += 1;
  }

  private add(text: string): void {
    this.word = (this.word ?? "") + text;
  }

  private endWord(): void {
    if (this.word !== undefined) this.words.push(this.word);
    this.word = undefined;
  }

  private endCommand(pipesOn = false): void {
    this.endWord();
    if (this.words.length > 0 && !this.keep()) this.found.leading = false;
    if (this.words.length > 0 || this.fed.length > 0) {
      const piped = this.piped || this.unseen;
      this.found.commands.push({ words: this.words, fed: this.fed, piped });
    }
    this.words = [];
    this.fed = [];
    this.piped = pipesOn;
    this.unseen = false;
  }

  /**
   * A part ended by more than `;` or a new line. What it set may not be set for what follows (a
   * pipe's part runs in a subshell, `&&` may not run it), so names set from here on are not read.
   */
  private chain(pipesOn: boolean): void {
    this.found.leading = false;
    this.endCommand(pipesOn);
  }

  /**
   * Whether this part only sets names (`U=…`, `export U=…`). Each is kept, so a later `$U` can be
   * read, where nothing else in the line touches the name; not inside `$(…)`, which runs apart.
   */
  private keep(): boolean {
    const [first, ...rest] = this.words;
    const words = SETTERS.has(first ?? "") ? rest : this.words;
    if (words.length === 0 || !words.every((word) => SETS.test(word))) return false;
    if (this.depth > 0) return true;
    for (const word of words) {
      const equals = word.indexOf("=");
      const name = word.slice(0, equals);
      const value = word.slice(equals + 1);
      if (!value.includes(FILLED) && this.found.knowable(name)) {
        this.found.names.set(name, { value, sure: this.found.leading });
      }
    }
    return true;
  }

  /** A new line ends the command, and the text of the heredocs opened on it comes next. */
  private newLine(): void {
    this.endCommand();
    let at = this.at + 1;
    for (const open of this.waiting) at = this.body(open, at);
    this.waiting = [];
    this.at = at - 1;
  }

  /** One heredoc's text, from `from` up to its closing word; where what follows it starts. */
  private body(open: Heredoc, from: number): number {
    let at = from;
    const lines: string[] = [];
    while (at < this.text.length) {
      const end = this.text.indexOf("\n", at);
      const stop = end === -1 ? this.text.length : end;
      const line = this.text.slice(at, stop);
      at = stop + 1;
      if ((open.tabs ? line.replace(/^\t+/, "") : line) === open.closes) break;
      lines.push(line);
    }
    const body = lines.join("\n");
    open.into[open.at] = body;
    // Text the shell fills in still runs its `$(…)` and backticks.
    if (!open.literal) this.inside(body);
    return at;
  }

  /** A backslash makes the next character itself; before a new line it joins the two lines. */
  private escaped(): void {
    const next = this.text[this.at + 1];
    if (next === undefined) return;
    if (next !== "\n") this.add(next);
    this.at += 1;
  }

  /** Inside single quotes everything is itself. */
  private single(): void {
    const end = this.text.indexOf("'", this.at + 1);
    const stop = end === -1 ? this.text.length : end;
    this.add(this.text.slice(this.at + 1, stop));
    this.at = stop;
  }

  /** Inside double quotes a shell still fills in `$` and runs backticks. */
  private double(): void {
    this.word ??= "";
    for (this.at += 1; this.at < this.text.length; this.at += 1) {
      const char = this.text[this.at] as string;
      if (char === '"') return;
      if (char === "$") this.dollar(true);
      else if (char === "`") this.backticks();
      else if (char === "\\" && '"\\$`\n'.includes(this.text[this.at + 1] ?? "")) this.escaped();
      else this.add(char);
    }
  }

  /**
   * `$(…)`, `${…}`, `$NAME`, `$'…'`, `$"…"`: what runs inside is scanned, and the word is filled
   * in. zsh's `$=NAME`, `$~NAME` and `$^NAME` change how a value is read, so they are filled in.
   */
  private dollar(quoted = false): void {
    const next = this.text[this.at + 1] ?? "";
    if (next === "(") this.runs(this.at + 1, false);
    else if (next === "{") this.braced(this.at + 1, quoted);
    else if (next === "'" && !quoted) this.ansi();
    else if (next === '"' && !quoted) return;
    else if (this.zshFlag()) this.add(FILLED);
    else if (/[A-Za-z0-9_@*#?$!-]/.test(next)) {
      const name = this.nameAt(this.at + 1);
      this.fill(name, quoted, this.at + 1 + name.length);
      this.at += name.length;
    } else this.add("$");
  }

  /** zsh's `$=NAME`, `$~NAME`, `$^NAME` and their braced forms, read past; whether it was one. */
  private zshFlag(): boolean {
    const flag = this.text[this.at + 1] ?? "";
    const after = this.text[this.at + 2] ?? "";
    if (flag === "" || !"=~^".includes(flag) || !/[A-Za-z_{]/.test(after)) return false;
    this.at += 1;
    if (after === "{") this.at = closing(this.text, this.at + 1, "{", "}");
    else this.at += this.nameAt(this.at + 1).length;
    return true;
  }

  /** The name or one special character a `$` stands before. */
  private nameAt(at: number): string {
    return /^(?:[A-Za-z_][A-Za-z0-9_]*|.)/s.exec(this.text.slice(at))?.[0] ?? "";
  }

  /**
   * `${NAME}` is the name's value; anything more in the braces is filled in, after what runs
   * inside it. bash 5.3's `${ …; }` and `${| …; }` run their text as commands.
   */
  private braced(open: number, quoted: boolean): void {
    const close = closing(this.text, open, "{", "}");
    const within = this.text.slice(open + 1, close);
    if (NAME.test(within)) this.fill(within, quoted, close + 1);
    else {
      if (/^[\s|]/.test(within)) this.scan(within.replace(/^\|/, ""), false);
      else this.inside(within);
      this.add(FILLED);
    }
    this.at = close;
  }

  /** `$'…'`, with its backslash escapes read as a shell reads them. */
  private ansi(): void {
    let at = this.at + 2;
    let text = "";
    while (at < this.text.length && this.text[at] !== "'") {
      if (this.text[at] === "\\" && at + 1 < this.text.length) {
        const [value, length] = ansiEscape(this.text, at + 1);
        text += value;
        at += 1 + length;
      } else {
        text += this.text[at];
        at += 1;
      }
    }
    this.add(text);
    this.at = at;
  }

  /**
   * A name's value where the line set it, else the mark of what the shell fills in. A name set
   * where the setting might not run may be empty, so it is read only quoted on its own (`"$C"`):
   * empty, that is an empty word, which runs nothing. Bare, an empty `$X` drops out and the next
   * word takes its place; beside other text, it changes the word. `after` is where the text after
   * the name starts.
   */
  private fill(name: string, quoted: boolean, after: number): void {
    const named = this.found.names.get(name);
    const value = named?.value;
    const alone =
      quoted &&
      this.word === "" &&
      this.text[after] === '"' &&
      ENDS_TARGET.includes(this.text[after + 1] ?? " ");
    if (value === undefined || (named?.sure !== true && !alone)) this.add(FILLED);
    else if (quoted) this.add(value);
    else {
      // Outside quotes a shell splits the value into words, and each may be a glob.
      value.split(/[ \t\n]+/).forEach((piece, index) => {
        if (index > 0) this.endWord();
        if (piece !== "") this.add(piece.replace(/[*?[]/g, FILLED));
      });
    }
  }

  private backticks(): void {
    let end = this.at + 1;
    while (end < this.text.length && this.text[end] !== "`") end += this.text[end] === "\\" ? 2 : 1;
    this.scan(this.text.slice(this.at + 1, end).replace(/\\([`\\$])/g, "$1"), false);
    this.add(FILLED);
    this.at = Math.min(end, this.text.length);
  }

  /**
   * `(…)` after a `$`, a `<`, a `>` or zsh's `=` runs what is inside, and leaves something filled
   * in. Inside `>(…)` the first command is fed what is written to it.
   */
  private runs(open: number, fed: boolean): void {
    const close = closing(this.text, open, "(", ")");
    this.scan(this.text.slice(open + 1, close), fed);
    this.add(FILLED);
    this.at = close;
  }

  /** The commands in text that runs inside this line. */
  private scan(text: string, fed: boolean): void {
    if (this.depth >= DEEPEST) this.found.lost = true;
    else new Scan(text, this.found, this.depth + 1, fed).run();
  }

  /** What runs inside text a shell only fills in: its `$(…)` and backticks, nothing else. */
  private inside(text: string): void {
    for (let at = 0; at < text.length; at += 1) {
      const char = text[at] as string;
      if (char === "\\") at += 1;
      else if (char === "$" && text[at + 1] === "(") {
        const close = closing(text, at + 1, "(", ")");
        this.scan(text.slice(at + 2, close), false);
        at = close;
      } else if (char === "`") {
        const end = text.indexOf("`", at + 1);
        const stop = end === -1 ? text.length : end;
        this.scan(text.slice(at + 1, stop), false);
        at = stop;
      }
    }
  }

  /** A comment runs to the line's end; a `#` inside a word is itself. */
  private comment(): void {
    if (this.word !== undefined) {
      this.add("#");
      return;
    }
    const end = this.text.indexOf("\n", this.at);
    this.at = (end === -1 ? this.text.length : end) - 1;
  }

  /** `&&` and `&` end a command; `&>` sends its output somewhere. */
  private ampersand(): void {
    const next = this.text[this.at + 1];
    if (next === ">") this.redirect();
    else {
      this.chain(false);
      if (next === "&") this.at += 1;
    }
  }

  /** `|` and `|&` pipe this command into the next; `||` only ends it. */
  private bar(): void {
    const next = this.text[this.at + 1];
    this.chain(next !== "|");
    if (next === "|" || next === "&") this.at += 1;
  }

  private semicolon(): void {
    this.endCommand();
    if (this.text[this.at + 1] === ";") this.at += 1;
  }

  /**
   * `(` opens a subshell or a function's `()`; after `name=` a list of values, whose `$(…)` still
   * runs; after zsh's lone `=` a command whose output stands as a file; and glued to a word, a
   * zsh glob's group (`/bin/(r)m`), which could be anything.
   */
  private opens(): void {
    const word = this.word;
    if (word === "=") {
      this.word = undefined;
      this.runs(this.at, false);
    } else if (word?.endsWith("=") === true) {
      const close = closing(this.text, this.at, "(", ")");
      this.inside(this.text.slice(this.at + 1, close));
      this.add(FILLED);
      this.at = close;
    } else if (word !== undefined && this.text[this.at + 1] !== ")") {
      this.at = closing(this.text, this.at, "(", ")");
      this.add(FILLED);
    } else this.chain(false);
  }

  private glob(): void {
    this.add(FILLED);
  }

  /**
   * `[` with a `]` later in the word is a glob. Alone (`[ -d x ]`, `[[`) it is the test command,
   * and after a name (`a[0]=x`) an array's index.
   */
  private bracket(): void {
    const rest = this.text.slice(this.at + 1);
    const index = NAME.test(this.word ?? "") && /^[^\]]*\]\+?=/.test(rest);
    const glob = !index && /^[^\s;&|()<>'"]*\]/.test(rest) && !/^\[?\s/.test(rest);
    this.add(glob ? FILLED : "[");
  }

  /** A redirection: its file is no word of the command, and a heredoc's text waits for its lines. */
  private redirect(): void {
    // A number standing right before (`2>`), or bash's `{fd}`, is part of it.
    if (this.word !== undefined && /^(?:\d+|\{[A-Za-z_]\w*\})$/.test(this.word)) {
      this.word = undefined;
    } else this.endWord();
    const rest = this.text.slice(this.at);
    const heredoc = /^<<(-?)(?!<)[ \t]*/.exec(rest);
    if (heredoc !== null) this.heredoc(heredoc[0].length, heredoc[1] === "-");
    else if (/^[<>]\(/.test(rest)) {
      // `<(…)` and `>(…)` run what is inside, and stand as a word.
      this.runs(this.at + 1, rest[0] === ">");
    } else {
      const sign = (/^(?:<<<|&>>?|>>|>&|<&|>\||<>|[<>])[ \t]*/.exec(rest) as RegExpExecArray)[0];
      this.at += sign.length;
      const target = this.target();
      // A here-string is fed to the command as a heredoc is.
      if (sign.startsWith("<<<")) this.fed.push(target);
      // Input from somewhere it can't read (`< <(…)`, `< "$F"`) is input it can't see.
      else if (sign.trim() === "<" && target.includes(FILLED)) this.unseen = true;
    }
  }

  private heredoc(sign: number, tabs: boolean): void {
    this.at += sign;
    const { closes, literal } = this.closingWord();
    this.waiting.push({ closes, tabs, literal, into: this.fed, at: this.fed.length });
    this.fed.push("");
  }

  /** A heredoc's closing word, as written: quotes off and nothing filled in, as a shell has it. */
  private closingWord(): { closes: string; literal: boolean } {
    let closes = "";
    let literal = false;
    for (; this.at < this.text.length; this.at += 1) {
      const char = this.text[this.at] as string;
      if (ENDS_TARGET.includes(char)) break;
      if (char === "'" || char === '"') {
        const end = quoteEnd(this.text, this.at);
        closes += this.text.slice(this.at + 1, end);
        this.at = end;
        literal = true;
      } else if (char === "\\") {
        this.at += 1;
        closes += this.text[this.at] ?? "";
        literal = true;
      } else closes += char;
    }
    this.at -= 1;
    return { closes, literal };
  }

  /** The word a redirection points at, read and left out of the command's words. */
  private target(): string {
    // `> >(tee log)`: what it points at runs.
    if (/^[<>]\($/.test(this.text.slice(this.at, this.at + 2))) {
      this.runs(this.at + 1, this.text[this.at] === ">");
      this.word = undefined;
      return FILLED;
    }
    while (this.at < this.text.length && !ENDS_TARGET.includes(this.text[this.at] as string)) {
      this.step();
    }
    const target = this.word ?? "";
    this.word = undefined;
    this.at -= 1;
    return target;
  }
}

/** One backslash escape of `$'…'`, from the character after the backslash: its value and length. */
function ansiEscape(text: string, at: number): readonly [string, number] {
  const char = text[at] as string;
  const known = ANSI[char];
  if (known !== undefined) return [known, 1];
  const code = /^(?:x([0-9A-Fa-f]{1,2})|u([0-9A-Fa-f]{1,4})|U([0-9A-Fa-f]{1,8})|([0-7]{1,3}))/.exec(
    text.slice(at),
  );
  if (code !== null) {
    const [whole, hex, short, long, octal] = code;
    const value = hex ?? short ?? long;
    const point =
      value === undefined ? Number.parseInt(octal ?? "0", 8) : Number.parseInt(value, 16);
    return [String.fromCodePoint(Math.min(point, 0x10_ff_ff)), whole.length];
  }
  if (char === "c" && at + 1 < text.length) {
    return [String.fromCharCode(text.charCodeAt(at + 1) & 0x1f), 2];
  }
  // Any other letter keeps its backslash.
  return [`\\${char}`, 1];
}

/**
 * Where the bracket opened at `open` closes, quotes, comments and nesting counted; the end if it
 * never does. Inside `$(…)` a `case` pattern's `)` closes nothing.
 */
function closing(text: string, open: number, left: string, right: string): number {
  let depth = 0;
  let cases = 0;
  for (let at = open; at < text.length; at = whole(text, at) + 1) {
    const char = text[at];
    if (char === left) depth += 1;
    else if (char === right && !(left === "(" && cases > 0 && depth === 1)) {
      depth -= 1;
      if (depth === 0) return at;
    } else cases += caseWord(text, at);
  }
  return text.length;
}

/** `case` opens a pattern list and `esac` closes one, each where a word starts. */
function caseWord(text: string, at: number): number {
  if (!startsAWord(text, at)) return 0;
  const word = /^(?:case|esac)(?=[\s;&|()]|$)/.exec(text.slice(at, at + 5))?.[0];
  return word === "case" ? 1 : word === "esac" ? -1 : 0;
}

function startsAWord(text: string, at: number): boolean {
  return at === 0 || BEFORE_A_WORD.includes(text[at - 1] as string);
}

/**
 * The last character of what stands at `at` as one thing: an escaped character, a quoted stretch,
 * a comment up to its line's end.
 */
function whole(text: string, at: number): number {
  const char = text[at];
  if (char === "\\") return at + 1;
  if (char === "'" || char === '"') return quoteEnd(text, at);
  if (char === "$" && text[at + 1] === "'") return ansiEnd(text, at + 1);
  if (char === "#" && startsAWord(text, at)) {
    const end = text.indexOf("\n", at);
    return end === -1 ? text.length : end - 1;
  }
  return at;
}

/** Where the quote opened at `open` closes; the end if it never does. */
function quoteEnd(text: string, open: number): number {
  const quote = text[open];
  for (let at = open + 1; at < text.length; at += 1) {
    if (text[at] === "\\" && quote === '"') at += 1;
    else if (text[at] === quote) return at;
  }
  return text.length;
}

/** Where a `$'…'` opened at `open` closes, its backslashes counted; the end if it never does. */
function ansiEnd(text: string, open: number): number {
  for (let at = open + 1; at < text.length; at += 1) {
    if (text[at] === "\\") at += 1;
    else if (text[at] === "'") return at;
  }
  return text.length;
}
