/**
 * The four groups an agent's page draws from its harness's copies (ADR 0238): Model (ADR 0140),
 * Heartbeat (ADR 0143), Context window (ADR 0146) and Context (ADR 0134), and how each looks to
 * the person reading the page.
 *
 * - **Shown** to the people who may restart or remove the harness, when the harness shares it.
 * - **Not shared**, to the same people, when the harness doesn't: the heading stands with a line
 *   saying so, so a group missing from one harness's agents isn't a mystery.
 * - **Hidden** from everybody else, as before.
 *
 * While a shown group's first copy is on its way, it stands in its place in its real shape, blank
 * (the apps' `Waiting`), so nothing under it moves when the copy lands.
 */

import { takesHeartbeats } from "./agentHeartbeat.js";
import { takesModels } from "./agentModel.js";
import { takesWindows } from "./agentWindow.js";
import { takesContextFiles } from "./context.js";
import { type Directory, harnessOf, nameOf } from "./events.js";
import type { WorkspaceModel } from "./model.js";
import { mayRemoveHarness } from "./removal.js";

export type SettingGroup = "model" | "heartbeat" | "window" | "context";
export type SettingLook = "shown" | "not_shared" | "hidden";

/** Each group's heading, the same on the phone and the web. */
export const SETTING_HEADINGS: Readonly<Record<SettingGroup, string>> = {
  model: "Model",
  heartbeat: "Heartbeat",
  window: "Context window",
  context: "Context",
};

const SHARES: Readonly<Record<SettingGroup, (directory: Directory, harnessId: string) => boolean>> =
  {
    model: takesModels,
    heartbeat: takesHeartbeats,
    window: takesWindows,
    context: takesContextFiles,
  };

/** How one of an agent's groups looks to this person. */
export function settingLook(
  workspace: WorkspaceModel,
  directory: Directory,
  agentId: string,
  selfId: string,
  group: SettingGroup,
): SettingLook {
  const harnessId = harnessOf(directory, agentId);
  if (directory[harnessId] === undefined) return "hidden";
  if (!mayRemoveHarness(workspace, directory, harnessId, selfId)) return "hidden";
  return SHARES[group](directory, harnessId) ? "shown" : "not_shared";
}

/** The line under a group's heading when its harness doesn't share it: "Codex doesn't share …". */
export function notSharedWords(group: SettingGroup, directory: Directory, agentId: string): string {
  const agent = nameOf(directory, agentId);
  const harness = nameOf(directory, harnessOf(directory, agentId));
  switch (group) {
    case "model":
      return `${harness} doesn't share ${agent}'s model with Chips.`;
    case "heartbeat":
      return `${harness} doesn't share a heartbeat for ${agent} with Chips.`;
    case "window":
      return `${harness} doesn't share how full ${agent}'s context is.`;
    default:
      return `${harness} doesn't share ${agent}'s context files with Chips.`;
  }
}

/**
 * The Context window group's line when its harness shares windows but hasn't sent this agent's
 * yet: an agent its harness has no reading of until it works (ADR 0238).
 */
export function windowNotYetWords(directory: Directory, agentId: string): string {
  const agent = nameOf(directory, agentId);
  const harness = nameOf(directory, harnessOf(directory, agentId));
  return `${harness} hasn't said how full ${agent}'s context is yet.`;
}

/** Whether a read failed because the server holds no copy (`404`), not because it went unanswered. */
export function noCopy(error: unknown): boolean {
  return (error as { readonly status?: unknown } | undefined)?.status === 404;
}
