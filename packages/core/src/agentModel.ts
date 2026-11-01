/**
 * An agent's model and effort, as its page draws them (ADR 0140): its harness's copy turned into
 * one row and one sheet, the same on the phone and the web.
 *
 * Nothing here names a model. Every model's label, every level's, and what "same as" means come
 * from the harness. Chips' own words are few: "effort", "its own", the line under the bars, and
 * what became of a save.
 */

import {
  type AgentModelView,
  type EffortLevel,
  HARNESS_CAPABILITIES,
  MODEL_CHANGE_WAIT_MS,
  type ModelChangeAsk,
  type ModelChoice,
} from "@chipschat/protocol";
import { type Directory, harnessOf } from "./events.js";
import type { WorkspaceModel } from "./model.js";
import { mayRemoveHarness } from "./removal.js";
import type { Store } from "./store.js";
import { ServerRefused } from "./transport.js";

/** Whether a harness, or an agent's, sends Chips its agents' models and takes changes (ADR 0140). */
export function takesModels(directory: Directory, harnessId: string): boolean {
  const harness = directory[harnessOf(directory, harnessId)];
  return harness?.capabilities?.includes(HARNESS_CAPABILITIES.models) ?? false;
}

/**
 * Who sees and changes an agent's model: the people who may restart or remove its harness (ADR
 * 0078, ADR 0094), and only while the harness declares `models`. Anyone else sees no Model group.
 */
export function mayChangeModel(
  workspace: WorkspaceModel,
  directory: Directory,
  agentId: string,
  selfId: string,
): boolean {
  const harnessId = harnessOf(directory, agentId);
  return (
    takesModels(directory, harnessId) && mayRemoveHarness(workspace, directory, harnessId, selfId)
  );
}

/**
 * The agent a harness page shows the Model row of (ADR 0154): the harness's Main agent, whose model
 * every agent of it with none of its own follows, so changing it changes the harness's. None for a
 * harness with no Main agent, or whose Main agent is archived.
 */
export function harnessModelAgent(directory: Directory, harnessId: string): string | undefined {
  return Object.values(directory).find(
    (each) =>
      each.kind === "agent" &&
      each.harnessId === harnessId &&
      each.lead === true &&
      each.archived !== true,
  )?.id;
}

/** The line under the effort bars: Chips' own, with no numbers. */
export const EFFORT_NOTE = "Higher is slower, and costs more";
/** Up to this many levels, each bar has its level's name under it; above, only the chosen one's. */
export const NAMED_BARS_MAX = 5;
/**
 * The ground of the model row's tile, by its index among the grounds a face may stand on (ADR
 * 0064): the blue the mock drew it on, which is also How it works' (`CONTEXT_GROUND_INDEX`).
 */
export const MODEL_GROUND_INDEX = 4;
/** How long Saved shows before the sheet goes and the row flashes (ADR 0141). */
export const MODEL_SAVED_MS = 650;
/** How far behind the last each bar's light comes as the level moves (ADR 0141). */
export const EFFORT_SWEEP_MS = 50;

/**
 * The bars a move of the level changes, and when each goes: from the one nearest where it was,
 * a bar every `EFFORT_SWEEP_MS`, up when it rises and down when it falls. Only the model's own
 * bars; -1 is none lit, as the sheet's bars are before they sweep up as it arrives.
 */
export function sweepOf(
  count: number,
  from: number,
  to: number,
): readonly { readonly at: number; readonly on: 0 | 1; readonly delay: number }[] {
  const changes = [];
  for (let at = 0; at < count; at += 1) {
    const on = at <= to ? 1 : 0;
    if (on === (at <= from ? 1 : 0)) continue;
    const step = to > from ? at - (from + 1) : from - at;
    changes.push({ at, on, delay: step * EFFORT_SWEEP_MS } as const);
  }
  return changes;
}

/** The names a row and a sheet use: the harness's and the agent's. */
export interface ModelNames {
  readonly harness: string;
  readonly agent: string;
}

/** The agent's model and effort, as its row on the agent's page draws them. */
export interface ModelRow {
  /** The model's label, as its harness gave it. */
  readonly label: string;
  /** Under it: "Steady effort · Same as J", "Steady effort · its own", or the half there is. */
  readonly sub: string;
  /** The model's levels, lowest first: one bar each. None for a model without any. */
  readonly levels: readonly EffortLevel[];
  /** Which bar is lit up to: an index into `levels`, or -1 for none. */
  readonly level: number;
  /** Away or read only: the row draws quiet, with no chevron, and a tap shows `hint`. */
  readonly quiet: boolean;
  readonly hint: string | undefined;
  /** The group's foot: how many follow it, and why it can't be changed now. */
  readonly foot: string | undefined;
}

function choiceOf(view: Pick<AgentModelView, "choices">, id: string): ModelChoice | undefined {
  return view.choices.find((choice) => choice.id === id);
}

function levelsOf(choice: ModelChoice | undefined): readonly EffortLevel[] {
  return choice?.efforts ?? [];
}

const capital = (words: string): string => words.charAt(0).toUpperCase() + words.slice(1);

/** "Steady effort · Same as J": the effort, then whose it is. */
function subOf(view: AgentModelView): string {
  const level = levelsOf(choiceOf(view, view.model)).find((each) => each.id === view.effort);
  const whose = view.own ? "its own" : view.default?.label;
  const parts = [level === undefined ? undefined : `${level.label} effort`, whose];
  return capital(parts.filter((part) => part !== undefined).join(" · "));
}

/** Under the Same as switch: what the default runs on, "Heron 2 · Steady effort". */
export function defaultWords(view: AgentModelView): string | undefined {
  const fallback = view.default;
  if (fallback === undefined) return undefined;
  const choice = choiceOf(view, fallback.model);
  const level = levelsOf(choice).find((each) => each.id === fallback.effort);
  const parts = [choice?.label ?? fallback.model, level && `${level.label} effort`];
  return parts.filter((part) => part !== undefined).join(" · ");
}

/** Why a tap does nothing: the harness is away, or it keeps this agent's model to itself. */
function hintOf(view: AgentModelView, names: ModelNames): string | undefined {
  if (!view.editable) return view.why_read_only ?? `Only ${names.harness} can change this.`;
  if (view.away) return `${names.harness} is away`;
  return undefined;
}

function followersOf(view: AgentModelView, names: ModelNames): string | undefined {
  const count = view.followed_by ?? 0;
  if (count === 0) return undefined;
  return count === 1
    ? `1 agent has no model of its own and uses ${names.agent}'s.`
    : `${count} agents have no model of their own and use ${names.agent}'s.`;
}

/** Why it can't be changed now, for the foot: the harness's reason, or that it is away. */
function whyNot(view: AgentModelView, names: ModelNames): string | undefined {
  if (!view.editable) return hintOf(view, names);
  if (view.away) return `${names.harness} is away. You can see this, not change it.`;
  return undefined;
}

function footOf(view: AgentModelView, names: ModelNames): string | undefined {
  const lines = [followersOf(view, names), whyNot(view, names)].filter(
    (line) => line !== undefined,
  );
  return lines.length === 0 ? undefined : lines.join(" ");
}

export function modelRow(view: AgentModelView, names: ModelNames): ModelRow {
  const choice = choiceOf(view, view.model);
  const levels = levelsOf(choice);
  return {
    label: choice?.label ?? view.model,
    sub: subOf(view),
    levels,
    level: levels.findIndex((each) => each.id === view.effort),
    quiet: view.away || !view.editable,
    hint: hintOf(view, names),
    foot: footOf(view, names),
  };
}

/**
 * The sheet, with no drawing in it: whether the agent follows its default, and the model and level
 * picked for it. The picks are kept while Same is on, so switching it off again gives them back.
 */
export interface ModelSheet {
  readonly view: AgentModelView;
  readonly same: boolean;
  readonly model: string;
  readonly effort: string | undefined;
}

/** The sheet as it opens: on Same when the agent has none of its own, on what it runs on now. */
export function openModelSheet(view: AgentModelView): ModelSheet {
  return {
    view,
    same: !view.own && view.default !== undefined,
    model: view.model,
    effort: view.effort ?? choiceOf(view, view.model)?.effort_default,
  };
}

/** Switch Same on, which drops both, or off, which gives the agent both of its own. */
export function sameAs(sheet: ModelSheet, on: boolean): ModelSheet {
  if (sheet.view.default === undefined) return sheet;
  return { ...sheet, same: on };
}

/**
 * The level a model is moved to (ruling 6): the same one if the new model has it, else the model's
 * own default, else the nearest lower of the old model's levels that the new one has, else its
 * lowest. A model with no levels has none.
 */
export function levelAfter(
  from: ModelChoice | undefined,
  effort: string | undefined,
  to: ModelChoice,
): string | undefined {
  const has = (id: string | undefined) => to.efforts.some((level) => level.id === id);
  if (to.efforts.length === 0) return undefined;
  if (has(effort)) return effort;
  if (has(to.effort_default)) return to.effort_default;
  const below = levelsOf(from);
  const at = below.findIndex((level) => level.id === effort);
  for (let step = at - 1; step >= 0; step -= 1) {
    if (has(below[step]?.id)) return below[step]?.id;
  }
  return to.efforts[0]?.id;
}

/** Pick a model: its level follows ruling 6. Nothing is picked while Same is on. */
export function pickModel(sheet: ModelSheet, modelId: string): ModelSheet {
  const to = choiceOf(sheet.view, modelId);
  if (sheet.same || to === undefined) return sheet;
  const from = choiceOf(sheet.view, sheet.model);
  return { ...sheet, model: modelId, effort: levelAfter(from, sheet.effort, to) };
}

/** Pick a level of the picked model. Nothing is picked while Same is on. */
export function pickLevel(sheet: ModelSheet, effortId: string): ModelSheet {
  const levels = levelsOf(choiceOf(sheet.view, sheet.model));
  if (sheet.same || !levels.some((level) => level.id === effortId)) return sheet;
  return { ...sheet, effort: effortId };
}

/** What the sheet shows checked and lit: the default's while Same is on, else the picks. */
export function shownPick(sheet: ModelSheet): {
  readonly model: string;
  readonly effort: string | undefined;
  readonly levels: readonly EffortLevel[];
  readonly level: number;
} {
  const fallback = sheet.view.default;
  const model = sheet.same && fallback !== undefined ? fallback.model : sheet.model;
  const effort = sheet.same && fallback !== undefined ? fallback.effort : sheet.effort;
  const levels = levelsOf(choiceOf(sheet.view, model));
  return { model, effort, levels, level: levels.findIndex((each) => each.id === effort) };
}

/** Whether Save would change anything: dropping its own, taking its own, or other picks. */
export function sheetChanged(sheet: ModelSheet): boolean {
  const { view } = sheet;
  if (sheet.same) return view.own;
  if (!view.own) return true;
  return sheet.model !== view.model || sheet.effort !== view.effort;
}

/** Whether Save is lit: something changed, the picks are whole, and the harness can take it. */
export function canSave(sheet: ModelSheet): boolean {
  const whole =
    sheet.same ||
    levelsOf(choiceOf(sheet.view, sheet.model)).length === 0 ||
    sheet.effort !== undefined;
  return sheetChanged(sheet) && whole && sheet.view.editable && !sheet.view.away;
}

/** What Save sends: both picks, or neither for the default. */
export function modelAsk(sheet: ModelSheet): ModelChangeAsk {
  if (sheet.same) return { model: null, effort: null };
  return { model: sheet.model, effort: sheet.effort ?? null };
}

export type ModelSaveState = "saving" | "saved" | "failed" | "missed" | "away";

/** What the sheet says under Save, in the product's words. */
export function modelWords(state: ModelSaveState, harness: string, message?: string): string {
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

/** The store's reads and writes the sheet uses. */
export type ModelReads = Pick<Store, "readAgentModel" | "changeAgentModel">;

/** What became of a save: the harness's words for a refusal, and the copy as it is now. */
export interface ModelSaveOutcome {
  readonly state: Exclude<ModelSaveState, "saving">;
  readonly message?: string | undefined;
  readonly view?: AgentModelView | undefined;
}

export interface ModelSaveOptions {
  /** Whether the sheet is still open: once it is not, nobody is asked again. */
  readonly alive: () => boolean;
  readonly everyMs?: number | undefined;
  /** For the tests: how to wait between reads. */
  readonly sleep?: ((ms: number) => Promise<void>) | undefined;
}

/** Why the server would not take it at all: away, or another rule in its words. */
function refusedOutcome(error: unknown): ModelSaveOutcome {
  if (error instanceof ServerRefused && error.refusal === "harness_away") return { state: "away" };
  return { state: "failed", message: String((error as Error)?.message ?? error) };
}

/**
 * Send a change down the harness's socket, then read the agent's copy every `everyMs` until the
 * harness has answered it, or its minute is past and the server says it was missed.
 */
export async function saveModelChange(
  store: ModelReads,
  agentId: string,
  ask: ModelChangeAsk,
  options: ModelSaveOptions,
): Promise<ModelSaveOutcome> {
  let changeId: string;
  try {
    changeId = (await store.changeAgentModel(agentId, ask)).change_id;
  } catch (error) {
    return refusedOutcome(error);
  }
  const everyMs = options.everyMs ?? 800;
  const sleep =
    options.sleep ?? ((ms: number) => new Promise<void>((done) => setTimeout(done, ms)));
  const tries = Math.ceil((MODEL_CHANGE_WAIT_MS + 5000) / everyMs);
  for (let at = 0; at < tries && options.alive(); at += 1) {
    await sleep(everyMs);
    const view = await store.readAgentModel(agentId).catch(() => undefined);
    const change = view?.change;
    if (change?.change_id !== changeId || change.state === "waiting") continue;
    return { state: change.state, message: change.message, view };
  }
  return { state: "missed" };
}
