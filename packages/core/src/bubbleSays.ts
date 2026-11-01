/**
 * What the thinking bubble says, held steady (ADR 0147).
 *
 * The bubble was one line of text that four voices took turns to write: a line of reasoning,
 * `Writing…` before every tool call, the reply's first words as they streamed, and the call in
 * hand, which came back in milliseconds. Each rewrite rolled the words, fired the sheen and gave
 * the bubble a new size, so it jumped — fourteen shapes in a forty-five-second turn, the room
 * moving 642 points under it — and the reply's opening was shown cut off and then said again by
 * the reply (Arjun, 10 October 2026: "super jumpy"). OpenClaw names no step, so it said nothing
 * but dots.
 *
 * So the bubble has a fixed shape, and each part of it has one job:
 *
 * - a **label**: what kind of work this is, in a few words — *Searching the web*, *Reading a
 *   page*, *Running a command* — read off the tool, never off the harness's prose;
 * - a **detail** under it: what the call was given, the first sentence of a thought, OpenClaw's
 *   summary of a step, or a tally — *4 searches · 2 pages so far* — when there is nothing else;
 * - a **strip** of glyphs, a call apiece, folding repeats into a count (`stripOf`, `fitStrip`).
 *
 * And the words hold: a new label waits until the one shown has stood `LABEL_HOLD_MS`, a new
 * detail `DETAIL_HOLD_MS`, and only the latest wish is kept, so a burst of calls is read as the
 * last of them rather than flickered through (`holdSays`). `Writing…` on its own is not read at
 * all (the fold keeps it out of `thought`), and the reply is never previewed: a harness writing
 * says *Writing · after 9 searches*. A call that has finished, with nothing begun since, goes
 * back to *Thinking* after `SETTLE_MS`, keeping its detail.
 *
 * Pure, and in core, so the phone and the Mac say the same things on the same beats. What the
 * bubble looks like is theirs.
 */

import type { StepKind } from "@chipschat/protocol";
import { stepWords, THINKING, tidy } from "./doingWords.js";
import type { Step, Thought } from "./model.js";
import type { Doing } from "./timeline.js";

/** What the detail says before the harness has said anything. */
export const READING = "Reading the message";
/** How long a label stands before another may take its place. */
export const LABEL_HOLD_MS = 1500;
/** How long a detail stands before another may take its place, under the same label. */
export const DETAIL_HOLD_MS = 1100;
/** How long a finished call's words stand, with nothing begun since, before *Thinking* again. */
export const SETTLE_MS = 3000;

/**
 * The kinds of call the strip draws, a glyph each. Every tool Jacobian (32) and OpenClaw (10)
 * called between 26 September and 10 October 2026 is one of the first nine, 1,424 of 1,428 calls;
 * `other` is a plain dot for a tool nobody has named here yet, and for Jacobian's `extend`,
 * which makes a Space rather than handing to one (11 October 2026). They are the protocol's
 * `step.log.kind`, so a harness can say which a tool is (ADR 0162).
 */
export type CallKind = StepKind;

/** A call, read: what the label says while it runs, its glyph, how a tally counts it, what it was given. */
export interface CallWords {
  readonly label: string;
  readonly kind: CallKind;
  /** How a tally counts it: `search`, `searches`. */
  readonly noun: readonly [one: string, many: string];
  /** What it was given, as a person reads it; nothing when that is nothing worth saying. */
  readonly detail?: string | undefined;
  /** The detail is a command, set in a monospaced face. */
  readonly code?: true | undefined;
  /** Left out of a tally: the harness finding its own way about, which is no work done for you. */
  readonly untallied?: true | undefined;
}

/** What the bubble says: a label, the detail under it, and the glyph before the detail. */
export interface Says {
  readonly label: string;
  readonly detail: string;
  /** The glyph before the detail, when the detail is what a call was given. */
  readonly kind?: CallKind | undefined;
  readonly code?: true | undefined;
  /** Calls begun when this was read. The strip's row opens with the first words read after one. */
  readonly calls: number;
  /** A finished call's words, nothing begun or said since: in `SETTLE_MS` they go back to Thinking. */
  readonly settled?: true | undefined;
}

/**
 * The tool's own name, lowercased, without the runtime's prefix: `jacobian.web_search`,
 * `local-dev__read_file` and `exec` are `web_search`, `read_file` and `exec`. A harness that sends
 * no tool names its call in its title, `web_search · LEGO trucks`.
 */
function toolOf(step: Step): string {
  const named = step.tool ?? step.title.split(" · ")[0] ?? "";
  const bare = named.split("__").at(-1) ?? named;
  return (bare.split(".").at(-1) ?? bare).trim().toLowerCase();
}

/**
 * What a call was given, from its title: `web_search · LEGO trucks` was given `LEGO trucks`. On
 * one line, but for a command, whose first line is the one said.
 */
function givenOf(step: Step, lines = false): string {
  const given = step.title.split(" · ").slice(1).join(" · ").trim();
  return lines ? given : given.replace(/\s+/g, " ");
}

/**
 * A file named for a person: the last part of its path. One the room sent is stored under Chips'
 * own name for it (`/chips/media/…`, `att_…`), which means nothing to anyone, so it is *a photo
 * from the room*.
 */
function fileWords(path: string, what: string): string {
  const base = path.split("/").at(-1) ?? path;
  return /\/chips\/media\//.test(path) || /^att_/.test(base) ? `a ${what} from the space` : base;
}

/** What a call was given, said: in quotes, for something looked for. */
const quoted = (given: string) => `“${given}”`;
/** The file at the end of a path. */
const base = (given: string) => given.split("/").at(-1) ?? given;

/** A tool this reads by its name, and how. */
interface Known {
  readonly names: RegExp;
  readonly label: string | ((tool: string, given: string) => string);
  readonly kind: CallKind;
  readonly noun: readonly [string, string];
  /** What it was given, as said; nothing when there is nothing to say about it. */
  readonly detail?: (given: string) => string;
  readonly code?: true;
  readonly untallied?: true;
}

const SEARCHES = ["search", "searches"] as const;
const FILES = ["file", "files"] as const;
const NOTES = ["note", "notes"] as const;

/**
 * Every tool Jacobian and OpenClaw called between 26 September and 10 October 2026, and their
 * near names, read by what it does. The first to match says.
 */
const KNOWN: readonly Known[] = [
  {
    names: /^(web_search|search_web|google)$/,
    label: "Searching the web",
    kind: "search",
    noun: SEARCHES,
    detail: quoted,
  },
  {
    names: /^tool_search$/,
    label: "Finding a tool",
    kind: "search",
    noun: SEARCHES,
    detail: quoted,
    untallied: true,
  },
  {
    names: /^(knowledge_query|evidence_search_facts)$/,
    label: "Searching what it knows",
    kind: "search",
    noun: SEARCHES,
    detail: quoted,
  },
  {
    names: /^(grep|glob|find)$/,
    label: "Searching files",
    kind: "search",
    noun: SEARCHES,
    detail: quoted,
  },
  {
    names: /^(browser|web_fetch|fetch|navigate|open_url|sources_opened)$/,
    label: "Reading a page",
    kind: "web",
    noun: ["page", "pages"],
    detail: tidy,
  },
  {
    names: /^(shell|exec|bash|terminal|run_command|python)$/,
    label: "Running a command",
    kind: "shell",
    noun: ["command", "commands"],
    detail: (given) => given.split("\n")[0]?.trim() ?? "",
    code: true,
  },
  {
    names: /^(view_image|image_download)$/,
    label: "Looking at an image",
    kind: "image",
    noun: ["image", "images"],
    detail: (given) => fileWords(given, "photo"),
  },
  { names: /^memory_save$/, label: "Saving a note", kind: "memory", noun: NOTES },
  {
    names: /^(memory_recall|memory_search|memory_list|knowledge_explore)$/,
    label: "Checking memory",
    kind: "memory",
    noun: ["lookup", "lookups"],
    detail: quoted,
  },
  {
    names: /^(memory_delete|memory_update)$/,
    label: "Updating memory",
    kind: "memory",
    noun: NOTES,
  },
  {
    names: /^(artifact_edit|artifact_write|edit|multiedit|write|patch|create_file)$/,
    label: "Editing a file",
    kind: "edit",
    noun: ["edit", "edits"],
    detail: base,
  },
  {
    names: /^(read_document|read_file|read|artifact_read)$/,
    label: "Reading a file",
    kind: "file",
    noun: FILES,
    detail: (given) => fileWords(given, "file"),
  },
  {
    names: /^space_boundary$/,
    label: "Looking through the space",
    kind: "file",
    noun: ["look", "looks"],
    untallied: true,
  },
  {
    names: /^(artifact_list|list_files|space_records)$/,
    label: "Looking through the space",
    kind: "file",
    noun: ["look", "looks"],
  },
  { names: /^(deliver|send_file)$/, label: "Attaching a file", kind: "file", noun: FILES },
  {
    names: /^gmail_/,
    label: (tool) => (tool === "gmail_draft" ? "Drafting an email" : "Reading email"),
    kind: "mail",
    noun: ["email", "emails"],
  },
  // Jacobian making a Space for the work: the name it gives that Space is its own, neither the
  // room's nor its agent's, so it is not said. "Trail finder", 11 October 2026: the bubble said
  // "Handing to Nearby Trails" while the room's agent was Clyde (ADR 0150's addendum).
  {
    names: /^extend$/,
    label: "Getting set up",
    kind: "other",
    noun: ["step", "steps"],
    untallied: true,
  },
  {
    names: /^(hand_down|hand_back)$/,
    label: handingWords,
    kind: "handoff",
    noun: ["hand-off", "hand-offs"],
  },
];

/** A hand-off names the room it goes to, when its title does. */
function handingWords(tool: string, given: string): string {
  if (given !== "") return `Handing to ${given}`;
  return tool === "hand_back" ? "Handing back" : "Handing on";
}

/**
 * The kinds a tool nobody named here may still say by its name, in the order they are asked
 * (core's `stepParts` asks the same): `coding_job_status` is nothing, `read_file` is a file.
 */
const GUESSES: readonly (readonly [CallKind, RegExp])[] = [
  ["search", /\b(search|grep|find|lookup|query)\b/],
  ["web", /\b(browser|browse|navigate|fetch|http|url|web|page)\b/],
  ["shell", /\b(shell|bash|exec|terminal|command|sh|zsh|python|node|run)\b/],
  ["file", /\b(write|read|edit|file|files|patch|create|save|open)\b/],
];

/**
 * A call by the kind its harness said it is, for a tool not read here by its name (ADR 0162):
 * the words a known tool of that kind says, and the same noun, so a tally counts them together.
 */
const KIND_WORDS: Readonly<
  Record<Exclude<CallKind, "other">, Pick<Known, "noun" | "code"> & { readonly label: string }>
> = {
  search: { label: "Searching", noun: SEARCHES },
  web: { label: "Reading a page", noun: ["page", "pages"] },
  shell: { label: "Running a command", noun: ["command", "commands"], code: true },
  image: { label: "Looking at an image", noun: ["image", "images"] },
  memory: { label: "Checking memory", noun: ["lookup", "lookups"] },
  edit: { label: "Editing a file", noun: ["edit", "edits"] },
  file: { label: "Reading a file", noun: FILES },
  mail: { label: "Reading email", noun: ["email", "emails"] },
  handoff: { label: "Handing on", noun: ["hand-off", "hand-offs"] },
};

/**
 * A call as the bubble says it (`CallWords`): by its tool's name where this knows the tool, and
 * the harness says nothing else of it; by the kind the harness says, where it says one; else by
 * what its name sounds like.
 */
export function callWords(step: Step): CallWords {
  const tool = toolOf(step);
  const said = step.callKind;
  const known = KNOWN.find((each) => each.names.test(tool));
  if (known !== undefined && (said === undefined || said === known.kind)) {
    return knownWords(known, step, tool);
  }
  if (said !== undefined && said !== "other") return kindWords(KIND_WORDS[said], said, step);
  return unknownWords(step, tool);
}

function kindWords(
  words: (typeof KIND_WORDS)[keyof typeof KIND_WORDS],
  kind: CallKind,
  step: Step,
): CallWords {
  const given = givenOf(step, words.code === true);
  const detail = words.code === true ? (given.split("\n")[0]?.trim() ?? "") : tidy(given);
  return {
    label: words.label,
    kind,
    noun: words.noun,
    ...(detail === "" ? {} : { detail, ...(words.code === true ? { code: true } : {}) }),
  };
}

function knownWords(known: Known, step: Step, tool: string): CallWords {
  const given = givenOf(step, known.code === true);
  const detail = given === "" ? "" : (known.detail?.(given) ?? "");
  return {
    label: typeof known.label === "string" ? known.label : known.label(tool, given),
    kind: known.kind,
    noun: known.noun,
    ...(detail === "" ? {} : { detail, ...(known.code === true ? { code: true } : {}) }),
    ...(known.untallied === true ? { untallied: true } : {}),
  };
}

function unknownWords(step: Step, tool: string): CallWords {
  // A harness that wrote its step as a sentence, with no tool, said what it is doing itself.
  if (step.tool === undefined && /\s/.test(tool)) {
    return { label: stepWords(step.title) ?? step.title, kind: "other", noun: ["step", "steps"] };
  }
  const words = tool.replace(/_+/g, " ").trim();
  const given = givenOf(step);
  // A harness that says its tool is none of the kinds is taken at its word.
  const guessed =
    step.callKind === undefined ? GUESSES.find(([, names]) => names.test(words)) : undefined;
  return {
    label: words === "" ? "Working" : `Using ${words}`,
    kind: guessed?.[0] ?? "other",
    noun: ["step", "steps"],
    ...(given === "" ? {} : { detail: tidy(given) }),
  };
}

/**
 * The calls so far, counted by what they were: `4 searches · 2 pages so far`, or `after 9
 * searches` under *Writing*. The two kinds called first, so the words do not grow with the run.
 * Jacobian finding a tool or the room's bounds is not counted: it is nearly always its first call,
 * so *after 1 search · 8 commands* led every tally with a search nobody asked for.
 */
export function tally(made: readonly Step[], after = false): string | undefined {
  const counts = new Map<string, { n: number; noun: readonly [string, string] }>();
  for (const step of made) {
    const { noun, untallied } = callWords(step);
    if (untallied === true) continue;
    const count = counts.get(noun[1]) ?? { n: 0, noun };
    count.n += 1;
    counts.set(noun[1], count);
  }
  if (counts.size === 0) return undefined;
  const said = [...counts.values()]
    .slice(0, 2)
    .map(({ n, noun }) => `${n} ${n === 1 ? noun[0] : noun[1]}`)
    .join(" · ");
  return after ? `after ${said}` : `${said} so far`;
}

/**
 * A line of reasoning as one line: its first sentence, without the Markdown a model writes into
 * its thoughts. Jacobian's run two hundred characters, and the detail is one line.
 */
export function headline(words: string): string {
  const plain = words
    .replace(/\*\*|__|`/g, "")
    .replace(/\s+/g, " ")
    .replace(/(?:…|\.{3,})\s*$/u, "")
    .trim();
  return /^.*?[.!?](?=\s|$)/.exec(plain)?.[0] ?? plain;
}

/**
 * A harness's word that it is still at it, as a person would say it, keeping the mark it leads
 * with: Jacobian's ⏳ says the line is its pulse, as it does in Telegram (Arjun, 10 October 2026:
 * "that ⏳ emoji is needed … that is an indicator that pulse is active"). Jacobian's
 * `⏳ still on your message, 5m — waiting on the model` and `⏳ waiting on the model, 2m` are
 * both *⏳ Waiting on the model*, and `⏳ round 15 of 30` is *⏳ Round 15 of 30*.
 */
export function pulse(words: string): string {
  const lead = /^\s*(\p{Extended_Pictographic}️?)?[^\p{L}\p{N}]*/u.exec(words);
  const mark = lead?.[1] === undefined ? "" : `${lead[1]} `;
  const plain = words.slice(lead?.[0].length ?? 0).trim();
  if (plain === "") return "";
  return `${mark}${capital(ageless(plain))}`;
}

/**
 * A pulse line without how long its fact has held. Jacobian says a line once, when what it is
 * about changes, so its age (`30s`, `5m`, `2h 10m`) stands still while the bubble's clock goes on:
 * *5m* beside 6:40. The clock says how long.
 */
function ageless(words: string): string {
  const still = /^still on (?:your|the) message, [^—]+? — (.+)$/iu.exec(words);
  if (still?.[1] !== undefined) return still[1];
  return words.replace(/, \d+(?:s|m|h(?: \d+m)?)$/u, "");
}

const capital = (words: string) => words.charAt(0).toUpperCase() + words.slice(1);

/** When a call was last news: the summary it ended with, or else its start. */
function newsAt(step: Step): string {
  if (step.summary !== undefined && step.endedAt !== undefined) return step.endedAt;
  return step.startedAt ?? step.endedAt ?? "";
}

/** The call that was news last; of two at once, the later one logged. */
function newest(made: readonly Step[]): Step | undefined {
  let last: Step | undefined;
  for (const step of made) if (last === undefined || newsAt(step) >= newsAt(last)) last = step;
  return last;
}

const going = (step: Step) => step.status === "started" || step.status === "waiting";

function callSays(step: Step, made: readonly Step[]): Omit<Says, "calls"> {
  const words = callWords(step);
  const ended = !going(step);
  const settled = ended && !made.some(going) ? { settled: true as const } : {};
  // OpenClaw names no step, and says what one was for as it ends: the only words it has.
  const said = ended ? summaryWords(step, words.kind) : undefined;
  if (said !== undefined) return { label: words.label, ...said, ...settled };
  if (words.detail !== undefined) {
    return {
      label: words.label,
      detail: words.detail,
      kind: words.kind,
      ...(words.code === undefined ? {} : { code: words.code }),
      ...settled,
    };
  }
  // A call with nothing to say for itself keeps what the harness last said it was at, so
  // OpenClaw's detail moves once a call rather than flicking to a tally as each begins; a tally
  // only before it has said anything.
  return { label: words.label, detail: lastAim(made) ?? tally(made) ?? READING, ...settled };
}

/** OpenClaw's word that it read a page or a file: `from https://terafab.ai/ (max 24000 chars)`. */
const FROM = /^from (\S+)(?: \(max \d+ chars\))?$/;

/**
 * What a step said as it ended, read. OpenClaw's `from <address> (max 24000 chars)` is the page or
 * file it read, said as an address beside a globe or a name beside a page; anything else is what
 * the step was for, said as it was.
 */
function summaryWords(step: Step, kind: CallKind): Pick<Says, "detail" | "kind"> | undefined {
  const summary = step.summary?.replace(/\s+/g, " ").trim();
  if (summary === undefined || summary === "") return undefined;
  const read = FROM.exec(summary)?.[1];
  if (read === undefined) return { detail: summary };
  return kind === "web" || /^https?:\/\//i.test(read)
    ? { detail: tidy(read), kind: "web" }
    : { detail: fileWords(read, "file"), kind: "file" };
}

/** The last thing a step of the run said it was for, as it ended: not a page or file it read. */
function lastAim(made: readonly Step[]): string | undefined {
  let aim: { readonly words: string; readonly at: string } | undefined;
  for (const step of made) {
    const words = step.summary?.replace(/\s+/g, " ").trim();
    if (going(step) || words === undefined || words === "" || FROM.test(words)) continue;
    const at = step.endedAt ?? "";
    if (aim === undefined || at >= aim.at) aim = { words, at };
  }
  return aim?.words;
}

/**
 * A thought, by its phase. Writing is the reply on its way, and the reply is never previewed:
 * shown cut off, then said again whole when it landed, it was the same words twice.
 */
function thoughtSays(thought: Thought, made: readonly Step[]): Omit<Says, "calls"> {
  if (thought.phase === "writing") {
    return { label: "Writing", detail: tally(made, true) ?? "the answer" };
  }
  if (thought.phase === "waiting") {
    return { label: "Still working", detail: pulse(thought.words) || READING };
  }
  return { label: THINKING, detail: headline(thought.words) || READING };
}

/**
 * What the bubble would say now, before holding: the newer of what the harness last said it was
 * thinking and the call it last began (or ended, with a summary), read; and before either,
 * *Thinking · Reading the message*.
 */
export function doingSays(doing: Doing): Says {
  const { made, thought } = doing;
  const calls = made.length;
  const last = newest(made);
  if (thought !== undefined && (last === undefined || thought.at > newsAt(last))) {
    return { ...thoughtSays(thought, made), calls };
  }
  if (last !== undefined) return { ...callSays(last, made), calls };
  return { label: THINKING, detail: READING, calls };
}

/**
 * The words on screen and the words waiting their turn. `read` is the last reading of the run
 * and `readAt` when it was first read so, for a finished call's settling back to *Thinking*:
 * counted on this device's clock from when it saw the call end, not from the server's stamp.
 */
export interface Held {
  readonly shown: Says;
  /** When `shown` went up. */
  readonly at: number;
  /** The latest words wanted, waiting for `shown` to have stood its time. */
  readonly next?: Says | undefined;
  readonly read: string;
  readonly readAt: number;
}

/** Whether two sayings look the same: the strip's row open or shut counts, the count does not. */
export function sameSays(a: Says, b: Says): boolean {
  return (
    a.label === b.label &&
    a.detail === b.detail &&
    a.kind === b.kind &&
    a.code === b.code &&
    a.calls > 0 === b.calls > 0
  );
}

function readKey(says: Says): string {
  return [says.label, says.detail, says.kind, says.code, says.calls, says.settled].join("\n");
}

/**
 * The words to show at `now`, given what was held and what the run says now, and when to ask
 * again if nothing new arrives: when waiting words are due, or a finished call settles.
 *
 * The first words go up at once. After that a change waits for the words shown to have stood
 * their time — a label `LABEL_HOLD_MS`, a detail `DETAIL_HOLD_MS` — and the latest wish replaces
 * any still waiting. The same `Held` comes back when nothing has changed, so a screen can keep it
 * in state without drawing again.
 */
export function holdSays(
  was: Held | undefined,
  says: Says,
  now: number,
): { readonly held: Held; readonly wake: number | undefined } {
  const read = readKey(says);
  const readAt = was === undefined || was.read !== read ? now : was.readAt;
  const { wanted, settles } = settling(says, readAt, now);
  if (was === undefined) return { held: { shown: wanted, at: now, read, readAt }, wake: settles };

  const next = waiting(was, wanted);
  if (next === undefined) {
    const same = was.next === undefined && was.read === read;
    return { held: same ? was : { shown: was.shown, at: was.at, read, readAt }, wake: settles };
  }
  const due = was.at + (next.label !== was.shown.label ? LABEL_HOLD_MS : DETAIL_HOLD_MS);
  if (now >= due) return { held: { shown: next, at: now, read, readAt }, wake: settles };
  const same = was.next === next && was.read === read;
  return {
    held: same ? was : { ...was, next, read, readAt },
    wake: Math.min(due, settles ?? due),
  };
}

/**
 * A finished call's words, once they have stood `SETTLE_MS` with nothing new: *Thinking*, and the
 * detail kept. Before then, when they will.
 */
function settling(says: Says, readAt: number, now: number) {
  if (says.settled !== true) return { wanted: says, settles: undefined };
  const settleAt = readAt + SETTLE_MS;
  if (now < settleAt) return { wanted: says, settles: settleAt };
  return { wanted: { ...says, label: THINKING, settled: undefined }, settles: undefined };
}

/** The words to wait their turn: none when the run says what is shown, and the latest otherwise. */
function waiting(was: Held, wanted: Says): Says | undefined {
  if (sameSays(was.shown, wanted)) return undefined;
  return was.next !== undefined && sameSays(was.next, wanted) ? was.next : wanted;
}

/** A glyph on the strip: a kind of call, how many came in a row, and whether it is the newest. */
export interface StripChip {
  /** Steady for the life of the run: the index of the first call it stands for. */
  readonly key: string;
  readonly kind: CallKind;
  readonly count: number;
  readonly lit: boolean;
}

/**
 * The strip: a glyph per call, in the order they began, a run of the same kind folded into one
 * glyph and its count — six searches in a row are one glass and a 6. The newest is lit. Folded,
 * a 107-call turn moved the strip 9 times where a glyph apiece moved it 96 (the mocks, 10
 * October 2026).
 */
export function stripOf(made: readonly Step[]): readonly StripChip[] {
  const chips: { key: string; kind: CallKind; count: number; lit: boolean }[] = [];
  made.forEach((step, index) => {
    const { kind } = callWords(step);
    const last = chips.at(-1);
    if (last !== undefined && last.kind === kind) last.count += 1;
    else chips.push({ key: `c${index}`, kind, count: 1, lit: false });
  });
  const newest = chips.at(-1);
  if (newest !== undefined) newest.lit = true;
  return chips;
}

/** A chip placed: where it stands from the strip's start, and how wide it is. */
export interface PlacedChip extends StripChip {
  readonly x: number;
  readonly width: number;
}

/** How wide the strip draws things, which only the screen drawing it knows. */
export interface StripSizes {
  /** A chip and its count, if it has one. */
  readonly chip: (count: number) => number;
  /** The `+N` standing for the calls folded off the start. */
  readonly more: (hidden: number) => number;
  readonly gap: number;
}

/**
 * The chips that fit in `room`, newest kept: when they outgrow it, the oldest fold into a `+N`
 * at the start, so the strip never scrolls and never wraps.
 */
export function fitStrip(
  chips: readonly StripChip[],
  room: number,
  sizes: StripSizes,
): { readonly chips: readonly PlacedChip[]; readonly more: number } {
  const widths = chips.map((chip) => sizes.chip(chip.count));
  const span = (from: number) =>
    widths.slice(from).reduce((sum, width) => sum + width, 0) +
    Math.max(0, chips.length - from - 1) * sizes.gap;
  const hidden = (from: number) => chips.slice(0, from).reduce((sum, chip) => sum + chip.count, 0);
  const roomFrom = (from: number) =>
    from === 0 ? room : room - sizes.more(hidden(from)) - sizes.gap;
  let from = 0;
  while (from < chips.length - 1 && span(from) > roomFrom(from)) from += 1;
  const more = hidden(from);
  let x = more > 0 ? sizes.more(more) + sizes.gap : 0;
  const placed = chips.slice(from).map((chip, index) => {
    const width = widths[from + index] ?? 0;
    const at = { ...chip, x, width };
    x += width + sizes.gap;
    return at;
  });
  return { chips: placed, more };
}

/** How long the run has been going, as a clock reads: `0:42`, `12:05`. */
export function clockWords(startedAt: string | undefined, now: number): string {
  const began = startedAt === undefined ? Number.NaN : Date.parse(startedAt);
  const seconds = Number.isNaN(began) ? 0 : Math.max(0, Math.floor((now - began) / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}
