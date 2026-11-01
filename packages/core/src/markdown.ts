/**
 * A small, safe Markdown parser.
 *
 * It parses a message's words into a tree of tokens: paragraphs, headings, lists, quotes, rules,
 * tables (ADR 0184), fenced code and pictures, and inside them bold, italic, code, links and
 * @mentions. It never produces HTML: the renderer builds elements from the tree, so there is
 * nothing to inject. Links keep only `http(s)` and relative targets, so a `javascript:` URL in a
 * message a person did not write cannot become a live one.
 *
 * The blocks are read by `markdown-it`, the reader a Markdown file's page is made with (ADR 0123),
 * so a list or a table is the same thing in a bubble as on a page. Only its block rules run, with
 * raw HTML, indented code, `===`/`---` underlines and link references turned off: a chat line
 * indented four spaces is words, and a `<div>` is its own characters. The words inside each block
 * are read here (`tokenize`), so @mentions, pictures and the link rules are this file's alone.
 *
 * A table written without its line of dashes, rows that each start and end with `|` and have as
 * many cells as the first, is read as one, the first row its heading (`withDashes`, ADR 0184
 * addendum): agents leave the line out, and the rows drew as pipes.
 *
 * A picture (`![alt](src)`, ADR 0068) is a block of its own, however it was written: a picture
 * stands between words, not among them, so a paragraph with one in it is split around it, and
 * pictures side by side are one block, drawn as a grid. Its source must be an absolute `http(s)`
 * address. Inside bold or italic, a heading or a table's cell, where a block cannot stand, it is
 * read as a link to itself.
 *
 * Parsing is pure and lives here so the web and mobile renderers agree on what a message means;
 * each turns the tree into its own kind of element.
 */

import { mentionPattern } from "@chipschat/protocol";
import MarkdownIt, { type Token as BlockToken } from "markdown-it";

export type Inline =
  | { readonly type: "text"; readonly text: string }
  | { readonly type: "strong"; readonly children: readonly Inline[] }
  | { readonly type: "em"; readonly children: readonly Inline[] }
  | { readonly type: "code"; readonly text: string }
  | { readonly type: "link"; readonly href: string; readonly text: string }
  | { readonly type: "mention"; readonly handle: string };

/**
 * A picture a message draws where it stands. `href` is where a tap goes: the picture itself, or
 * where a linked picture (`[![alt](src)](href)`) points.
 */
export interface Picture {
  readonly src: string;
  readonly alt: string;
  readonly href: string;
}

/** A table's cell: its words, read as a paragraph's are, a picture being a link there. */
export type Cell = readonly Inline[];

/** How a column's words sit, as its line of dashes said (`:--`, `:-:`, `--:`); none is the start. */
export type Align = "left" | "center" | "right" | undefined;

/** A table (ADR 0184): its heading row and the rows under it, every row as many cells as it. */
export interface Table {
  readonly type: "table";
  readonly align: readonly Align[];
  readonly head: readonly Cell[];
  readonly rows: readonly (readonly Cell[])[];
}

export type Block =
  | { readonly type: "paragraph"; readonly children: readonly Inline[] }
  | { readonly type: "heading"; readonly level: number; readonly children: readonly Inline[] }
  | { readonly type: "code"; readonly text: string }
  | { readonly type: "pictures"; readonly pictures: readonly Picture[] }
  /** Each item is the blocks it holds: its words, and any list inside it. */
  | {
      readonly type: "list";
      readonly ordered: boolean;
      readonly start: number;
      readonly items: readonly (readonly Block[])[];
    }
  | { readonly type: "quote"; readonly blocks: readonly Block[] }
  | { readonly type: "rule" }
  | Table;

/** What the tokenizer finds: the inlines, and a picture, which a block is made around. */
type Token = Inline | { readonly type: "picture"; readonly picture: Picture };

/**
 * The block reader: `markdown-it`'s block rules alone. Its inline rules, and the core rules that
 * work on what they make, are off, so each block's words come through as written.
 */
const reader = new MarkdownIt("default", {
  html: false,
  linkify: false,
  typographer: false,
}).disable(["code", "lheading", "reference", "html_block"]);
reader.core.ruler.enableOnly(["normalize", "block"]);

/** Where the walk through `markdown-it`'s tokens has got to. */
interface Cursor {
  at: number;
}

/** Split into blocks, as `markdown-it` reads them, each block's words read here. */
export function parseMarkdown(source: string): Block[] {
  return readBlocks(reader.parse(withDashes(source), {}), { at: 0 });
}

/** A line of a table: from a `|` to a `|`, at most three spaces in, as a table's line may be. */
const TABLE_LINE = /^ {0,3}\|.*\|\s*$/;

/** A table's line of dashes: `|---|:--:|`, as `markdown-it` would take it. */
const DASHES = /^ {0,3}\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/;

/** A fence opening or closing a block of code. */
const FENCE = /^ {0,3}(```|~~~)/;

/**
 * The words, with a line of dashes under the first row of any table written without one (ADR 0184
 * addendum). Two or more lines that each start and end with `|`, outside a code block, with as many
 * cells as each other and at least two, and no line of dashes among them, are a table its writer
 * left the line out of: agents do (big-pickle in the OpenCode room, 17 October 2026, whose table
 * drew as rows of pipes). Rows of differing lengths are left as they are, as words.
 */
function withDashes(source: string): string {
  if (!source.includes("|")) return source;
  const lines = source.split("\n");
  const out: string[] = [];
  let fenced = false;
  for (let at = 0; at < lines.length; ) {
    const line = lines[at] as string;
    if (FENCE.test(line)) fenced = !fenced;
    if (fenced || !TABLE_LINE.test(line)) {
      out.push(line);
      at += 1;
      continue;
    }
    let end = at;
    while (end < lines.length && TABLE_LINE.test(lines[end] as string)) end += 1;
    const run = lines.slice(at, end);
    out.push(
      ...(dashless(run) ? [run[0] as string, dashesFor(run[0] as string), ...run.slice(1)] : run),
    );
    at = end;
  }
  return out.join("\n");
}

/** Whether rows of a table were written with no line of dashes, every row as wide as the first. */
function dashless(run: readonly string[]): boolean {
  if (run.length < 2 || run.some((line) => DASHES.test(line))) return false;
  const width = cellsIn(run[0] as string);
  return width >= 2 && run.every((line) => cellsIn(line) === width);
}

/** How many cells a `|`-bounded line holds: its `|`s less one, an escaped `\|` being a character. */
function cellsIn(line: string): number {
  return line.trim().split(/(?<!\\)\|/).length - 2;
}

/** A line of dashes as wide as a heading row. */
function dashesFor(head: string): string {
  return `|${" --- |".repeat(cellsIn(head))}`;
}

/** The blocks up to the token that closes their container (`until`), or to the end. */
function readBlocks(tokens: readonly BlockToken[], cursor: Cursor, until?: string): Block[] {
  const blocks: Block[] = [];
  while (cursor.at < tokens.length) {
    const token = tokens[cursor.at] as BlockToken;
    cursor.at += 1;
    if (token.type === until) break;
    for (const block of readBlock(token, tokens, cursor)) push(blocks, block);
  }
  return blocks;
}

/** The block a token opens, read to its close: none for a token that opens nothing drawn. */
function readBlock(token: BlockToken, tokens: readonly BlockToken[], cursor: Cursor): Block[] {
  switch (token.type) {
    case "paragraph_open":
      return aroundPictures(tokenize(wordsUntil(tokens, cursor, "paragraph_close")));
    case "heading_open":
      return heading(Number(token.tag.slice(1)), wordsUntil(tokens, cursor, "heading_close"));
    case "fence":
      return [{ type: "code", text: token.content.replace(/\n$/, "") }];
    case "hr":
      return [{ type: "rule" }];
    case "blockquote_open":
      return [{ type: "quote", blocks: readBlocks(tokens, cursor, "blockquote_close") }];
    case "bullet_list_open":
    case "ordered_list_open":
      return [readList(token, tokens, cursor)];
    case "table_open":
      return [readTable(tokens, cursor)];
    default:
      return [];
  }
}

/**
 * Whether a message holds a table anywhere, in a list's item or a quotation too (ADR 0184). A
 * phone draws a bubble with one at its widest. A table's line of dashes always has a `|` against
 * a `-`, so words without one are no table and are not parsed to say so.
 */
export function holdsTable(text: string): boolean {
  return /\|\s*:?-|-:?\s*\|/.test(withDashes(text)) && parseMarkdown(text).some(hasTable);
}

function hasTable(block: Block): boolean {
  if (block.type === "table") return true;
  if (block.type === "quote") return block.blocks.some(hasTable);
  if (block.type === "list") return block.items.some((item) => item.some(hasTable));
  return false;
}

/** A heading with words in it; a `#` alone says nothing. */
function heading(level: number, words: string): Block[] {
  const children = parseInline(words);
  return children.length === 0 ? [] : [{ type: "heading", level, children }];
}

/** The words a block holds, up to its close: `markdown-it` hands them over unread. */
function wordsUntil(tokens: readonly BlockToken[], cursor: Cursor, close: string): string {
  let words = "";
  while (cursor.at < tokens.length) {
    const token = tokens[cursor.at] as BlockToken;
    cursor.at += 1;
    if (token.type === close) break;
    if (token.type === "inline") words += token.content;
  }
  return words;
}

function readList(open: BlockToken, tokens: readonly BlockToken[], cursor: Cursor): Block {
  const ordered = open.type === "ordered_list_open";
  const close = ordered ? "ordered_list_close" : "bullet_list_close";
  const items: Block[][] = [];
  while (cursor.at < tokens.length) {
    const token = tokens[cursor.at] as BlockToken;
    cursor.at += 1;
    if (token.type === close) break;
    if (token.type === "list_item_open") items.push(readBlocks(tokens, cursor, "list_item_close"));
  }
  return { type: "list", ordered, start: Number(open.attrGet("start") ?? 1), items };
}

/**
 * A table: its first row is its heading, and `markdown-it` has already made every row under it
 * as many cells as the heading, filling a short one and cutting a long one.
 */
function readTable(tokens: readonly BlockToken[], cursor: Cursor): Table {
  const rows: { cells: Cell[]; align: Align[] }[] = [];
  while (cursor.at < tokens.length) {
    const token = tokens[cursor.at] as BlockToken;
    cursor.at += 1;
    if (token.type === "table_close") break;
    if (token.type === "tr_open") rows.push({ cells: [], align: [] });
    if (token.type === "th_open" || token.type === "td_open") {
      const row = rows.at(-1);
      const words = wordsUntil(tokens, cursor, token.type.replace("_open", "_close"));
      row?.cells.push(parseInline(words.trim()));
      row?.align.push(alignOf(token));
    }
  }
  const [head, ...body] = rows;
  return {
    type: "table",
    align: head?.align ?? [],
    head: head?.cells ?? [],
    rows: body.map((row) => row.cells),
  };
}

function alignOf(cell: BlockToken): Align {
  const style = String(cell.attrGet("style") ?? "");
  const found = /text-align:\s*(left|center|right)/.exec(style);
  return found === null ? undefined : (found[1] as Align);
}

/** Adds a block, joining pictures to the pictures just before them: a blank line is no gap. */
function push(blocks: Block[], block: Block): void {
  const last = blocks.at(-1);
  if (block.type === "pictures" && last?.type === "pictures") {
    blocks[blocks.length - 1] = {
      type: "pictures",
      pictures: [...last.pictures, ...block.pictures],
    };
  } else {
    blocks.push(block);
  }
}

/**
 * A paragraph's tokens as blocks: the words, cut wherever a picture stands, and each run of
 * pictures — with nothing but white space between them — one block.
 */
function aroundPictures(tokens: readonly Token[]): Block[] {
  const blocks: Block[] = [];
  let words: Inline[] = [];
  let pictures: Picture[] = [];
  for (const token of tokens) {
    if (token.type === "picture") {
      pushParagraph(blocks, words);
      words = [];
      pictures.push(token.picture);
    } else if (!(pictures.length > 0 && token.type === "text" && token.text.trim() === "")) {
      if (pictures.length > 0) blocks.push({ type: "pictures", pictures });
      pictures = [];
      words.push(token);
    }
  }
  if (pictures.length > 0) blocks.push({ type: "pictures", pictures });
  pushParagraph(blocks, words);
  return blocks;
}

/** The words either side of a picture, without the white space that stood against it. */
function pushParagraph(blocks: Block[], words: readonly Inline[]): void {
  const children = words.map((word, index) => {
    if (word.type !== "text") return word;
    let text = word.text;
    if (index === 0) text = text.trimStart();
    if (index === words.length - 1) text = text.trimEnd();
    return { type: "text" as const, text };
  });
  const kept = children.filter((child) => child.type !== "text" || child.text !== "");
  if (kept.length > 0) blocks.push({ type: "paragraph", children: kept });
}

/** Where the app lives, as far as a relative link is concerned. Any real origin would do. */
const HOME = "http://chips.local";

/**
 * A link target we are willing to make live. Anything else renders as plain text.
 *
 * Resolve and compare, rather than pattern-match the spelling: `javascript:` and `data:` are
 * schemes we do not know; `//evil.example` and `/\evil.example` — a backslash is a slash to the
 * URL parser — both resolve to another origin. An in-app path resolves to home and is kept as
 * written; an absolute `http(s)` link may go anywhere, and says so.
 */
export function safeHref(href: string): string | undefined {
  const trimmed = href.trim();
  let resolved: URL;
  try {
    resolved = new URL(trimmed, HOME);
  } catch {
    return undefined;
  }
  if (resolved.protocol !== "http:" && resolved.protocol !== "https:") return undefined;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return resolved.origin === HOME && trimmed.startsWith("/") ? trimmed : undefined;
}

/**
 * A message as one line of plain words: the marks gone, the newlines gone, a fenced block
 * reduced to what it says.
 *
 * An ask's card, a row in the list and a room's name have room for a sentence, not a document,
 * and what they were showing instead was the source — `**2421 Golden Hill Rd**`, asterisks and all. The
 * space itself still renders the markdown; a summary of it should read as words.
 */
export function plainWords(text: string): string {
  return parseMarkdown(text).map(blockWords).join(" ").replace(/\s+/g, " ").trim();
}

/**
 * A block's words. A picture is its words, and one without any is a picture all the same; a list,
 * a quote and a table are the words in them, in the order they stand.
 */
function blockWords(block: Block): string {
  switch (block.type) {
    case "code":
      return block.text;
    case "pictures":
      return block.pictures.map((each) => each.alt || "Image").join(" ");
    case "rule":
      return "";
    case "quote":
      return block.blocks.map(blockWords).join(" ");
    case "list":
      return block.items.map((item) => item.map(blockWords).join(" ")).join(" ");
    case "table":
      return [block.head, ...block.rows].flat().map(runsWords).join(" ");
    default:
      return runsWords(block.children);
  }
}

/** Runs of words as plain words: what a table's cell says, without its marks. */
export function runsWords(runs: readonly Inline[]): string {
  return runs.map(inlineWords).join("");
}

function inlineWords(inline: Inline): string {
  if (inline.type === "strong" || inline.type === "em") {
    return inline.children.map(inlineWords).join("");
  }
  return inline.type === "mention" ? `@${inline.handle}` : inline.text;
}

/**
 * A host a picture must not make every reader fetch from (SEC-30): this machine, or something on
 * the reader's own network, which an IP literal, `localhost` or an mDNS `.local` name reaches.
 * That a picture's host sees the viewer's address is the trade ADR 0068 made; a probe of the
 * viewer's own network, by whoever can write in a room, is not. The host is read off the parsed
 * address, so `2130706433` and `127.1` are `127.0.0.1` here as they are to a fetch.
 */
function nearby(hostname: string): boolean {
  const name = hostname.toLowerCase();
  return (
    name.startsWith("[") ||
    /^\d+(\.\d+){3}$/.test(name) ||
    name === "localhost" ||
    name.endsWith(".localhost") ||
    name.endsWith(".local")
  );
}

/**
 * A picture's source: an absolute `http(s)` address to a host out on the web, and nothing else. A
 * relative one would be fetched from Chips's own server, a `data:` one is whatever the sender
 * liked, and a nearby one is a probe of the reader's network.
 */
function pictureSrc(src: string): string | undefined {
  const safe = safeHref(src);
  if (safe === undefined || !/^https?:\/\//i.test(safe)) return undefined;
  return nearby(new URL(safe).hostname) ? undefined : safe;
}

/**
 * Inline tokens, in precedence order: code spans first (their content is literal), then
 * pictures, then links, then bold, then italic, then @mentions, then the text between them.
 *
 * A picture here, inside words, is a link to itself: only a paragraph (`parseMarkdown`) makes a
 * block for one.
 */
export function parseInline(text: string): Inline[] {
  return tokenize(text).map((token) =>
    token.type === "picture"
      ? { type: "link", href: token.picture.href, text: token.picture.alt || "Image" }
      : token,
  );
}

/**
 * The inline tokens of a block's words, in one pass (SEC-3).
 *
 * Each pattern is searched from the cursor with its `g` flag, so nothing is copied, and what it
 * finds is kept until the cursor has passed it: a pattern is searched again only then, and one
 * that finds nothing is never searched again. Before this the whole remainder was searched by
 * every pattern for every token, and a message of five thousand mentions took a quarter of a
 * second to read, on every draw, for everybody in the room; 64 KB of them, which the protocol
 * allows, took seconds.
 *
 * A find is good from any later cursor up to where it starts: a pattern's earliest find from
 * here is its earliest find from anywhere between here and there, since none of them looks
 * behind the character before the token (`lead`), and the lead is searched for from one
 * character back, so a `_` right after a bold's closing `**` still opens italics.
 */
function tokenize(text: string): Token[] {
  const out: Token[] = [];
  /** Each pattern's next find, `null` for a pattern with nothing more to find. */
  const next: (Found | null | undefined)[] = PATTERNS.map(() => undefined);
  let cursor = 0;
  while (cursor < text.length) {
    const first = firstFind(text, cursor, next);
    if (first === undefined) break;
    if (first.at > cursor) out.push({ type: "text", text: text.slice(cursor, first.at) });
    out.push(first.token);
    cursor = first.end;
  }
  if (cursor < text.length) out.push({ type: "text", text: text.slice(cursor) });
  return out;
}

/** Whether a pattern's kept find is no find yet, or one the cursor has passed. */
function passed(found: Found | null | undefined, cursor: number): boolean {
  return found === undefined || (found !== null && found.at < cursor);
}

/** The earliest token any pattern finds at or after the cursor, each pattern's find kept in `next`. */
function firstFind(
  text: string,
  cursor: number,
  next: (Found | null | undefined)[],
): Found | undefined {
  let first: Found | undefined;
  for (const [i, pattern] of PATTERNS.entries()) {
    if (passed(next[i], cursor)) next[i] = search(pattern, text, cursor);
    const found = next[i];
    if (found === null || found === undefined) continue;
    if (first === undefined || found.at < first.at) first = found;
  }
  return first;
}

/** A token found: where it starts, where the words go on after it, and what it is. */
interface Found {
  readonly at: number;
  readonly end: number;
  readonly token: Token;
}

interface Pattern {
  /** With its `g` flag: `search` sets where it starts. */
  readonly re: RegExp;
  /**
   * The pattern's first group is the character before the token, matched to see that it is
   * not a word's, and is not part of the token.
   */
  readonly lead?: boolean;
  readonly make: (m: RegExpExecArray) => Token | undefined;
}

/**
 * The pattern's first token at or after the cursor. A pattern with a lead is searched from the
 * character before, which may be the last of the token just read, as `**bold**_soft_` has it.
 */
function search(pattern: Pattern, text: string, cursor: number): Found | null {
  const { re, lead, make } = pattern;
  let from = lead === true ? Math.max(0, cursor - 1) : cursor;
  for (;;) {
    re.lastIndex = from;
    const m = re.exec(text);
    if (m === null) return null;
    const at = m.index + (lead === true ? (m[1] ?? "").length : 0);
    const token = at < cursor ? undefined : make(m);
    if (token !== undefined) return { at, end: m.index + m[0].length, token };
    from = m.index + 1;
  }
}

/**
 * A picture's or a link's address: no spaces, and parentheses only in balanced pairs, so a
 * Wikipedia address stays whole and `![a](x)![b](y)` is two pictures. Bounded by the next
 * parenthesis, so a run of addresses that never close is read once, not once per start (SEC-3).
 */
const ADDRESS = String.raw`[^\s()]+(?:\([^\s()]*\)[^\s()]*)*`;
/**
 * A picture's or a link's words: anything but a bracket. Allowing `[` let a message of nothing but
 * `[` be scanned to its end from every one of them (SEC-3: 20,000 took half a second), and a
 * link's words hold no link.
 */
const WORDS = String.raw`[^\[\]]`;
/** A picture's optional title, `"…"` after its address. Read and set aside. */
const TITLE = String.raw`(?:\s+"[^"]*")?`;

/** A picture, or what is left of one whose source will not do: its words. */
function picture(alt: string, src: string, href?: string): Token {
  const source = pictureSrc(src);
  if (source === undefined) return { type: "text", text: alt };
  const target = href === undefined ? source : (safeHref(href) ?? source);
  return { type: "picture", picture: { src: source, alt: alt.trim(), href: target } };
}

/** The pattern with its `g` flag, as `search` drives it. */
function global(re: RegExp): RegExp {
  return new RegExp(re.source, re.flags.includes("g") ? re.flags : `${re.flags}g`);
}

const PATTERNS: readonly Pattern[] = [
  { re: /`([^`]+)`/g, make: (m) => ({ type: "code", text: m[1] as string }) },
  // A linked picture before a link, which would otherwise read `[![alt` as a link's words.
  {
    re: new RegExp(String.raw`\[!\[(${WORDS}*)\]\((${ADDRESS})${TITLE}\)\]\((${ADDRESS})\)`, "g"),
    make: (m) => picture(m[1] as string, m[2] as string, m[3] as string),
  },
  {
    re: new RegExp(String.raw`!\[(${WORDS}*)\]\((${ADDRESS})${TITLE}\)`, "g"),
    make: (m) => picture(m[1] as string, m[2] as string),
  },
  {
    // The URL's parentheses come in pairs, so a target with its own stays whole.
    re: new RegExp(String.raw`\[(${WORDS}+)\]\((${ADDRESS})\)`, "g"),
    make: (m) => {
      const href = safeHref(m[2] as string);
      // A link we will not follow degrades to its own text, never to a live bad URL.
      return href === undefined
        ? { type: "text", text: m[1] as string }
        : { type: "link", href, text: m[1] as string };
    },
  },
  {
    re: /\*\*([^*]+)\*\*/g,
    make: (m) => ({ type: "strong", children: parseInline(m[1] as string) }),
  },
  { re: /\*([^*]+)\*/g, make: (m) => ({ type: "em", children: parseInline(m[1] as string) }) },
  // Underscores as well as stars, which is how Jacobian writes a title: `_Robin Hood_ (1973)`.
  // Bounded so that `snake_case`, `file_name.ts` and a lone leading underscore stay whole: an
  // opening underscore follows the start or a character that is not a word's, the content does
  // not begin or end in a space, and the closing underscore is not followed by a word.
  {
    re: /(^|[^\w])__([^_\s](?:[^_]*[^_\s])?)__(?!\w)/g,
    lead: true,
    make: (m) => ({ type: "strong", children: parseInline(m[2] as string) }),
  },
  {
    re: /(^|[^\w])_([^_\s](?:[^_]*[^_\s])?)_(?!\w)/g,
    lead: true,
    make: (m) => ({ type: "em", children: parseInline(m[2] as string) }),
  },
  // What a handle is comes from the protocol, so what this draws is what the server resolved.
  { re: global(mentionPattern()), make: (m) => ({ type: "mention", handle: m[1] as string }) },
];
