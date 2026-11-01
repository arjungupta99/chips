/**
 * An agent's heartbeat, as its page draws it (ADR 0143): its harness's copy turned into the
 * Heartbeat group, a switch and an Every row under it while it is on, and the group's foot, the
 * same on the phone and the web.
 *
 * The harness sends minutes; Chips puts them into words itself ("30 min", "Once a day"). The foot
 * counts the checks a day, since each is a full turn for the agent and Chips can't know what a
 * harness's turn costs.
 */

import {
  type AgentHeartbeatView,
  HARNESS_CAPABILITIES,
  HEARTBEAT_CHANGE_WAIT_MS,
  type HeartbeatChangeAsk,
} from "@chipschat/protocol";
import { type Directory, harnessOf } from "./events.js";
import type { WorkspaceModel } from "./model.js";
import { mayRemoveHarness } from "./removal.js";
import type { Store } from "./store.js";
import { ServerRefused } from "./transport.js";

const HOUR = 60;
const DAY = 24 * HOUR;

/** Whether a harness, or an agent's, sends Chips its agents' heartbeats and takes changes. */
export function takesHeartbeats(directory: Directory, harnessId: string): boolean {
  const harness = directory[harnessOf(directory, harnessId)];
  return harness?.capabilities?.includes(HARNESS_CAPABILITIES.heartbeats) ?? false;
}

/**
 * Who sees and changes an agent's heartbeat: the people who may restart or remove its harness, as
 * for its model (ADR 0140), and only while the harness declares `heartbeats`. Anyone else sees no
 * Heartbeat group.
 */
export function mayChangeHeartbeat(
  workspace: WorkspaceModel,
  directory: Directory,
  agentId: string,
  selfId: string,
): boolean {
  const harnessId = harnessOf(directory, agentId);
  return (
    takesHeartbeats(directory, harnessId) &&
    mayRemoveHarness(workspace, directory, harnessId, selfId)
  );
}

/** An interval in words: "15 min", "1 hour", "12 hours", "Once a day", "Every 2 days". */
export function everyWords(minutes: number): string {
  if (minutes === DAY) return "Once a day";
  if (minutes > DAY && minutes % DAY === 0) return `Every ${minutes / DAY} days`;
  if (minutes === HOUR) return "1 hour";
  if (minutes > HOUR && minutes % HOUR === 0) return `${minutes / HOUR} hours`;
  return `${minutes} min`;
}

/** Roughly how many checks a day an interval makes, "about 48 a day": none for fewer than one. */
export function perDay(minutes: number): string | undefined {
  const count = DAY / minutes;
  return count < 1 ? undefined : `about ${Math.round(count)} a day`;
}

/** How often, to open a sentence: "Every 30 min", "Every hour", "Once a day", "Every 2 days". */
function howOften(minutes: number): string {
  if (minutes === HOUR) return "Every hour";
  const words = everyWords(minutes);
  return words.startsWith("Once") || words.startsWith("Every") ? words : `Every ${words}`;
}

/** A change still on its way to the harness: the rows show what it asks, saving. */
function waitingChange(view: AgentHeartbeatView) {
  return view.change?.state === "waiting" ? view.change : undefined;
}

/** The heartbeat as the rows show it: as asked while a change waits, else as the harness said. */
function shown(view: AgentHeartbeatView): { readonly on: boolean; readonly every: number } {
  const asked = waitingChange(view);
  return asked === undefined ? view : asked;
}

/** The Heartbeat group's two rows, as the agent's page draws them. */
export interface HeartbeatRows {
  /** The switch: as the harness said, or as a person just asked while the change waits. */
  readonly on: boolean;
  /** Under the switch's label: "On", "Off", or "Saving to Lathe" while its change waits. */
  readonly sub: string;
  /** The Every row, which shows while the switch is on: its minutes and its value's words. */
  readonly every: { readonly shows: boolean; readonly minutes: number; readonly value: string };
  /** Which row a waiting change is saving, if one is. Neither takes a tap while it does. */
  readonly saving: "switch" | "every" | undefined;
  /** Away or read only: both rows draw quiet, with no chevron, and a tap shows `hint`. */
  readonly quiet: boolean;
  readonly hint: string | undefined;
}

/** Why a tap does nothing: the harness keeps this agent's heartbeat to itself, or is away. */
function hintOf(view: AgentHeartbeatView, harness: string): string | undefined {
  if (!view.editable) return view.why_read_only ?? `Only ${harness} can change this.`;
  if (view.away) return `${harness} is away`;
  return undefined;
}

export function heartbeatRows(view: AgentHeartbeatView, harness: string): HeartbeatRows {
  const now = shown(view);
  const asked = waitingChange(view);
  const saving = asked === undefined ? undefined : asked.on !== view.on ? "switch" : "every";
  const savingWords = `Saving to ${harness}`;
  return {
    on: now.on,
    sub: saving === "switch" ? savingWords : now.on ? "On" : "Off",
    every: {
      shows: now.on,
      minutes: now.every,
      value: saving === "every" ? savingWords : everyWords(now.every),
    },
    saving,
    quiet: view.away || !view.editable,
    hint: hintOf(view, harness),
  };
}

/** One interval in the Every sheet: its words, roughly how many checks a day, and if it's picked. */
export interface EveryChoice {
  readonly minutes: number;
  readonly label: string;
  readonly sub: string | undefined;
  readonly checked: boolean;
}

/** The intervals the harness offers, shortest first, with the one the agent beats at checked. */
export function everyChoices(view: AgentHeartbeatView): readonly EveryChoice[] {
  const every = shown(view).every;
  return view.choices.map((minutes) => ({
    minutes,
    label: everyWords(minutes),
    sub: perDay(minutes),
    checked: minutes === every,
  }));
}

/**
 * The group's foot: what the switch means as it stands, and why it can't be changed now. On: "Every
 * 30 min, Shore looks over what it's doing and writes in its room only when something needs you.
 * Each look is a full turn: about 48 a day." Off: "Off. Shore only answers when you write to it."
 */
export function heartbeatFoot(view: AgentHeartbeatView, agent: string, harness: string): string {
  const now = shown(view);
  const count = perDay(now.every);
  const turn =
    count === undefined ? "Each look is a full turn." : `Each look is a full turn: ${count}.`;
  const what = now.on
    ? `${howOften(now.every)}, ${agent} looks over what it's doing and writes in its space only when something needs you. ${turn}`
    : `Off. ${agent} only answers when you write to it.`;
  if (!view.editable) return `${what} ${hintOf(view, harness)}`;
  if (view.away) return `${what} ${harness} is away, so this can't be changed now.`;
  return what;
}

export type HeartbeatSaveState = "saving" | "saved" | "failed" | "missed" | "away";

/** What the switch's row says of a save once it is done, in the product's words. */
export function heartbeatWords(
  state: HeartbeatSaveState,
  harness: string,
  message?: string,
): string {
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

/** The store's reads and writes the group uses. */
export type HeartbeatReads = Pick<Store, "readAgentHeartbeat" | "changeAgentHeartbeat">;

/** What became of a save: the harness's words for a refusal, and the copy as it is now. */
export interface HeartbeatSaveOutcome {
  readonly state: Exclude<HeartbeatSaveState, "saving">;
  readonly message?: string | undefined;
  readonly view?: AgentHeartbeatView | undefined;
}

export interface HeartbeatSaveOptions {
  /** Whether the page is still open: once it is not, nobody is asked again. */
  readonly alive: () => boolean;
  readonly everyMs?: number | undefined;
  /** For the tests: how to wait between reads. */
  readonly sleep?: ((ms: number) => Promise<void>) | undefined;
}

/** Why the server would not take it at all: away, or another rule in its words. */
function refusedOutcome(error: unknown): HeartbeatSaveOutcome {
  if (error instanceof ServerRefused && error.refusal === "harness_away") return { state: "away" };
  return { state: "failed", message: String((error as Error)?.message ?? error) };
}

/**
 * Send a change down the harness's socket, then read the agent's copy every `everyMs` until the
 * harness has answered it, or its minute is past and the server says it was missed.
 */
export async function saveHeartbeatChange(
  store: HeartbeatReads,
  agentId: string,
  ask: HeartbeatChangeAsk,
  options: HeartbeatSaveOptions,
): Promise<HeartbeatSaveOutcome> {
  let changeId: string;
  try {
    changeId = (await store.changeAgentHeartbeat(agentId, ask)).change_id;
  } catch (error) {
    return refusedOutcome(error);
  }
  const everyMs = options.everyMs ?? 800;
  const sleep =
    options.sleep ?? ((ms: number) => new Promise<void>((done) => setTimeout(done, ms)));
  const tries = Math.ceil((HEARTBEAT_CHANGE_WAIT_MS + 5000) / everyMs);
  for (let at = 0; at < tries && options.alive(); at += 1) {
    await sleep(everyMs);
    const view = await store.readAgentHeartbeat(agentId).catch(() => undefined);
    const change = view?.change;
    if (change?.change_id !== changeId || change.state === "waiting") continue;
    return { state: change.state, message: change.message, view };
  }
  return { state: "missed" };
}
