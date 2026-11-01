/**
 * The owner's relay switch (ADR 0211, Phase 4): whether this server dials its relay, at run time.
 *
 * Off, the server stops dialling and its health says so; devices away from its own network
 * cannot connect until they go direct, and new invite and pairing links carry no relay, so they
 * open only where the server's own address does (Arjun's pick). Before it goes, `relay.set` is
 * written to the log, so every device connected hears it, those on the relay too, and can say why
 * it cannot connect after; the owner is answered at once, and the link is let go a moment later
 * (`TELL_MS`), so an owner who turned it off from a device on the relay hears it done too. On, it
 * dials again at once, and an off still waiting its moment does not follow.
 *
 * Who: an owner, since the relay is the server's and its traffic theirs to route. The switch is
 * one for the server, so a server holding several workspaces turns it for all of them; the change
 * is written to the workspace of the owner who turned it.
 *
 * An owner sees every device of the workspace with its way in: the way its socket goes now, if it
 * has one, the way its newest socket came, and when it last came other than through the relay.
 * The ones whose newest socket came through the relay are who would be cut off. "Ask them to go
 * direct first" sends their people a push (two fixed sentences, ADR 0045) that opens Connection,
 * where Go direct is; the switch stays where it is until the owner turns it.
 */

import type { Logger } from "@chipschat/platform";
import type { Clock } from "../ports/clock.js";
import type { DirectAskRegistry } from "../ports/direct-asks.js";
import type { EventStore } from "../ports/event-store.js";
import type { Principal } from "../ports/identity.js";
import type { IdGenerator } from "../ports/index.js";
import type { NotificationRegistry } from "../ports/notifications.js";
import type { PushMessage, PushRegistry, PushSender, PushToken } from "../ports/push.js";
import type {
  DeviceWay,
  RelayStatus,
  RelaySwitchRegistry,
  RelayTrouble,
  SocketWay,
} from "../ports/relay-switch.js";

/** The push to the people a relay switch would cut off. It says nobody's name. */
export const RELAY_ASK_WORDS = {
  title: "The relay is going off",
  body: "Go direct to keep reaching the server.",
} as const;

/** How long the devices have to hear `relay.set` before the relay is let go. */
export const TELL_MS = 2000;

/** A day: an ask nobody has seen by then is still worth seeing. */
const ASK_TTL_SECONDS = 86_400;

/** The link to the relay, as the switch drives it. */
export interface RelayLinkControl {
  /**
   * Whether a relay is set up at all. Since ADR 0245 a server always has one, its own
   * (`CHIPS_RELAY_URL`) or else Chips's, so this is true but in a test that says otherwise.
   */
  readonly configured: boolean;
  /** The relay it dials when on: the one `CHIPS_RELAY_URL` names, or Chips's. */
  readonly url: string;
  /** Dial the relay, or let it go. */
  readonly apply: (on: boolean) => Promise<void>;
  /** Whether the server is dialled in now. */
  readonly status: () => RelayStatus;
  /** Why not, while it is on and isn't: nothing once it is, or before its first try fails. */
  readonly trouble: () => RelayTrouble | undefined;
}

export interface RelaySwitchDeps {
  readonly registry: RelaySwitchRegistry;
  readonly directAsks: Pick<DirectAskRegistry, "keptLink">;
  readonly store: Pick<EventStore, "append">;
  readonly link: RelayLinkControl;
  /** The way each device of the workspace's sockets goes now, by device. */
  readonly liveWays: (workspaceId: string) => ReadonlyMap<string, SocketWay>;
  readonly notifications: Pick<NotificationRegistry, "claim">;
  readonly push: Pick<PushRegistry, "forPeople">;
  readonly sender: PushSender;
  readonly clock: Clock;
  readonly ids: IdGenerator;
  readonly logger: Logger;
  /** Waits; the tests' does not. */
  readonly wait?: ((ms: number) => Promise<void>) | undefined;
}

/** A device with the way its socket goes now, beside the way its newest came. */
export interface DeviceWayNow extends DeviceWay {
  readonly now: SocketWay | null;
}

export interface RelayView {
  readonly configured: boolean;
  /** The relay it dials when on, so an owner is told which before turning it on (ADR 0245). */
  readonly url: string;
  readonly on: boolean;
  /** Whether the server is dialled in now, and why not when it is on and isn't. */
  readonly status: RelayStatus;
  readonly why: RelayTrouble | null;
  readonly setBy: string | null;
  readonly setAt: string | null;
  readonly devices: readonly DeviceWayNow[];
  /** The Tailscale share link kept for the next guest (Phase 3), to forget from here. */
  readonly keptLink: string | undefined;
}

export type RelayRefusal = { readonly kind: "not_allowed" | "invalid"; readonly message: string };

type Answer<T> = { ok: true; value: T } | { ok: false; error: RelayRefusal };

const refuse = <T>(kind: RelayRefusal["kind"], message: string): Answer<T> => ({
  ok: false,
  error: { kind, message },
});

const isOwner = (principal: Principal) => principal.kind === "person" && principal.role === "owner";

const ONLY_OWNERS = "Only an owner turns the relay.";

/** The people with a device whose newest socket came through the relay, but the one asking. */
export function cutOff(devices: readonly DeviceWay[], but: string): string[] {
  return [
    ...new Set(
      devices
        .filter((device) => device.lastVia === "relay" && device.participantId !== but)
        .map((device) => device.participantId),
    ),
  ];
}

export function createRelaySwitch(deps: RelaySwitchDeps) {
  const wait = deps.wait ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));

  async function viewFor(workspaceId: string): Promise<RelayView> {
    const [current, ways, keptLink] = await Promise.all([
      deps.registry.current(),
      deps.registry.ways(workspaceId),
      deps.directAsks.keptLink(workspaceId),
    ]);
    const live = deps.liveWays(workspaceId);
    return {
      configured: deps.link.configured,
      url: deps.link.url,
      on: current.on,
      status: deps.link.status(),
      why: deps.link.trouble() ?? null,
      setBy: current.setBy,
      setAt: current.setAt,
      devices: ways.map((device) => ({ ...device, now: live.get(device.deviceId) ?? null })),
      keptLink,
    };
  }

  return {
    /** For an owner: the switch, every device with its way in, and the kept link. */
    async view(principal: Principal): Promise<Answer<RelayView>> {
      if (!isOwner(principal)) return refuse("not_allowed", ONLY_OWNERS);
      return { ok: true, value: await viewFor(principal.workspaceId) };
    },

    /**
     * An owner turns it. Off: the change is written first, so the devices on the relay hear it,
     * and the link goes a moment later. The same again changes nothing and writes nothing.
     */
    async set(principal: Principal, on: boolean): Promise<Answer<RelayView>> {
      if (!isOwner(principal)) return refuse("not_allowed", ONLY_OWNERS);
      if (!deps.link.configured) {
        return refuse("invalid", "This server has no relay to turn. Set CHIPS_RELAY_URL first.");
      }
      const { workspaceId, participantId } = principal;
      const current = await deps.registry.current();
      if (current.on === on) return { ok: true, value: await viewFor(workspaceId) };
      const at = deps.clock.nowIso();
      await deps.registry.set({ on, by: participantId, workspaceId, at });
      // On, the server names its relay before devices hear of it, so one that asks the server
      // for its relay the moment it hears is told it (the new-person sweep's finding 2).
      if (on) await deps.link.apply(true);
      const eventId = deps.ids.next("event");
      await deps.store.append({
        v: 1,
        type: "relay.set",
        id: eventId,
        ts: at,
        workspace_id: workspaceId,
        actor: { kind: "person", id: participantId },
        idempotency_key: `relay-set-${eventId}`,
        on,
      });
      if (on) deps.logger.info({ event: "relay.set", on }, "the relay is on");
      else letGo();
      return { ok: true, value: await viewFor(workspaceId) };
    },

    /**
     * An owner asks the people the switch would cut off to go direct first: one push to each,
     * which opens Connection. Returns how many people were asked.
     */
    async ask(principal: Principal): Promise<Answer<{ asked: number }>> {
      if (!isOwner(principal)) return refuse("not_allowed", ONLY_OWNERS);
      const { workspaceId, participantId } = principal;
      const people = cutOff(await deps.registry.ways(workspaceId), participantId);
      if (people.length > 0) void pushTo(workspaceId, people, `relay-ask:${deps.clock.nowMs()}`);
      return { ok: true, value: { asked: people.length } };
    },

    /** A person's device opened a socket, this way: kept for the owner's list. */
    async noteWay(principal: Principal, via: SocketWay): Promise<void> {
      if (principal.kind !== "person" || principal.deviceId === undefined) return;
      try {
        await deps.registry.noteWay(principal.deviceId, via, deps.clock.nowIso());
      } catch (error) {
        deps.logger.warn(
          {
            event: "relay.way_failed",
            why: error instanceof Error ? error.message : String(error),
          },
          "a device's way in could not be kept",
        );
      }
    },
  };

  /** The relay goes once the devices have had their moment, unless it was turned on since. */
  function letGo(): void {
    void (async () => {
      await wait(TELL_MS);
      if ((await deps.registry.current()).on) return;
      await deps.link.apply(false);
      deps.logger.info({ event: "relay.set", on: false }, "the relay is off");
    })().catch((error: unknown) =>
      deps.logger.warn(
        { event: "relay.off_failed", why: error instanceof Error ? error.message : String(error) },
        "the relay could not be let go",
      ),
    );
  }

  /** The ask to go direct, for each phone the claim ledger grants `key` to. */
  async function claimed(workspaceId: string, phones: readonly PushToken[], key: string) {
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
      if (granted.length === 0) continue;
      messages.push({
        to: phone.token,
        ...RELAY_ASK_WORDS,
        priority: "high",
        ttl: ASK_TTL_SECONDS,
        data: { device_id: phone.deviceId, relay_ask: "connection" },
      });
    }
    return messages;
  }

  /** One push to each person's phone, as the claim ledger grants `key` to one phone each. */
  async function pushTo(workspaceId: string, people: readonly string[], key: string) {
    // A push that cannot go claims no banner: the person's computer raises it (ADR 0244).
    if (deps.sender.readiness() !== "ready") return;
    try {
      const phones = await deps.push.forPeople(workspaceId, people);
      const messages = await claimed(workspaceId, phones, key);
      if (messages.length > 0) await deps.sender.send(messages);
    } catch (error) {
      deps.logger.warn(
        { event: "push.failed", why: error instanceof Error ? error.message : String(error) },
        "an ask to go direct could not be pushed",
      );
    }
  }
}

export type RelaySwitchUseCase = ReturnType<typeof createRelaySwitch>;
