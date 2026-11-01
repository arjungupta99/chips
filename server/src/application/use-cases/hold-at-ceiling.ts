/**
 * A room's job at its spend ceiling (ADR 0118): Chips warns the room's harnesses at 80%, and at
 * the ceiling holds the agents until a person acts.
 *
 * Chips cannot refuse a run: `run.started` reports one already begun. What it can do is the
 * referee's pause (ADR 0097), which holds every message an agent sends an agent in the room, and
 * stops the lead being handed what was nobody's turn. So after each `usage` in a room, the job's
 * spend (ADR 0117) is read against the room's ceiling:
 *
 * - **From 80%:** `budget.warning` warn, scope `job`, to the room.
 * - **At the ceiling:** `exchange.set` paused by the system with `why: "spend"` and the figures,
 *   unless the agents are paused already, then `budget.warning` pause. A harness that chains turns
 *   itself starts no new one in the room; the room draws the banner with *Let them carry on*.
 *
 * Each is once per job: its key names the room and where the job began, so a run reporting after
 * the pause, or two reports at once, append nothing more. Letting the agents carry on, or anything
 * else a person does there, starts a new job, with the room's whole ceiling again (R1). A job whose
 * runs report no cost spends nothing, and is never held. Runs after every append, whichever door
 * made it, beside the hand-over of what was held.
 */

import { type JobSpend, spendStage } from "@chipschat/protocol";
import type { Clock, IdGenerator } from "../ports/clock.js";
import type { EventStore, StoredEvent } from "../ports/event-store.js";
import type { ReadModels } from "../ports/read-models.js";
import { roomSpendFor } from "../room-spend.js";

export interface HoldAtCeilingDeps {
  readonly store: EventStore;
  readonly readModels: Pick<ReadModels, "exchangeOf" | "jobSpendOf" | "spendCeilingOf">;
  readonly clock: Clock;
  readonly ids: IdGenerator;
}

interface Room {
  readonly workspaceId: string;
  readonly spaceId: string;
}

export function createHoldAtCeiling(deps: HoldAtCeilingDeps) {
  /** What Chips appends in a room, as Chips, under a key that makes it once per job. */
  function append(
    room: Room,
    key: string,
    event: { readonly type: string } & Record<string, unknown>,
  ) {
    return deps.store.append({
      v: 1,
      id: deps.ids.next("event"),
      ts: deps.clock.nowIso(),
      workspace_id: room.workspaceId,
      space_id: room.spaceId,
      actor: { kind: "system", id: "system" },
      idempotency_key: key,
      ...event,
    });
  }

  /** The agents paused at the ceiling, saying why, unless somebody paused them already. */
  async function pause(room: Room, job: string, spend: JobSpend): Promise<void> {
    const now = await deps.readModels.exchangeOf(room.workspaceId, room.spaceId);
    if (now.paused) return;
    await append(room, `${job}-paused`, {
      type: "exchange.set",
      state: "paused",
      why: "spend",
      spend,
    });
  }

  return {
    async after(event: StoredEvent): Promise<void> {
      if (event.type !== "usage" || event.space_id === null) return;
      const room = { workspaceId: event.workspace_id, spaceId: event.space_id };
      const spend = await roomSpendFor({
        readModels: deps.readModels,
        ...room,
        uptoSeq: event.seq,
      });
      const stage = spendStage(spend);
      if (stage === "within") return;
      const job = `spend-${room.spaceId}-${spend.since_seq}`;
      if (stage === "ceiling") await pause(room, job, spend);
      const at = stage === "ceiling" ? 100 : 80;
      await append(room, `${job}-${at}`, {
        type: "budget.warning",
        budget: { limit_usd: spend.ceiling_usd, spent_usd: spend.spent_usd },
        threshold: at,
        action: at === 100 ? "pause" : "warn",
        scope: "job",
        since_seq: spend.since_seq,
      });
    },
  };
}
