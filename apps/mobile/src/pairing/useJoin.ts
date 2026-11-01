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

export interface Join extends Pairing {
  /** Paste an invite link, or a new phone's pairing link (ADR 0206), which pastes where one does. */
  readonly invites: PasteInvite;
  /** A scanned code: an invite opens its join card, and anything else is tried as a pairing code. */
  readonly scanned: (text: string) => void;
}

/** `firstFailure`: what a pairing link that did not work has to say (`usePairingLink`). */
export function useJoin(firstFailure?: string): Join {
  const { began } = useChips();
  const router = useRouter();
  const pairing = usePairing(
    useCallback(
      (device) => {
        began(device);
        // The pairing code page stands over the first screen: both go, film and all.
        if (router.canDismiss()) router.dismissAll();
        router.replace("/");
      },
      [began, router],
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
  return { ...pairing, invites, scanned };
}
