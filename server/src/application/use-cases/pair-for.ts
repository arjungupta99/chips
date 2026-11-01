/**
 * Whom a device is paired as (ADR 0206): the person who made the code or allowed the ask, or,
 * from an owner, somebody else already in the workspace whose phone is new.
 *
 * 19 October 2026: Natalie deleted Chips from her phone and put it back. Her device key went with
 * it, she had no passkey, and there was no other device of hers to make a code; the invite Arjun
 * sent her was refused because somebody here goes by Natalie already. The only way back was to
 * remove her and invite her as somebody new, leaving everything she had said under a person who
 * was gone. An owner already lets people in and takes them out (ADR 0034, ADR 0160); this lets an
 * owner let a person back in, as themselves. An admin pairs only as themselves: an admin who could
 * pair a phone as a member could read as that member.
 */

import type { Principal } from "../ports/identity.js";
import type { ReadModels } from "../ports/index.js";

export type PairForFailure = {
  readonly kind: "not_allowed" | "unknown";
  readonly message: string;
};

export type PairFor =
  | { readonly ok: true; readonly participantId: string }
  | { readonly ok: false; readonly error: PairForFailure };

/** Whom `principal`'s code or allowing pairs a device as, when they name `forId`. */
export async function pairingFor(
  readModels: Pick<ReadModels, "participant">,
  principal: Principal,
  forId: string | undefined,
): Promise<PairFor> {
  if (forId === undefined || forId === principal.participantId) {
    return { ok: true, participantId: principal.participantId };
  }
  if (principal.kind !== "person" || principal.role !== "owner") {
    return {
      ok: false,
      error: { kind: "not_allowed", message: "Only an owner pairs a device for somebody else." },
    };
  }
  const person = await readModels.participant(principal.workspaceId, forId);
  if (person?.kind !== "person" || person.removed_at !== null) {
    return { ok: false, error: { kind: "unknown", message: "They aren't in this workspace." } };
  }
  return { ok: true, participantId: forId };
}
