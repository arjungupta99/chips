/**
 * A command as the ask screen draws it (ADR 0280): one part to a line, the way Chips reads it, so
 * the thing a person is judging is the thing on the screen. It was a JSON dump of the ask's input
 * under a headline that said the command a second time, cut off.
 *
 * Each part keeps its words as they were written, quotes and all, and says how it follows the one
 * before: the first, after a `|`, or after `;`, `&&`, `||` or a new line. The words a standing yes
 * would remember are marked, so Always can light them where they stand; so are output thrown away
 * (`2>/dev/null`, dropped from what is remembered), a write into a file (`> limits.js`, which keeps
 * the ask to once), and a part on the never list (`rm`). Protocol's reader stays the one that
 * decides (`commandParts`, the door, the engine); this one only draws, and never fails: a command
 * the reader can't follow is still drawn, part by part, as best its words allow.
 *
 * A shell's ask whose input is the command line itself, as Jacobian sends one (`jacobian.shell.shell`
 * with the words as its input, not `{ command }`), is drawn on the plate too. It was a paragraph of
 * body text under "shell · shell" (Luis's ask, 10 November 2026). Protocol's reader takes it as the
 * command (ADR 0239, addendum of 10 November 2026), so what the plate draws is what a yes keeps.
 */

import {
  askedCommand,
  commandParts,
  commandStarts,
  neverStanding,
  startOf,
  startsWith,
} from "@chipschat/protocol";
import { askHeadline } from "./model/readers.js";
import type { Approval } from "./model/types.js";

/** One word or run of words on a line of the plate, and what it is. */
export type PlateBit =
  /** A word of the start a standing yes remembers; `order` counts them down the plate. */
  | { readonly kind: "start"; readonly text: string; readonly order: number }
  /** A word a standing yes is never given for, at the start of its part. */
  | { readonly kind: "never"; readonly text: string }
  | { readonly kind: "word"; readonly text: string }
  /** Output thrown away or merged, which writes nothing. */
  | { readonly kind: "dropped"; readonly text: string }
  /** A write into a file, with the file. */
  | { readonly kind: "writes"; readonly text: string; readonly to: string };

/** How a part follows the one before it. */
export type PlateJoint = "first" | "pipe" | "then";

export interface PlatePart {
  readonly joint: PlateJoint;
  readonly bits: readonly PlateBit[];
}

export interface Plate {
  readonly parts: readonly PlatePart[];
  /** Whether Chips reads it part by part, so that a yes beyond once can be given for it. */
  readonly readable: boolean;
  /** The file it writes into, when it does: what keeps it to once. */
  readonly writesTo?: string | undefined;
}

/** What an ask is, as far as its plate goes: its input, and the kind of action it asks for. */
type Asked = Pick<Approval, "input"> & { readonly actionKind?: string | undefined };

/** The command an ask carries, as protocol's reader takes it from the action. */
function commandOf(approval: Asked): string | readonly string[] | undefined {
  return askedCommand({ kind: approval.actionKind, input: approval.input });
}

/** The command an ask carries, as the plate draws it; nothing for an ask with no command. */
export function commandPlate(approval: Asked): Plate | undefined {
  const command = commandOf(approval);
  if (command === undefined) return undefined;
  const scanned =
    typeof command === "string"
      ? scan(command)
      : [{ joint: "first" as const, tokens: command.map((word) => ({ text: word, value: word })) }];
  const strict = commandParts(command);
  const remembered = strict === undefined ? undefined : commandStarts(strict);
  let order = 0;
  const parts = scanned.map((part): PlatePart => {
    const bits = bitsOf(part.tokens, remembered);
    return {
      joint: part.joint,
      bits: bits.map((bit) => (bit.kind === "start" ? { ...bit, order: order++ } : bit)),
    };
  });
  const writes = parts.flatMap((part) => part.bits).find((bit) => bit.kind === "writes");
  return {
    parts,
    readable: strict !== undefined,
    ...(strict === undefined && writes?.kind === "writes" ? { writesTo: writes.to } : {}),
  };
}

/**
 * The headline over a plate: the ask's question without the command it quotes at its end, since
 * the plate draws it whole (`Inspect the main Chips repo layout? \`cd …\`` reads as its first
 * half). A question that quotes something else, or nothing, is left as it is.
 */
export function plateHeadline(approval: Approval): string {
  const headline = askHeadline(approval);
  const command = commandOf(approval);
  if (command === undefined) return headline;
  const quoted = /^(.*\S)\s*`([^`]+)`\s*$/.exec(headline);
  if (quoted === null) return headline;
  const said = (quoted[2] as string).replace(/…$/, "").trim();
  const whole = typeof command === "string" ? command.trim() : command.join(" ");
  return said.length > 0 && whole.startsWith(said) ? (quoted[1] as string) : headline;
}

/**
 * The line under a plate Chips reads, of more than one part or with output thrown away: `7 parts.
 * Chips reads each one, and \`2>/dev/null\` writes no file.` Nothing for one it can't read, whose
 * why is said where the choices would be.
 */
export function plateCaption(plate: Plate): string | undefined {
  if (!plate.readable) return undefined;
  const dropped = plate.parts.flatMap((part) => part.bits).find((bit) => bit.kind === "dropped");
  const count = plate.parts.length;
  const reads = count > 1 ? `${count} parts. Chips reads each one` : undefined;
  const nowhere = dropped === undefined ? undefined : `\`${dropped.text}\` writes no file`;
  if (reads === undefined) return nowhere === undefined ? undefined : `${nowhere}.`;
  return nowhere === undefined ? `${reads}.` : `${reads}, and ${nowhere}.`;
}

/**
 * Whether the plate takes the preview's place: a preview that is the ask's input as JSON, or one
 * that says the command again, is what the plate draws (Ike's ask, 6 November 2026, was headed by
 * the command, then a JSON dump of it, then the plate's three lines of choices).
 */
export function plateTakesPreview(
  approval: Asked & Pick<Approval, "preview" | "previewFormat">,
): boolean {
  const command = commandOf(approval);
  if (command === undefined) return false;
  const preview = approval.preview;
  if (preview === undefined || approval.previewFormat === "json") return true;
  const head = (typeof command === "string" ? command : command.join(" ")).trim().slice(0, 24);
  return head !== "" && preview.includes(head);
}

/** Why a command that writes into a file keeps no Always, under Once (ADR 0281). */
export function writesWords(to: string): string {
  return `This writes to \`${to}\`, so there is no Always for it.`;
}

/** One word as written, and what it says once its quotes are off. */
interface Token {
  readonly text: string;
  readonly value: string;
}

interface Scanned {
  readonly joint: PlateJoint;
  readonly tokens: readonly Token[];
}

/**
 * A command's parts and words, as written: split at `|`, `;`, `&&`, `||` and new lines outside
 * quotes, and at spaces into words. Nothing here refuses anything.
 */
function scan(command: string): Scanned[] {
  const scanner = new Scanner();
  for (let at = 0; at < command.length; at += 1) at = scanner.step(command, at);
  return scanner.done();
}

/** Where a part ends outside quotes, and how the next one follows it (`&&` and `||` aside). */
const BREAKS: Readonly<Record<string, PlateJoint>> = { "|": "pipe", ";": "then", "\n": "then" };

/** One pass over a command's characters; `step` answers where it got to. */
class Scanner {
  private readonly parts: Scanned[] = [];
  private tokens: Token[] = [];
  private joint: PlateJoint = "first";
  private text = "";
  private value = "";
  private started = false;
  private quote: string | undefined;

  step(command: string, at: number): number {
    const char = command[at] as string;
    const next = command[at + 1];
    // A backslash makes the next character itself, outside single quotes: `Application\ Support`.
    if (char === "\\" && next !== undefined && this.quote !== "'") {
      this.add(char + next, next);
      return at + 1;
    }
    if (this.quote !== undefined) {
      const closes = char === this.quote;
      if (closes) this.quote = undefined;
      this.add(char, closes ? "" : char);
      return at;
    }
    return this.bare(char, next, at);
  }

  private bare(char: string, next: string | undefined, at: number): number {
    if ((char === "&" || char === "|") && next === char) {
      this.endPart("then");
      return at + 1;
    }
    const joint = BREAKS[char];
    if (joint !== undefined) this.endPart(joint);
    else if (char === " " || char === "\t") this.endWord();
    else this.word(char);
    return at;
  }

  /** A character of a word; a quote opens and is kept as written, but is no part of its value. */
  private word(char: string): void {
    const opens = char === "'" || char === '"';
    if (opens) this.quote = char;
    this.add(char, opens ? "" : char);
  }

  private add(text: string, value: string): void {
    this.text += text;
    this.value += value;
    this.started = true;
  }

  private endWord(): void {
    if (this.started) this.tokens.push({ text: this.text, value: this.value });
    this.text = "";
    this.value = "";
    this.started = false;
  }

  private endPart(next: PlateJoint): void {
    this.endWord();
    if (this.tokens.length > 0) {
      this.parts.push({
        joint: this.parts.length === 0 ? "first" : this.joint,
        tokens: this.tokens,
      });
    }
    this.tokens = [];
    this.joint = next;
  }

  done(): Scanned[] {
    this.endPart("then");
    return this.parts;
  }
}

/** A redirection at the start of a word: `2>/dev/null`, `>`, `>>`, `&>`, `>&2`, `<`. */
const REDIRECT = /^(\d*|&)(>>?|<)(.*)$/;

/** Output thrown away or merged into the other: where a redirection writes nothing. */
const NOWHERE = /^(?:\/dev\/null|&[12])$/;

/**
 * A part's words as bits: redirections joined to what they name, then the start a standing yes
 * would remember marked, or on the never list.
 */
function bitsOf(
  tokens: readonly Token[],
  remembered: readonly (readonly string[])[] | undefined,
): PlateBit[] {
  const bits: (PlateBit | Token)[] = [];
  for (let at = 0; at < tokens.length; at += 1) {
    const token = tokens[at] as Token;
    const redirect = REDIRECT.exec(token.text);
    if (redirect === null) {
      bits.push(token);
      continue;
    }
    let target = redirect[3] as string;
    let text = token.text;
    const next = tokens[at + 1];
    if (target === "" && next !== undefined) {
      target = next.value;
      text = `${text} ${next.text}`;
      at += 1;
    }
    if (redirect[2] === "<") bits.push({ kind: "word", text });
    else if (NOWHERE.test(target)) bits.push({ kind: "dropped", text });
    else bits.push({ kind: "writes", text, to: target });
  }
  return marked(bits, remembered);
}

/** The words of a part, with its start marked: the one a standing yes keeps, or the never list's. */
function marked(
  bits: readonly (PlateBit | Token)[],
  remembered: readonly (readonly string[])[] | undefined,
): PlateBit[] {
  const words = bits.filter((bit): bit is Token => !("kind" in bit));
  const values = words.map((word) => word.value);
  const never = values.length > 0 && neverStanding([values]) !== undefined;
  const covering = remembered
    ?.filter((start) => startsWith(values, start))
    .sort((one, other) => one.length - other.length)[0];
  const length = values.length === 0 ? 0 : (covering ?? startOf(values)).length;
  let index = 0;
  return bits.map((bit): PlateBit => {
    if ("kind" in bit) return bit;
    const inStart = index < length;
    index += 1;
    if (!inStart) return { kind: "word", text: bit.text };
    return never ? { kind: "never", text: bit.text } : { kind: "start", text: bit.text, order: 0 };
  });
}
