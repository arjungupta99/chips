/**
 * Deleting a message (ADR 0167): the words both apps say, so the phone and the desktop offer the
 * same two things and ask the same question.
 *
 * Delete for me asks nothing: it changes nobody else's room, and Undo is there for five seconds
 * (`UNDO_MS`). Delete for everyone cannot be undone, so it asks first, and says what an agent in
 * the room keeps: it has read the message already.
 */

import type { Asking } from "./putAway.js";

export const DELETE_FOR_ME = { label: "Delete for me", hint: "Only you stop seeing it" } as const;

export const DELETE_FOR_EVERYONE = {
  label: "Delete for everyone",
  hint: "Takes it off every screen in the space",
} as const;

/** What the pill says while Undo is offered. */
export const DELETED_FOR_YOU = "Deleted for you";

/**
 * The question before a message is deleted for everyone. `agents` is whether the room has an
 * agent in it, which has read the message already and keeps what it read.
 */
export function deleteForEveryoneAsking(agents: boolean): Asking {
  return {
    title: "Delete for everyone?",
    body: "It leaves every screen in this space, yours too, and a line says it was taken back.",
    note: agents
      ? "The agents here have read it already and keep what they read. This can’t be undone."
      : "This can’t be undone.",
    confirm: "Delete for everyone",
  };
}
