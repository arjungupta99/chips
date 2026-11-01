/**
 * Attachment caps, on the server's side (ADR 0047). The arithmetic — which cap applies, and the
 * sentence that refuses a file — is the protocol's, shared with every client. What is here reads
 * a cap event, and refuses one that reaches past the ceiling: a cap the server would never
 * apply is a lie in the log, and the person setting it deserves to hear so now.
 */

import { type AttachmentCaps, capsOverCeiling } from "@chipschat/protocol";
import type { Refusal } from "./authorize.js";

export const LIMITS_EVENT = "attachment.limits_set";

/** The caps an `attachment.limits_set` carries: a number, or `null` for the server's own. */
export function capsOf(event: Readonly<Record<string, unknown>>): AttachmentCaps {
  const read = (name: string): number | null => {
    const value = event[name];
    return typeof value === "number" ? value : null;
  };
  return { image: read("image_bytes"), video: read("video_bytes"), file: read("file_bytes") };
}

/** Nothing unless this is a cap event and one of its caps is above what the server takes. */
export function refuseCapsOverCeiling(
  event: Readonly<Record<string, unknown>>,
  ceiling: number | undefined,
): Refusal | undefined {
  if (event["type"] !== LIMITS_EVENT || ceiling === undefined) return undefined;
  const why = capsOverCeiling(capsOf(event), ceiling);
  return why === undefined ? undefined : { kind: "invalid", message: why };
}
