/**
 * Optimistic messages: what a person has sent that the server has not yet confirmed.
 *
 * A send shows up in the space the instant it happens, marked pending, so the app feels
 * immediate. When the server appends the message and streams it back — the person is a member,
 * so they see their own `message.post` — the real line arrives with the same idempotency key,
 * and the store drops the optimistic one. A message the server refuses stays, marked with the
 * reason, rather than vanishing or saying "sending…" for ever. Overlaying pending onto the
 * model is pure, so the merge is tested without a socket.
 */

import type { Attachment } from "./attachments.js";
import type { Line, SteerMode, WorkspaceModel } from "./model.js";
import type { OutboxEvent } from "./outbox.js";

export interface PendingMessage {
  /** The idempotency key the send carried, which the confirming event echoes. */
  readonly key: string;
  readonly spaceId: string;
  readonly authorId: string;
  readonly text: string;
  readonly ts: string;
  /** The server's reason for refusing it, once it has. */
  readonly failed?: string | undefined;
  /** For a steer sent from the composer: how it was meant. */
  readonly mode?: SteerMode | undefined;
  /** The files it carries, already uploaded. */
  readonly attachments?: readonly Attachment[] | undefined;
  /** Who the composer said it goes to (ADR 0081), until Chips says. */
  readonly addressedTo?: readonly string[] | undefined;
  /** Whether that was everyone in the room (ADR 0081). */
  readonly addressedToAll?: true | undefined;
  /** The people the field said it is for (ADR 0204), until Chips says. */
  readonly addressedPeople?: readonly string[] | undefined;
  /** The line it replies to (ADR 0219), so its card draws from the send. */
  readonly replyTo?: string | undefined;
}

/**
 * A pending message with the event it went out as, kept in the cache until the server answers
 * for it, so a message typed while the socket was down survives a reload of the page: the store
 * shows it as pending again and sends the same event, under the same key, when the socket next
 * opens (found 5 September 2026: a message typed while the server was down, then a reload, was
 * gone). A message the server refused is not kept — it stays on screen for the person to read
 * and does not go again on its own.
 */
export interface QueuedMessage {
  readonly message: PendingMessage;
  readonly event: OutboxEvent;
}

/** The model with each still-unconfirmed message shown as a pending line in its space. */
export function withPending(
  model: WorkspaceModel,
  pending: readonly PendingMessage[],
): WorkspaceModel {
  if (pending.length === 0) return model;

  const bySpace = new Map<string, PendingMessage[]>();
  for (const message of pending) {
    const list = bySpace.get(message.spaceId) ?? [];
    list.push(message);
    bySpace.set(message.spaceId, list);
  }

  const spaces = model.spaces.map((space) => {
    const extra = bySpace.get(space.id);
    if (extra === undefined) return space;
    const lines: Line[] = [...space.lines, ...extra.map(pendingLine)];
    return { ...space, lines };
  });

  return { ...model, spaces };
}

/** A message on its way, as a line: marked pending, and after every real line. */
function pendingLine(message: PendingMessage): Line {
  return {
    id: `pending:${message.key}`,
    // After every real line: a pending message is the newest thing in the space.
    seq: Number.MAX_SAFE_INTEGER,
    kind: "text" as const,
    authorId: message.authorId,
    authorKind: "person" as const,
    text: message.text,
    ts: message.ts,
    key: message.key,
    pending: true,
    ...(message.failed === undefined ? {} : { failed: message.failed }),
    ...(message.mode === undefined ? {} : { mode: message.mode }),
    ...(message.attachments === undefined || message.attachments.length === 0
      ? {}
      : { attachments: message.attachments }),
    ...(message.addressedTo === undefined ? {} : { addressedTo: message.addressedTo }),
    ...(message.addressedToAll === true ? { addressedToAll: true as const } : {}),
    ...(message.addressedPeople === undefined || message.addressedPeople.length === 0
      ? {}
      : { addressedPeople: message.addressedPeople }),
    ...(message.replyTo === undefined ? {} : { replyTo: message.replyTo }),
  };
}
