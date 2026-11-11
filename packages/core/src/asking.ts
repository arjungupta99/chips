/**
 * When it asks you (ADR 0195): the words and the readers behind the harness page's section, You's
 * Allowed always row and its sheet, and the ask card's two new lines, so the phone, the web and
 * the Mac say the same thing.
 *
 * The harness decides when to ask, by its own settings; Chips decides who answers, and keeps three
 * promises nobody sets: an ask that matters waits for a person (a harness can't settle it, and it
 * takes no This session or Always), a yes in the harness's own window settles a small ask, and an
 * ask nobody answers is denied when its time runs out. The one thing a person controls is what
 * they allowed always: each rule a person's Always made, switched off to be asked again or removed
 * for good, by sending the harness's rules without it (`setRules`).
 */

import { standingOffer } from "@chipschat/protocol";
import { commandPlate, writesWords } from "./commandPlate.js";
import { type Directory, harnessOf, nameOf, workspaceHarnesses } from "./events.js";
import { lettingWork } from "./model/readers.js";
import type { Approval, LetWork, Rule, WorkspaceModel } from "./model/types.js";
import { namesWords } from "./people.js";
import { roomName } from "./rooms.js";

/** The section's opening: who decides when, who decides the answer, and where the asks go. */
export interface AskingOpening {
  readonly headline: string;
  readonly sub: string;
}

/**
 * Who the asks go to, from where the reader stands: `you` when the reader owns the harness, its
 * owner's name otherwise, or nobody known.
 */
export type AsksGoTo =
  | { readonly kind: "you" }
  | { readonly kind: "owner"; readonly name: string }
  | { readonly kind: "unknown" };

/** Where a harness's asks go, for this reader: its owner, by default (ADR 0042). */
export function asksGoTo(directory: Directory, harnessId: string, selfId?: string): AsksGoTo {
  const owner = directory[harnessId]?.ownerId;
  if (owner === undefined) return { kind: "unknown" };
  if (owner === selfId) return { kind: "you" };
  return { kind: "owner", name: nameOf(directory, owner) };
}

/** "Jacobian decides when to ask. You decide the answer." and where its asks go. */
export function askingOpening(name: string, to: AsksGoTo): AskingOpening {
  const who =
    to.kind === "you"
      ? "You decide"
      : to.kind === "owner"
        ? `${to.name} decides`
        : "A person decides";
  const goes =
    to.kind === "you"
      ? "Its asks come to you on any device, unless it names someone else in the space."
      : to.kind === "owner"
        ? `Its asks go to ${to.name} on any device, unless it names someone else in the space.`
        : "Its asks go to whoever it names in the space.";
  return { headline: `${name} decides when to ask. ${who} the answer.`, sub: goes };
}

/** One of the three things that are always true, with nothing to set. */
export interface AskingPromise {
  readonly id: "big" | "window" | "silence";
  readonly title: string;
  readonly line: string;
}

/** The three promises, in the order the page draws them. */
export function askingPromises(name: string, to: AsksGoTo): readonly AskingPromise[] {
  return [
    {
      id: "big",
      title: to.kind === "you" ? "The big ones wait for you" : "The big ones wait for a person",
      line: `Money, outside messages, deletions and anything that can't be undone. ${name} can't answer these itself, and each one takes a fresh yes.`,
    },
    {
      id: "window",
      title: "Its own window counts for the small ones",
      line: `Say yes in ${name}'s window and the card here closes too.`,
    },
    {
      id: "silence",
      title: "No answer is a no",
      line: "An ask nobody answers is denied when its time runs out.",
    },
  ];
}

/** One entry under Allowed always: a rule in the harness's policy, everywhere or in one room. */
export interface AlwaysRule {
  /** Stable while the list stands: the harness, the room or `*`, and the rule's place. */
  readonly key: string;
  readonly harnessId: string;
  /** The room whose policy holds it; absent for the harness's rules everywhere. */
  readonly spaceId?: string | undefined;
  /** Its place in that policy's list, which is what `setRules` sends back changed. */
  readonly index: number;
  /** The action kind it is for, as the harness names it. */
  readonly kind: string;
  /** What it allows in plain words (`actionWords`); absent, the kind is the row's name. */
  readonly words?: string | undefined;
  /**
   * For a command's rule, the start it lets through, `node --check …` (ADR 0239): the row's name,
   * in code. Absent for a rule that answers its kind whole.
   */
  readonly start?: string | undefined;
  readonly on: boolean;
  /** Who made it, where and when; or that it is off and the harness asks again. */
  readonly line: string;
  /** When a person's answer made it, for the order; absent for a rule nobody's answer made. */
  readonly madeAt?: string | undefined;
}

/**
 * What a kind allows, in plain words, for the kinds whose own words say it: `shell.exec` and
 * `acp.bash` run commands, `file.delete` deletes files, `email.send` sends email. Read from the
 * kind's words and never from which harness sent it, since Chips names no harness (ADR 0051). The
 * first that fits says it, so a kind that runs a command is never called an edit.
 */
const KIND_WORDS: readonly (readonly [(words: ReadonlySet<string>) => boolean, string])[] = [
  [
    (w) => ["bash", "shell", "exec", "execute", "command", "terminal"].some((x) => w.has(x)),
    "Run commands",
  ],
  [(w) => ["delete", "remove", "rm", "unlink", "trash"].some((x) => w.has(x)), "Delete files"],
  [(w) => w.has("send") && ["email", "mail", "gmail"].some((x) => w.has(x)), "Send email"],
  [(w) => w.has("draft") && ["email", "mail", "gmail"].some((x) => w.has(x)), "Draft email"],
  [
    (w) => w.has("send") && ["message", "messages", "chat", "sms"].some((x) => w.has(x)),
    "Send messages",
  ],
  [(w) => ["payment", "payments", "pay", "transfer"].some((x) => w.has(x)), "Make payments"],
  [
    (w) => ["fetch", "http", "browse", "browser", "url"].some((x) => w.has(x)),
    "Fetch from the web",
  ],
  [(w) => ["search", "grep", "glob"].some((x) => w.has(x)), "Search files"],
  [(w) => ["move", "rename"].some((x) => w.has(x)), "Move files"],
  [
    (w) => w.has("apply") && ["changeset", "diff", "patch", "changes"].some((x) => w.has(x)),
    "Apply changes",
  ],
  [(w) => ["edit", "patch"].some((x) => w.has(x)), "Edit files"],
  [(w) => w.has("write"), "Write files"],
  [(w) => ["read", "view", "cat"].some((x) => w.has(x)), "Read files"],
];

/**
 * A rule's plain words when it answers its kind whole: for a kind that runs commands, `Any
 * command`, since a person's answer now remembers a command by its starts and only a policy
 * written another way lets every command through (ADR 0239).
 */
function kindWideWords(kind: string): string | undefined {
  const words = actionWords(kind);
  return words === "Run commands" ? "Any command" : words;
}

/** `Run commands` for `shell.exec`; nothing for a kind whose words say nothing Chips knows. */
export function actionWords(kind: string): string | undefined {
  const words = new Set(kind.toLowerCase().split(/[^a-z0-9]+/));
  return KIND_WORDS.find(([fits]) => fits(words))?.[1];
}

/** The counts under Allowed always's heading: `2 on`, `1 of 2 on`; nothing when there are none. */
export function alwaysCount(rules: readonly { readonly on: boolean }[]): string | undefined {
  if (rules.length === 0) return undefined;
  const on = rules.filter((rule) => rule.on).length;
  return on === rules.length ? `${on} on` : `${on} of ${rules.length} on`;
}

/** What the list says under itself, for whoever may change it and for everybody else. */
export function alwaysFoot(
  name: string,
  mayChange: boolean,
  /** How a row is removed where it is read: swiped on the phone, its × on the web and the Mac. */
  removal: "swipe" | "cross" = "swipe",
): string {
  if (!mayChange) return "Only an owner or admin changes these.";
  const remove = removal === "swipe" ? "Swipe one to remove it" : "Its × removes it";
  return `Turn one off and ${name} asks again; it stays here to turn back on. ${remove} for good.`;
}

/** What the list says when it is empty. */
export const ALWAYS_EMPTY = "Nothing yet. Answering a smaller ask with Always adds it here.";

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

/** `12 October`, with the year when it is not this one. Local time, as the reader lives it. */
export function dayMonth(iso: string, now: number = Date.now()): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return "";
  const day = `${at.getDate()} ${MONTHS[at.getMonth()]}`;
  return at.getFullYear() === new Date(now).getFullYear() ? day : `${day} ${at.getFullYear()}`;
}

const text = (value: unknown): string | undefined =>
  typeof value === "string" && value !== "" ? value : undefined;

/** Whether a rule came from a person's Always: it names who, or its reason says so (older ones). */
function fromAlways(rule: Rule): boolean {
  return text(rule["made_by"]) !== undefined || /said always/.test(text(rule["reason"]) ?? "");
}

/** Who made it, in words: `by you`, `by Dana`, `from an Always`, or that it is in the policy. */
function madeByWords(rule: Rule, directory: Directory, selfId: string | undefined): string {
  const by = text(rule["made_by"]);
  if (by !== undefined) return by === selfId ? "by you" : `by ${nameOf(directory, by)}`;
  return fromAlways(rule) ? "from an Always" : "from its policy";
}

/** What a rule decides, said before who made it when it is not a yes. */
function decisionWords(rule: Rule): string {
  if (rule["decision"] === "deny") return "Denied always · ";
  if (rule["decision"] === "ask") return "Asks always · ";
  return "";
}

interface RuleContext {
  readonly model: WorkspaceModel;
  readonly directory: Directory;
  readonly selfId: string | undefined;
  readonly name: string;
  readonly now: number;
}

/**
 * The line under a rule, where it holds first: `In Bakery · by you, 12 October`, `In every space ·
 * from its policy`, or `Off · Jacobian asks again`.
 */
export function alwaysLine(rule: Rule, spaceId: string | undefined, context: RuleContext): string {
  if (rule["off"] === true) return `Off · ${context.name} asks again`;
  const where =
    spaceId === undefined
      ? "In every space"
      : `In ${roomName(context.model, spaceId, context.directory)}`;
  const by = madeByWords(rule, context.directory, context.selfId);
  const madeAt = text(rule["made_at"]);
  const when = madeAt === undefined ? "" : `, ${dayMonth(madeAt, context.now)}`;
  return `${decisionWords(rule)}${where} · ${by}${when}`;
}

function entry(
  harnessId: string,
  spaceId: string | undefined,
  rule: Rule,
  index: number,
  context: RuleContext,
): AlwaysRule {
  const kind = text(rule["match"]) ?? "Anything";
  const starts = (rule["when"] as { starts_with?: unknown } | undefined)?.starts_with;
  const start = Array.isArray(starts) ? startWords(starts.map(String)) : undefined;
  return {
    key: `${harnessId}:${spaceId ?? "*"}:${index}`,
    harnessId,
    ...(spaceId === undefined ? {} : { spaceId }),
    index,
    kind,
    ...(start === undefined ? {} : { start }),
    words: kindWideWords(kind),
    on: rule["off"] !== true,
    line: alwaysLine(rule, spaceId, context),
    madeAt: text(rule["made_at"]),
  };
}

/** Newest first; a rule nobody's answer made, which has no date, after them in its own order. */
function newestFirst(a: AlwaysRule, b: AlwaysRule): number {
  if (a.madeAt === b.madeAt) return 0;
  if (a.madeAt === undefined) return 1;
  if (b.madeAt === undefined) return -1;
  return b.madeAt.localeCompare(a.madeAt);
}

/**
 * The harness's rules, everywhere and in each room, as the list draws them. Every rule a person
 * may have made, not only those an Always made: a harness sends no policy of its own, so each is
 * a person's, and one written another way is said to be in its policy.
 */
export function alwaysRules(
  model: WorkspaceModel,
  directory: Directory,
  harnessId: string,
  selfId: string | undefined,
  now: number = Date.now(),
): readonly AlwaysRule[] {
  const policy = model.harnesses[harnessId];
  if (policy === undefined) return [];
  const context: RuleContext = {
    model,
    directory,
    selfId,
    name: nameOf(directory, harnessId),
    now,
  };
  const everywhere = policy.rules.map((rule, index) =>
    entry(harnessId, undefined, rule, index, context),
  );
  const rooms = Object.entries(policy.bySpace).flatMap(([spaceId, set]) =>
    set.rules.map((rule, index) => entry(harnessId, spaceId, rule, index, context)),
  );
  return [...everywhere, ...rooms].sort(newestFirst);
}

/** The rules a scope holds now, everywhere or in one room, for `setRules` to send back changed. */
export function rulesOf(
  model: WorkspaceModel,
  harnessId: string,
  spaceId: string | undefined,
): readonly Rule[] {
  const policy = model.harnesses[harnessId];
  if (policy === undefined) return [];
  return spaceId === undefined ? policy.rules : (policy.bySpace[spaceId]?.rules ?? []);
}

/**
 * The model with one scope's rules replaced: what a screen draws while a change it sent is on its
 * way, so a switch stays where the thumb put it and a removed row stays gone until the server's
 * `policy.updated` says the same.
 */
export function withRules(
  model: WorkspaceModel,
  harnessId: string,
  spaceId: string | undefined,
  rules: readonly Rule[],
): WorkspaceModel {
  const policy = model.harnesses[harnessId];
  if (policy === undefined) return model;
  const changed =
    spaceId === undefined
      ? { ...policy, rules }
      : {
          ...policy,
          bySpace: {
            ...policy.bySpace,
            [spaceId]: { autonomy: policy.bySpace[spaceId]?.autonomy ?? policy.autonomy, rules },
          },
        };
  return { ...model, harnesses: { ...model.harnesses, [harnessId]: changed } };
}

/** A scope's rules sent to the server and not yet echoed back, as a screen holds it meanwhile. */
export interface RulesChange {
  readonly harnessId: string;
  readonly spaceId?: string | undefined;
  readonly rules: readonly Rule[];
  /** When it was sent. */
  readonly at: number;
}

/** How long a change on its way is drawn before the model is trusted again: the server refused it. */
export const RULES_CHANGE_MS = 6000;

/** Which scope a change is to: one change on its way per scope, the latest. */
export function changeScope(harnessId: string, spaceId: string | undefined): string {
  return `${harnessId}:${spaceId ?? "*"}`;
}

const sameRules = (a: readonly Rule[], b: readonly Rule[]) =>
  JSON.stringify(a) === JSON.stringify(b);

/**
 * The changes the model has not caught up with and that are not too old to trust; the same map
 * when none has gone, so a screen that keeps it draws nothing again.
 */
export function changesStill(
  changes: ReadonlyMap<string, RulesChange>,
  model: WorkspaceModel,
  now: number,
): ReadonlyMap<string, RulesChange> {
  const kept = new Map<string, RulesChange>();
  for (const [scope, change] of changes) {
    if (now - change.at > RULES_CHANGE_MS) continue;
    if (sameRules(rulesOf(model, change.harnessId, change.spaceId), change.rules)) continue;
    kept.set(scope, change);
  }
  return kept.size === changes.size ? changes : kept;
}

/** The model with every change on its way drawn in. */
export function withChanges(
  model: WorkspaceModel,
  changes: ReadonlyMap<string, RulesChange>,
): WorkspaceModel {
  let drawn = model;
  for (const change of changes.values()) {
    drawn = withRules(drawn, change.harnessId, change.spaceId, change.rules);
  }
  return drawn;
}

/** The list with one rule switched on or off; turned on, the rule carries no `off` at all. */
export function switchedRule(rules: readonly Rule[], index: number, on: boolean): Rule[] {
  return rules.map((rule, at) => {
    if (at !== index) return rule;
    const { off: _off, ...rest } = rule;
    return on ? rest : { ...rest, off: true };
  });
}

/** The list without one rule: removing it is sending the rest (ADR 0195). */
export function withoutRule(rules: readonly Rule[], index: number): Rule[] {
  return rules.filter((_, at) => at !== index);
}

/** The list with a removed rule put back where it was, for Undo. */
export function withRuleBack(rules: readonly Rule[], index: number, rule: Rule): Rule[] {
  const at = Math.max(0, Math.min(index, rules.length));
  return [...rules.slice(0, at), rule, ...rules.slice(at)];
}

/** What the Undo capsule says after a removal. */
export const REMOVED_WORDS = "Removed";

/** One ask, as a dot: a yes, a yes for the session, a no, still open, or lapsed. */
export type AskDot = "yes" | "session" | "no" | "open" | "lapsed";

/** The dots under the section, and the line under them; nothing for a harness never asked. */
export interface AskHistory {
  readonly dots: readonly AskDot[];
  readonly line: string;
}

/** The most dots drawn; the line counts every ask. */
const MOST_DOTS = 30;

function dotOf(approval: Approval): AskDot {
  const resolved = approval.resolved;
  if (resolved === undefined) return "open";
  if (resolved.decision === "expired") return "lapsed";
  if (resolved.decision === "denied") return "no";
  return resolved.scope === "session" || resolved.scope === "always" ? "session" : "yes";
}

/** The asks of a harness the reader can see, oldest first: every run of it, in every room. */
export function harnessAsks(
  model: WorkspaceModel,
  directory: Directory,
  harnessId: string,
): readonly Approval[] {
  return model.spaces
    .flatMap((space) => space.runs)
    .filter((run) => harnessOf(directory, run.harnessId) === harnessId)
    .flatMap((run) => run.approvals)
    .sort((a, b) => a.askedAt.localeCompare(b.askedAt));
}

interface AnswerTally {
  readonly people: Map<string, number>;
  readonly ownWindow: number;
  /** Answered on the spot by Chips, by a rule or the level: not lapsed, nobody's answer. */
  readonly byPolicy: number;
  readonly lapsed: number;
  readonly open: number;
}

function tally(asks: readonly Approval[], directory: Directory): AnswerTally {
  const people = new Map<string, number>();
  let ownWindow = 0;
  let byPolicy = 0;
  let lapsed = 0;
  let open = 0;
  for (const ask of asks) {
    const by = ask.resolved?.by;
    if (by === undefined) open += 1;
    else if (ask.resolved?.decision === "expired") lapsed += 1;
    // Chips on the spot, by a rule or the level (the walk of 18 October 2026 found these said
    // "lapsed").
    else if (by === "system") byPolicy += 1;
    else if (directory[by]?.kind === "person") people.set(by, (people.get(by) ?? 0) + 1);
    else ownWindow += 1;
  }
  return { people, ownWindow, byPolicy, lapsed, open };
}

function peopleWords(
  people: Map<string, number>,
  total: number,
  directory: Directory,
  selfId: string | undefined,
): string | undefined {
  if (people.size === 0) return undefined;
  const named = [...people.keys()].map((id) => (id === selfId ? "you" : nameOf(directory, id)));
  const answered = [...people.values()].reduce((sum, each) => sum + each, 0);
  const who =
    named.length <= 2
      ? named.join(" and ")
      : `${named.slice(0, 2).join(", ")} and ${named.length - 2} more`;
  return answered === total ? `all answered by ${who}` : `${answered} answered by ${who}`;
}

/** `15 asks since 6 September · all answered by you`, and the dots for the most recent. */
export function askHistory(
  model: WorkspaceModel,
  directory: Directory,
  harnessId: string,
  selfId: string | undefined,
  now: number = Date.now(),
): AskHistory | undefined {
  return historyOf(harnessAsks(model, directory, harnessId), directory, selfId, now);
}

/** One agent's asks so far, for its Permissions page (ADR 0286). */
export function agentAskHistory(
  model: WorkspaceModel,
  directory: Directory,
  agentId: string,
  selfId: string | undefined,
  now: number = Date.now(),
): AskHistory | undefined {
  const asks = model.spaces
    .flatMap((space) => space.runs)
    .filter((run) => run.harnessId === agentId)
    .flatMap((run) => run.approvals)
    .sort((a, b) => a.askedAt.localeCompare(b.askedAt));
  return historyOf(asks, directory, selfId, now);
}

/** Every ask the reader can see, from every harness, as You's Allowed always draws them. */
export function workspaceAskHistory(
  model: WorkspaceModel,
  directory: Directory,
  selfId: string | undefined,
  now: number = Date.now(),
): AskHistory | undefined {
  const asks = model.spaces
    .flatMap((space) => space.runs)
    .flatMap((run) => run.approvals)
    .sort((a, b) => a.askedAt.localeCompare(b.askedAt));
  return historyOf(asks, directory, selfId, now);
}

function historyOf(
  asks: readonly Approval[],
  directory: Directory,
  selfId: string | undefined,
  now: number,
): AskHistory | undefined {
  const first = asks[0];
  if (first === undefined) return undefined;
  const count = tally(asks, directory);
  const parts = [
    `${asks.length} ${asks.length === 1 ? "ask" : "asks"} since ${dayMonth(first.askedAt, now)}`,
    peopleWords(count.people, asks.length, directory, selfId),
    count.ownWindow === 0 ? undefined : `${count.ownWindow} in its own window`,
    count.byPolicy === 0 ? undefined : `${count.byPolicy} by policy`,
    count.lapsed === 0 ? undefined : `${count.lapsed} lapsed`,
    count.open === 0 ? undefined : `${count.open} waiting`,
  ].filter((part): part is string => part !== undefined);
  return { dots: asks.slice(-MOST_DOTS).map(dotOf), line: parts.join(" · ") };
}

/** One harness on You's Allowed always sheet, with its rules. */
export interface AlwaysByHarness {
  readonly harnessId: string;
  readonly name: string;
  readonly rules: readonly AlwaysRule[];
}

/** Every harness in the workspace, by name, each with what it is allowed always. */
export function alwaysByHarness(
  model: WorkspaceModel,
  directory: Directory,
  selfId: string | undefined,
  now: number = Date.now(),
): readonly AlwaysByHarness[] {
  return workspaceHarnesses(directory).map((harness) => ({
    harnessId: harness.id,
    name: harness.displayName,
    rules: alwaysRules(model, directory, harness.id, selfId, now),
  }));
}

/**
 * You's row: `2 on`, `1 of 3 on`, or `Asks every time` when no harness is allowed anything always
 * (Arjun's A of 26 October 2026: "None" read as a value missing).
 */
export function alwaysSummary(model: WorkspaceModel, directory: Directory): string {
  const rules = alwaysByHarness(model, directory, undefined).flatMap((each) => each.rules);
  return alwaysCount(rules) ?? "Asks every time";
}

/** What You's sheet says over its list, where rows are swiped (the phone) or ×'d (web, Mac). */
export function alwaysSheetWhy(removal: "swipe" | "cross" = "swipe"): string {
  const remove = removal === "swipe" ? "Swipe one away to remove it." : "Its × removes it.";
  return `Each rule lets a harness do one kind of thing without asking you. Turn one off and its asks come back. ${remove}`;
}

/** Under You's list, the harnesses nothing is allowed for: `Codex and Hermes ask every time.` */
export function alwaysAsking(harnesses: readonly AlwaysByHarness[]): string | undefined {
  const names = harnesses.filter((each) => each.rules.length === 0).map((each) => each.name);
  if (names.length === 0) return undefined;
  return `${namesWords(names, names.length)} ${names.length === 1 ? "asks" : "ask"} every time.`;
}

/** You's sheet when no harness is allowed anything always: said once, not under every name. */
export interface AlwaysNone {
  readonly headline: string;
  /** How a rule comes to be here. */
  readonly line: string;
  /** Why the asks that matter never come to be here. */
  readonly matters: string;
  /** Whether every harness's asks come to the reader, so the picture shows them. */
  readonly yours: boolean;
}

export function alwaysNone(directory: Directory, selfId: string | undefined): AlwaysNone {
  const harnesses = workspaceHarnesses(directory);
  const yours =
    selfId !== undefined &&
    harnesses.length > 0 &&
    harnesses.every((harness) => harness.ownerId === selfId);
  return {
    headline: `Nothing is allowed always, so every ask comes to ${yours ? "you" : "a person"}.`,
    line: "When a harness asks to do something small, Always on its card lets it do that again without asking, in that space or in every space. Each one made is listed here, where it can be turned off.",
    matters:
      "Asks that a harness marks as spending money, messaging outside, deleting or not undoable take a yes each time, so Always isn't offered for them.",
    yours,
  };
}

/** Whether an ask is about an action that matters, so it is answered once and waits for a person. */
export function askMatters(approval: Approval): boolean {
  return approval.matters === true;
}

/** The line under an open ask that matters, where the scope choices would be. */
export const ONCE_ONLY_WORDS = "You answer asks like this each time, so there is no Always.";

/** The line under Once, for a command Chips can't read part by part: For an hour is still there. */
export const UNREADABLE_WORDS =
  "This command does more than Chips can read, so there is no Always for it.";

/**
 * What a yes beyond this once can be on an ask (ADR 0239): anything, for an ask with no command;
 * for a command, the starts an Always would remember, as the card shows them (`node --check …`);
 * or no Always, with the line that says why. A command Chips can't read, or one that uses a
 * command never given a standing yes, still takes For an hour and Let it work (ADR 0281: `holds`);
 * an ask that matters takes nothing but a yes this once.
 */
export type AskStanding =
  | { readonly kind: "any" }
  | { readonly kind: "starts"; readonly starts: readonly string[] }
  | { readonly kind: "once"; readonly why: string; readonly holds: boolean };

export function askStanding(approval: Approval): AskStanding {
  if (askMatters(approval)) return { kind: "once", why: ONCE_ONLY_WORDS, holds: false };
  const offer = standingOffer({ kind: approval.actionKind, input: approval.input });
  if (offer === undefined) return { kind: "any" };
  if (offer.kind === "unreadable") {
    // A write into a file is named where it stands (ADR 0280); anything else is said whole.
    const to = commandPlate(approval)?.writesTo;
    return {
      kind: "once",
      why: to === undefined ? UNREADABLE_WORDS : writesWords(to),
      holds: true,
    };
  }
  if (offer.kind === "never") {
    return {
      kind: "once",
      why: `There is no Always for asks that use ${offer.command}.`,
      holds: true,
    };
  }
  return { kind: "starts", starts: offer.starts.map(startWords) };
}

/**
 * The choices of how far a yes reaches that an ask offers (ADR 0281): Once, For an hour and Always;
 * no Always where none is kept; and none for an ask that matters, which is answered once. No hour
 * from a server that wouldn't keep one (`keeps`, its last hello): with no Always left either, the
 * ask is answered once.
 */
export function askLastings(standing: AskStanding, keeps = true): readonly Lasting[] {
  if (standing.kind !== "once") return keeps ? ["once", "hour", "always"] : ["once", "always"];
  return standing.holds && keeps ? ["once", "hour"] : [];
}

/**
 * Whether an ask offers Let it work (ADR 0281): every ask but one that matters, on a server that
 * keeps it (`keeps`, its last hello).
 */
export function offersLetWork(standing: AskStanding, keeps = true): boolean {
  return keeps && (standing.kind !== "once" || standing.holds);
}

/** How a start reads on a card and in the list: its words, then that more may follow. */
export function startWords(start: readonly string[]): string {
  return `${start.join(" ")} …`;
}

/** How far a standing yes reaches: the rest of the run, the ask's space, or every space. */
export type Reach = "session" | "space" | "everywhere";

/**
 * The line under a standing yes's choices, saying what it lets through and where: `Commands made
 * only of these go ahead without a card in every space. Anything else still comes to you.`
 */
export function reachWords(reach: Reach, spaceName: string, commands: boolean): string {
  const where =
    reach === "session"
      ? "until this session ends"
      : reach === "space"
        ? `in ${spaceName}`
        : "in every space";
  return commands
    ? `Commands made only of the lit words go ahead without a card ${where}. Anything else still comes to you.`
    : `Asks like this go ahead without a card ${where}.`;
}

/** How long a yes for a while holds (ADR 0239, addendum of 6 November 2026): an hour. */
export const WHILE_MINUTES = 60;

/** When a yes for a while given now would stop. */
export function whileUntil(now: number = Date.now()): Date {
  return new Date(now + WHILE_MINUTES * 60_000);
}

/** A time of day as a card says it: `12:09 AM`. */
function clockTime(at: Date): string {
  return at.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

/**
 * How far a yes reaches, as the ask screen offers it (ADR 0280): Once, For an hour, Always, or
 * `work`, the switch that lets the agent work without asking until somebody stops it (ADR 0281).
 */
export type Lasting = "once" | "hour" | "always" | "work";

/** Approve, saying how far the yes reaches (ADR 0280): `Approve for an hour`. */
export function approveWords(lasting: Lasting): string {
  switch (lasting) {
    case "hour":
      return "Approve for an hour";
    case "always":
      return "Approve always";
    case "work":
      return "Approve and let it work";
    default:
      return "Approve once";
  }
}

/**
 * What Approve says once it is pressed (ADR 0280), as it turns to a tick: `Approved`, `Until
 * 12:09 AM`, `Until you stop it`, `Always, in every space`, `Always, in Bakery`.
 */
export function answeredWords(
  lasting: Lasting,
  now: number,
  reach: Reach,
  spaceName: string,
): string {
  if (lasting === "hour") return `Until ${clockTime(whileUntil(now))}`;
  if (lasting === "work") return "Until you stop it";
  if (lasting === "always")
    return reach === "everywhere" ? "Always, in every space" : `Always, in ${spaceName}`;
  return "Approved";
}

/** The ends of the hour a yes for a while holds, as the strip under For an hour draws them. */
export function hourEnds(now: number): { readonly from: string; readonly until: string } {
  return { from: `Now, ${clockTime(new Date(now))}`, until: `Until ${clockTime(whileUntil(now))}` };
}

/** What still comes to a person while an agent works without asking (ADR 0281). */
export const STILL_ASKS =
  "Anything that moves money, messages someone outside, or can't be undone still comes to you.";

/**
 * The line under For an hour, for the agent that asked (ADR 0281): everything it asks here goes
 * ahead, and what still comes to a person. The strip above it says until when.
 */
export function whileWords(name: string): string {
  return `Everything ${name} asks in this space goes ahead without a card for the hour, commands Chips can't read too. ${STILL_ASKS}`;
}

/** The switch above the choices (ADR 0281): `Let Jiro work without asking`, `In Bakery, until you stop it`. */
export function letWorkWords(
  name: string,
  spaceName: string,
): { readonly title: string; readonly sub: string } {
  return { title: `Let ${name} work without asking`, sub: `In ${spaceName}, until you stop it` };
}

/** The line in the choices' place while the switch is on (ADR 0281). */
export function untilStoppedWords(name: string): string {
  return `Everything ${name} asks here goes ahead without a card until you stop it, commands Chips can't read too. ${STILL_ASKS}`;
}

/**
 * The band at the top of a room while an agent works there without asking (ADR 0281): `Jiro is
 * working without asking`, and for an hour, until when.
 */
export function workingWords(name: string, held: LetWork): string {
  // For an hour says it shorter, so Stop and × both fit beside it on a phone (ADR 0286).
  if (held.until !== undefined)
    return `${name} isn't asking until ${clockTime(new Date(held.until))}`;
  return `${name} is working without asking`;
}

/** The band, for a moment, once Stop is pressed (ADR 0281). */
export function stoppedWords(name: string): string {
  return `Stopped. ${name} asks again from its next step.`;
}

/** How long the band says it stopped before it goes. */
export const STOPPED_MS = 2400;

/** One agent let work without asking, as You's Allowed always lists it (ADR 0281). */
export interface WorkingRow {
  readonly spaceId: string;
  /** The agent's name. */
  readonly name: string;
  /** `In Chips explain · Until you stop it`. */
  readonly line: string;
  readonly held: LetWork;
}

/** Every agent let work without asking now, in every room the reader is in (ADR 0281). */
export function workingWithoutAsking(
  model: WorkspaceModel,
  directory: Directory,
  now: number = Date.now(),
): readonly WorkingRow[] {
  return model.spaces.flatMap((space) =>
    lettingWork(space, now).map((held) => ({
      spaceId: space.id,
      name: nameOf(directory, held.asker),
      line: `In ${roomName(model, space.id, directory)} · ${holdsWords(held)}`,
      held,
    })),
  );
}

/** The heading over them on You's Allowed always. */
export const WORKING_HEADING = "Working without asking";

/** How long a yes given for now holds, as You's row says it: `Until you stop it`, `Until 2:50 AM`. */
export function holdsWords(held: LetWork): string {
  return held.until === undefined
    ? "Until you stop it"
    : `Until ${clockTime(new Date(held.until))}`;
}

/** The tag an open ask that matters wears. */
export function waitsWords(mine: boolean): string {
  return mine ? "Waits for you" : "Waits for a person";
}

/**
 * The line a card gains when the harness settled its own ask, as its own window answered it:
 * `Answered by Jacobian in its own tools.` Nothing for a person's answer, policy's or an expiry.
 */
export function ownToolsWords(
  approval: Approval,
  directory: Directory,
  askingHarness?: string,
): string | undefined {
  const by = approval.resolved?.by;
  if (by === undefined || by === "system" || approval.resolved?.decision === "expired") {
    return undefined;
  }
  const kind = directory[by]?.kind;
  if (kind === undefined || kind === "person") return undefined;
  // A lead policy handed it to answered for another harness (ADR 0036): not its own tools.
  if (
    askingHarness !== undefined &&
    harnessOf(directory, by) !== harnessOf(directory, askingHarness)
  ) {
    return undefined;
  }
  return `Answered by ${nameOf(directory, by)} in its own tools.`;
}
