/**
 * Push a decision to the phones that may answer it (M4.3, ADR 0045).
 *
 * Runs after an `approval.request` or `approval.routed` is in the log, beside `routeLane`.
 * What it sends carries no words about the ask: a fixed title, a fixed body, and two ids. The
 * phone reads the rest over its own authenticated socket, so the push service — and anything
 * else between here and the lock screen — learns that a decision exists and nothing about it.
 *
 * Before sending, each phone claims the key the browser's planner would claim for the same
 * ask, `decision:<approval id>`. That is what makes "exactly one notification per event per
 * person" hold across a laptop and a phone, and across two phones: a desktop that raised the
 * banner first leaves the phone quiet, and a person with two phones is buzzed on one of them.
 * Which one is settled before the claim — a phone where it is the middle of the night has
 * already been dropped by the domain.
 *
 * A phone whose push didn't go gives its claim back (ADR 0244). The person's computer asks once
 * more about a decision it was told was taken, so it raises the banner after all.
 *
 * Nothing here throws. A push that does not go is a push that does not go; the decision is in
 * the queue, on every screen, the moment anything looks.
 */

import type { Logger } from "@chipschat/platform";
import type { Phone, PushAsk, RoomMember } from "../../domain/index.js";
import { pushRecipients } from "../../domain/index.js";
import type { Clock } from "../ports/clock.js";
import type { StoredEvent } from "../ports/event-store.js";
import type { NotificationRegistry } from "../ports/notifications.js";
import type { PushMessage, PushRegistry, PushSender, PushTicket } from "../ports/push.js";
import type { ApprovalView, ReadModels } from "../ports/read-models.js";
import { sayPushed } from "../pushed.js";

/** The two words a push carries. Neither says anything about the ask. */
const TITLE = "A decision is waiting";
const BODY = "Approve or deny from here.";

/** The buttons the phone registered under this name: Approve (with Face ID) and Deny. */
const CATEGORY = "decision";

/** Longest a push is worth delivering, when the ask has no expiry of its own. */
const DEFAULT_TTL_SECONDS = 3600;

/** The events worth a push. Everything else in the log is somebody's screen to notice. */
const ABOUT = new Set(["approval.request", "approval.routed"]);

/** A claim the ledger granted for one phone: what to give back if its push doesn't go. */
interface Held {
  readonly participantId: string;
  readonly deviceId: string;
  readonly key: string;
}

export interface NotifyPushDeps {
  readonly readModels: Pick<ReadModels, "approval" | "membersOf" | "run">;
  readonly notifications: Pick<NotificationRegistry, "settings" | "claim" | "release">;
  readonly push: PushRegistry;
  readonly sender: PushSender;
  readonly clock: Clock;
  readonly logger: Logger;
}

export interface NotifyPush {
  /**
   * `resolution` is the `approval.resolved` a policy rule produced at ingest. When there is one
   * nobody is being asked anything, so nobody is told.
   */
  readonly after: (event: StoredEvent, resolution: StoredEvent | undefined) => Promise<void>;
}

/** Seconds until the ask expires, floored at a minute and capped at the default. */
function ttlFor(approval: ApprovalView, nowMs: number): number {
  if (approval.expires_at === null) return DEFAULT_TTL_SECONDS;
  const left = Math.floor((Date.parse(approval.expires_at) - nowMs) / 1000);
  if (Number.isNaN(left)) return DEFAULT_TTL_SECONDS;
  return Math.max(60, Math.min(DEFAULT_TTL_SECONDS, left));
}

function messageFor(to: string, deviceId: string, approval: ApprovalView): PushMessage {
  return {
    to,
    title: TITLE,
    body: BODY,
    categoryId: CATEGORY,
    priority: "high",
    // Ids and nothing else. The run is here because a decision made from the lock screen has
    // to name one, and the phone has no store open in the background to look it up in. The
    // device is the phone's in this workspace, so a phone holding several answers through the
    // right one (ADR 0197).
    data: {
      device_id: deviceId,
      approval_id: approval.approval_id,
      ...(approval.space_id === null ? {} : { space_id: approval.space_id }),
      ...(approval.run_id === null ? {} : { run_id: approval.run_id }),
    },
  };
}

export function createNotifyPush(deps: NotifyPushDeps): NotifyPush {
  /** The harness that asked: the actor when it asked, and the run's when somebody handed it on. */
  async function harnessOf(
    event: StoredEvent,
    approval: ApprovalView,
  ): Promise<string | undefined> {
    if (event.actor.kind === "harness") return event.actor.id;
    if (approval.run_id === null) return undefined;
    const run = await deps.readModels.run(event.workspace_id, approval.run_id);
    return run?.harness_id;
  }

  /** The room's people, as the domain reads them. Nobody, when the ask is in no room. */
  async function roomOf(event: StoredEvent, approval: ApprovalView): Promise<RoomMember[]> {
    const spaceId = approval.space_id ?? event.space_id;
    if (spaceId === null) return [];
    const members = await deps.readModels.membersOf(event.workspace_id, spaceId);
    return members.map((member) => ({
      id: member.participant_id,
      kind: member.kind,
      role: member.workspace_role ?? undefined,
    }));
  }

  /** Each person's settings, read once each however many phones they have. */
  async function settingsFor(
    workspaceId: string,
    phones: readonly Phone[],
  ): Promise<Map<string, Awaited<ReturnType<NotificationRegistry["settings"]>>>> {
    const people = [...new Set(phones.map((phone) => phone.participantId))];
    const read = await Promise.all(
      people.map(async (id) => [id, await deps.notifications.settings(workspaceId, id)] as const),
    );
    return new Map(read);
  }

  /** Delete the row behind a token the push service says is dead. */
  async function forgetDead(
    tickets: readonly PushTicket[],
    devices: readonly string[],
  ): Promise<void> {
    for (const [index, ticket] of tickets.entries()) {
      const deviceId = devices[index];
      if (ticket.error !== "DeviceNotRegistered" || deviceId === undefined) continue;
      await deps.push.remove(deviceId);
      deps.logger.info({ event: "push.forgotten", device_id: deviceId }, "push token is dead");
    }
  }

  /** The phones this ask may go to, before the ledger has had its say. */
  async function eligible(
    event: StoredEvent,
    approval: ApprovalView,
    at: string,
  ): Promise<ReturnType<typeof pushRecipients>> {
    const harnessId = await harnessOf(event, approval);
    const ask: PushAsk = {
      approvalId: approval.approval_id,
      harnessId: harnessId ?? "",
      approvers: approval.approvers,
    };
    const members = await roomOf(event, approval);
    const named = ask.approvers.length > 0 ? [...ask.approvers] : members.map((one) => one.id);
    const phones = await deps.push.forPeople(event.workspace_id, named);
    if (phones.length === 0) return [];
    return pushRecipients({
      ask,
      members,
      settings: await settingsFor(event.workspace_id, phones),
      phones,
      at: new Date(at),
    });
  }

  /** Claim each phone's key, and keep the ones the ledger granted. */
  async function claimEach(
    event: StoredEvent,
    recipients: ReturnType<typeof pushRecipients>,
    approval: ApprovalView,
    at: string,
  ): Promise<{ messages: PushMessage[]; held: Held[] }> {
    const messages: PushMessage[] = [];
    const held: Held[] = [];
    const ttl = ttlFor(approval, Date.parse(at));
    for (const recipient of recipients) {
      const granted = await deps.notifications.claim({
        workspaceId: event.workspace_id,
        participantId: recipient.participantId,
        deviceId: recipient.deviceId,
        keys: [recipient.key],
        at,
      });
      if (granted.length === 0) continue;
      messages.push({ ...messageFor(recipient.token, recipient.deviceId, approval), ttl });
      held.push(recipient);
    }
    return { messages, held };
  }

  /** Give back each claim whose push didn't go, so the person's computer may raise it. */
  async function giveBack(
    workspaceId: string,
    held: readonly Held[],
    tickets: readonly PushTicket[] | undefined,
  ): Promise<void> {
    for (const [index, one] of held.entries()) {
      if (tickets?.[index]?.ok === true) continue;
      await deps.notifications.release({
        workspaceId,
        participantId: one.participantId,
        deviceId: one.deviceId,
        keys: [one.key],
      });
    }
  }

  /** Send what was claimed, say what went, and settle the claims and tokens by the tickets. */
  async function send(
    workspaceId: string,
    approvalId: string,
    messages: readonly PushMessage[],
    held: readonly Held[],
  ): Promise<void> {
    let tickets: PushTicket[];
    try {
      tickets = await deps.sender.send(messages);
    } catch (error) {
      await giveBack(workspaceId, held, undefined);
      throw error;
    }
    sayPushed(deps.logger, tickets, "a decision", { approval_id: approvalId });
    await giveBack(workspaceId, held, tickets);
    await forgetDead(
      tickets,
      held.map((one) => one.deviceId),
    );
  }

  async function notify(event: StoredEvent): Promise<void> {
    // A push that cannot go claims no banner: the person's computer raises it (ADR 0244).
    if (deps.sender.readiness() !== "ready") return;
    const approvalId = event.payload["approval_id"];
    if (typeof approvalId !== "string") return;
    const approval = await deps.readModels.approval(event.workspace_id, approvalId);
    if (approval === undefined || approval.state !== "pending") return;

    const at = deps.clock.nowIso();
    const recipients = await eligible(event, approval, at);
    if (recipients.length === 0) return;

    const { messages, held } = await claimEach(event, recipients, approval, at);
    if (messages.length === 0) return;
    await send(event.workspace_id, approvalId, messages, held);
  }

  return {
    async after(event, resolution) {
      if (!ABOUT.has(event.type)) return;
      // A rule already answered it. Nobody is being asked, so nobody is told.
      if (resolution !== undefined) return;
      try {
        await notify(event);
      } catch (error) {
        // A push is best effort, and an append is not: whatever went wrong here, the event is
        // in the log and every screen already has it.
        deps.logger.warn(
          { event: "push.failed", why: error instanceof Error ? error.message : String(error) },
          "a decision could not be pushed",
        );
      }
    },
  };
}
