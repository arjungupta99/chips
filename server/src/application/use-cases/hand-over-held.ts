/**
 * Hand over what Chips held, once a person acts (ADR 0097).
 *
 * Chips holds an agent's message to agents past the referee's ceiling, or while a person has
 * paused them, so the agents it named never hear it. Holding used to mean dropping: nothing was
 * handed over when the person spoke, and a handoff waited on an agent repeating itself (ADR
 * 0081's guard, the ASCII Art room). Now the first thing a person does in the room after a hold —
 * writes, answers, decides, adds somebody, lets the agents carry on — hands each agent the newest
 * held message that was for it, as `message.handed`, which its harness hears as `message.new`.
 * The older ones are the room's lines, which that turn is handed with it (ADR 0088).
 *
 * Who a held message was for is worked out again from what it said, as if nothing had been
 * held, among the agents in the room now. Runs after every append, whichever door made it.
 */

import {
  isAgentKind,
  mentionsEveryone,
  messageIdOf,
  resetsTheCount,
  resolveAddress,
} from "@chipschat/protocol";
import type { Clock, IdGenerator } from "../ports/clock.js";
import type { EventStore, StoredEvent } from "../ports/event-store.js";
import type { HeldMessageView, ReadModels } from "../ports/read-models.js";

export interface HandOverHeldDeps {
  readonly store: EventStore;
  readonly readModels: Pick<ReadModels, "exchangeOf" | "heldIn" | "membersOf">;
  readonly clock: Clock;
  readonly ids: IdGenerator;
}

/** Who a held message was for, had it not been held: the agents it named, chose or answered. */
function meantFor(message: HeldMessageView, agents: readonly string[]): string[] {
  return resolveAddress({
    sender: { id: message.author_id, kind: message.author_kind },
    mentioned: message.mentions,
    everyone: mentionsEveryone(message.text),
    ...(message.to === undefined ? {} : { to: message.to }),
    agents,
  }).addressed_to;
}

export function createHandOverHeld(deps: HandOverHeldDeps) {
  /** One `message.handed` for each agent the held messages were for: its newest, once. */
  async function handOver(
    room: { readonly workspaceId: string; readonly spaceId: string },
    held: readonly HeldMessageView[],
    agents: readonly string[],
  ): Promise<void> {
    const handed = new Set<string>();
    // Newest first, so each agent is handed its newest.
    for (const message of held) {
      const fresh = meantFor(message, agents).filter((agentId) => !handed.has(agentId));
      for (const agentId of fresh) {
        handed.add(agentId);
        await deps.store.append({
          v: 1,
          type: "message.handed",
          id: deps.ids.next("event"),
          ts: deps.clock.nowIso(),
          workspace_id: room.workspaceId,
          space_id: room.spaceId,
          actor: { kind: "system", id: "system" },
          idempotency_key: `handed-${message.event_id}-${agentId}`,
          message_id: messageIdOf(message.event_id),
          agent_id: agentId,
        });
      }
    }
  }

  return {
    async after(event: StoredEvent): Promise<void> {
      const spaceId = event.space_id;
      if (event.actor.kind !== "person" || spaceId === null) return;
      if (!resetsTheCount(event.type, event.payload)) return;
      const workspaceId = event.workspace_id;
      // What was held since the act before this one was never handed over: that act handed over
      // what came before it.
      const before = await deps.readModels.exchangeOf(workspaceId, spaceId, {
        uptoSeq: event.seq - 1,
      });
      const after = before.personSeq ?? 0;
      const held = await deps.readModels.heldIn(workspaceId, spaceId, after, event.seq);
      if (held.length === 0) return;
      const agents = (await deps.readModels.membersOf(workspaceId, spaceId))
        .filter((member) => isAgentKind(member.kind) && member.removed !== true)
        .map((member) => member.participant_id);
      await handOver({ workspaceId, spaceId }, held, agents);
    },
  };
}
