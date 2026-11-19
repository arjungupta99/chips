/**
 * A harness's Permissions (ADR 0299, Arjun's B of the mock "Harness permissions"): the words and
 * the readers behind the page, You → Permissions, the New rule page, the ask screen's snooze row
 * and the room's band, so the phone, the iPad, the web and the Mac say the same thing.
 *
 * Two gates stand between a harness and a person. Its own settings decide first what it runs
 * without asking, and what they let through never reaches Chips; a bridge sends a copy of them
 * (`readOwnRules`), which the page says in plain words, naming what Chips would never allow. Then
 * Chips answers what the rules a person wrote cover, and brings the rest to a person.
 *
 * Turning a harness's asks off is one switch with four lengths: an hour, eight hours, until
 * tomorrow morning, or until someone turns it back on. Chips then says yes for it in every space,
 * keeps each yes on the record (a gold dot), and still brings what matters to a person unless an
 * owner or admin included those too. A Never a person wrote still holds.
 */

import {
  askedCommand,
  askLineFor,
  chipsRulesOn,
  commandKind,
  commandParts,
  NEVER_STANDING,
  neverCovered,
  neverStanding,
  type OwnEntry,
  type OwnKind,
  type OwnRules,
  type OwnRulesRead,
  standingOffer,
  startOf,
  startsWith,
} from "@chipschat/protocol";
import {
  type AlwaysRule,
  type AskHistory,
  type AsksGoTo,
  actionWords,
  alwaysCount,
  alwaysRules,
  askHistory,
  askingOpening,
  askMatters,
  asksGoTo,
  EVERY_HARNESS,
  harnessAsks,
} from "./asking.js";
import { type Directory, harnessOf, nameOf, workspaceHarnesses } from "./events.js";
import { mayTurnDial } from "./model/readers.js";
import type { Approval, Hold, Rule, WorkspaceModel } from "./model/types.js";
import { roomName } from "./rooms.js";

// ------------------------------------------------------------------ text with code in it

/** A stretch of words, in code where the words were between backticks. */
export interface Segment {
  readonly text: string;
  readonly code?: true | undefined;
}

/** `Runs \`git push\` freely` as stretches: the apps draw the code ones in code. */
export function segments(text: string): readonly Segment[] {
  return text
    .split("`")
    .map((part, at) => (at % 2 === 1 ? { text: part, code: true as const } : { text: part }))
    .filter((part) => part.text !== "");
}

/** `a`, `a and b`, `a, b and c`. */
function listWords(items: readonly string[]): string {
  if (items.length < 2) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
}

const plural = (count: number, one: string, many: string) => (count === 1 ? one : many);

// ------------------------------------------------------------------ turning the asks off

/** How long a harness's asks are off: an hour, eight hours, until tomorrow morning, or until on. */
export type SnoozeLength = "1h" | "8h" | "tomorrow" | "stopped";

export const SNOOZE_LENGTHS: readonly SnoozeLength[] = ["1h", "8h", "tomorrow", "stopped"];
/** The lengths with an end, as You's Snooze and the ask screen offer them in a row. */
export const SNOOZE_CHIPS: readonly SnoozeLength[] = ["1h", "8h", "tomorrow"];

const HOUR_MS = 3_600_000;
/** Tomorrow morning is this hour, the reader's time. */
const MORNING_HOUR = 9;

/** When a snooze of this length given now ends; nothing for one that holds until turned on. */
export function snoozeUntil(length: SnoozeLength, now: number = Date.now()): string | undefined {
  if (length === "stopped") return undefined;
  if (length === "1h") return new Date(now + HOUR_MS).toISOString();
  if (length === "8h") return new Date(now + 8 * HOUR_MS).toISOString();
  const at = new Date(now);
  at.setDate(at.getDate() + 1);
  at.setHours(MORNING_HOUR, 0, 0, 0);
  return at.toISOString();
}

/** A time of day as a card says it: `10:41 AM`. */
function clockTime(at: Date): string {
  return at.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

/** Whole days from one day to another, the reader's calendar. */
function daysApart(from: Date, to: Date): number {
  const start = new Date(from.getFullYear(), from.getMonth(), from.getDate()).getTime();
  const end = new Date(to.getFullYear(), to.getMonth(), to.getDate()).getTime();
  return Math.round((end - start) / 86_400_000);
}

/** `10:41 AM`, `9:00 AM tomorrow`, or `9:00 AM on Friday` further off. */
function whenWords(iso: string, now: number): string {
  const at = new Date(iso);
  const days = daysApart(new Date(now), at);
  if (days <= 0) return clockTime(at);
  if (days === 1) return `${clockTime(at)} tomorrow`;
  return `${clockTime(at)} on ${at.toLocaleDateString("en-US", { weekday: "long" })}`;
}

/** A length as a chip in a row says it: `1 hour`, `8 hours`, `Until tomorrow`. */
export function snoozeChipWords(length: SnoozeLength): string {
  if (length === "1h") return "1 hour";
  if (length === "8h") return "8 hours";
  if (length === "tomorrow") return "Until tomorrow";
  return "Until I turn it back on";
}

/** The hold, while it still holds at `now`; nothing once its end has passed or there is none. */
export function holding(hold: Hold | undefined, now: number = Date.now()): Hold | undefined {
  if (hold === undefined) return undefined;
  return hold.until === undefined || Date.parse(hold.until) > now ? hold : undefined;
}

/** Who turned the asks off, as a line says it: `you`, `Dana`. */
function byWords(hold: Hold, directory: Directory, selfId: string | undefined): string {
  if (hold.by === undefined) return "someone";
  return hold.by === selfId ? "you" : nameOf(directory, hold.by);
}

/** The gold line on a harness's row: `Not asking until 10:41 AM`, `Not asking · switched off by you`. */
export function notAskingWords(
  hold: Hold,
  directory: Directory,
  selfId: string | undefined,
  now: number = Date.now(),
): string {
  return hold.until === undefined
    ? `Not asking · switched off by ${byWords(hold, directory, selfId)}`
    : `Not asking until ${whenWords(hold.until, now)}`;
}

export const ASK_AGAIN_WORDS = "Ask again";

/** What the row says once a length is picked: `Approved · snoozed until 10:41 AM`. */
export function snoozedWords(length: SnoozeLength, now: number = Date.now()): string {
  const until = snoozeUntil(length, now);
  return until === undefined
    ? "Approved · not asking until you turn it back on"
    : `Approved · snoozed until ${whenWords(until, now)}`;
}

/**
 * A harness's own hold. Read with care: the room's band reads it in every room, and a model built
 * by hand may leave `harnesses` out, which must never take the room down with it.
 */
function heldOn(model: WorkspaceModel, harnessId: string): Hold | undefined {
  return model.harnesses?.[harnessId]?.hold;
}

/**
 * The asks a harness has off, its own or every harness's, whichever holds: what its page, its row
 * and a room's band say. Its own comes first, since that is the one its switch turns back on.
 */
export function holdOf(
  model: WorkspaceModel,
  harnessId: string,
  now: number = Date.now(),
): { readonly hold: Hold; readonly every: boolean } | undefined {
  const own = holding(heldOn(model, harnessId), now);
  if (own !== undefined) return { hold: own, every: false };
  const every = holding(model.workspaceRules?.hold, now);
  return every === undefined ? undefined : { hold: every, every: true };
}

/** One band at the top of a room while a harness of someone in it isn't asking. */
export interface HoldBand {
  /** The harness, or `EVERY_HARNESS` while every harness isn't asking. */
  readonly harnessId: string;
  readonly words: string;
}

/**
 * The bands a room shows (ADR 0299): one for each harness with an agent in it whose asks are off,
 * or one for every harness while they all are. Nothing in a room with no agent in it.
 */
export function roomHolds(
  model: WorkspaceModel,
  directory: Directory,
  spaceId: string,
  now: number = Date.now(),
): readonly HoldBand[] {
  const space = model.spaces.find((each) => each.id === spaceId);
  if (space === undefined) return [];
  const harnesses = [
    ...new Set(
      space.members
        .filter((member) => {
          const kind = directory[member]?.kind;
          return kind !== undefined && kind !== "person";
        })
        .map((member) => harnessOf(directory, member)),
    ),
  ];
  if (harnesses.length === 0) return [];
  const every = holding(model.workspaceRules?.hold, now);
  if (every !== undefined) {
    return [
      {
        harnessId: EVERY_HARNESS,
        words:
          every.until === undefined
            ? "Chips is saying yes for every harness"
            : `Chips is saying yes for every harness until ${whenWords(every.until, now)}`,
      },
    ];
  }
  return harnesses.flatMap((harnessId) => {
    // A pause is Chips's, so it holds only while the harness's Chips's rules are on (ADR 0300).
    if (!chipsRulesOnFor(model, harnessId)) return [];
    const hold = holding(heldOn(model, harnessId), now);
    if (hold === undefined) return [];
    const name = nameOf(directory, harnessId);
    return [
      {
        harnessId,
        words:
          hold.until === undefined
            ? `Chips is saying yes for ${name}`
            : `Chips is saying yes for ${name} until ${whenWords(hold.until, now)}`,
      },
    ];
  });
}

// ------------------------------------------------------------------ what it runs on its own

/** One kind of thing its own settings let through, as the page lists it. */
export interface OwnRow {
  readonly kind: OwnKind;
  readonly title: string;
  /** The tools or programs, as its settings name them; `never` marks one on Chips's never list. */
  readonly names: readonly { readonly name: string; readonly never: boolean }[];
}

/** The notice for what it runs that Chips would never let a rule allow. */
export interface OwnNotice {
  readonly title: string;
  readonly body: string;
  /** The line that makes those ask in its own settings, and where it goes; nothing to paste. */
  readonly line?: string | undefined;
  readonly where?: string | undefined;
}

/** What a harness last said it runs on its own, as the page says it. */
export interface OwnRulesView {
  /** It has sent a copy. */
  readonly said: boolean;
  /** It runs everything without asking. */
  readonly everything: boolean;
  /** How many kinds of work it runs without asking. */
  readonly count: number;
  readonly rows: readonly OwnRow[];
  readonly foot: string | undefined;
  /** The never-list commands it runs without a card, in words. */
  readonly conflicts: readonly string[];
  readonly notice: OwnNotice | undefined;
  /** The mode its sessions run in, as the harness names it (`Default`), when it says. */
  readonly mode?: string | undefined;
}

/** Nothing said: a harness whose bridge doesn't send a copy yet, or a server that doesn't keep one. */
export const NOT_SAID: OwnRulesView = {
  said: false,
  everything: false,
  count: 0,
  rows: [],
  foot: undefined,
  conflicts: [],
  notice: undefined,
};

const OWN_TITLES: Readonly<Record<Exclude<OwnKind, "command" | "tool">, string>> = {
  read: "Read and search files",
  write: "Edit and write files",
  web: "Fetch pages and search the web",
};

/** An entry's name on the page: a command's start, else the tool's name. */
function entryName(entry: OwnEntry): string {
  return entry.kind === "command" && entry.words !== undefined ? entry.words.join(" ") : entry.name;
}

/** Whether a list that asks or refuses catches a listed command (`git push` by `git`). */
function caught(entries: readonly OwnEntry[], never: readonly string[]): boolean {
  return entries.some(
    (entry) =>
      entry.kind === "command" &&
      (entry.words === undefined ||
        (!entry.words.some((word) => word.includes("*")) &&
          entry.words.every((word, at) => never[at] === word))),
  );
}

/** The listed commands an entry lets through, that nothing it asks about or refuses catches. */
function entryConflicts(entry: OwnEntry, rules: OwnRules): string[] {
  if (entry.kind !== "command") return [];
  const stops = [...(rules.asks ?? []), ...(rules.refuses ?? [])];
  return neverCovered(entry.words ?? []).filter((never) => !caught(stops, never.split(" ")));
}

/** Its conflicts, one for each program first, then the rest, in the never list's order. */
function conflictsOf(rules: OwnRules): string[] {
  const found = new Set(rules.runs.flatMap((entry) => entryConflicts(entry, rules)));
  const ordered = NEVER_STANDING.map((words) => words.join(" ")).filter((words) =>
    found.has(words),
  );
  const firsts: string[] = [];
  const programs = new Set<string>();
  for (const words of ordered) {
    const program = words.split(" ")[0] ?? "";
    if (programs.has(program)) continue;
    programs.add(program);
    firsts.push(words);
  }
  return [...firsts, ...ordered.filter((words) => !firsts.includes(words))];
}

/**
 * The starts its own ask line names: a listed command's program alone when its second word is a
 * flag, since a flag can come anywhere (`find . -exec`), else the listed words (`git push`).
 */
function askStarts(conflicts: readonly string[]): (readonly string[])[] {
  const starts: (readonly string[])[] = [];
  for (const never of conflicts) {
    const words = never.split(" ");
    const start = (words[1] ?? "").startsWith("-") ? words.slice(0, 1) : words;
    if (!starts.some((kept) => kept.join(" ") === start.join(" "))) starts.push(start);
  }
  return starts;
}

/** The rows for one kind of entry. */
function rowsOf(rules: OwnRules, conflicts: ReadonlySet<string>): OwnRow[] {
  const flagged = (entry: OwnEntry) =>
    entryConflicts(entry, rules).some((each) => conflicts.has(each));
  const names = (entries: readonly OwnEntry[]) =>
    entries.map((entry) => ({ name: entryName(entry), never: flagged(entry) }));
  const of = (kind: OwnKind) => rules.runs.filter((entry) => entry.kind === kind);
  const rows: OwnRow[] = [];
  for (const kind of ["read", "write", "web"] as const) {
    const entries = of(kind);
    if (entries.length > 0) rows.push({ kind, title: OWN_TITLES[kind], names: names(entries) });
  }
  const commands = of("command");
  const any = commands.filter((entry) => entry.words === undefined);
  const shaped = commands.filter(
    (entry) => entry.words?.some((word) => word.includes("*")) === true,
  );
  const programs = commands.filter((entry) => !any.includes(entry) && !shaped.includes(entry));
  if (any.length > 0) rows.push({ kind: "command", title: "Run any command", names: names(any) });
  if (programs.length > 0) {
    rows.push({
      kind: "command",
      title: `Run ${programs.length} ${plural(programs.length, "program", "programs")}`,
      names: names(programs),
    });
  }
  if (shaped.length > 0) {
    rows.push({ kind: "command", title: "Run commands shaped like these", names: names(shaped) });
  }
  const tools = of("tool");
  if (tools.length > 0) {
    rows.push({
      kind: "tool",
      title: `Use ${tools.length} other ${plural(tools.length, "tool", "tools")}`,
      names: names(tools),
    });
  }
  return rows;
}

/** `\`a\`, \`b\` and 3 more`: up to three named, in code. */
function namedInCode(items: readonly string[]): string {
  const named = items.slice(0, 3).map((item) => `\`${item}\``);
  const more = items.length - named.length;
  return more > 0 ? `${named.join(", ")} and ${more} more` : listWords(named);
}

/** What a harness last said it runs on its own, in the page's words; `NOT_SAID` before it said. */
export function ownRulesView(name: string, read: OwnRulesRead | undefined): OwnRulesView {
  const rules = read?.own_rules ?? undefined;
  if (rules === undefined || rules === null) return NOT_SAID;
  const foot = [
    `Read from ${listWords(rules.read_from.map((place) => `\`${place}\``))}.`,
    rules.note,
    rules.mode === undefined
      ? undefined
      : `Its sessions here run in ${rules.mode} mode, so anything not on this list asks.`,
  ]
    .filter((part): part is string => part !== undefined)
    .join(" ");
  const mode = rules.mode === undefined ? {} : { mode: rules.mode };
  if (rules.everything === true) {
    return {
      ...mode,
      said: true,
      everything: true,
      count: 0,
      rows: [],
      foot,
      conflicts: [],
      notice: {
        title: `${name} runs everything without asking, \`rm\` and \`git push\` included.`,
        body: "Chips never sees what it runs, so no rule here and no Never applies to it.",
      },
    };
  }
  const conflicts = conflictsOf(rules);
  const line = askLineFor(rules, askStarts(conflicts));
  return {
    ...mode,
    said: true,
    everything: false,
    count: rules.runs.length,
    rows: rowsOf(rules, new Set(conflicts)),
    foot,
    conflicts,
    notice:
      conflicts.length === 0
        ? undefined
        : {
            title: `${name} runs ${namedInCode(conflicts)} without a card.`,
            body: "Chips never lets a rule allow these, but its own settings let them through before Chips sees them.",
            ...(line === undefined ? {} : { line, where: rules.ask_line?.where }),
          },
  };
}

export const MAKE_ASK_WORDS = "Make these ask";
export const COPY_WORDS = "Copy";
export const COPIED_WORDS = "Copied";

/** The sentence over the line to paste. */
export function pasteWords(where: string | undefined): string {
  return where === undefined ? "Add this to its own settings." : `Add this to ${where}.`;
}

// ------------------------------------------------------------------ the page

export const OWN_HEADING = "Runs without asking";
export const OWN_RIGHT = "from its settings";
export const CHIPS_ANSWERS_HEADING = "Chips answers";
export const ADD_RULE_WORDS = "Add a rule";
export const OWN_GATE_WORDS = "Its settings";
export const CHIPS_GATE_WORDS = "Chips";

/** A harness's Permissions page, from where the reader stands. */
export interface HarnessPermissions {
  readonly harnessId: string;
  readonly name: string;
  /** An owner or an admin, on a server that keeps these: the switches turn. */
  readonly mayChange: boolean;
  /** Its asks off, its own or every harness's, while that holds. */
  readonly off: { readonly hold: Hold; readonly every: boolean } | undefined;
  readonly headline: string;
  readonly sub: string;
  /** What the two gates on the path say under their names. */
  readonly gates: { readonly own: string; readonly chips: string };
  readonly own: OwnRulesView;
  readonly rules: readonly AlwaysRule[];
  readonly rulesCount: string | undefined;
  readonly rulesFoot: string;
  readonly history: AskHistory | undefined;
  /** Whether Chips's rules answer its asks (ADR 0300), as set or as never set reads. */
  readonly chipsOn: boolean;
  /** An owner or an admin, on a server that keeps the switch (ADR 0300). */
  readonly maySwitch: boolean;
  /** The main page's top line: who decides what to ask, and what Chips does with it. */
  readonly lead: string;
  /** While it runs everything without asking: the one yellow banner's words (ADR 0300). */
  readonly open: { readonly title: string; readonly sub: string } | undefined;
  /** The row that opens its own settings. */
  readonly settingsRow: {
    readonly title: string;
    readonly value: string;
    readonly sub: string;
    /** Its settings let a never-list command through: said in amber. */
    readonly warn: boolean;
  };
  /** The row that opens Chips's rules. */
  readonly chipsRow: { readonly value: string; readonly sub: string };
  /** The Chips's rules page. */
  readonly chipsPage: ChipsRulesPage;
}

/** A harness's Chips's rules, on a page of their own (ADR 0300). */
export interface ChipsRulesPage {
  readonly switchSub: string;
  /** Under the switch while it's off. */
  readonly offFoot: string;
  /** Stop asking: running until a time, or not. */
  readonly pause: {
    readonly holding: boolean;
    readonly title: string;
    readonly sub: string;
  };
  readonly rulesFoot: string;
  /** While nothing it does reaches Chips, the rules have nothing to answer. */
  readonly note: string | undefined;
}

/** What the page reads of the store's snapshot. */
export interface HarnessPermissionsInput {
  readonly model: WorkspaceModel;
  readonly directory: Directory;
  readonly keepsHarnessRules?: boolean | undefined;
  /** The server keeps the Chips's rules switch (ADR 0300): the switch turns. */
  readonly keepsChipsRules?: boolean | undefined;
}

/** Of a harness's command asks, those Chips couldn't read, so no rule could answer. */
function unreadable(asks: readonly Approval[]): number {
  return asks.filter(
    (ask) => standingOffer({ kind: ask.actionKind, input: ask.input })?.kind === "unreadable",
  ).length;
}

/** The top of the page: what runs where, as the gates and the switch leave it. */
function headlineOf(name: string, own: OwnRulesView, off: boolean): string {
  const kinds = `${own.count} ${plural(own.count, "kind", "kinds")} of work`;
  if (own.everything)
    return `${name} runs everything without asking, so nothing it does reaches Chips.`;
  if (off) {
    return own.said
      ? `${name} runs ${kinds} on its own, and Chips says yes to the rest for now.`
      : `Chips says yes to everything ${name} asks, for now.`;
  }
  return own.said
    ? `${name} runs ${kinds} without asking. Everything else comes to Chips first.`
    : `${name} doesn't say yet what it runs on its own. Everything it asks comes to Chips first.`;
}

/**
 * Under the top line: where its asks go, or, while it isn't asking, where the big ones still go,
 * and that nothing waits once the big ones are covered too.
 */
function subOf(name: string, to: AsksGoTo, off: { readonly hold: Hold } | undefined): string {
  if (off === undefined) return askingOpening(name, to).sub;
  if (off.hold.matters) return "Nothing it asks waits for an answer while this holds.";
  return to.kind === "you"
    ? "The big ones still come to you on any device, unless it names someone else in the space."
    : to.kind === "owner"
      ? `The big ones still go to ${to.name} on any device, unless it names someone else in the space.`
      : "The big ones still go to whoever it names in the space.";
}

/** A harness's Permissions page. `own` is what its last copy says, once read. */
export function harnessPermissions(
  input: HarnessPermissionsInput,
  harnessId: string,
  selfId: string | undefined,
  own: OwnRulesView = NOT_SAID,
  now: number = Date.now(),
): HarnessPermissions {
  const { model, directory } = input;
  const name = nameOf(directory, harnessId);
  const chipsOn = chipsRulesOnFor(model, harnessId);
  // A hold is Chips's: while its rules are off, nothing of it is read (ADR 0300).
  const off = chipsOn ? holdOf(model, harnessId, now) : undefined;
  const rules = alwaysRules(model, directory, harnessId, selfId, now);
  const on = rules.filter((rule) => rule.on).length;
  const asks = harnessAsks(model, directory, harnessId);
  const unread = unreadable(asks);
  return {
    ...pagesOf(name, own, rules, chipsOn, off, now),
    harnessId,
    name,
    mayChange: input.keepsHarnessRules !== false && mayTurnDial(model, selfId),
    maySwitch:
      input.keepsHarnessRules !== false &&
      input.keepsChipsRules !== false &&
      mayTurnDial(model, selfId),
    off,
    headline: headlineOf(name, own, off !== undefined),
    sub: subOf(name, asksGoTo(directory, harnessId, selfId), off),
    gates: {
      own: own.everything ? "runs all" : (own.mode ?? (own.said ? `${own.count} run` : "not said")),
      chips:
        off !== undefined
          ? "saying yes"
          : on === 0
            ? "no rules"
            : `${on} ${plural(on, "rule", "rules")}`,
    },
    own,
    rules,
    rulesCount: alwaysCount(rules),
    rulesFoot:
      unread === 0
        ? "A rule answers the next ask it covers."
        : `A rule answers the next ask it covers. Commands Chips can't read still come to you: ${unread} of the ${asks.length} so far.`,
    history: askHistory(model, directory, harnessId, selfId, now),
  };
}

export const WHERE_SET_HEADING = "Where it's set";
export const CHIPS_RULES_TITLE = "Chips's rules";
export const STOP_ASKING_HEADING = "Stop asking";
export const STOP_ASKING_TITLE = "Stop asking for a while";
const NEVER_PAUSED = "never to `rm`, `git push` and the like";

/** Whether Chips's rules answer a harness's asks (ADR 0300): as set, else as never set reads. */
export function chipsRulesOnFor(model: WorkspaceModel, harnessId: string): boolean {
  const policy = model.harnesses?.[harnessId];
  const rooms = Object.values(policy?.bySpace ?? {});
  return chipsRulesOn(policy?.chipsRules, {
    harnessRules: (policy?.rules.length ?? 0) > 0 || rooms.some((room) => room.rules.length > 0),
    harnessLevel: (policy?.autonomy ?? 0) >= 2 || rooms.some((room) => room.autonomy >= 2),
    harnessHold: policy?.hold !== undefined,
    workspaceRules: (model.workspaceRules?.rules.length ?? 0) > 0,
    workspaceHold: model.workspaceRules?.hold !== undefined,
  });
}

type Off = { readonly hold: Hold; readonly every: boolean } | undefined;

/** How long Chips says yes for, in words: `until 10:41 AM`. */
function pausedWords(off: Off, now: number): string {
  const until = off?.hold.until;
  return until === undefined ? "until you turn it back on" : `until ${whenWords(until, now)}`;
}

/** The row that opens the harness's own settings: its mode, and what gets through. */
function settingsRowOf(name: string, own: OwnRulesView) {
  const warn = own.conflicts.length > 0;
  const runs = own.everything
    ? "Runs everything without asking"
    : `${own.count} ${plural(own.count, "kind", "kinds")} of work run without asking`;
  const said = own.said ? runs : "Doesn't say yet what it runs on its own";
  return {
    title: `${name}'s settings`,
    value: own.everything ? "Runs all" : (own.mode ?? (own.said ? "Its own" : "Not said")),
    // A row's line is plain text in both apps, so the commands go without code marks.
    sub: warn ? `Lets ${listWords(own.conflicts)} through` : said,
    warn,
  };
}

/** The row that opens Chips's rules: on or off, and a pause while one runs. */
function chipsRowOf(chipsOn: boolean, off: Off, on: number, now: number) {
  const onWords = on === 0 ? "On · no rules yet" : `On · ${on} ${plural(on, "rule", "rules")}`;
  const sub = off === undefined ? onWords : `Saying yes for you ${pausedWords(off, now)}`;
  return chipsOn ? { value: "On", sub } : { value: "Off", sub: "Off · every ask reaches a person" };
}

/** Stop asking, as its row says it: running until a time, or not. */
function pauseOf(off: Off, now: number) {
  if (off === undefined) {
    return {
      holding: false,
      title: STOP_ASKING_TITLE,
      sub: `Chips says yes for you, ${NEVER_PAUSED}`,
    };
  }
  const words = pausedWords(off, now);
  return {
    holding: true,
    title: off.every ? "Saying yes for every harness" : "Saying yes for you",
    sub: `${words.charAt(0).toUpperCase()}${words.slice(1)} · ${NEVER_PAUSED}`,
  };
}

/** The Chips's rules page (ADR 0300). */
function chipsPageOf(name: string, own: OwnRulesView, chipsOn: boolean, off: Off, now: number) {
  return {
    switchSub: chipsOn
      ? "On. Chips answers the asks your rules cover."
      : `Off. Every ask ${name} sends reaches a person.`,
    offFoot: `Turn them on to let Chips answer some of ${name}'s asks for you: rules you write, a don't-ask-again Chips keeps for all its agents, and Stop asking for a while. Your rules are kept while they're off.`,
    pause: pauseOf(off, now),
    rulesFoot: `Chips's rules answer only what ${name} asks. They can't make it ask about something its settings let through.`,
    note: own.everything
      ? `${name} runs everything without asking, so these rules have nothing to answer.`
      : undefined,
  };
}

/** The main page's rows and the Chips's rules page, in words (ADR 0300). */
function pagesOf(
  name: string,
  own: OwnRulesView,
  rules: readonly AlwaysRule[],
  chipsOn: boolean,
  off: Off,
  now: number,
) {
  const on = rules.filter((rule) => rule.on).length;
  return {
    chipsOn,
    lead: chipsOn
      ? `${name} decides what to ask. Chips answers the ones your rules cover and brings you the rest.`
      : `${name} decides what to ask. Chips brings every ask to you.`,
    open: own.everything
      ? {
          title: "Nothing asks",
          sub: `${own.mode ?? name} runs everything without asking, so nothing reaches Chips.`,
        }
      : undefined,
    settingsRow: settingsRowOf(name, own),
    chipsRow: chipsRowOf(chipsOn, off, on, now),
    chipsPage: chipsPageOf(name, own, chipsOn, off, now),
  };
}

/** The row on the harness page that opens it: the gold words while its asks are off. */
export function permissionsRowWords(
  model: WorkspaceModel,
  directory: Directory,
  harnessId: string,
  selfId: string | undefined,
  now: number = Date.now(),
): { readonly value: string; readonly off: boolean } {
  if (!chipsRulesOnFor(model, harnessId)) return { value: "Asks you", off: false };
  const off = holdOf(model, harnessId, now);
  if (off !== undefined) {
    return {
      value:
        off.hold.until === undefined
          ? "Chips says yes"
          : `Chips says yes until ${whenWords(off.hold.until, now)}`,
      off: false,
    };
  }
  const count = alwaysCount(alwaysRules(model, directory, harnessId, selfId, now));
  return { value: count ?? "Chips's rules on", off: false };
}

// ------------------------------------------------------------------ You → Permissions

export const HARNESSES_HEADING = "Harnesses";
export const YOU_HARNESSES_FOOT =
  "Each harness keeps its own permissions. Chips's rules are off for a new harness: turn them on in its page.";

/**
 * What You's Permissions row says: that nothing is asking while every harness is snoozed, how many
 * harnesses aren't asking, or else how many rules are on.
 */
export function permissionsSummary(
  model: WorkspaceModel,
  directory: Directory,
  _now: number = Date.now(),
): string {
  const on = workspaceHarnesses(directory).filter((harness) =>
    chipsRulesOnFor(model, harness.id),
  ).length;
  return on === 0 ? "Harnesses decide" : `Chips's rules on for ${on}`;
}

/** One harness on You → Permissions. */
export interface PermissionsHarnessRow {
  readonly harnessId: string;
  readonly name: string;
  /** Its own asks are on; every harness's being off leaves this on and the switch still. */
  readonly asking: boolean;
  /** The line under its name, gold while it isn't asking. */
  readonly line: string;
  readonly gold: boolean;
  /** What it runs on its own covers something Chips would never allow. */
  readonly warn: boolean;
  /** Its Chips's rules are on (ADR 0300). */
  readonly chipsOn: boolean;
}

/** You → Permissions: every harness at once. */
export interface YouPermissions {
  readonly mayChange: boolean;
  /** Every harness's asks off, while that holds. */
  readonly every: Hold | undefined;
  readonly rules: readonly AlwaysRule[];
  readonly harnesses: readonly PermissionsHarnessRow[];
}

/** The line under a harness that is asking: what it runs on its own and how many rules it has. */
function harnessLine(own: OwnRulesView | undefined, rules: readonly AlwaysRule[]): string {
  const on = rules.filter((rule) => rule.on).length;
  const count = on === 0 ? undefined : `${on} ${plural(on, "rule", "rules")}`;
  const ownWords =
    own === undefined || !own.said
      ? "Doesn't say yet what it runs on its own"
      : own.everything
        ? "Runs everything on its own"
        : `Runs ${own.count} ${plural(own.count, "kind", "kinds")} of work on its own`;
  return count === undefined ? ownWords : `${ownWords} · ${count}`;
}

/** You → Permissions, with what each harness last said it runs on its own, by id, once read. */
export function youPermissions(
  input: HarnessPermissionsInput,
  selfId: string | undefined,
  owns: Readonly<Record<string, OwnRulesView | undefined>> = {},
  now: number = Date.now(),
): YouPermissions {
  const { model, directory } = input;
  const every = holding(model.workspaceRules?.hold, now);
  return {
    mayChange: input.keepsHarnessRules !== false && mayTurnDial(model, selfId),
    every,
    rules: alwaysRules(model, directory, EVERY_HARNESS, selfId, now),
    harnesses: workspaceHarnesses(directory).map((harness) => {
      const own = owns[harness.id];
      const chipsOn = chipsRulesOnFor(model, harness.id);
      const hold = chipsOn ? holding(heldOn(model, harness.id), now) : undefined;
      const rules = alwaysRules(model, directory, harness.id, selfId, now);
      const line =
        hold !== undefined
          ? hold.until === undefined
            ? "Chips says yes for it"
            : `Chips says yes for it until ${whenWords(hold.until, now)}`
          : harnessLine(own, chipsOn ? rules : []);
      return {
        harnessId: harness.id,
        name: harness.displayName,
        asking: hold === undefined,
        line,
        // Yellow is for a harness that runs everything without asking (ADR 0300).
        gold: own?.everything === true,
        warn: (own?.conflicts.length ?? 0) > 0 || own?.everything === true,
        chipsOn,
      };
    }),
  };
}

// ------------------------------------------------------------------ a new rule

export const NEW_RULE_TITLE = "New rule";
export const WHAT_HEADING = "What it does";
export const STARTS_HEADING = "Commands that start with";
export const ANSWER_HEADING = "Answer";
export const WHERE_HEADING = "Where";
export const EVERY_SPACE_WORDS = "Every space";
export const SAVE_RULE_WORDS = "Save rule";
export const SAVED_WORDS = "Saved";
export const RUN_COMMANDS_WORDS = "Run commands";
export const OWN_KIND_SUB = "Runs on its own, from its settings";
/** What it does when it is commands, beside an action kind. */
export const COMMANDS_KIND = "commands";

export type RuleAnswer = "allow" | "ask" | "deny";
export const RULE_ANSWERS: readonly { readonly answer: RuleAnswer; readonly words: string }[] = [
  { answer: "allow", words: "Allow" },
  { answer: "ask", words: "Ask me" },
  { answer: "deny", words: "Never" },
];

/** A rule as the page has it so far. */
export interface RuleDraft {
  /** `COMMANDS_KIND`, or an action kind as the harness names it. */
  readonly what: string;
  /** For commands: the starts picked, each as its words with spaces, `git log`. */
  readonly starts: readonly string[];
  readonly answer: RuleAnswer;
  /** One space, for one harness; absent for every space. */
  readonly spaceId?: string | undefined;
}

/** One thing the rule may be about. */
export interface RuleKind {
  /** `COMMANDS_KIND` or the kind. */
  readonly id: string;
  readonly title: string;
  readonly sub: string | undefined;
  /** It runs on its own, from its settings: shown, not picked. */
  readonly own: boolean;
}

/** What the page offers. */
export interface NewRuleOptions {
  readonly kinds: readonly RuleKind[];
  /** The starts its asks began with, most asked first. */
  readonly starts: readonly string[];
  /** Listed commands, which a rule may refuse or ask about and never allow. */
  readonly never: readonly string[];
  /** The spaces it can be held to, for one harness; none for every harness. */
  readonly spaces: readonly { readonly id: string; readonly name: string }[];
}

/** The asks a new rule is read against: one harness's, or every harness's. */
function asksFor(
  model: WorkspaceModel,
  directory: Directory,
  harnessId: string,
): readonly Approval[] {
  if (harnessId !== EVERY_HARNESS) return harnessAsks(model, directory, harnessId);
  return model.spaces
    .flatMap((space) => space.runs)
    .flatMap((run) => run.approvals)
    .sort((a, b) => a.askedAt.localeCompare(b.askedAt));
}

/** A command ask's parts, read as a rule reads them; nothing for one with no command or unread. */
function partsOf(ask: Approval) {
  const command = askedCommand({ kind: ask.actionKind, input: ask.input });
  return command === undefined ? undefined : commandParts(command);
}

/** The most starts offered. */
const MOST_STARTS = 18;
/** Listed commands offered whether or not it asked to run them. */
const NEVER_ALWAYS = ["rm", "git push", "curl", "sudo"];

/** How its asks started, the listed commands they used, and the other kinds they were. */
function readAsks(asks: readonly Approval[]) {
  const counts = new Map<string, number>();
  const nevers = new Map<string, number>();
  const kinds = new Map<string, string>();
  for (const ask of asks) {
    const parts = partsOf(ask);
    if (parts === undefined) {
      if (!commandKind(ask.actionKind)) {
        kinds.set(ask.actionKind, actionWords(ask.actionKind) ?? ask.actionKind);
      }
      continue;
    }
    for (const part of parts) countPart(part, counts, nevers);
  }
  return { counts, nevers, kinds };
}

/** A start a shorter one covers (`ls -la` by `ls`), counted with it, since the shorter lets it through. */
function mergeCovered(counts: Map<string, number>): void {
  for (const [start, count] of [...counts]) {
    const words = start.split(" ");
    const shorter = [...counts.keys()].find(
      (other) => other !== start && startsWith(words, other.split(" ")),
    );
    if (shorter === undefined) continue;
    counts.set(shorter, (counts.get(shorter) ?? 0) + count);
    counts.delete(start);
  }
}

/** One part, counted by how it starts, or by the listed command it uses. */
function countPart(
  part: readonly string[],
  counts: Map<string, number>,
  nevers: Map<string, number>,
): void {
  const never = neverStanding([part]);
  const into = never === undefined ? counts : nevers;
  const words = never ?? startOf(part).join(" ");
  into.set(words, (into.get(words) ?? 0) + 1);
}

/** What a new rule for this harness, or for every harness, may be about. */
export function newRuleOptions(
  model: WorkspaceModel,
  directory: Directory,
  harnessId: string,
  own: OwnRulesView = NOT_SAID,
): NewRuleOptions {
  const { counts, nevers, kinds } = readAsks(asksFor(model, directory, harnessId));
  mergeCovered(counts);
  const byCount = (map: Map<string, number>) =>
    [...map].sort((a, b) => b[1] - a[1]).map(([words]) => words);
  const asked = [...kinds].map(([kind, title]) => ({ id: kind, title, sub: kind, own: false }));
  const ownRows = own.rows
    .filter((row) => row.kind === "read" || row.kind === "write" || row.kind === "web")
    .filter((row) => !asked.some((kind) => kind.title === row.title))
    .map((row) => ({ id: `own:${row.kind}`, title: row.title, sub: OWN_KIND_SUB, own: true }));
  const spaces =
    harnessId === EVERY_HARNESS
      ? []
      : model.spaces
          .filter(
            (space) =>
              space.state === "open" &&
              space.runs.some((run) => harnessOf(directory, run.harnessId) === harnessId),
          )
          .map((space) => ({ id: space.id, name: roomName(model, space.id, directory) }));
  const never = [...new Set([...byCount(nevers), ...NEVER_ALWAYS])].slice(0, 8);
  return {
    kinds: [
      { id: COMMANDS_KIND, title: RUN_COMMANDS_WORDS, sub: undefined, own: false },
      ...asked,
      ...ownRows,
    ],
    starts: byCount(counts).slice(0, MOST_STARTS),
    never,
    spaces,
  };
}

/** Whether a start is on the never list, so a rule never allows it. */
export function neverStart(start: string): boolean {
  return neverStanding([start.split(" ")]) !== undefined;
}

/** The line under the starts, for the answer picked. */
export function startsNote(answer: RuleAnswer): string {
  return answer === "allow"
    ? "Picked from how its asks started. Every part of a command has to start with one of these. The locked ones never get a standing yes."
    : "Picked from how its asks started. A command with any part that starts with one of these is caught.";
}

/** Why the rule can't be saved yet, in a sentence; nothing once it can. */
export function draftProblem(draft: RuleDraft): string | undefined {
  if (draft.what !== COMMANDS_KIND) return draft.what === "" ? "Pick what it does." : undefined;
  const starts =
    draft.answer === "allow" ? draft.starts.filter((start) => !neverStart(start)) : draft.starts;
  return starts.length === 0 ? "Pick how the commands start." : undefined;
}

/**
 * The rules a draft saves: one for each start of a command (`*`, since a start speaks only for a
 * command, ADR 0239), or one for the kind. Chips stamps who made them and when, so they show as
 * one row and an Allow never covers what matters.
 */
export function draftRules(draft: RuleDraft): Rule[] {
  if (draft.what !== COMMANDS_KIND) return [{ match: draft.what, decision: draft.answer }];
  return draft.starts
    .filter((start) => draft.answer !== "allow" || !neverStart(start))
    .map((start) => ({
      match: "*",
      when: { starts_with: start.split(" ") },
      decision: draft.answer,
    }));
}

/** One ask, as the preview lights it. */
export type PreviewDot = "lit" | "still" | "never" | "unread";

/** What the rule would have done to the asks so far. */
export interface RulePreview {
  readonly count: number;
  readonly total: number;
  readonly words: string;
  readonly dots: readonly PreviewDot[];
}

/** The most dots the preview draws; the count counts every ask. */
const MOST_PREVIEW_DOTS = 240;

/** What a draft about a kind says of one ask. */
function kindDot(ask: Approval, draft: RuleDraft): PreviewDot {
  if (ask.actionKind !== draft.what) return "still";
  return draft.answer === "allow" && askMatters(ask) ? "still" : "lit";
}

/** What a draft about commands says of one ask. */
function commandDot(ask: Approval, draft: RuleDraft): PreviewDot {
  const parts = partsOf(ask);
  if (parts === undefined) {
    return askedCommand({ kind: ask.actionKind, input: ask.input }) === undefined
      ? "still"
      : "unread";
  }
  const picked = draft.starts.map((start) => start.split(" "));
  const covered = (part: readonly string[]) => picked.some((start) => startsWith(part, start));
  const never = neverStanding(parts) !== undefined;
  if (draft.answer !== "allow") return parts.some(covered) ? "lit" : never ? "never" : "still";
  if (never) return "never";
  return !askMatters(ask) && parts.every(covered) ? "lit" : "still";
}

/** What a draft says of one ask. */
function previewDot(ask: Approval, draft: RuleDraft): PreviewDot {
  return draft.what === COMMANDS_KIND ? commandDot(ask, draft) : kindDot(ask, draft);
}

/** The preview: how many of its asks the rule would have answered, refused or brought to you. */
export function rulePreview(
  model: WorkspaceModel,
  directory: Directory,
  harnessId: string,
  draft: RuleDraft,
): RulePreview {
  const every = harnessId === EVERY_HARNESS;
  const asks = asksFor(model, directory, harnessId).filter(
    (ask) =>
      draft.spaceId === undefined ||
      model.spaces.some(
        (space) => space.id === draft.spaceId && space.runs.some((run) => run.runId === ask.runId),
      ),
  );
  const dots = asks.map((ask) => previewDot(ask, draft));
  const count = dots.filter((dot) => dot === "lit").length;
  const of = every ? `of the ${asks.length} asks from every harness` : `of its ${asks.length} asks`;
  const words =
    draft.answer === "allow"
      ? `${of} this rule would have answered for you`
      : draft.answer === "ask"
        ? `${of} would still have come to you, even while it works without asking`
        : `${of} this rule would have refused`;
  return { count, total: asks.length, words, dots: dots.slice(-MOST_PREVIEW_DOTS) };
}

export const PREVIEW_KEY: readonly { readonly dot: PreviewDot; readonly words: string }[] = [
  { dot: "lit", words: "This rule" },
  { dot: "still", words: "Still asks" },
  { dot: "never", words: "Never list" },
  { dot: "unread", words: "Chips can't read" },
];

/** The scope's rules with the draft's added, as they are sent. */
export function withDraft(current: readonly Rule[], draft: RuleDraft): Rule[] {
  return [...current, ...draftRules(draft)];
}
