/**
 * The words the thinking bubble says, out of what the harness sent. Pure, because a tool
 * arriving under its runtime's name is a matter of reading rather than of drawing, and the
 * desktop will want the same reading when it follows.
 */

/** What the bubble says while the harness has not said what it is doing. */
export const THINKING = "Thinking";

/**
 * The step, as English.
 *
 * A harness names the call underway the way its runtime names it, prefix and all:
 * `local-dev__coding_job_status`, where `local-dev` is the MCP server it came from. The server
 * is not the news, and on a phone it is most of the width — clipped, it left
 * `local-dev__coding_jo…` standing in the room, which says nothing and looks broken (Arjun,
 * 20 September 2026, watching Jacobian work in the game of life).
 *
 * So: what is left after the last `__` is the tool, and the tool's underscores are spaces. A
 * step is `tool · what it was given` (core's `Doing`), and only the tool half is touched —
 * an argument may be a filename, and `spatial_index.ts` is not `spatial index.ts`. A step a
 * harness wrote as a sentence has neither a prefix nor an underscore, and comes back whole.
 */
export function stepWords(step: string | undefined): string | undefined {
  if (step === undefined) return undefined;
  const [tool = "", ...given] = step.split(" · ");
  const named = (tool.split("__").at(-1) ?? tool).replace(/_+/g, " ").trim();
  const said = [named, ...given].filter((part) => part.trim() !== "").join(" · ");
  return said === "" ? undefined : said;
}

/** What kind of call a step is, where its tool says: the thinking bubble draws it as a glyph. */
export type ToolKind = "shell" | "web" | "search" | "file";

/** A step read for drawing: the kind its tool is, the tool in words, and what it was given. */
export interface StepParts {
  readonly kind: ToolKind | undefined;
  /** The tool, as `stepWords` says it: `web search`, `memory recall`. */
  readonly tool: string;
  /** What it was given, an address without its `https://www.` and its last slash. */
  readonly target: string | undefined;
}

/**
 * The kinds a tool's name says, in the order they are asked: `web search` is a search before it
 * is the web. A tool none of them names has no kind, and is said in words as before.
 */
const KINDS: readonly (readonly [ToolKind, RegExp])[] = [
  ["search", /\b(search|grep|find|lookup|query)\b/],
  ["web", /\b(browser|browse|navigate|fetch|http|url|web|page)\b/],
  ["shell", /\b(shell|bash|exec|terminal|command|sh|zsh|python|node|run)\b/],
  ["file", /\b(write|read|edit|file|files|patch|create|save|open)\b/],
];

/**
 * A step as the bubble draws it (ADR 0126): the kind of tool, so a terminal, a globe, a glass or a
 * page can stand where `shell ·` and `browser ·` were spelled out, and what it was given, tidied —
 * `https://www.chinatownsf.com/visit/` is `chinatownsf.com/visit`. The tool keeps its words for a
 * kind nobody named (`memory recall`) and for a screen reader, which hears the step whole.
 */
export function stepParts(step: string | undefined): StepParts | undefined {
  const said = stepWords(step);
  if (said === undefined) return undefined;
  const [tool = "", ...given] = said.split(" · ");
  const name = tool.toLowerCase();
  const kind = KINDS.find(([, words]) => words.test(name))?.[0];
  const target = given.join(" · ").trim();
  return { kind, tool, target: target === "" ? undefined : tidy(target) };
}

/**
 * An address as a person reads one: no scheme, no `www.`, no slash at its end. Only an address or
 * a path loses its slash, never a command: `ls /` is not `ls `.
 */
export function tidy(target: string): string {
  const bare = target.replace(/^https?:\/\/(www\.)?/i, "");
  return /\s/.test(bare) ? bare : bare.replace(/(.)\/$/, "$1");
}

/**
 * The word, without the ellipsis a harness hangs off the end of it. The dots beside it already
 * say the work is going on, and `Writing… · coding job status` says it twice — three times once
 * the line is clipped. A full stop is a sentence's and stays.
 */
export function verbWords(verb: string | undefined): string {
  const said = (verb ?? "").replace(/(?:…|\.{3,})\s*$/u, "").trim();
  return said === "" ? THINKING : said;
}
