/**
 * Direct asks (ADR 0211, Phase 3): a guest on the relay asks the workspace's owners to share the
 * server's machine with them in Tailscale, so they can reach it at its own address as the owner
 * does. Chips carries the ask to the owners and Tailscale's share link back; the share itself is
 * made in the owner's Tailscale.
 *
 * Who: anybody in the workspace but an owner asks (an owner signs in to their own tailnet, which
 * the Go direct guide says); only an owner answers, since it is their machine and their Tailscale.
 * A link must be Tailscale's own, on https. An owner may keep the link for the next guest who
 * asks: the next owner to answer finds it filled in, and still sends it themselves.
 *
 * Three pushes, two fixed sentences and an id each (ADR 0045), one phone per person by the claim
 * ledger: the owners hear an ask is waiting; the guest hears it was shared; and the owner who
 * shared hears when the guest's socket arrives other than through the relay (`arrived`, which the
 * hub calls for every socket). Nothing here throws on a push.
 */

import type { Logger } from "@chipschat/platform";
import { type DirectAskView, shareLinkOf } from "@chipschat/protocol";
import type { Clock } from "../ports/clock.js";
import type { DirectAsk, DirectAskRegistry } from "../ports/direct-asks.js";
import type { Principal } from "../ports/identity.js";
import type { IdGenerator } from "../ports/index.js";
import type { NotificationRegistry } from "../ports/notifications.js";
import type { PushMessage, PushRegistry, PushSender, PushToken } from "../ports/push.js";
import type { ReadModels } from "../ports/read-models.js";
import type { SocketWay } from "../ports/relay-switch.js";
import { sayPushed } from "../pushed.js";

/** The sentences each push carries. None says who. */
export const DIRECT_PUSH_WORDS = {
  asked: {
    title: "A guest wants to connect directly",
    body: "Share your server with them in Tailscale.",
  },
  shared: { title: "Your server is shared with you", body: "Open Chips to go direct." },
  direct: {
    title: "Connected directly",
    body: "A guest you shared your server with is direct now.",
  },
} as const;

/** A day: an ask nobody has answered by then is still worth answering, and stays. */
const ASK_TTL_SECONDS = 86_400;

export interface DirectAsksDeps {
  readonly registry: DirectAskRegistry;
  readonly readModels: Pick<ReadModels, "peopleIn">;
  readonly notifications: Pick<NotificationRegistry, "claim">;
  readonly push: Pick<PushRegistry, "forPeople">;
  readonly sender: PushSender;
  readonly clock: Clock;
  readonly ids: IdGenerator;
  readonly logger: Logger;
}

/** An ask as the wire says it. */
export function directAskViewOf(ask: DirectAsk): DirectAskView {
  return {
    ask_id: ask.id,
    participant_id: ask.participantId,
    state: ask.state,
    trip_ms: ask.tripMs,
    link: ask.link,
    shared_by: ask.sharedBy,
    asked_at: ask.createdAt,
    shared_at: ask.sharedAt,
    direct_at: ask.directAt,
  };
}

export type DirectAskRefusal = {
  readonly kind: "not_allowed" | "not_found" | "taken" | "invalid";
  readonly message: string;
};

type Answer<T> = { ok: true; value: T } | { ok: false; error: DirectAskRefusal };

const refuse = <T>(kind: DirectAskRefusal["kind"], message: string): Answer<T> => ({
  ok: false,
  error: { kind, message },
});

const isOwner = (principal: Principal) => principal.kind === "person" && principal.role === "owner";

export function createDirectAsks(deps: DirectAsksDeps) {
  /** The push for each phone the claim ledger grants `key` to. */
  async function claimed(
    workspaceId: string,
    phones: readonly PushToken[],
    key: string,
    push: (phone: PushToken) => PushMessage,
  ): Promise<PushMessage[]> {
    const at = deps.clock.nowIso();
    const messages: PushMessage[] = [];
    for (const phone of phones) {
      const granted = await deps.notifications.claim({
        workspaceId,
        participantId: phone.participantId,
        deviceId: phone.deviceId,
        keys: [key],
        at,
      });
      if (granted.length > 0) messages.push(push(phone));
    }
    return messages;
  }

  /** One push each to these people's phones, as the claim ledger grants `key` to one phone each. */
  async function pushTo(
    workspaceId: string,
    people: readonly string[],
    key: string,
    words: { readonly title: string; readonly body: string },
    data: Readonly<Record<string, string>>,
  ): Promise<void> {
    // A push that cannot go claims no banner: the person's computer raises it (ADR 0244).
    if (deps.sender.readiness() !== "ready") return;
    try {
      const phones = await deps.push.forPeople(workspaceId, people);
      const messages = await claimed(workspaceId, phones, key, (phone) => ({
        to: phone.token,
        ...words,
        priority: "high",
        ttl: ASK_TTL_SECONDS,
        data: { device_id: phone.deviceId, ...data },
      }));
      if (messages.length === 0) return;
      sayPushed(deps.logger, await deps.sender.send(messages), "a direct ask", { key });
    } catch (error) {
      deps.logger.warn(
        { event: "push.failed", why: error instanceof Error ? error.message : String(error) },
        "a direct ask could not be pushed",
      );
    }
  }

  /** A guest is direct: the owner who shared hears it. */
  function wentDirect(ask: DirectAsk): void {
    if (ask.sharedBy === null) return;
    void pushTo(
      ask.workspaceId,
      [ask.sharedBy],
      `direct-done:${ask.id}`,
      DIRECT_PUSH_WORDS.direct,
      {
        direct_done: ask.id,
      },
    );
  }

  async function owners(workspaceId: string): Promise<string[]> {
    return (await deps.readModels.peopleIn(workspaceId))
      .filter((person) => person.role === "owner")
      .map((person) => person.participant_id);
  }

  return {
    /**
     * A guest asks. Their ask still waiting, or already shared, is the one there is; a new ask is
     * made only when they have none or their last one is done.
     */
    async ask(principal: Principal, tripMs: number | undefined): Promise<Answer<DirectAsk>> {
      if (principal.kind !== "person" || isOwner(principal)) {
        return refuse("not_allowed", "An owner signs in to their own Tailscale; a guest asks one.");
      }
      const { workspaceId, participantId } = principal;
      const latest = await deps.registry.latestFor(workspaceId, participantId);
      if (latest !== undefined && latest.state !== "direct") return { ok: true, value: latest };
      const ask: DirectAsk = {
        id: deps.ids.next("direct"),
        workspaceId,
        participantId,
        deviceId: principal.deviceId ?? null,
        state: "asked",
        tripMs: tripMs === undefined ? null : Math.max(0, Math.round(tripMs)),
        link: null,
        sharedBy: null,
        createdAt: deps.clock.nowIso(),
        sharedAt: null,
        directAt: null,
      };
      await deps.registry.create(ask);
      void pushTo(
        workspaceId,
        await owners(workspaceId),
        `direct:${ask.id}`,
        DIRECT_PUSH_WORDS.asked,
        {
          direct_ask_id: ask.id,
        },
      );
      return { ok: true, value: ask };
    },

    /** The person's own newest ask, link and all, or nothing. */
    async mine(principal: Principal): Promise<Answer<DirectAsk | undefined>> {
      if (principal.kind !== "person") return refuse("not_allowed", "Only a person asks.");
      return {
        ok: true,
        value: await deps.registry.latestFor(principal.workspaceId, principal.participantId),
      };
    },

    /** For an owner: the asks waiting, and the link kept for the next guest. */
    async waiting(
      principal: Principal,
    ): Promise<Answer<{ asks: readonly DirectAsk[]; keptLink: string | undefined }>> {
      if (!isOwner(principal)) return refuse("not_allowed", "Only an owner answers direct asks.");
      const [asks, keptLink] = await Promise.all([
        deps.registry.waiting(principal.workspaceId),
        deps.registry.keptLink(principal.workspaceId),
      ]);
      return { ok: true, value: { asks, keptLink } };
    },

    /** For an owner: one ask, as a push names it, and the link kept. */
    async get(
      principal: Principal,
      id: string,
    ): Promise<Answer<{ ask: DirectAsk; keptLink: string | undefined }>> {
      if (!isOwner(principal)) return refuse("not_allowed", "Only an owner answers direct asks.");
      const ask = await deps.registry.get(principal.workspaceId, id);
      if (ask === undefined) return refuse("not_found", "No such ask.");
      return {
        ok: true,
        value: { ask, keptLink: await deps.registry.keptLink(principal.workspaceId) },
      };
    },

    /**
     * An owner answers with Tailscale's share link, kept for the next guest or not. The first
     * owner to answer is the one who did; another finds it taken.
     */
    async share(
      principal: Principal,
      input: { readonly id: string; readonly link: string; readonly keep: boolean },
    ): Promise<Answer<DirectAsk>> {
      if (!isOwner(principal)) return refuse("not_allowed", "Only an owner answers direct asks.");
      const link = shareLinkOf(input.link);
      if (link === undefined) {
        return refuse("invalid", "Paste the link Tailscale gives when you share the machine.");
      }
      const { workspaceId, participantId } = principal;
      const at = deps.clock.nowIso();
      const shared = await deps.registry.share(workspaceId, input.id, {
        link,
        by: participantId,
        at,
      });
      if (shared === undefined) {
        const there = await deps.registry.get(workspaceId, input.id);
        return there === undefined
          ? refuse("not_found", "No such ask.")
          : refuse("taken", "Another owner has answered this ask.");
      }
      await deps.registry.keep(
        workspaceId,
        input.keep ? { link, by: participantId, at } : undefined,
      );
      void pushTo(
        workspaceId,
        [shared.participantId],
        `direct-shared:${shared.id}`,
        DIRECT_PUSH_WORDS.shared,
        {
          direct_shared: shared.id,
        },
      );
      return { ok: true, value: shared };
    },

    /** For an owner: forget the link kept for the next guest (the Relay page, Phase 4). */
    async forget(principal: Principal): Promise<Answer<undefined>> {
      if (!isOwner(principal)) return refuse("not_allowed", "Only an owner answers direct asks.");
      await deps.registry.keep(principal.workspaceId, undefined);
      return { ok: true, value: undefined };
    },

    /**
     * A socket opened: a guest whose ask was shared, arriving at the server's own address rather
     * than through the relay, is direct, and the owner who shared hears it.
     */
    async arrived(principal: Principal, via: SocketWay): Promise<void> {
      if (principal.kind !== "person" || via === "relay") return;
      try {
        const latest = await deps.registry.latestFor(
          principal.workspaceId,
          principal.participantId,
        );
        if (latest?.state !== "shared") return;
        const direct = await deps.registry.direct(
          latest.workspaceId,
          latest.id,
          deps.clock.nowIso(),
        );
        if (direct !== undefined) wentDirect(direct);
      } catch (error) {
        deps.logger.warn(
          {
            event: "direct.arrived_failed",
            why: error instanceof Error ? error.message : String(error),
          },
          "a direct arrival could not be recorded",
        );
      }
    },
  };
}

export type DirectAsks = ReturnType<typeof createDirectAsks>;
