/**
 * An agent's context files, as a page draws them (ADR 0134): its harness's copy turned into rows,
 * the same on the phone and the web.
 *
 * Nothing here names a harness or a file. Each row's title, file name, line and tag come from what
 * the harness sent: **Shared** for a file the agent reads from its harness's own set (it opens on
 * the harness's page), **Its own** for one it was given in place of a shared one, **Read only**
 * where the harness says so. Past the eighth, the harness names the rest, and the page says Chips
 * does not show them.
 */

import {
  type AgentContextView,
  CONTEXT_EDIT_WAIT_MS,
  type ContextEditState,
  type ContextEditView,
  type ContextFile,
  type ContextRole,
  HARNESS_CAPABILITIES,
  type HarnessContextView,
  type NotShownFile,
  type SharedContextFile,
} from "@chipschat/protocol";
import { type Directory, nameOf } from "./events.js";
import type { WorkspaceModel } from "./model.js";
import { mayRemoveHarness } from "./removal.js";

/** Whether a harness sends Chips its agents' context files and takes edits (ADR 0134). */
export function takesContextFiles(directory: Directory, harnessId: string): boolean {
  return directory[harnessId]?.capabilities?.includes(HARNESS_CAPABILITIES.contextFiles) ?? false;
}

/**
 * Who reads and edits a harness's context files, and its agents': the people who may restart or
 * remove it (ADR 0078, ADR 0094), and only while it declares them.
 */
export function mayReadContext(
  model: WorkspaceModel,
  directory: Directory,
  harnessId: string,
  selfId: string,
): boolean {
  return (
    takesContextFiles(directory, harnessId) && mayRemoveHarness(model, directory, harnessId, selfId)
  );
}

export type ContextTag = "shared" | "own" | "read_only";

/** One file, as a row draws it. */
export interface ContextRow {
  readonly name: string;
  readonly title: string;
  /** Under the title, after the file's name: the harness's line, or the text's first. */
  readonly line: string;
  readonly role: ContextRole;
  readonly tag: ContextTag | undefined;
  /** Where a tap goes: the editor, the harness's page (a shared file), or a page to read. */
  readonly opens: "editor" | "harness_page" | "read_only";
  readonly text: string | undefined;
  readonly hash: string | undefined;
  readonly whyReadOnly: string | undefined;
  /** For a shared file a person may give the agent its own of: the shared file's id. */
  readonly replaces: string | undefined;
  /** For a shared file: the id of the file in its harness's set that the agent reads. */
  readonly readsShared: string | undefined;
}

/** A shared file of the harness's own set, as its page draws it. */
export interface SharedRow extends ContextRow {
  readonly id: string;
  readonly usedBy: number | undefined;
  readonly forNewAgents: boolean;
}

export interface NotShown {
  readonly names: readonly string[];
  readonly tooLarge: readonly string[];
}

export interface AgentContext {
  readonly agentId: string;
  readonly harnessId: string;
  readonly harnessName: string;
  readonly rows: readonly ContextRow[];
  readonly notShown: NotShown;
  /** When it reads them, in its harness's words; absent, at the start of every turn (ADR 0238). */
  readonly readNote: string | undefined;
  readonly readAt: string;
  readonly away: boolean;
}

export interface HarnessContext {
  readonly harnessId: string;
  readonly harnessName: string;
  readonly shared: readonly SharedRow[];
  readonly newAgentsNote: string | undefined;
  readonly notShown: NotShown;
  readonly readAt: string;
  readonly away: boolean;
}

/** A text's first line worth reading: past headings, with Markdown's marks taken off. */
export function firstLine(text: string): string {
  const line = text.split("\n").find((each) => each.trim() !== "" && !each.startsWith("#"));
  return (line ?? "")
    .replace(/[*_`]/g, "")
    .replace(/^\s*[-*]\s+/, "")
    .trim();
}

function notShownOf(files: readonly NotShownFile[]): NotShown {
  return {
    names: files.filter((file) => file.reason === "count").map((file) => file.name),
    tooLarge: files.filter((file) => file.reason === "too_large").map((file) => file.name),
  };
}

function tagOf(file: ContextFile, ownInPlaceOfShared: boolean): ContextTag | undefined {
  if (file.shared !== undefined) return "shared";
  if (!file.editable) return "read_only";
  return ownInPlaceOfShared ? "own" : undefined;
}

/** A row's line: the harness's, else the text's first; a shared file's, for one the agent reads. */
function lineOf(file: ContextFile, reads: SharedContextFile | undefined): string {
  if (file.about !== undefined) return file.about;
  if (file.text !== undefined) return firstLine(file.text);
  if (reads === undefined) return "";
  return reads.about ?? (reads.text === undefined ? "" : firstLine(reads.text));
}

function rowOf(
  file: ContextFile,
  sharedNames: ReadonlySet<string>,
  reads?: SharedContextFile | undefined,
): ContextRow {
  const shared = file.shared !== undefined;
  const tag = tagOf(file, sharedNames.has(file.name));
  return {
    name: file.name,
    title: file.title,
    line: lineOf(file, reads),
    role: file.role ?? "other",
    tag,
    opens: shared ? "harness_page" : file.editable ? "editor" : "read_only",
    text: file.text,
    hash: file.hash,
    whyReadOnly: file.why_read_only,
    replaces: shared && file.replaceable === true ? file.shared : undefined,
    readsShared: file.shared,
  };
}

/**
 * An agent's context from the server's answer. With its harness's own set beside it, a file of
 * the same name as a shared one agents read is the agent's own, given in place of the shared:
 * tagged so, even when none reads the shared one now (`used_by: 0`). A file the set only copies
 * into new agents (no `used_by`) makes nobody's file its own.
 */
export function agentContextOf(
  view: AgentContextView,
  directory: Directory,
  harnessSet?: HarnessContextView | undefined,
): AgentContext {
  const sharedNames = new Set(
    (harnessSet?.shared ?? [])
      .filter((file) => file.used_by !== undefined)
      .map((file) => file.name),
  );
  return {
    agentId: view.agent_id,
    harnessId: view.harness_id,
    harnessName: nameOf(directory, view.harness_id),
    rows: view.files.map((file) =>
      rowOf(
        file,
        sharedNames,
        harnessSet?.shared.find((each) => each.id === file.shared),
      ),
    ),
    notShown: notShownOf(view.not_shown),
    readNote: view.read_note,
    readAt: view.read_at,
    away: view.away,
  };
}

function sharedRowOf(file: SharedContextFile): SharedRow {
  return {
    ...rowOf(file, new Set()),
    tag: file.editable ? undefined : "read_only",
    opens: file.editable ? "editor" : "read_only",
    id: file.id,
    usedBy: file.used_by,
    forNewAgents: file.for_new_agents === true,
  };
}

export function harnessContextOf(view: HarnessContextView, directory: Directory): HarnessContext {
  return {
    harnessId: view.harness_id,
    harnessName: nameOf(directory, view.harness_id),
    shared: view.shared.map(sharedRowOf),
    newAgentsNote: view.new_agents_note,
    notShown: notShownOf(view.not_shown),
    readAt: view.read_at,
    away: view.away,
  };
}

/** The words under a group past its eighth file: what Chips leaves out, and why. */
export function notShownWords(
  notShown: NotShown,
  harnessName: string,
  agentName: string,
  /** How many it does show: the foot then begins with how many the harness has in all. */
  shown?: number,
): { readonly title: string; readonly line: string; readonly foot: string } | undefined {
  const all = [...notShown.names, ...notShown.tooLarge];
  if (all.length === 0) return undefined;
  const count = all.length;
  const files = count === 1 ? "file" : "files";
  const reasons = [
    notShown.names.length > 0
      ? `Chips shows the first 8, in ${harnessName}'s order, and doesn't support more than that yet.`
      : undefined,
    notShown.tooLarge.length > 0
      ? `Chips doesn't show a file over 64 KB: ${notShown.tooLarge.join(", ")}.`
      : undefined,
  ].filter((each): each is string => each !== undefined);
  return {
    title: `${count} more ${files} not shown`,
    line: all.join(", "),
    foot: [
      shown === undefined
        ? undefined
        : `${harnessName} has ${shown + count} files for ${agentName}.`,
      ...reasons,
      `${count === 1 ? "It is" : `The other ${count} are`} still in ${harnessName}, and ${agentName} still reads ${count === 1 ? "it" : "them"}.`,
    ]
      .filter((each): each is string => each !== undefined)
      .join(" "),
  };
}

/** Where an editor stands, beside what became of an edit: as read, typed into, or not to be saved. */
export type EditorState =
  | ContextEditState
  | "read"
  | "edited"
  | "away"
  | "theirs"
  /** Giving an agent its own of a shared file: the shared text, not saved yet. */
  | "new";

/**
 * What an edit's state says at the foot of the editor, in the product's words. `agentName` is
 * whose file it is; absent for a harness's own set, which new agents are given. `atSave`: the
 * harness went away at a save, and the person's words wait there for it to be back. Missed says
 * only that the harness has not answered: one that answers after its minute still saves.
 */
export function editWords(
  state: EditorState,
  harnessName: string,
  agentName: string | undefined,
  more: {
    readonly readAt?: string | undefined;
    readonly from?: string | undefined;
    readonly atSave?: boolean | undefined;
  } = {},
): string {
  switch (state) {
    case "read":
      return more.readAt === undefined
        ? `Read from ${harnessName}`
        : `Read from ${harnessName} at ${more.readAt}`;
    case "new":
      return `Starts as ${more.from ?? `${harnessName}'s shared file`}`;
    case "edited":
      return "Edited · not saved yet";
    case "waiting":
      return `Saving to ${harnessName}…`;
    case "saved":
      return agentName === undefined
        ? "Saved · new agents get it"
        : `Saved · ${agentName} reads it next turn`;
    case "changed":
      return `Changed in ${harnessName} while you were editing`;
    case "failed":
      return `${harnessName} couldn't save it. Your words are still here.`;
    case "missed":
      return `${harnessName} hasn't answered. Your words are still here.`;
    case "away":
      return more.atSave === true
        ? `${harnessName} is away. Your words are still here, to save once it's back.`
        : `${harnessName} is away. You can read this, not save it.`;
    case "theirs":
      return more.readAt === undefined
        ? `Theirs, from ${harnessName}`
        : `Theirs, from ${harnessName} at ${more.readAt}`;
  }
}

/**
 * The words an edit begins with, to give an agent its own of a shared file: the shared text, with
 * a marker the harness left for the name filled in. `‹its name›` is the one marker.
 */
export function ownFrom(shared: SharedRow, agentName: string): string {
  return (shared.text ?? "").replaceAll("‹its name›", agentName);
}

/**
 * Wait for what an edit's harness makes of it: read every `everyMs` until it is no longer waiting,
 * or the minute it has is past and the server says it was missed.
 */
export async function settleEdit(
  read: (editId: string) => Promise<ContextEditView>,
  editId: string,
  options: {
    readonly everyMs?: number;
    readonly sleep?: (ms: number) => Promise<void>;
    readonly tries?: number;
  } = {},
): Promise<ContextEditView> {
  const everyMs = options.everyMs ?? 800;
  const sleep =
    options.sleep ?? ((ms: number) => new Promise<void>((done) => setTimeout(done, ms)));
  const tries = options.tries ?? Math.ceil((CONTEXT_EDIT_WAIT_MS + 5000) / everyMs);
  let seen = await read(editId);
  for (let at = 0; seen.state === "waiting" && at < tries; at += 1) {
    await sleep(everyMs);
    seen = await read(editId);
  }
  return seen;
}

/** The icon a row's tile wears, by what its file is for. Each client draws these its own way. */
export type ContextIcon = "sparkle" | "list" | "person" | "drawers" | "page";
/** The tile's ground, by name: one of the grounds a space's or an agent's face may stand on. */
export type ContextGround = "violet" | "blue" | "green" | "sea" | "slate";

/**
 * The mark of each role, so Who it is looks the same on every harness, and on the phone and the
 * web: the role is what a harness says a file is for, and it picks this and nothing else.
 */
export const CONTEXT_MARKS: Readonly<
  Record<ContextRole, { readonly icon: ContextIcon; readonly ground: ContextGround }>
> = {
  identity: { icon: "sparkle", ground: "violet" },
  instructions: { icon: "list", ground: "blue" },
  about_you: { icon: "person", ground: "green" },
  memory: { icon: "drawers", ground: "sea" },
  other: { icon: "page", ground: "slate" },
};

/**
 * Where each tile's ground is among the grounds a face may stand on, by the index a face's
 * `ground` is sent as (ADR 0064), so the phone and the web each turn it into the same colour.
 */
export const CONTEXT_GROUND_INDEX: Readonly<Record<ContextGround, number>> = {
  blue: 4,
  violet: 5,
  green: 7,
  sea: 8,
  slate: 14,
};

/** A foot with a link in it: the words before, the link's, and after. */
export interface LinkedWords {
  readonly before: string;
  /** The words that open the harness's page. Absent: the foot has no link. */
  readonly link?: string | undefined;
  readonly after?: string | undefined;
}

const listed = (words: readonly string[]): string =>
  words.length <= 1
    ? (words[0] ?? "")
    : `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;

/** The shared files of a harness's set that its agents read, rather than only begin with. */
function readShared(set: HarnessContext | undefined): readonly SharedRow[] {
  return (set?.shared ?? []).filter((row) => row.usedBy !== undefined);
}

/** The files a new agent is given a copy of, which no agent reads after. */
function copiedForNew(set: HarnessContext | undefined): readonly SharedRow[] {
  return (set?.shared ?? []).filter((row) => row.forNewAgents && row.usedBy === undefined);
}

/** "is" or "are", for a list of so many. */
const isAre = (count: number) => (count === 1 ? "is" : "are");

/** How many of its harness's agents read the shared files: one number when they agree. */
function readersOf(
  shared: readonly ContextRow[],
  set: HarnessContext | undefined,
  harness: string,
) {
  const counts = shared.map(
    (row) => readShared(set).find((each) => each.id === row.readsShared)?.usedBy,
  );
  const first = counts[0];
  return first !== undefined && counts.every((count) => count === first)
    ? `${first} of ${harness}'s agents`
    : `${harness}'s agents`;
}

function sharedFootOf(
  context: AgentContext,
  set: HarnessContext | undefined,
  agentName: string,
): LinkedWords {
  const harness = context.harnessName;
  const shared = context.rows.filter((row) => row.tag === "shared");
  const rest = context.rows.filter((row) => row.tag !== "shared");
  const one = shared.length === 1;
  return {
    before: `${listed(shared.map((row) => row.title))} ${isAre(shared.length)} shared by ${readersOf(shared, set, harness)}, so ${one ? "it lives" : "they live"} on `,
    link: `${harness}'s page`,
    after:
      rest.length === 0
        ? "."
        : `. ${listed(rest.map((row) => row.title))} ${isAre(rest.length)} ${agentName}'s own.`,
  };
}

/**
 * What the foot under an agent's Context group says, from what its harness sent and nothing
 * else: which of its files are shared, and so on the harness's page, which it was given its own
 * of, and where the rest came from. Past the eighth file, what Chips leaves out instead.
 */
export function contextFoot(
  context: AgentContext,
  set: HarnessContext | undefined,
  agentName: string,
): LinkedWords {
  const harness = context.harnessName;
  const leftOut = notShownWords(context.notShown, harness, agentName, context.rows.length);
  if (leftOut !== undefined) return { before: leftOut.foot };
  if (context.rows.some((row) => row.tag === "shared")) {
    return sharedFootOf(context, set, agentName);
  }
  const given =
    context.readNote ?? `${harness} gives ${agentName} these at the start of every turn.`;
  const own = context.rows.filter((row) => row.tag === "own");
  if (own.length > 0) {
    return {
      before: `${given} ${listed(own.map((row) => row.title))} ${isAre(own.length)} ${agentName}'s own now, in place of `,
      link: `${harness}'s shared one`,
      after: ".",
    };
  }
  if (copiedForNew(set).length > 0) {
    return {
      before: `${given} They are its own, copied from `,
      link: `${harness}'s set for new agents`,
      after: " when it was made.",
    };
  }
  return { before: given };
}

/** A harness's page, for its owner: what its agents share, and what a new agent starts with. */
export interface HarnessGroups {
  /** The files its agents read from its set. Empty: `sharedFoot` says so. */
  readonly shared: readonly SharedRow[];
  readonly sharedFoot: string;
  /** The files each new agent is given a copy of. Empty: `newLine` says what it starts with. */
  readonly forNew: readonly SharedRow[];
  readonly newFoot: string | undefined;
  /** In place of rows: what a new agent starts with, when nothing is copied into it. */
  readonly newLine: string | undefined;
}

function sharedWords(shared: readonly SharedRow[], harness: string): string {
  if (shared.length === 0) return `Nothing. Each ${harness} agent has its own files.`;
  const one = shared.length === 1;
  if (!shared.every((row) => row.tag === "read_only")) {
    return `Changing ${one ? "it" : "one"} changes it for every agent that reads it.`;
  }
  const why = shared.find((row) => row.whyReadOnly !== undefined)?.whyReadOnly ?? "Read only";
  return `${why}, so ${one ? "it is" : "they are"} read only here. To change one for a single agent, give it its own from its page.`;
}

function newWords(forNew: readonly SharedRow[], harness: string, note: string): string | undefined {
  if (forNew.length === 0) return undefined;
  const one = forNew.length === 1;
  return `Each new ${harness} agent gets its own copy of ${one ? "this" : "these"}${note}. Changing ${one ? "it" : "them"} leaves agents made before as they are.`;
}

export function harnessGroups(set: HarnessContext): HarnessGroups {
  const harness = set.harnessName;
  const shared = readShared(set);
  const forNew = copiedForNew(set);
  const note = set.newAgentsNote === undefined ? "" : `, ${set.newAgentsNote}`;
  const startsShared = shared.filter((row) => row.forNewAgents).map((row) => row.title);
  const lineless = forNew.length > 0 || (startsShared.length === 0 && note === "");
  return {
    shared,
    sharedFoot: sharedWords(shared, harness),
    forNew,
    newFoot: newWords(forNew, harness, note),
    newLine: lineless
      ? undefined
      : `${harness}'s shared ${startsShared.length === 0 ? "files" : listed(startsShared)}${note}.`,
  };
}

/** What one side added to a text and took out of it, line by line, blank lines aside. */
export interface LineChanges {
  readonly added: readonly string[];
  readonly removed: readonly string[];
}

/** Past this many line pairs a text is compared as two sets of lines, not in order. */
const ORDERED_PAIRS = 4_000_000;

const worded = (lines: readonly string[]) => lines.filter((line) => line.trim() !== "");

/** The table of the longest run of lines in common, from each pair of places to the ends. */
function runs(a: readonly string[], b: readonly string[]): (i: number, j: number) => number {
  const width = b.length + 1;
  const table = new Uint32Array((a.length + 1) * width);
  const at = (i: number, j: number) => table[i * width + j] ?? 0;
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      table[i * width + j] =
        a[i] === b[j] ? at(i + 1, j + 1) + 1 : Math.max(at(i + 1, j), at(i, j + 1));
    }
  }
  return at;
}

/** What changed from one text to another, by the longest run of lines the two share in order. */
export function lineChanges(from: string, to: string): LineChanges {
  const a = from.split("\n");
  const b = to.split("\n");
  if (a.length * b.length > ORDERED_PAIRS) {
    const inA = new Set(a);
    const inB = new Set(b);
    return {
      added: worded(b.filter((line) => !inA.has(line))),
      removed: worded(a.filter((line) => !inB.has(line))),
    };
  }
  const run = runs(a, b);
  const added: string[] = [];
  const removed: string[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i += 1;
      j += 1;
    } else if (run(i + 1, j) >= run(i, j + 1)) {
      removed.push(a[i++] ?? "");
    } else {
      added.push(b[j++] ?? "");
    }
  }
  return { added: worded([...added, ...b.slice(j)]), removed: worded([...removed, ...a.slice(i)]) };
}

/**
 * A conflict, for the sheet that asks whose words stay: what the harness's side changed since the
 * person opened the file, and what they did.
 */
export function conflictOf(
  opened: string,
  theirs: string,
  mine: string,
): { readonly theirs: LineChanges; readonly mine: LineChanges } {
  return { theirs: lineChanges(opened, theirs), mine: lineChanges(opened, mine) };
}
