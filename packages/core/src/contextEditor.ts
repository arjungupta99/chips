/**
 * How the context editor works (ADR 0135), the same on the phone and the web, so the two can only
 * differ in how they look: what a file's screen opens on, what a save does, and where the editor
 * stands after each thing a person does. Each client keeps an `EditorModel` in its own state, steps
 * it with the functions here, and draws it. Nothing here draws.
 *
 * Save sends the edit down the harness's socket and waits for the harness's copy back (ADR 0134):
 * saved; changed, and the person is asked whose words stay; failed or missed, and the words stay
 * for another go; away, and Save waits for the harness to be back, reading its copy again until it
 * is. Nothing typed is ever thrown away by the editor itself.
 */

import type {
  AgentContextView,
  ContextEditView,
  ContextFile,
  HarnessContextView,
} from "@chipschat/protocol";
import {
  agentContextOf,
  type ContextRow,
  type EditorState,
  harnessContextOf,
  ownFrom,
  type SharedRow,
  settleEdit,
} from "./context.js";
import { type Directory, nameOf } from "./events.js";
import type { Store } from "./store.js";
import { ServerRefused } from "./transport.js";

/**
 * Whose context files a screen shows: one of an agent's, or its harness's own set, what its agents
 * share and what a new one starts with. The two are read, edited and opened the same way.
 */
export type ContextOwner =
  | { readonly kind: "agent"; readonly id: string }
  | { readonly kind: "harness"; readonly id: string };

/** What an edit is made from: the file as read, or, to give an agent its own, the shared text. */
export interface EditBase {
  readonly text: string;
  /** The harness's hash of it. `null`: there is no file of the agent's yet (Give it its own). */
  readonly hash: string | null;
}

/** The file as the harness has it now, when it changed under an edit. */
export interface Theirs {
  readonly text: string;
  readonly hash: string;
  readonly readAt: string;
}

/** How long Saved stands before the editor goes back. */
export const SAVED_BEAT_MS = 1000;

/** The store's reads and writes the editor uses. */
export type ContextReads = Pick<
  Store,
  "agentContext" | "harnessContext" | "editContext" | "contextEdit"
>;

/** What became of a save, for the editor to show. */
export interface EditOutcome {
  readonly state: EditorState;
  readonly theirs?: Theirs | undefined;
  readonly message?: string | undefined;
}

/** The file as its owner's copy has it now. */
async function readNow(store: ContextReads, owner: ContextOwner, name: string) {
  const copy: AgentContextView | HarnessContextView =
    owner.kind === "agent"
      ? await store.agentContext(owner.id)
      : await store.harnessContext(owner.id);
  const files: readonly ContextFile[] = "files" in copy ? copy.files : copy.shared;
  const file = files.find((each) => each.name === name);
  if (file?.text === undefined || file.hash === undefined) return undefined;
  return { text: file.text, hash: file.hash, readAt: copy.read_at };
}

/** The file a stale refusal carried, as Chips holds it now. */
function staleFile(error: unknown, readAt: string): Theirs | undefined {
  if (!(error instanceof ServerRefused) || error.code !== "stale_context") return undefined;
  const file = error.body["file"] as { text?: string; hash?: string } | undefined;
  if (file?.text === undefined || file.hash === undefined) return undefined;
  return { text: file.text, hash: file.hash, readAt };
}

const away = (error: unknown) => error instanceof ServerRefused && error.refusal === "harness_away";

/** The harness's answer, once it has given one or its minute is up. */
async function answered(
  store: ContextReads,
  owner: ContextOwner,
  name: string,
  editId: string,
  options: SaveOptions,
): Promise<EditOutcome> {
  const done = await settleEdit(
    (id: string): Promise<ContextEditView> =>
      options.alive() ? store.contextEdit(id) : Promise.reject(new Error("left")),
    editId,
    options.sleep === undefined ? {} : { sleep: options.sleep },
  );
  if (done.state !== "changed") return { state: done.state, message: done.message };
  // Refused as changed: the harness sent its copy with the refusal, so read the file as it is.
  const now = await readNow(store, owner, name).catch(() => undefined);
  return now === undefined ? { state: "failed" } : { state: "changed", theirs: now };
}

/** Why the server would not take it at all: changed since it was read, away, or otherwise. */
function refused(error: unknown): EditOutcome {
  const stale = staleFile(error, new Date().toISOString());
  if (stale !== undefined) return { state: "changed", theirs: stale };
  if (away(error)) return { state: "away" };
  return { state: "failed", message: String((error as Error)?.message ?? error) };
}

export interface SaveOptions {
  /** Whether the editor is still open: once it is not, nobody is asked again. */
  readonly alive: () => boolean;
  /** For the tests: how to wait between reads. */
  readonly sleep?: ((ms: number) => Promise<void>) | undefined;
}

/** Send an edit down the harness's socket, and wait for what the harness makes of it. */
export async function saveContextEdit(
  store: ContextReads,
  owner: ContextOwner,
  name: string,
  from: EditBase,
  words: string,
  options: SaveOptions,
): Promise<EditOutcome> {
  try {
    const asked = await store.editContext({
      owner: owner.kind,
      id: owner.id,
      name,
      text: words,
      baseHash: from.hash,
    });
    return await answered(store, owner, name, asked.edit_id, options);
  } catch (error) {
    return refused(error);
  }
}

/** Where an editor stands: its words, what they were made from, and what became of a save. */
export interface EditorModel {
  readonly text: string;
  readonly base: EditBase;
  /** What it says once the words are back to the base's: read as it was, or theirs. */
  readonly rest: "read" | "theirs";
  readonly state: EditorState;
  /** The harness's words, for a failure. */
  readonly message: string | undefined;
  /** Set while the person is asked whose words stay. */
  readonly theirs: Theirs | undefined;
  /** When the words on screen were read from the harness, for "Theirs, from …". */
  readonly theirsAt: string | undefined;
  /** It opened while its harness was away: it reads, and takes no typing. */
  readonly awayAtOpen: boolean;
}

export function openEditor(opened: EditBase, awayAtOpen: boolean): EditorModel {
  const fresh: EditorState = opened.hash === null ? "new" : "read";
  return {
    text: opened.text,
    base: opened,
    rest: "read",
    state: awayAtOpen ? "away" : fresh,
    message: undefined,
    theirs: undefined,
    theirsAt: undefined,
    awayAtOpen,
  };
}

/**
 * What may be done now: whether there is anything to save (an agent's own of a shared file is, from
 * the start), and whether leaving would lose words the person typed, which asks first.
 */
export function editorCan(model: EditorModel): {
  readonly dirty: boolean;
  readonly unsaved: boolean;
  readonly mayType: boolean;
  readonly maySave: boolean;
} {
  const dirty = model.base.hash === null || model.text !== model.base.text;
  const busy = model.state === "waiting" || model.state === "saved";
  return {
    dirty,
    unsaved: model.text !== model.base.text && !busy,
    mayType: !busy && !(model.awayAtOpen && model.state === "away"),
    maySave: dirty && !busy && model.state !== "away" && model.theirs === undefined,
  };
}

/** Words typed: edited, or as read again once they are back to the file's. */
export function typed(model: EditorModel, next: string): EditorModel {
  const busy = model.state === "waiting" || model.state === "saved";
  if (busy || model.state === "away") return { ...model, text: next };
  const back = next === model.base.text && model.base.hash !== null;
  return { ...model, text: next, state: back ? model.rest : "edited" };
}

/** Sent to the harness: saving, until it answers. */
export function sending(model: EditorModel): EditorModel {
  return { ...model, state: "waiting", message: undefined };
}

/** What the harness made of it. */
export function settled(model: EditorModel, outcome: EditOutcome): EditorModel {
  return { ...model, state: outcome.state, theirs: outcome.theirs, message: outcome.message };
}

/** Keep mine: the harness's file is the base now, and the person's words go over it. */
export function keptMine(
  model: EditorModel,
): { readonly model: EditorModel; readonly from: EditBase } | undefined {
  const theirs = model.theirs;
  if (theirs === undefined) return undefined;
  const from = { text: theirs.text, hash: theirs.hash };
  return { model: { ...model, theirs: undefined, base: from }, from };
}

/** The ask put away unanswered: the person's words stay, to be saved over the harness's. */
export function putOff(model: EditorModel): EditorModel {
  const theirs = model.theirs;
  if (theirs === undefined) return model;
  return {
    ...model,
    theirs: undefined,
    base: { text: theirs.text, hash: theirs.hash },
    state: "edited",
  };
}

/**
 * Its harness is back: Save is on again for the words typed, and one opened while it was away
 * takes typing now.
 */
export function cameBack(model: EditorModel): EditorModel {
  if (model.state !== "away") return model;
  const typedHere = model.text !== model.base.text;
  const fresh: EditorState = model.base.hash === null ? "new" : model.rest;
  return { ...model, awayAtOpen: false, state: typedHere ? "edited" : fresh };
}

/** How often an editor whose harness is away reads its copy again, to see it back. */
export const AWAY_READ_MS = 5000;

/**
 * Whether the owner's harness is still away, by its copy read again: an editor whose harness is
 * away asks every `AWAY_READ_MS`, and a copy it cannot read counts as still away.
 */
export async function harnessAway(store: ContextReads, owner: ContextOwner): Promise<boolean> {
  const copy = await (owner.kind === "agent"
    ? store.agentContext(owner.id)
    : store.harnessContext(owner.id)
  ).catch(() => undefined);
  return copy === undefined || copy.away;
}

/** Use theirs: the harness's words in the editor, to read, saving nothing. */
export function tookTheirs(model: EditorModel): EditorModel {
  const theirs = model.theirs;
  if (theirs === undefined) return model;
  return {
    ...model,
    theirs: undefined,
    base: { text: theirs.text, hash: theirs.hash },
    text: theirs.text,
    rest: "theirs",
    theirsAt: theirs.readAt,
    state: "theirs",
  };
}

/** What the editor says about whose file it is, beside what the harness is called. */
export interface EditorWords {
  readonly harnessName: string;
  /** Whose file it is, for "reads it next turn"; absent for the harness's own set. */
  readonly agentName: string | undefined;
  /** After the file's name: "Scout's own". */
  readonly whose: string;
  /** For giving an agent its own: what it starts as. */
  readonly from?: string | undefined;
}

/** What one file's screen opens on: the row, its words as read, and whose it is. */
export interface ContextOpening {
  readonly row: ContextRow;
  readonly text: string;
  readonly hash: string | null;
  readonly readAt: string;
  readonly away: boolean;
  readonly harnessId: string;
  readonly words: EditorWords;
  /** The shared file it stands for, on the harness's own page. */
  readonly shared?: SharedRow | undefined;
}

/** An agent's file: its own to edit, or, to give it its own, the shared text it starts from. */
function agentOpening(
  view: AgentContextView,
  setView: HarnessContextView | undefined,
  directory: Directory,
  name: string,
  own: boolean,
): ContextOpening | undefined {
  const context = agentContextOf(view, directory, setView);
  const row = context.rows.find((each) => each.name === name);
  if (row === undefined) return undefined;
  const agentName = nameOf(directory, view.agent_id);
  const harnessName = context.harnessName;
  const base = { row, readAt: context.readAt, away: context.away, harnessId: context.harnessId };
  if (!own) {
    const words = { harnessName, agentName, whose: `${agentName}'s own` };
    return { ...base, text: row.text ?? "", hash: row.hash ?? null, words };
  }
  const set = setView === undefined ? undefined : harnessContextOf(setView, directory);
  const shared = set?.shared.find((each) => each.id === row.replaces);
  if (shared === undefined) return undefined;
  return {
    ...base,
    row: { ...row, tag: "own", opens: "editor" },
    text: ownFrom(shared, agentName),
    hash: null,
    words: {
      harnessName,
      agentName,
      whose: `${agentName}'s own · new`,
      from: shared.line === "" ? `${harnessName}'s ${shared.title}` : shared.line,
    },
  };
}

/** One file of a harness's own set. */
function harnessOpening(
  setView: HarnessContextView,
  directory: Directory,
  name: string,
): ContextOpening | undefined {
  const set = harnessContextOf(setView, directory);
  const shared = set.shared.find((each) => each.name === name);
  if (shared === undefined) return undefined;
  const harnessName = set.harnessName;
  const whose =
    shared.usedBy === undefined
      ? `${harnessName}'s set for new agents`
      : `Shared by ${harnessName}'s agents`;
  return {
    row: shared,
    text: shared.text ?? "",
    hash: shared.hash ?? null,
    readAt: set.readAt,
    away: set.away,
    harnessId: set.harnessId,
    words: { harnessName, agentName: undefined, whose },
    shared,
  };
}

/**
 * What a file's screen opens on: an agent's file, or one of its harness's own set, from the copies
 * the page behind it read, so it is exactly what the row said. `own` begins an agent's own of a
 * shared file. Nothing, while a copy it needs is not read yet.
 */
export function contextOpening(
  owner: ContextOwner,
  copies: {
    readonly view?: AgentContextView | undefined;
    readonly setView?: HarnessContextView | undefined;
  },
  directory: Directory,
  name: string,
  own: boolean,
): ContextOpening | undefined {
  const { view, setView } = copies;
  if (owner.kind === "agent") {
    return view === undefined ? undefined : agentOpening(view, setView, directory, name, own);
  }
  return setView === undefined ? undefined : harnessOpening(setView, directory, name);
}

/**
 * A piece of a context file's Markdown as an editor draws it: a mark (`#`, `**`, `_`, a backtick,
 * a list's dash), what a heading, a bold or an emphasis says, code, or plain words. Only the colour
 * of each changes, never a weight or a size, so each glyph keeps its width and a caret stays where
 * it was typed (ADR 0135).
 */
export interface Ink {
  readonly text: string;
  readonly ink: "plain" | "mark" | "strong" | "code";
  /** Where it is in the text, for a client that keys what it draws. */
  readonly key: string;
}

/** Past this many characters a text is drawn plain: re-marking 64 KB a keystroke costs too much. */
const MARKED_UP_TO = 16_000;

const INLINE = /(\*\*[^*\n]+\*\*|`[^`\n]+`|_[^_\n]+_)/g;

/** Emphasis only where a word begins: `snake_case_name` is not. */
const wordStart = (line: string, index: number) =>
  index === 0 || /[\s(]/.test(line.charAt(index - 1));

function inline(line: string, key: string): Ink[] {
  const out: Ink[] = [];
  let at = 0;
  let n = 0;
  const plain = (text: string) => {
    if (text !== "") out.push({ text, ink: "plain", key: `${key}.${n++}` });
  };
  for (const found of line.matchAll(INLINE)) {
    const whole = found[0];
    if (whole.startsWith("_") && !wordStart(line, found.index)) continue;
    plain(line.slice(at, found.index));
    const mark = whole.startsWith("**") ? "**" : whole.charAt(0);
    const inner = whole.slice(mark.length, whole.length - mark.length);
    out.push(
      { text: mark, ink: "mark", key: `${key}.${n++}` },
      { text: inner, ink: mark === "`" ? "code" : "strong", key: `${key}.${n++}` },
      { text: mark, ink: "mark", key: `${key}.${n++}` },
    );
    at = found.index + whole.length;
  }
  plain(line.slice(at));
  return out;
}

function lineInks(line: string, key: string): Ink[] {
  const heading = /^(#{1,6})(\s.*)?$/.exec(line);
  if (heading !== null) {
    return [
      { text: heading[1] ?? "", ink: "mark", key: `${key}#` },
      { text: heading[2] ?? "", ink: "strong", key: `${key}h` },
    ];
  }
  const item = /^(\s*[-*]|\s*\d+\.)(\s.*)$/.exec(line);
  if (item !== null) {
    return [
      { text: item[1] ?? "", ink: "mark", key: `${key}-` },
      ...inline(item[2] ?? "", `${key}i`),
    ];
  }
  return inline(line, key);
}

/** A text as inks, every character kept and its line breaks as they are. */
export function markdownInks(text: string): readonly Ink[] {
  if (text.length > MARKED_UP_TO) return [{ text, ink: "plain", key: "all" }];
  return text
    .split("\n")
    .flatMap((line, index, lines) => [
      ...lineInks(line, `l${index}`),
      ...(index < lines.length - 1
        ? [{ text: "\n", ink: "plain" as const, key: `l${index}n` }]
        : []),
    ]);
}
