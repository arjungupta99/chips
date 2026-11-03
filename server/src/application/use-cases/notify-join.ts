/**
 * Push a join request to the phones of the people who may decide it (ADR 0122): every owner and
 * admin, or for a link's request the one person it is asked of (ADR 0232), one phone each, as the claim ledger grants `join:<request id>` to the first device of a
 * person to ask. A phone that holds a socket hears the `join` frame as well and opens the sheet;
 * this is for the one in a pocket.
 *
 * As notify-push's rule says (ADR 0045): two fixed sentences and an id, nothing about who asks or
 * from where. The phone reads that over its own socket. Quiet hours are not kept: a request is
 * made because somebody is setting something up now, and it is gone in ten minutes. Nothing here
 * throws.
 */

import type { Logger } from "@chipschat/platform";
import { JOIN_CODE_SECONDS } from "@chipschat/protocol";
import { administers } from "../../domain/index.js";
import type { Clock } from "../ports/clock.js";
import type { NotificationRegistry } from "../ports/notifications.js";
import type { PushMessage, PushRegistry, PushSender } from "../ports/push.js";
import type { ReadModels } from "../ports/read-models.js";
import { sayPushed } from "../pushed.js";

/** The two sentences a push carries. Neither says who asks. */
export const JOIN_PUSH_WORDS = {
  title: "Something asks to join",
  body: "Check its code, then allow it or not.",
} as const;

export interface NotifyJoinDeps {
  readonly readModels: Pick<ReadModels, "peopleIn">;
  readonly notifications: Pick<NotificationRegistry, "claim">;
  readonly push: Pick<PushRegistry, "forPeople">;
  readonly sender: PushSender;
  readonly clock: Clock;
  readonly logger: Logger;
}

export function createNotifyJoin(deps: NotifyJoinDeps) {
  async function tell(workspaceId: string, requestId: string, to?: string): Promise<void> {
    // A push that cannot go claims no banner: the person's computer raises it (ADR 0244).
    if (deps.sender.readiness() !== "ready") return;
    const people =
      to === undefined
        ? (await deps.readModels.peopleIn(workspaceId))
            .filter((person) => administers(person.role))
            .map((person) => person.participant_id)
        : [to];
    const phones = await deps.push.forPeople(workspaceId, people);
    const at = deps.clock.nowIso();
    const messages: PushMessage[] = [];
    for (const phone of phones) {
      const granted = await deps.notifications.claim({
        workspaceId,
        participantId: phone.participantId,
        deviceId: phone.deviceId,
        keys: [`join:${requestId}`],
        at,
      });
      if (granted.length === 0) continue;
      messages.push({
        to: phone.token,
        ...JOIN_PUSH_WORDS,
        priority: "high",
        ttl: JOIN_CODE_SECONDS,
        data: { device_id: phone.deviceId, join_request_id: requestId },
      });
    }
    if (messages.length === 0) return;
    sayPushed(deps.logger, await deps.sender.send(messages), "a join request", {
      join_request_id: requestId,
    });
  }

  return {
    /** A request a requester has just started is waiting; `to`, the one person a link's asks. */
    async waiting(workspaceId: string, requestId: string, to?: string): Promise<void> {
      try {
        await tell(workspaceId, requestId, to);
      } catch (error) {
        deps.logger.warn(
          { event: "push.failed", why: error instanceof Error ? error.message : String(error) },
          "a join request could not be pushed",
        );
      }
    },
  };
}

export type NotifyJoin = ReturnType<typeof createNotifyJoin>;
