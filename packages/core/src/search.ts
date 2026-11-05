/**
 * What search finds without asking the server, and how what it found is marked. Spaces are found
 * by name and by who is in them, and agents by name and by harness, from the model and directory
 * this client already holds, so they come on the first letter and with no connection. Messages
 * are the server's (`store.search`: FTS5 over what was typed and what was heard in voice notes;
 * `messageSearch.ts` asks it), and these rules read words as its tokenizer does, so a result row
 * and the bubble it opens mark the same words. In core so the phone and the desktop find the same
 * things in the same order (docs/proposals/search-plan.md §3.2).
 *
 * The cost is kept off the keys. `searchIndex` folds every name into words once, and again only
 * for what changed: the fold hands back an untouched space by the identity it had, so a new
 * message re-reads one room's name, not all of them. A key then costs a prefix test on words
 * already folded, and an agent's row (`agentLine`, which reads the rooms) is drawn only for the
 * agents found.
 */

import { type AgentRow, agentsTab } from "./agentsTab.js";
import { type Directory, nameOf } from "./events.js";
import { spaceList, spaceTitle } from "./model/readers.js";
import type { Space, WorkspaceModel } from "./model/types.js";
import { SNIPPET_CLOSE, SNIPPET_OPEN } from "./store.js";

/** The most terms a search reads, as the server's query does (`ftsQuery`). */
const MOST_TERMS = 8;

/** How many searches a device remembers. */
export const RECENT_SEARCHES = 8;

/**
 * A word as FTS5's `unicode61` tokenizer reads one: a run of letters and digits, with any marks
 * on them. So `@ChinatownWalkingTour` is one word, and `6–10` is two.
 */
const WORD = /[\p{L}\p{N}][\p{L}\p{N}\p{M}]*/gu;

/** Plain ASCII, whose folding is its lower case, letter for letter. */
const ASCII = /^\p{ASCII}*$/u;

/** A stretch of a text to draw marked, from `start` up to `end`, in the units `slice` takes. */
export interface SearchMark {
  readonly start: number;
  readonly end: number;
}

/** A piece of a text, marked or not, in order: what a row or a bubble draws. */
export interface SearchPart {
  readonly text: string;
  readonly marked: boolean;
}

/** A word of a text: where it starts and ends, and how search compares it. */
interface Word {
  readonly start: number;
  readonly end: number;
  readonly folded: string;
  /**
   * After each of its characters: where that is in the text, and how long the folded word is
   * by then. Absent for ASCII, where the two are the same.
   */
  readonly cuts?: readonly (readonly [at: number, folded: number])[] | undefined;
}

/** One character as search compares it: lower case, its accents dropped, as `unicode61` does. */
function foldChar(char: string): string {
  return char.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

/** A text as search compares it. Character by character, so a word's place in it is kept. */
function fold(text: string): string {
  return ASCII.test(text) ? text.toLowerCase() : Array.from(text, foldChar).join("");
}

function wordOf(raw: string, start: number): Word {
  if (ASCII.test(raw)) return { start, end: start + raw.length, folded: raw.toLowerCase() };
  let at = start;
  let folded = "";
  const cuts: (readonly [number, number])[] = [];
  for (const char of raw) {
    at += char.length;
    folded += foldChar(char);
    cuts.push([at, folded.length]);
  }
  return { start, end: at, folded, cuts };
}

function wordsOf(text: string): readonly Word[] {
  return Array.from(text.matchAll(WORD), (match) => wordOf(match[0], match.index));
}

/** Where the first `length` folded characters of a word end in its text, marks on them included. */
function endOfPrefix(word: Word, length: number): number {
  if (word.cuts === undefined) return Math.min(word.start + length, word.end);
  const reached = word.cuts.find(([, folded]) => folded >= length)?.[1] ?? word.folded.length;
  return word.cuts.findLast(([, folded]) => folded <= reached)?.[0] ?? word.end;
}

/**
 * The words a search looks for, as the server reads them (`ftsQuery`): the text split at white
 * space, quotes dropped, the first eight terms, each taken apart into its words, folded. The last
 * word is the one being typed, which the server finds as a prefix.
 */
export function searchTerms(text: string): readonly string[] {
  return text
    .split(/\s+/u)
    .filter((term) => term.replaceAll('"', "") !== "")
    .slice(0, MOST_TERMS)
    .flatMap((term) => Array.from(term.matchAll(WORD), (match) => fold(match[0])));
}

/** Whether every term starts one of a name's words: how a space or an agent is found. */
function startsWords(words: readonly Word[], terms: readonly string[]): boolean {
  return terms.every((term) => words.some((word) => word.folded.startsWith(term)));
}

function marksIn(words: readonly Word[], terms: readonly string[]): readonly SearchMark[] {
  return words.flatMap((word) => {
    let longest = 0;
    for (const term of terms) {
      if (term.length > longest && word.folded.startsWith(term)) longest = term.length;
    }
    return longest === 0 ? [] : [{ start: word.start, end: endOfPrefix(word, longest) }];
  });
}

/** In a name: the part of each word that a term starts, the longest where two do ("Chin"atown). */
export function nameMarks(text: string, terms: readonly string[]): readonly SearchMark[] {
  return marksIn(wordsOf(text), terms);
}

/**
 * In a message: the words the server marks in its snippet. A whole word, when it is one of the
 * terms before the last or starts with the last, which is what FTS5 found it by.
 */
export function wordMarks(text: string, terms: readonly string[]): readonly SearchMark[] {
  const typing = terms.at(-1);
  if (typing === undefined) return [];
  const whole = new Set(terms.slice(0, -1));
  return wordsOf(text)
    .filter((word) => whole.has(word.folded) || word.folded.startsWith(typing))
    .map((word) => ({ start: word.start, end: word.end }));
}

/**
 * Whether a message holds what was searched for, as the server's FTS5 finds it: each term before
 * the last a whole word in it, the last the start of one. The demo's search asks this, where it
 * stands in for the server (ADR 0263): "mi" finds Milo, not the "mi" inside "family".
 */
export function holdsTerms(text: string, terms: readonly string[]): boolean {
  const typing = terms.at(-1);
  if (typing === undefined) return false;
  const words = wordsOf(text).map((word) => word.folded);
  return (
    terms.slice(0, -1).every((term) => words.includes(term)) &&
    words.some((word) => word.startsWith(typing))
  );
}

/** Adds a piece, joined to the one before it when both are marked alike. Nothing empty. */
function addPart(parts: SearchPart[], text: string, marked: boolean): void {
  if (text === "") return;
  const last = parts.at(-1);
  if (last?.marked === marked) parts[parts.length - 1] = { text: last.text + text, marked };
  else parts.push({ text, marked });
}

/** A text cut into pieces at its marks, which come in order and do not overlap. */
export function markedParts(text: string, marks: readonly SearchMark[]): readonly SearchPart[] {
  const parts: SearchPart[] = [];
  let from = 0;
  for (const mark of marks) {
    addPart(parts, text.slice(from, mark.start), false);
    addPart(parts, text.slice(mark.start, mark.end), true);
    from = mark.end;
  }
  addPart(parts, text.slice(from), false);
  return parts;
}

/** Either of a snippet's marks, kept by `split` as a piece of its own. */
const SNIPPET_MARK = new RegExp(`([${SNIPPET_OPEN}${SNIPPET_CLOSE}])`, "u");

/**
 * A server snippet cut at its marks (`SNIPPET_OPEN`, `SNIPPET_CLOSE`). Marks side by side read as
 * one, and a mark the server left open runs to the end.
 */
export function snippetParts(snippet: string): readonly SearchPart[] {
  const parts: SearchPart[] = [];
  let marked = false;
  for (const piece of snippet.split(SNIPPET_MARK)) {
    if (piece === SNIPPET_OPEN || piece === SNIPPET_CLOSE) marked = piece === SNIPPET_OPEN;
    else addPart(parts, piece, marked);
  }
  return parts;
}

/** A name, folded into its words once. */
interface Named {
  readonly id: string;
  readonly name: string;
  readonly words: readonly Word[];
}

function named(id: string, name: string): Named {
  return { id, name, words: wordsOf(name) };
}

/** A space as the index holds it: its name's words, and who else is in it. */
interface SpaceEntry {
  readonly space: Space;
  readonly title: Named;
  readonly members: readonly Named[];
}

/** An agent as the index holds it: its name's words, and its harness's. */
interface AgentEntry {
  readonly agent: Named;
  readonly harness?: Named | undefined;
}

/**
 * Everything search finds names in, folded. Build it with `searchIndex` when the model or the
 * directory changes, handing it the last one so only what changed is folded again; then each
 * key is `findSpaces` and `findAgents` on it.
 */
export interface SearchIndex {
  readonly model: WorkspaceModel;
  readonly directory: Directory;
  readonly selfId: string;
  /** In the Spaces list's order (`spaceList`). */
  readonly spaces: readonly SpaceEntry[];
  /** Every agent the directory holds; the Agents tab's own rule says which it lists. */
  readonly agents: readonly AgentEntry[];
  /** Everyone's name, folded, for the next index to take back while the directory is the same. */
  readonly names: ReadonlyMap<string, Named>;
  /** Each entry by the space it was built from, for the next index to take back. */
  readonly bySpace: WeakMap<Space, SpaceEntry>;
}

/**
 * The index of what a reader can find by name. Given the last index, it takes back every space
 * entry whose space is the same object under the same directory, so a model change costs the
 * rooms it touched; a new directory, which is rare, folds every name again.
 */
export function searchIndex(
  model: WorkspaceModel,
  directory: Directory,
  selfId: string,
  previous?: SearchIndex | undefined,
): SearchIndex {
  const kept =
    previous?.directory === directory && previous.selfId === selfId ? previous : undefined;
  const names = new Map(kept?.names);
  const nameIn = (id: string): Named => {
    const known = names.get(id) ?? named(id, nameOf(directory, id));
    names.set(id, known);
    return known;
  };
  const bySpace = new WeakMap<Space, SpaceEntry>();
  const spaces = spaceList(model).map((space) => {
    const entry = kept?.bySpace.get(space) ?? {
      space,
      title: named(space.id, spaceTitle(space, directory, selfId)),
      // Not the reader: every room they are in has them in it. Nor an id the directory can't name.
      members: space.members
        .filter((id) => id !== selfId && directory[id] !== undefined)
        .map(nameIn),
    };
    bySpace.set(space, entry);
    return entry;
  });
  const agents = Object.values(directory)
    .filter((each) => each.kind === "agent")
    .map((each) => ({
      agent: nameIn(each.id),
      harness: each.harnessId === undefined ? undefined : nameIn(each.harnessId),
    }));
  return { model, directory, selfId, spaces, agents, names, bySpace };
}

/** A space search found, and why. */
export interface SpaceFound {
  readonly space: Space;
  /** What the room is called (`spaceTitle`), and the part typed. */
  readonly title: string;
  readonly marks: readonly SearchMark[];
  /** Found by someone in it rather than by its name: the row says *With Kit*, Kit marked. */
  readonly member?:
    | { readonly id: string; readonly name: string; readonly marks: readonly SearchMark[] }
    | undefined;
  readonly closed: boolean;
}

function spaceFound(entry: SpaceEntry, terms: readonly string[]): SpaceFound | undefined {
  const { space, title } = entry;
  const closed = space.state === "closed";
  if (startsWords(title.words, terms)) {
    return { space, title: title.name, marks: marksIn(title.words, terms), closed };
  }
  const member = entry.members.find((each) => startsWords(each.words, terms));
  if (member === undefined) return undefined;
  const marks = marksIn(member.words, terms);
  return {
    space,
    title: title.name,
    marks: [],
    member: { id: member.id, name: member.name, marks },
    closed,
  };
}

/**
 * The spaces with every term starting a word of their name, then those with someone in them so
 * named; open before closed in each, and otherwise in the Spaces list's own order. Not a thread,
 * which is listed nowhere, nor a glimpse (`spaceList`).
 */
export function findSpaces(index: SearchIndex, terms: readonly string[]): readonly SpaceFound[] {
  if (terms.length === 0) return [];
  const rank = (found: SpaceFound) => (found.member === undefined ? 0 : 2) + Number(found.closed);
  return index.spaces
    .flatMap((entry) => spaceFound(entry, terms) ?? [])
    .sort((a, b) => rank(a) - rank(b));
}

/** An agent search found, and why. */
export interface AgentFound {
  /** Its row on the Agents tab: its name, the line under it (`agentLine`), its face. */
  readonly row: AgentRow;
  /** The part of its name typed. */
  readonly marks: readonly SearchMark[];
  /** Found by its harness's name, which is marked where the row's line says it. */
  readonly byHarness: boolean;
  readonly lineMarks: readonly SearchMark[];
}

function agentFound(
  index: SearchIndex,
  row: AgentRow,
  byName: ReadonlySet<string>,
  terms: readonly string[],
): AgentFound {
  if (byName.has(row.id)) {
    const words = index.names.get(row.id)?.words ?? [];
    return { row, marks: marksIn(words, terms), byHarness: false, lineMarks: [] };
  }
  const harness = index.names.get(row.harnessId);
  const at = harness === undefined ? -1 : row.line.indexOf(harness.name);
  const lineMarks =
    harness === undefined || at < 0
      ? []
      : marksIn(harness.words, terms).map((mark) => ({
          start: mark.start + at,
          end: mark.end + at,
        }));
  return { row, marks: [], byHarness: true, lineMarks };
}

/**
 * The agents the Agents tab lists with every term starting a word of their name, then those
 * whose harness is so named, so `openclaw` finds OpenClaw's; archived ones last. Otherwise in the
 * tab's own order. Rows are drawn for the agents found and no others.
 */
export function findAgents(index: SearchIndex, terms: readonly string[]): readonly AgentFound[] {
  if (terms.length === 0) return [];
  const byName = new Set<string>();
  const found = new Set<string>();
  for (const { agent, harness } of index.agents) {
    if (startsWords(agent.words, terms)) byName.add(agent.id);
    else if (harness === undefined || !startsWords(harness.words, terms)) continue;
    found.add(agent.id);
  }
  if (found.size === 0) return [];
  const tab = agentsTab(index.model, index.directory, index.selfId, { only: found });
  const rows = [...tab.leads, ...tab.agents, ...tab.archived.here, ...tab.archived.elsewhere];
  const rank = (each: AgentFound) => (each.row.archived ? 2 : 0) + Number(each.byHarness);
  return rows.map((row) => agentFound(index, row, byName, terms)).sort((a, b) => rank(a) - rank(b));
}

/** A search as it is kept: trimmed, its spaces single. */
function said(text: string): string {
  return text.trim().replace(/\s+/gu, " ");
}

/**
 * The recent searches with one more: newest first, the same words once whatever their case or
 * accents (they find the same things), at most eight. A blank search is not one.
 */
export function rememberSearch(list: readonly string[], text: string): readonly string[] {
  const words = said(text);
  if (words === "") return list;
  return [words, ...forgetSearch(list, words)].slice(0, RECENT_SEARCHES);
}

/** The recent searches without one. */
export function forgetSearch(list: readonly string[], text: string): readonly string[] {
  const same = fold(said(text));
  return list.filter((each) => fold(said(each)) !== same);
}
