/**
 * Direct asks (ADR 0211, Phase 3): a guest asks the owners to share the server's machine with
 * them in Tailscale, and an owner answers with Tailscale's share link.
 *
 * The link is what an owner pastes and what the guest is handed. Only Tailscale's own, on https,
 * so a guest is never sent somewhere else by a slip of the paste. The server refuses anything
 * else; the apps hold Send until the field holds one. Read with a pattern rather than `new URL`,
 * whose host React Native does not always give.
 */

import { z } from "zod";
import { id, isoTimestamp } from "./primitives.js";

export const directAskState = z
  .enum(["asked", "shared", "direct"])
  .describe(
    "Asked and waiting for an owner; shared, the link sent; direct, the guest's socket arrived other than through the relay.",
  );

export const directAskView = z
  .object({
    ask_id: id("direct"),
    participant_id: id("person").describe("Who asked."),
    state: directAskState,
    trip_ms: z
      .int()
      .nonnegative()
      .nullable()
      .describe("Their round trip through the relay when they asked, in milliseconds."),
    link: z.string().max(2048).nullable().describe("Tailscale's share link, once shared."),
    shared_by: id("person").nullable().describe("The owner who answered."),
    asked_at: isoTimestamp,
    shared_at: isoTimestamp.nullable(),
    direct_at: isoTimestamp.nullable(),
  })
  .describe("A guest's ask to go direct, as `/v1/direct-asks` says it.");
export type DirectAskView = z.infer<typeof directAskView>;

/** https, a host that is tailscale.com or one of its names, then a path or nothing. */
const SHARE_LINK = /^https:\/\/(?:[a-z0-9-]+\.)*tailscale\.com(?:[/?#]\S*)?$/i;

/** The longest link taken. */
export const SHARE_LINK_MAX = 2048;

/** The link, trimmed, or nothing when it is not Tailscale's. */
export function shareLinkOf(text: string): string | undefined {
  const trimmed = text.trim();
  if (trimmed.length > SHARE_LINK_MAX) return undefined;
  return SHARE_LINK.test(trimmed) ? trimmed : undefined;
}
