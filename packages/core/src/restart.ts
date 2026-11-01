/**
 * Restarting a harness (ADR 0094): who may ask, what its page offers, and what the sheet that asks
 * first says. In core for the reason `removal.ts` is: the phone's page and the desktop's pane offer
 * it to the same people as the server allows, in the same words.
 */

import type { AgentState } from "@chipschat/protocol";
import { cantAnswer, clockOf } from "./agents.js";
import { type Directory, nameOf, takesRestarts } from "./events.js";
import type { WorkspaceModel } from "./model.js";
import type { Asking } from "./putAway.js";
import { mayRemoveHarness } from "./removal.js";

/**
 * A harness that says it takes restarts, and a reader who may remove it: its owner, or an owner
 * or admin of the workspace (ADR 0078). Never a guest, and never a harness removed already.
 */
export function mayRestartHarness(
  model: WorkspaceModel,
  directory: Directory,
  harnessId: string,
  selfId: string,
): boolean {
  return (
    takesRestarts(directory, harnessId) && mayRemoveHarness(model, directory, harnessId, selfId)
  );
}

/** What the harness's page offers, for a reader who may restart it. */
export type RestartOffer =
  /** Restart, in gold while it can't answer, drawn quietly while it can. */
  | { readonly kind: "offer"; readonly loud: boolean; readonly label: string }
  /** A restart stands: nothing to press until the harness speaks again. */
  | { readonly kind: "going"; readonly label: string }
  /** Nothing of it is connected, so nobody would hear the ask: said in words, with no button. */
  | { readonly kind: "unreachable"; readonly title: string; readonly body: string };

export function restartOffer(
  model: WorkspaceModel,
  directory: Directory,
  harnessId: string,
  selfId: string,
): RestartOffer | undefined {
  if (!mayRestartHarness(model, directory, harnessId, selfId)) return undefined;
  const name = nameOf(directory, harnessId);
  const why = cantAnswer(directory, harnessId);
  if (why?.kind === "restarting") return { kind: "going", label: "Restarting…" };
  if (why?.kind === "offline") {
    return {
      kind: "unreachable",
      title: `Chips can't reach ${name}`,
      body: "Nothing of it is connected, so there's nobody to ask to restart. Start it on its machine.",
    };
  }
  return { kind: "offer", loud: why !== undefined, label: `Restart ${name}…` };
}

/** What the sheet that asks before a restart says. `name` is the harness's. */
export function restartAsking(name: string): Asking {
  return {
    title: `Restart ${name}?`,
    body: `${name} runs its own restart on its machine. It stops whatever it's doing, and should be back in a minute or two.`,
    note: "Everyone here sees it restarting until it's back.",
    confirm: "Restart",
  };
}

/**
 * Whether a restart just ended with the harness able to answer: the page that watched it say
 * "Restarting" says when it was back. Nothing is kept of it, so another device, or this page
 * opened later, says nothing.
 */
export function backFromRestart(
  before: AgentState | undefined,
  after: AgentState | undefined,
): boolean {
  return (
    before?.restarting !== undefined &&
    after !== undefined &&
    after.restarting === undefined &&
    after.connected &&
    after.trouble === undefined
  );
}

/** "Back · 8:33 AM": when it came back, on the reader's clock. */
export function backWords(
  at: number,
  now: number,
  clock: (iso: string, now: number) => string = clockOf,
): string {
  return `Back · ${clock(new Date(at).toISOString(), now)}`;
}
