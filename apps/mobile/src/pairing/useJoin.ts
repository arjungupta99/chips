/**
 * The ways a phone joins a Chips (ADR 0217's addendum of 26 October): a pairing code, scanned or
 * typed (M4.1, ADR 0038), and an invite, pasted or scanned (ADR 0164). Paired, the phone begins on
 * the new workspace and opens its Spaces, with nothing of the first screen left under it. The first
 * screen, its pairing code page and the full-screen film's end card all join through this.
 */

import { useRouter } from "expo-router";
import { useCallback } from "react";
import { useChips } from "../store/provider";
import { pairingLinkIn } from "./scanned";
import { type Pairing, usePairing } from "./usePairing";
import { type PasteInvite, usePasteInvite } from "./usePasteInvite";

/**
 * What the ways in paste through: an invite link, or a new phone's pairing link (ADR 0206), and how
 * that pairing is going. A pasted pairing link said nothing while it paired or when it failed: those
 * were the code page's alone (the onboarding audit, Part 2, item 21).
 */
export type JoinInvites = Pick<PasteInvite, "paste" | "pasted" | "problem"> & {
  readonly pairing?: Pick<Pairing, "working" | "failure"> | undefined;
};

export interface Join extends Pairing {
  /** Paste an invite link, or a new phone's pairing link (ADR 0206), which pastes where one does. */
  readonly invites: PasteInvite & JoinInvites;
  /** A scanned code: an invite opens its join card, and anything else is tried as a pairing code. */
  readonly scanned: (text: string) => void;
}

/**
 * `firstFailure`: what a pairing link that did not work has to say (`usePairingLink`). `onPaired`:
 * anything of the caller's to put away once the phone is in, as a camera over Spaces is.
 */
export function useJoin(firstFailure?: string, onPaired?: () => void): Join {
  const { began } = useChips();
  const router = useRouter();
  const pairing = usePairing(
    useCallback(
      (device) => {
        onPaired?.();
        began(device);
        // The pairing code page stands over the first screen: both go, film and all.
        if (router.canDismiss()) router.dismissAll();
        router.replace("/");
      },
      [began, router, onPaired],
    ),
    firstFailure,
  );
  const { pair } = pairing;
  const orPair = useCallback(
    (text: string) => {
      const link = pairingLinkIn(text);
      if (link === undefined) return false;
      pair(link);
      return true;
    },
    [pair],
  );
  const invites = usePasteInvite({ orPair });
  const { scanned: openInvite } = invites;
  const scanned = useCallback(
    (text: string) => {
      if (!openInvite(text)) pair(text);
    },
    [openInvite, pair],
  );
  const { working, failure } = pairing;
  return { ...pairing, invites: { ...invites, pairing: { working, failure } }, scanned };
}
