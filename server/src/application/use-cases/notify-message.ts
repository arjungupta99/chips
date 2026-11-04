/**
 * Push a message to the people in its room who want it (ADRs 0158, 0198, 0216).
 *
 * Runs after a `message.post` is in the log, beside the decision's and the referee's pushes,
 * whoever said it: a person or an agent. The people it @s or was sent to from the field's list
 * (ADR 0204), and those who hear everything in that room, hear it on one phone each, outside their
 * quiet hours. Each person's word for the room (`spaces`) is "people" until they say otherwise, so
 * a person's message reaches everyone else in the room even when it was for an agent, while an
 * agent's pushes only those it @s: a reminder at 10 that @s you does. An agent's words also need
 * its harness's word to be everything. A room somebody hid from their list pushes them nothing
 * (ADR 0205).
 *
 * What leaves here is fixed words, two ids, and, for a phone that registered a key, the speaker's
 * name, the room's and the words, sealed to that phone. Its notification extension opens them
 * and shows them in place of the fixed words; anything between here and the lock screen sees
 * ciphertext. A phone with no key, or an extension that can't open it, shows the fixed words.
 */

import type { Logger } from "@chipschat/platform";
import { isAgentKind, messageIdOf, PUSH_WORDS } from "@chipschat/protocol";
import { messageRecipients, type Phone } from "../../domain/index.js";
import type { Clock } from "../ports/clock.js";
import type { StoredEvent } from "../ports/event-store.js";
import type { HiddenSpaceRegistry } from "../ports/hidden-spaces.js";
import type { NotificationRegistry } from "../ports/notifications.js";
import type { PushMessage, PushRegistry, PushSender, PushTicket } from "../ports/push.js";
import type { MemberView, ReadModels } from "../ports/read-models.js";
import { sayPushed } from "../pushed.js";
import { lockScreenLine, sealTo } from "../seal.js";

/** The words a push shows when nothing opens it. They say nothing of the message. */
const FOR_YOU = PUSH_WORDS.messageForYou.title;
const NEW = PUSH_WORDS.message.title;
const BODY = PUSH_WORDS.message.body;

/** How much of the message the lock screen gets, sealed. */
const WORDS = 240;

/** A message six hours late is no news; the room has it by then. */
const TTL_SECONDS = 6 * 60 * 60;

export interface NotifyMessageDeps {
  readonly readModels: Pick<ReadModels, "membersOf" | "space">;
  readonly notifications: Pick<NotificationRegistry, "settings" | "claim">;
  /** Who hid the room from their own list (ADR 0205). */
  readonly hidden: Pick<HiddenSpaceRegistry, "hidersOf">;
  readonly push: Pick<PushRegistry, "forPeople" | "remove">;
  readonly sender: PushSender;
  readonly clock: Clock;
  readonly logger: Logger;
}

export interface NotifyMessage {
  readonly after: (event: StoredEvent) => Promise<void>;
}

/** The people in the room now. */
function peopleIn(members: readonly MemberView[]): string[] {
  return members
    .filter((member) => member.kind === "person" && member.removed !== true)
    .map((member) => member.participant_id);
}

/**
 * The people a message is for by name: those it @s, and those its sender picked in the field's
 * list (`addressed_people`, ADR 0204), whom a pick tells as an @ would.
 */
function mentionsOf(event: StoredEvent): string[] {
  const named = [event.payload["mentions"], event.payload["addressed_people"]].flatMap((ids) =>
    Array.isArray(ids) ? ids : [],
  );
  return [...new Set(named)].filter((id): id is string => typeof id === "string");
}

export function createNotifyMessage(deps: NotifyMessageDeps): NotifyMessage {
  /** Each person's settings, read once each however many phones they have. */
  async function settingsFor(workspaceId: string, phones: readonly Phone[]) {
    const people = [...new Set(phones.map((phone) => phone.participantId))];
    const read = await Promise.all(
      people.map(async (id) => [id, await deps.notifications.settings(workspaceId, id)] as const),
    );
    return new Map(read);
  }

  /** Delete the row behind a token the push service says is dead. */
  async function forgetDead(tickets: readonly PushTicket[], devices: readonly string[]) {
    for (const [index, ticket] of tickets.entries()) {
      const deviceId = devices[index];
      if (ticket.error !== "DeviceNotRegistered" || deviceId === undefined) continue;
      await deps.push.remove(deviceId);
      deps.logger.info({ event: "push.forgotten", device_id: deviceId }, "push token is dead");
    }
  }

  /** What the sealed push shows: who said it, where, and the words. */
  async function wordsOf(event: StoredEvent, spaceId: string, speaker: MemberView | undefined) {
    const room = await deps.readModels.space(event.workspace_id, spaceId);
    const who =
      speaker?.held_name ??
      speaker?.display_name ??
      (isAgentKind(event.actor.kind) ? "An agent" : "Someone");
    const text = typeof event.payload["text"] === "string" ? event.payload["text"] : "";
    return JSON.stringify({
      title: room?.title ? `${who} · ${room.title}` : who,
      body: lockScreenLine(text, WORDS),
    });
  }

  /** The phones this message may go to, before the ledger has had its say; and who said it. */
  async function eligible(event: StoredEvent, spaceId: string, at: string) {
    const members = await deps.readModels.membersOf(event.workspace_id, spaceId);
    const speaker = members.find((member) => member.participant_id === event.actor.id);
    const people = peopleIn(members).filter((id) => id !== event.actor.id);
    const phones = people.length === 0 ? [] : await deps.push.forPeople(event.workspace_id, people);
    if (phones.length === 0) return { speaker, recipients: [] };
    const agent = isAgentKind(event.actor.kind);
    const recipients = messageRecipients({
      messageId: messageIdOf(event.id),
      spaceId,
      speakerId: event.actor.id,
      harnessId: agent
        ? (event.actor.harness_id ?? speaker?.harness_id ?? event.actor.id)
        : undefined,
      people,
      mentioned: mentionsOf(event),
      hidden: await deps.hidden.hidersOf(event.workspace_id, spaceId),
      settings: await settingsFor(event.workspace_id, phones),
      phones,
      at: new Date(at),
    });
    return { speaker, recipients };
  }

  /** Claim each phone's key, and seal the words to each phone the ledger granted. */
  async function claimEach(
    event: StoredEvent,
    spaceId: string,
    recipients: ReturnType<typeof messageRecipients>,
    words: string,
    at: string,
  ): Promise<{ messages: PushMessage[]; devices: string[] }> {
    const messages: PushMessage[] = [];
    const devices: string[] = [];
    for (const recipient of recipients) {
      const granted = await deps.notifications.claim({
        workspaceId: event.workspace_id,
        participantId: recipient.participantId,
        deviceId: recipient.deviceId,
        keys: [recipient.key],
        at,
      });
      if (granted.length === 0) continue;
      const sealed =
        recipient.sealKey === undefined ? {} : { sealed: sealTo(recipient.sealKey, words) };
      messages.push({
        to: recipient.token,
        // An @ is for the person; a room they hear everything in has something new.
        title: mentionsOf(event).includes(recipient.participantId) ? FOR_YOU : NEW,
        body: BODY,
        priority: "high",
        ttl: TTL_SECONDS,
        sound: "default",
        mutableContent: true,
        // The phone's device in this workspace (ADR 0197): one holding several opens the right one.
        data: {
          device_id: recipient.deviceId,
          space_id: spaceId,
          message_id: messageIdOf(event.id),
          ...sealed,
        },
      });
      devices.push(recipient.deviceId);
    }
    return { messages, devices };
  }

  async function notify(event: StoredEvent, spaceId: string): Promise<void> {
    // A push that cannot go claims no banner: the person's computer raises it (ADR 0244).
    if (deps.sender.readiness() !== "ready") return;
    const at = deps.clock.nowIso();
    const { speaker, recipients } = await eligible(event, spaceId, at);
    if (recipients.length === 0) return;
    const words = await wordsOf(event, spaceId, speaker);
    const { messages, devices } = await claimEach(event, spaceId, recipients, words, at);
    if (messages.length === 0) return;

    const tickets = await deps.sender.send(messages);
    sayPushed(deps.logger, tickets, "a message", {
      space_id: spaceId,
      message: messageIdOf(event.id),
    });
    await forgetDead(tickets, devices);
  }

  return {
    async after(event) {
      if (event.type !== "message.post" || event.space_id === null) return;
      try {
        await notify(event, event.space_id);
      } catch (error) {
        // Best effort: the words are in the room whatever happens here.
        deps.logger.warn(
          { event: "push.failed", why: error instanceof Error ? error.message : String(error) },
          "a message could not be pushed",
        );
      }
    },
  };
}
