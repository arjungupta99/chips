/**
 * An agent's context window, as its page draws it (ADR 0146, layout B): its harness's copy turned
 * into the Context window group, the same on the phone and the web.
 *
 * - **The gauge.** How full, as a big percent and "172k of 272k tokens", the window as
 *   `WINDOW_BARS` bars lit up to the fill in the context ring's tone (neutral to 70%, amber to 90%,
 *   red past it), and the limit it compacts itself at as a marker standing in the bars, dragged
 *   along them to change it, snapping to the harness's choices. Past the fill, faint bars in its
 *   tone run up to how full its last long turn got, its top bar held, "Last long turn 80%" under
 *   it (his pick, way 1 of the peak mock): an agent that holds little between turns reads low, and
 *   the faint bars show what it reaches while working.
 * - **Compact now**, a button in the gauge, beside what it last did or is doing.
 * - **Compacts itself**, a row under the gauge: a switch where the harness lets the limit be
 *   turned off, and what the marker means.
 * - **The foot**, what compacting does, and why nothing can be changed now when it can't.
 *
 * The harness sends tokens and percents; Chips puts them into words itself, by the rule the run
 * panel's tokens follow (`formatTokens` in `@chipschat/ui`).
 */

import {
  type AgentContextWindowView,
  type CompactionState,
  HARNESS_CAPABILITIES,
  WINDOW_ASK_WAIT_MS,
  type WindowLimitAsk,
} from "@chipschat/protocol";
import { clockOf } from "./agents.js";
import { type Directory, harnessOf } from "./events.js";
import type { WorkspaceModel } from "./model.js";
import { mayRemoveHarness } from "./removal.js";
import type { Store } from "./store.js";
import { tokenWords } from "./tokens.js";
import { ServerRefused } from "./transport.js";

/** How many bars the gauge draws the window as. */
export const WINDOW_BARS = 40;
/** The context ring's tones (`@chipschat/ui`, vocabulary/context.ts): amber from here… */
export const WINDOW_WARN_PERCENT = 70;
/** …and red from here. */
export const WINDOW_HOT_PERCENT = 90;
/** How often a page reads the copy again while a Compact now is on its way or under way. */
export const COMPACT_READ_MS = 2000;
/** How long a page follows a Compact now before it stops asking: its harness may take minutes. */
export const COMPACT_FOLLOW_MS = 4 * 60_000;
/** The limit a switch turned on picks when the harness names none of its own. */
const LIMIT_WHEN_ON = 80;

/** Whether a harness, or an agent's, sends Chips its agents' context windows and takes asks. */
export function takesWindows(directory: Directory, harnessId: string): boolean {
  const harness = directory[harnessOf(directory, harnessId)];
  return harness?.capabilities?.includes(HARNESS_CAPABILITIES.contextWindows) ?? false;
}

/**
 * Who sees an agent's context window and asks things of it: the people who may restart or remove
 * its harness, as for its model (ADR 0140), and only while the harness declares `context_windows`.
 * Anyone else sees no Context window group.
 */
export function mayChangeWindow(
  workspace: WorkspaceModel,
  directory: Directory,
  agentId: string,
  selfId: string,
): boolean {
  const harnessId = harnessOf(directory, agentId);
  return (
    takesWindows(directory, harnessId) && mayRemoveHarness(workspace, directory, harnessId, selfId)
  );
}

/** How full, as a whole percent from 0 to 100. */
export function windowPercent(used: number, window: number): number {
  if (window <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round((used / window) * 100)));
}

export type WindowTone = "neutral" | "warn" | "hot";

export function windowTone(percent: number): WindowTone {
  if (percent >= WINDOW_HOT_PERCENT) return "hot";
  if (percent >= WINDOW_WARN_PERCENT) return "warn";
  return "neutral";
}

/** A limit change still on its way to the harness: the page shows what it asks, saving. */
function waitingChange(view: AgentContextWindowView) {
  return view.change?.state === "waiting" ? view.change : undefined;
}

/**
 * The limit as the page shows it: as asked while a change waits, else as the harness said; `null`
 * for only when asked, and `undefined` when the harness keeps its own and offers no other.
 */
export function shownLimit(view: AgentContextWindowView): number | null | undefined {
  if (view.limit === undefined) return undefined;
  const asked = waitingChange(view);
  return asked === undefined ? view.limit.at : asked.at;
}

/** How full its last long turn got, as faint bars past the fill. */
export interface WindowGhost {
  /** How many of the `WINDOW_BARS` it reaches: those past `lit` draw faint, the last of them held. */
  readonly bars: number;
  readonly percent: number;
  readonly tone: WindowTone;
  /** Under its top bar, before the percent: "Last long turn". */
  readonly words: string;
}

/** The gauge, as the group draws it. */
export interface WindowGauge {
  readonly percent: number;
  /** "63%". */
  readonly big: string;
  /** "172k of 272k tokens". */
  readonly tokens: string;
  readonly tone: WindowTone;
  /** How many of the `WINDOW_BARS` are lit. */
  readonly lit: number;
  /** Where the marker stands, in percent; nothing when there is no limit to show. */
  readonly marker: number | undefined;
  /** The window, under the bars' far end: "272k". */
  readonly end: string;
  /** Its last long turn, when it reached past the fill. */
  readonly ghost: WindowGhost | undefined;
  /** What a screen reader hears for the gauge. */
  readonly label: string;
}

const barsOf = (percent: number): number => Math.round((percent / 100) * WINDOW_BARS);

function ghostOf(view: AgentContextWindowView, lit: number): WindowGhost | undefined {
  const turn = view.long_turn;
  if (turn === undefined) return undefined;
  const percent = windowPercent(turn.peak, view.window);
  const bars = barsOf(percent);
  if (bars <= lit) return undefined;
  return { bars, percent, tone: windowTone(percent), words: "Last long turn" };
}

export function windowGauge(view: AgentContextWindowView): WindowGauge {
  const percent = windowPercent(view.used, view.window);
  const tokens = `${tokenWords(view.used)} of ${tokenWords(view.window)} tokens`;
  const limit = shownLimit(view);
  const lit = barsOf(percent);
  const ghost = ghostOf(view, lit);
  return {
    percent,
    big: `${percent}%`,
    tokens,
    tone: windowTone(percent),
    lit,
    marker: limit ?? undefined,
    end: tokenWords(view.window),
    ghost,
    label: `Context ${percent}% full, ${tokens}${ghost === undefined ? "" : `. Its last long turn reached ${ghost.percent}%`}`,
  };
}

/** The nearest of the harness's limits to where a finger let go of the marker. */
export function snapLimit(choices: readonly number[], percent: number): number {
  let best = choices[0] ?? LIMIT_WHEN_ON;
  for (const each of choices) {
    if (Math.abs(each - percent) < Math.abs(best - percent)) best = each;
  }
  return best;
}

/** The limit the switch picks when it is turned on: the harness's own, else the one nearest 80%. */
export function limitWhenOn(view: AgentContextWindowView): number {
  const limit = view.limit;
  if (limit === undefined) return LIMIT_WHEN_ON;
  return limit.default ?? snapLimit(limit.choices, LIMIT_WHEN_ON);
}

/** The group's controls, as the agent's page draws them. */
export interface WindowRows {
  /** The Compact now button. `busy` while it is on its way or under way: it takes no tap. */
  readonly compact: { readonly label: string; readonly busy: boolean; readonly quiet: boolean };
  /** Beside the button: what it is doing, or what it last did. */
  readonly note: string;
  /** The Compacts itself row: absent when the harness keeps its own limit and offers no other. */
  readonly auto:
    | {
        /** Whether it compacts itself at a limit now (shown as asked while a change waits). */
        readonly on: boolean;
        /** Whether the row has a switch: only where the harness lets the limit be turned off. */
        readonly switch: boolean;
        readonly sub: string;
        readonly saving: boolean;
      }
    | undefined;
  /** Whether the marker may be dragged now. */
  readonly drags: boolean;
  /** Away, or read only: the limit draws quiet, and a tap shows `hint`. */
  readonly quiet: boolean;
  readonly hint: string | undefined;
}

/** Why a tap on the limit does nothing: the harness keeps it to itself, or is away. */
function hintOf(view: AgentContextWindowView, harness: string): string | undefined {
  if (view.away) return `${harness} is away`;
  if (!view.editable) return view.why_read_only ?? `Only ${harness} can change this.`;
  return undefined;
}

/** Whether a Compact now is on its way, or the copy says it compacts now. */
function compacting(view: AgentContextWindowView): "asked" | "queued" | "running" | undefined {
  if (view.compacting !== undefined) return view.compacting;
  return view.compaction?.state === "waiting" ? "asked" : undefined;
}

/** What it last did: "Compacted itself at 9:14 AM, 221k to 24k." */
function lastWords(view: AgentContextWindowView, now: number): string {
  const last = view.last;
  if (last === undefined) return "It hasn't compacted yet.";
  const how = last.by === "itself" ? "Compacted itself" : "Compacted when asked";
  return `${how} ${whenOf(last.at, now)}, ${tokenWords(last.from)} to ${tokenWords(last.to)}.`;
}

const times = (n: number): string => (n === 1 ? "once" : n === 2 ? "twice" : `${n} times`);

function whenOf(at: string, now: number): string {
  const clock = clockOf(at, now);
  return /\d:\d\d/.test(clock) ? `at ${clock}` : `on ${clock}`;
}

/** Its last long turn: "Its last long turn reached 218k and compacted itself once, at 9:16 AM." */
function longTurnWords(
  turn: NonNullable<AgentContextWindowView["long_turn"]>,
  now: number,
): string {
  const folded = turn.folds > 0 ? ` and compacted itself ${times(turn.folds)}` : "";
  return `Its last long turn reached ${tokenWords(turn.peak)}${folded}, ${whenOf(turn.at, now)}.`;
}

/** What it last did: its last compaction, or its last long turn, whichever came later. */
function lastDone(view: AgentContextWindowView, now: number): string {
  const turn = view.long_turn;
  const last = view.last;
  if (turn !== undefined && (last === undefined || Date.parse(turn.at) >= Date.parse(last.at))) {
    return longTurnWords(turn, now);
  }
  return lastWords(view, now);
}

function noteOf(view: AgentContextWindowView, agent: string, now: number): string {
  switch (compacting(view)) {
    case "asked":
      return `Asking ${agent} to compact.`;
    case "queued":
      return `${agent} compacts when this turn ends.`;
    case "running":
      return `${agent} is summing up its conversation.`;
    default:
      return lastDone(view, now);
  }
}

function autoSub(view: AgentContextWindowView, harness: string, limit: number | null): string {
  if (waitingChange(view) !== undefined) return `Saving to ${harness}`;
  if (limit === null) return "Only when you ask, or when it is full.";
  const quiet = view.away || !view.editable;
  return quiet ? `At ${limit}%.` : `At ${limit}%. Drag the marker to change it.`;
}

export function windowRows(
  view: AgentContextWindowView,
  agent: string,
  harness: string,
  now: number,
): WindowRows {
  const quiet = view.away || !view.editable;
  const doing = compacting(view);
  const limit = shownLimit(view);
  const saving = waitingChange(view) !== undefined;
  return {
    compact: {
      label: doing === undefined ? "Compact now" : "Compacting",
      busy: doing !== undefined,
      quiet: view.away || !view.compacts,
    },
    note: noteOf(view, agent, now),
    auto:
      limit === undefined || view.limit === undefined
        ? undefined
        : {
            on: limit !== null,
            switch: view.limit.may_turn_off,
            sub: autoSub(view, harness, limit),
            saving,
          },
    drags: !quiet && !saving && limit !== undefined && limit !== null,
    quiet,
    hint: hintOf(view, harness),
  };
}

/**
 * The group's foot: what compacting does, and why nothing can be asked now when it can't. "J sums
 * up its conversation so far and carries on from the summary. Details from early on may be lost."
 */
export function windowFoot(view: AgentContextWindowView, agent: string, harness: string): string {
  const what = `Compacting sums up ${agent}'s conversation so far, and it carries on from the summary. Details from early on may be lost.`;
  if (view.away) return `${what} ${harness} is away, so nothing can be asked of it now.`;
  // While it compacts, the note beside Compact now already says so.
  if (!view.compacts && view.why_not !== undefined && view.compacting === undefined) {
    return `${what} ${view.why_not}`;
  }
  if (!view.editable) return `${what} ${hintOf(view, harness)}`;
  return what;
}

/** The sheet Compact now opens before it asks. */
export interface CompactSheet {
  /** "Compact J's context?" */
  readonly title: string;
  /** "172k of 272k tokens" */
  readonly sub: string;
  readonly body: string;
  /** Only while the agent is working: when it will happen. */
  readonly after: string | undefined;
}

export function compactSheet(
  view: AgentContextWindowView,
  agent: string,
  working: boolean,
): CompactSheet {
  const last = view.last;
  const before =
    last === undefined
      ? ""
      : ` Last time it went from ${tokenWords(last.from)} to ${tokenWords(last.to)}.`;
  return {
    title: `Compact ${agent}'s context?`,
    sub: `${tokenWords(view.used)} of ${tokenWords(view.window)} tokens`,
    body: `${agent} sums up its conversation so far and carries on from the summary. Details from early on may be lost.${before}`,
    after: working ? `${agent} is working, so it compacts when this turn ends.` : undefined,
  };
}

export type WindowSaveState = "saving" | "saved" | "failed" | "missed" | "away";

/** What the Compacts itself row says of a save once it is done, in the product's words. */
export function windowSaveWords(state: WindowSaveState, harness: string, message?: string): string {
  switch (state) {
    case "saving":
      return `Saving to ${harness}`;
    case "saved":
      return "Saved";
    case "failed":
      return message ?? `${harness} couldn't change it.`;
    case "missed":
      return `${harness} hasn't answered. It may still change it.`;
    case "away":
      return `${harness} is away`;
  }
}

export type CompactOutcomeState = Exclude<CompactionState, "waiting" | "taken"> | "away" | "gone";

/** What the gauge says of a Compact now once it is over. */
export function compactWords(
  state: CompactOutcomeState,
  harness: string,
  view?: AgentContextWindowView,
  message?: string,
): string {
  switch (state) {
    case "done": {
      const last = view?.last;
      return last === undefined
        ? "Compacted."
        : `Compacted, ${tokenWords(last.from)} to ${tokenWords(last.to)}.`;
    }
    case "failed":
      return message ?? `${harness} couldn't compact it.`;
    case "missed":
      return `${harness} hasn't answered. It may still compact it.`;
    case "away":
      return `${harness} is away`;
    case "gone":
      return "Still compacting. It shows here when it is done.";
  }
}

/** The store's reads and writes the group uses. */
export type WindowReads = Pick<
  Store,
  "readAgentContextWindow" | "changeAgentContextWindow" | "compactAgent"
>;

export interface WindowFollowOptions {
  /** Whether the page is still open: once it is not, nobody is asked again. */
  readonly alive: () => boolean;
  readonly everyMs?: number | undefined;
  /** Each copy read on the way, so the page can show it moving. */
  readonly onView?: ((view: AgentContextWindowView) => void) | undefined;
  /** For the tests: how to wait between reads. */
  readonly sleep?: ((ms: number) => Promise<void>) | undefined;
}

const nap = (ms: number) => new Promise<void>((done) => setTimeout(done, ms));

/** Why the server would not take it at all: away, or another rule in its words. */
function refusedWith(error: unknown): {
  readonly state: "away" | "failed";
  readonly message?: string;
} {
  if (error instanceof ServerRefused && error.refusal === "harness_away") return { state: "away" };
  return { state: "failed", message: String((error as Error)?.message ?? error) };
}

/** What became of a limit's save: the harness's words for a refusal, and the copy as it is now. */
export interface WindowSaveOutcome {
  readonly state: Exclude<WindowSaveState, "saving">;
  readonly message?: string | undefined;
  readonly view?: AgentContextWindowView | undefined;
}

/**
 * Send a new limit down the harness's socket, then read the agent's copy every `everyMs` until the
 * harness has answered it, or its minute is past and the server says it was missed.
 */
export async function saveWindowLimit(
  store: WindowReads,
  agentId: string,
  ask: WindowLimitAsk,
  options: WindowFollowOptions,
): Promise<WindowSaveOutcome> {
  let changeId: string;
  try {
    changeId = (await store.changeAgentContextWindow(agentId, ask)).change_id;
  } catch (error) {
    return refusedWith(error);
  }
  const everyMs = options.everyMs ?? 800;
  const sleep = options.sleep ?? nap;
  const tries = Math.ceil((WINDOW_ASK_WAIT_MS + 5000) / everyMs);
  for (let at = 0; at < tries && options.alive(); at += 1) {
    await sleep(everyMs);
    const view = await store.readAgentContextWindow(agentId).catch(() => undefined);
    const change = view?.change;
    if (change?.change_id !== changeId || change.state === "waiting") continue;
    return { state: change.state, message: change.message, view };
  }
  return { state: "missed" };
}

/** What became of a Compact now. `gone`: still under way when the page stopped following it. */
export interface CompactOutcome {
  readonly state: CompactOutcomeState;
  readonly message?: string | undefined;
  readonly view?: AgentContextWindowView | undefined;
}

/**
 * Ask for a Compact now, then read the agent's copy every `everyMs` (handing each to `onView`)
 * until it is done, refused or missed, for up to `COMPACT_FOLLOW_MS`.
 */
export async function compactNow(
  store: WindowReads,
  agentId: string,
  options: WindowFollowOptions,
): Promise<CompactOutcome> {
  let askId: string;
  try {
    askId = (await store.compactAgent(agentId)).change_id;
  } catch (error) {
    return refusedWith(error);
  }
  const everyMs = options.everyMs ?? COMPACT_READ_MS;
  const sleep = options.sleep ?? nap;
  const tries = Math.ceil(COMPACT_FOLLOW_MS / everyMs);
  for (let at = 0; at < tries && options.alive(); at += 1) {
    await sleep(everyMs);
    const view = await store.readAgentContextWindow(agentId).catch(() => undefined);
    if (view === undefined) continue;
    options.onView?.(view);
    const asked = view.compaction;
    if (asked?.change_id !== askId) continue;
    if (asked.state === "done" || asked.state === "failed" || asked.state === "missed") {
      return { state: asked.state, message: asked.message, view };
    }
  }
  return { state: "gone" };
}
