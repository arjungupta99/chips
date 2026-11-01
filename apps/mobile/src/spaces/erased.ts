/**
 * What the phone keeps of a room beside the store, let go of when the room is erased from the
 * server (ADR 0067): the draft in its composer, the files kept for its attachments, and any
 * answer to one of its asks still waiting to be sent from the lock screen. The store has already
 * dropped the room, its events and its cache (`onErased` in core); these are the phone's own.
 */

import type { Space } from "@chipschat/core";
import { forgetSpace } from "../push/queue";
import { forgetDraft } from "./Composer";
import { forgetKept } from "./local";

export function letGoOf(spaces: readonly Space[]): void {
  const files: string[] = [];
  for (const space of spaces) {
    forgetDraft(space.id);
    void forgetSpace(space.id).catch(() => undefined);
    for (const line of space.lines) {
      for (const attachment of line.attachments ?? []) files.push(attachment.id);
    }
  }
  void forgetKept(files).catch(() => undefined);
}
