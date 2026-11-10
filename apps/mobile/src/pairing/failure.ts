/**
 * What a failed pairing says. A `PairingError` is the server's own sentence and is shown as it
 * is. Anything else is the phone's — the network refused, a key could not be made, storage
 * would not open — and for an evening it was shown as *That did not work*, which sent the
 * blame to the code every time. The cause goes in the sentence now.
 *
 * A code for an address on the home network, with no relay to fall back on, fails the same way
 * forever on an iPhone whose owner said no to iOS's Local Network question: a fresh code can't
 * help, so the sentence says where that answer is changed. Before that, it says the phone has to be
 * on that computer's Wi-Fi, or the computer has to use the relay: a phone away from home was told
 * only to try a fresh code, which fails the same way (the onboarding audit, Part 2, item 17).
 */

import { PairingError } from "@chipschat/core";
import { hostOf } from "./elsewhere";

/** An address only the home network reaches: private IPv4, link-local, or an mDNS name. */
const HOME_NETWORK = /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.)|\.local$/;

/** What to do when a code for the home network, with no relay, didn't get through. */
const HOME_ONLY =
  "This phone has to be on the same Wi-Fi as that computer, unless Chips there uses the relay. On the same Wi-Fi? If you said no to Local Network, allow it in Settings → Privacy & Security → Local Network → Chips, then try a fresh code.";

/** Where the phone was trying to pair: the server's address, and its relay when it has one. */
export interface Tried {
  readonly lan: string;
  readonly relayUrl?: string | undefined;
}

function onHomeNetwork(tried: Tried | undefined): boolean {
  if (tried === undefined || tried.relayUrl !== undefined) return false;
  // `hostOf`, not `new URL`: React Native's URL is not the WHATWG parser (`scanned.ts`).
  return HOME_NETWORK.test(hostOf(tried.lan).replace(/:\d+$/, ""));
}

export function pairingFailure(error: unknown, tried?: Tried): string {
  if (error instanceof PairingError) return error.message;
  const said = error instanceof Error ? error.message : String(error);
  const cause = said.trim() === "" || said === "undefined" ? "no reason given" : said.trim();
  const then = onHomeNetwork(tried) ? HOME_ONLY : "Try a fresh code.";
  return `That did not work: ${cause.replace(/\.$/, "")}. ${then}`;
}
