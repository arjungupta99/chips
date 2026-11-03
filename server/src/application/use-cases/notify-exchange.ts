/**
 * Tell the room's people when the agents need them (ADR 0097): the first warning of a stretch of
 * talk between agents, and the first message Chips holds. Blocked is loud — a banner in the room,
 * a mark on its row, and this — once for each person: the claim ledger grants
 * `warning:<room>:<reset>` and `held:<room>:<reset>` to one device of each, as it does a
 * decision's key. Nobody looking at the room would need it, but the server cannot yet say who
 * is (`exchangeOf`), so the room's people are told.
 *
 * As notify-push's rule says: fixed words and ids, nothing about what the agents said. Quiet
 * hours are kept; this is never worth breaking through them. Nothing here throws.
 */

import type { Logger } from "@chipschat/platform";
import { exchangeFactsOf, isAgentKind } from "@chipschat/protocol";
import { inQuietHours } from "../../domain/index.js";
import type { Clock } from "../ports/clock.js";
import type { StoredEvent } from "../ports/event-store.js";
import type { NotificationRegistry } from "../ports/notifications.js";
import type { PushMessage, PushRegistry, PushSender } from "../ports/push.js";
import type { ReadModels } from "../ports/read-models.js";
import { sayPushed } from "../pushed.js";

const WORDS = {
  held: { title: "Chips paused the agents", body: "Open the space to let them carry on." },
  warning: { title: "The agents need a look", body: "They have been talking among themselves." },
} as const;

/** Longest such a push is worth delivering: after that, the room says it better. */
const TTL_SECONDS = 1800;

export interface NotifyExchangeDeps {
  readonly readModels: Pick<ReadModels, "exchangeOf" | "membersOf">;
  readonly notifications: Pick<NotificationRegistry, "settings" | "claim">;
  readonly push: Pick<PushRegistry, "forPeople">;
  readonly sender: PushSender;
  readonly clock: Clock;
  readonly logger: Logger;
}

export function createNotifyExchange(deps: NotifyExchangeDeps) {
  /** The room's people's phones outside their quiet hours, each with the key it would claim. */
  async function tell(
    event: StoredEvent,
    spaceId: string,
    stage: "held" | "warning",
    reset: number,
  ) {
    // A push that cannot go claims no banner: the person's computer raises it (ADR 0244).
    if (deps.sender.readiness() !== "ready") return;
    const members = await deps.readModels.membersOf(event.workspace_id, spaceId);
    const people = members
      .filter((member) => member.kind === "person" && member.removed !== true)
      .map((member) => member.participant_id);
    const phones = await deps.push.forPeople(event.workspace_id, people);
    const at = deps.clock.nowIso();
    const key = `${stage}:${spaceId}:${reset}`;
    const messages: PushMessage[] = [];
    for (const phone of phones) {
      const settings = await deps.notifications.settings(event.workspace_id, phone.participantId);
      if (inQuietHours(settings, new Date(at), phone.timeZone)) continue;
      const granted = await deps.notifications.claim({
        workspaceId: event.workspace_id,
        participantId: phone.participantId,
        deviceId: phone.deviceId,
        keys: [key],
        at,
      });
      if (granted.length === 0) continue;
      messages.push({
        to: phone.token,
        title: WORDS[stage].title,
        body: WORDS[stage].body,
        priority: "default",
        ttl: TTL_SECONDS,
        data: { device_id: phone.deviceId, space_id: spaceId },
      });
    }
    if (messages.length === 0) return;
    sayPushed(deps.logger, await deps.sender.send(messages), "the agents' talk", {
      space_id: spaceId,
      stage,
    });
  }

  async function notify(event: StoredEvent, spaceId: string): Promise<void> {
    const nowMs = deps.clock.nowMs();
    const stretch = await deps.readModels.exchangeOf(event.workspace_id, spaceId, {
      uptoSeq: event.seq,
    });
    // Somebody with the room open sees the room say it; nobody needs a push then.
    if (stretch.personLooking === true) return;
    const facts = exchangeFactsOf(stretch, { nowMs });
    const stage =
      event.payload["held"] === true ? "held" : facts.stage === "warning" ? "warning" : undefined;
    if (stage !== undefined) await tell(event, spaceId, stage, facts.since.seq);
  }

  return {
    async after(event: StoredEvent): Promise<void> {
      if (event.type !== "message.post" || event.space_id === null) return;
      if (!isAgentKind(event.actor.kind)) return;
      try {
        await notify(event, event.space_id);
      } catch (error) {
        deps.logger.warn(
          { event: "push.failed", why: error instanceof Error ? error.message : String(error) },
          "the agents' talk could not be pushed",
        );
      }
    },
  };
}

export type NotifyExchange = ReturnType<typeof createNotifyExchange>;
