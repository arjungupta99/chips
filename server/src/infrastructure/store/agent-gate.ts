/**
 * The one-room rule, asked inside the append's transaction (agents review, findings 5 to 8).
 *
 * Every path that puts an agent in a room ends in one of two events: `membership.added` naming an
 * agent, or `membership.replaced`, whose `to` is one. This reads what the domain's rule needs with
 * the transaction's own connection, after the event's row is in and before its projection is, so
 * what it reads is the workspace exactly as the event would find it. The store holds one writer at
 * a time, so two events that would each put the agent somewhere cannot both pass: the second reads
 * what the first wrote.
 *
 * Replaying the log does not come through here. History that predates the rule (an agent in
 * several rooms between the two upgrades) rebuilds as it was written.
 */

import { type AgentPlacement, type PlaceRefusal, refuseAgentInto } from "@chipschat/protocol";
import type { Transaction } from "kysely";
import type { IncomingEvent } from "../../application/ports/index.js";
import type { Database } from "../db/schema.js";

type Trx = Transaction<Database>;

/** The agent an event puts in a room, and whose place it takes there, or nothing. */
function placedBy(event: IncomingEvent): { agentId: string; replacing?: string } | undefined {
  if (typeof event["space_id"] !== "string") return undefined;
  if (event.type === "membership.added") {
    const id = event["participant_id"];
    return typeof id === "string" ? { agentId: id } : undefined;
  }
  if (event.type !== "membership.replaced") return undefined;
  const to = event["to"];
  const from = event["from"];
  if (typeof to !== "string") return undefined;
  return typeof from === "string" ? { agentId: to, replacing: from } : { agentId: to };
}

async function participantIn(trx: Trx, workspaceId: string, id: string) {
  return await trx
    .selectFrom("participants")
    .select(["id", "kind", "lead", "removed_at"])
    .where("workspace_id", "=", workspaceId)
    .where("id", "=", id)
    .executeTakeFirst();
}

/** The rule's facts for one agent and one room, read with the transaction's connection. */
async function placementOf(
  trx: Trx,
  workspaceId: string,
  spaceId: string,
  placed: { readonly agentId: string; readonly lead: boolean; readonly replacing?: string },
): Promise<AgentPlacement> {
  const room = await trx
    .selectFrom("spaces")
    .select(["id", "state", "home"])
    .where("workspace_id", "=", workspaceId)
    .where("id", "=", spaceId)
    .executeTakeFirst();
  const held = await trx
    .selectFrom("memberships")
    .select("space_id")
    .where("workspace_id", "=", workspaceId)
    .where("participant_id", "=", placed.agentId)
    .where("space_id", "!=", spaceId)
    .orderBy("joined_at", "desc")
    .limit(1)
    .executeTakeFirst();
  const here = await trx
    .selectFrom("memberships")
    .innerJoin("participants", (join) =>
      join
        .onRef("participants.id", "=", "memberships.participant_id")
        .onRef("participants.workspace_id", "=", "memberships.workspace_id"),
    )
    .select(["participants.id as id", "participants.lead as lead"])
    .where("memberships.workspace_id", "=", workspaceId)
    .where("memberships.space_id", "=", spaceId)
    .where("participants.kind", "=", "agent")
    .execute();
  const others = here.filter((each) => each.id !== placed.agentId && each.id !== placed.replacing);
  const replaced = here.find((each) => each.id === placed.replacing);
  return {
    agent: { id: placed.agentId, lead: placed.lead },
    room:
      room === undefined
        ? null
        : { space_id: room.id, state: room.state ?? "open", home: room.home === 1 },
    elsewhere: held?.space_id ?? null,
    others: others.length,
    replacesLead: replaced?.lead === 1,
  };
}

/**
 * Why the store will not take this event, or nothing when it will. Only an event that puts an
 * agent in a room is asked about; everything else costs one comparison.
 */
export async function agentGate(trx: Trx, event: IncomingEvent): Promise<PlaceRefusal | undefined> {
  const placed = placedBy(event);
  if (placed === undefined) return undefined;
  const agent = await participantIn(trx, event.workspace_id, placed.agentId);
  if (agent?.kind !== "agent") return undefined;
  const placement = await placementOf(trx, event.workspace_id, String(event["space_id"]), {
    ...placed,
    lead: agent.lead === 1,
  });
  // A deleted agent is in no room again (ADR 0095), whichever path would put it in one.
  return refuseAgentInto({
    ...placement,
    agent: { ...placement.agent, deleted: agent.removed_at !== null },
  });
}
