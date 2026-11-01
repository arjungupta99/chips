/**
 * How a harness is shown what it reads (ADR 0087's addendum of 29 September, point 1). One that
 * has declared `agents` is shown agents as they are. One that has not is shown the view it knew:
 * its own agents are its own id, any other agent a harness, and nothing it has no words for. The
 * socket and every HTTP read a harness makes go through here, so it cannot be shown agents on
 * one door and itself on another.
 */

import {
  AGENT_EVENTS,
  HARNESS_CAPABILITIES,
  inLegacyView,
  type LegacyView,
} from "@chipschat/protocol";
import type { Principal } from "./ports/identity.js";
import type { ReadModels } from "./ports/index.js";

export interface HarnessSight {
  /** The harness's agents, archived ones too; a socket adds one registered while it is open. */
  readonly agents: Set<string>;
  /** The view to put what it reads into, or nothing when it speaks agents. */
  readonly legacy: LegacyView | undefined;
}

/** How this caller is shown things: read once per socket, and once per HTTP read. */
export async function sightOf(
  readModels: Pick<ReadModels, "participant" | "agentsOf">,
  principal: Principal,
): Promise<HarnessSight> {
  // A person's sight: agents as they are, and none of their own.
  if (principal.kind !== "harness") return { agents: new Set(), legacy: undefined };
  const { workspaceId, participantId } = principal;
  const [harness, agents] = await Promise.all([
    readModels.participant(workspaceId, participantId),
    readModels.agentsOf(workspaceId, participantId),
  ]);
  const own = new Set(agents.map((agent) => agent.agent_id));
  const speaks = harness?.capabilities?.includes(HARNESS_CAPABILITIES.agents) === true;
  return { agents: own, legacy: speaks ? undefined : { harnessId: participantId, own } };
}

/** What this sight is shown of a value: itself, or the value in the view it knew. */
export function shown<T>(value: T, sight: HarnessSight): T {
  return sight.legacy === undefined ? value : inLegacyView(value, sight.legacy);
}

/** Whether an event of this type is shown at all: the new ones are not, to one that knows none. */
export function shows(type: string, sight: HarnessSight): boolean {
  return sight.legacy === undefined || !AGENT_EVENTS.has(type);
}
