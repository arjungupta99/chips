/**
 * A room with two or more agents has a lead, unless a person said nobody leads it (ADR 0291).
 *
 * What Chips does for a room gone still (ADR 0104), and for work an agent did not pick up (ADR
 * 0291), goes through the room's lead. Only a room asked of a harness from the + was given one
 * (its claim's agent), so a room a person filled with agents themselves had none unless they
 * chose: three of the six rooms with several agents on 9 November 2026, for some of their time.
 *
 * So whenever an agent comes into a room or goes from it, and the room then has two or more agents
 * and no lead, the agent that has been there longest leads. A person's choice stands, whatever it
 * was: a lead they picked that is still there, or nobody. Runs after every append, whichever door
 * made it.
 */

import type { Clock, IdGenerator } from "../ports/clock.js";
import type { EventStore, StoredEvent } from "../ports/event-store.js";
import type { ReadModels } from "../ports/read-models.js";

export interface EnsureLeadDeps {
  readonly store: Pick<EventStore, "append">;
  readonly readModels: Pick<ReadModels, "membersOf" | "leadOf" | "lastLeadChoice" | "space">;
  readonly clock: Clock;
  readonly ids: IdGenerator;
}

/** What changes who is in a room. */
const MOVES: ReadonlySet<string> = new Set([
  "membership.added",
  "membership.removed",
  "membership.replaced",
]);

export function createEnsureLead(deps: EnsureLeadDeps) {
  const { readModels } = deps;

  /** The agent that should lead a room now, or nothing: it has a lead, too few agents, or a person said nobody. */
  async function toLead(workspaceId: string, spaceId: string): Promise<string | undefined> {
    const space = await readModels.space(workspaceId, spaceId);
    if (space?.state !== "open") return undefined;
    // In the order they joined: the first is the one there longest.
    const agents = (await readModels.membersOf(workspaceId, spaceId)).filter(
      (member) => member.kind === "agent" && member.removed !== true,
    );
    const [longest] = agents;
    if (longest === undefined || agents.length < 2) return undefined;
    if ((await readModels.leadOf(workspaceId, spaceId)) !== undefined) return undefined;
    // A person who said nobody leads meant it; a lead they chose that has since left did not.
    const chosen = await readModels.lastLeadChoice(workspaceId, spaceId);
    const nobody = chosen?.by_person === true && chosen.agent_id === null;
    return nobody ? undefined : longest.participant_id;
  }

  return {
    async after(event: StoredEvent): Promise<void> {
      const spaceId = event.space_id;
      if (spaceId === null || !MOVES.has(event.type)) return;
      const agentId = await toLead(event.workspace_id, spaceId);
      if (agentId === undefined) return;
      await deps.store.append({
        v: 1,
        type: "space.lead_set",
        id: deps.ids.next("event"),
        ts: deps.clock.nowIso(),
        workspace_id: event.workspace_id,
        space_id: spaceId,
        actor: { kind: "system", id: "system" },
        idempotency_key: `lead-longest-${spaceId}-at-${event.seq}`,
        agent_id: agentId,
      });
    },
  };
}

export type EnsureLead = ReturnType<typeof createEnsureLead>;
