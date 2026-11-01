/**
 * A pairing offer that arrives as a link rather than through the camera.
 *
 * Three links carry one: `chips://pair?pair=ABC-234&v=1&lan=http://…`, which `pnpm phone`
 * launches the installed app with and a browser that cannot pair offers instead; the QR's own
 * `http://…/#pair=…` address, when the app is what opens it; and nothing else. All of them are
 * the payload the camera reads, differently wrapped, so `scanned` reads them.
 */

import { type Offer, offerFrom, scanned } from "./scanned";

/** The offer in a link, or nothing when the link is not about pairing (`chips://space/…`). */
export function pairingLink(url: string): Offer | undefined {
  if (scanned(url) === undefined) return undefined;
  return offerFrom(url);
}

/**
 * Whether two addresses name the same server: the same origin, however either is spelt. A device
 * paired before there was anywhere else to be has no address at all, and matches nothing.
 */
export function sameServer(known: string | undefined, offered: string): boolean {
  if (known === undefined || known.trim() === "") return false;
  return originOf(known) === originOf(offered);
}

/** `http://Host:4431/anything` → `http://host:4431`, by hand, since React Native's URL is a regex. */
function originOf(address: string): string {
  const trimmed = address.trim();
  const origin = /^https?:\/\/[^/?#]+/i.exec(trimmed)?.[0] ?? trimmed;
  return origin.replace(/\/$/, "").toLowerCase();
}
