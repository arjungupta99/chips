/**
 * The pairing payload (M4.1, ADR 0038): what a QR carries, and what `POST /v1/pairing-codes`
 * answers beside the code.
 *
 * Since Gate 2 a QR has been an address with the code in its fragment —
 * `http://192.168.1.20:4431/#pair=ABC-234` — which a phone's camera opens and the page reads.
 * That stays the shape. What joins it, in the same fragment, is everything else a phone needs
 * to reach the server when it is not on that network: the relay to dial, the server's tunnel
 * key to ask for there and to authenticate it by, a version, and a list of candidate addresses
 * for a direct path across the internet that is empty in v0. A QR without a version is one
 * from before this, and reads as a code alone.
 *
 * The fragment rather than the query, as before: a fragment never reaches a server's log.
 */

import { z } from "zod";
import { candidateAddresses } from "./relay.js";

/** The payload's version. Bumped when a field's meaning changes, never for a new field. */
export const PAIRING_VERSION = 1;

/** Six characters from thirty-two, in two groups, as `chips serve` prints them. */
export const pairingCode = z.string().regex(/^[A-Z2-9]{3}-[A-Z2-9]{3}$/, "a pairing code");

/**
 * A code as somebody typed it, in the form a code is compared in (SEC-6): upper case, the dash
 * put back after the third character, whatever else was typed between the characters dropped.
 * Anything that is not six characters of the alphabet comes back as typed, trimmed, which no code
 * matches.
 */
export function pairingCodeTyped(typed: string): string {
  const characters = typed.toUpperCase().replace(/[^A-Z2-9]/g, "");
  if (characters.length !== 6) return typed.trim().toUpperCase();
  return `${characters.slice(0, 3)}-${characters.slice(3)}`;
}

/** The server's tunnel key: thirty-two bytes, base64url without padding. */
export const serverKey = z.string().regex(/^[A-Za-z0-9_-]{43}$/, "a server key");

export const pairingPayload = z.object({
  v: z.int().nonnegative().describe("0 for a QR from before M4.1, which carries a code alone."),
  code: pairingCode,
  lan: z
    .url({ protocol: /^https?$/ })
    .optional()
    .describe("The server on the network it is on. Tried first, on a short timeout."),
  relay: z
    .url({ protocol: /^wss?$/ })
    .optional()
    .describe("The relay the server dials out to, when it has one."),
  key: serverKey
    .optional()
    .describe(
      "The server's tunnel key: asked for at the relay, and what the tunnel authenticates.",
    ),
  candidates: candidateAddresses,
});

export type PairingPayload = z.infer<typeof pairingPayload>;

/** What a server offers beside a code, and what a QR carries beside it. */
export interface PairingOffer {
  readonly relay?: string | undefined;
  readonly key?: string | undefined;
  /**
   * The server on its network, when that is not the address the QR opens: a page served from
   * somewhere else — the desktop app — names the server it is paired with here.
   */
  readonly lan?: string | undefined;
}

/**
 * The text a QR carries: the address the phone should try first, with the code and the rest in
 * the fragment. `base` is that address — the LAN address when the server is bound to the
 * network, else its own.
 */
export function pairingUrl(base: string, code: string, offer: PairingOffer = {}): string {
  const fields = new URLSearchParams({ pair: code, v: String(PAIRING_VERSION) });
  if (offer.relay !== undefined && offer.relay !== "") fields.set("relay", offer.relay);
  if (offer.key !== undefined && offer.key !== "") fields.set("key", offer.key);
  if (offer.lan !== undefined && offer.lan !== "" && offer.lan !== base)
    fields.set("lan", offer.lan);
  return `${base.replace(/\/$/, "")}/#${fields.toString()}`;
}

/**
 * The same payload as a link the installed app opens: `chips://pair?pair=ABC-234&v=1&lan=…`.
 *
 * A QR's address opens in a browser, and a browser makes a device key only on a secure origin,
 * which a server's plain-HTTP address on a home network or a tailnet never is. The app has no
 * such rule. So a page that cannot pair offers this link instead, and `pnpm phone` hands it to
 * the app directly at launch, with nobody typing anything. The server's address travels in the
 * query as `lan`, because a `chips://` link has no origin of its own to fall back on.
 */
export function appPairingUrl(server: string, code: string, offer: PairingOffer = {}): string {
  const fields = new URLSearchParams({ pair: code, v: String(PAIRING_VERSION) });
  fields.set("lan", (offer.lan ?? server).replace(/\/$/, ""));
  if (offer.relay !== undefined && offer.relay !== "") fields.set("relay", offer.relay);
  if (offer.key !== undefined && offer.key !== "") fields.set("key", offer.key);
  return `chips://pair?${fields.toString()}`;
}

/** The page a phone's pairing QR opens at (the install plan, §3.2): on chipschat.ai, whoever runs the server. */
export const PHONE_PAIR_PAGE = "https://chipschat.ai/p";

/** Chips for iPhone and iPad on the App Store, for somebody who has no Chips yet. */
export const APP_STORE_LINK = "https://apps.apple.com/app/id6824148802";

/** Where to get Chips for a computer: Chips for Mac, and the install line for the rest. */
export const MAC_DOWNLOAD = "https://chipschat.ai/download";

/**
 * The link a phone's QR carries (the install plan, §3.2):
 * `https://chipschat.ai/p#pair=ABC-234&v=1&lan=http://…&relay=wss://…&key=…`.
 *
 * It is an ordinary address, so the iPhone's camera opens it. With Chips installed it is a
 * universal link and the app pairs (`applinks:chipschat.ai`); without Chips the page says where to
 * get it, and once it is installed hands the same payload to the app as `chips://pair?…`. The
 * payload is the fragment, which never leaves the phone: the page reads it there and sends it
 * nowhere. An app from before this link reads it in its own scanner as it reads any `#pair=`
 * address, taking the server from `lan`, so the server's address always travels in it.
 */
export function phonePairingUrl(server: string, code: string, offer: PairingOffer = {}): string {
  const fields = new URLSearchParams({ pair: code, v: String(PAIRING_VERSION) });
  fields.set("lan", (offer.lan ?? server).replace(/\/$/, ""));
  if (offer.relay !== undefined && offer.relay !== "") fields.set("relay", offer.relay);
  if (offer.key !== undefined && offer.key !== "") fields.set("key", offer.key);
  return `${PHONE_PAIR_PAGE}#${fields.toString()}`;
}

/** Whether a link is a phone's pairing link at `chipschat.ai/p`, the path the app claims. */
export function isPhonePairingLink(link: string): boolean {
  return /^https:\/\/chipschat\.ai\/p(?:[?#]|$)/i.test(link.trim());
}

/** Where a pairing link opens at a relay (ADR 0210): the page a computer is sent to. */
export const RELAY_PAIR_PATH = "/pair";

/**
 * The link a phone sends a computer to pair it, when the server has a relay (ADR 0210): the relay's
 * own page, with the payload in its fragment and the server beside it as `lan`. The relay is on the
 * open internet where the server may not be, so the link opens on any network; the page hands the
 * payload to Chips for Mac as `chips://pair?…`, or to the server's own page for a browser on its
 * network. The fragment never reaches the relay. `until` is when the code runs out, in seconds, so
 * the page can say so instead of letting a pairing fail.
 *
 *   https://relay.chipschat.ai/pair#pair=ABC-234&v=1&lan=https://host&relay=wss://…&key=…&until=…
 */
export function pairRelayUrl(
  relay: string,
  code: string,
  offer: { readonly lan: string; readonly key: string; readonly until?: number | undefined },
): string {
  const page = /^https?:\/\/[^/?#]+/i.exec(relay.replace(/^ws(s?):\/\//i, "http$1://"))?.[0];
  if (page === undefined) throw new Error(`not a relay's address: ${relay}`);
  const lan = /^https?:\/\/[^/?#]+/i.exec(offer.lan)?.[0] ?? offer.lan.replace(/\/$/, "");
  const fields = new URLSearchParams({ pair: code, v: String(PAIRING_VERSION), lan });
  fields.set("relay", relay);
  fields.set("key", offer.key);
  if (offer.until !== undefined) fields.set("until", String(Math.floor(offer.until)));
  return `${page}${RELAY_PAIR_PATH}#${fields.toString()}`;
}

/**
 * The payload in a link somebody pasted (ADR 0210): the relay's page, the server's own page, or
 * the app's `chips://pair?…`. Nothing when it carries no code, and nothing for a relay page that
 * names no server, since its own origin is the relay's and no server answers there.
 */
export function pairingFromLink(text: string): PairingPayload | undefined {
  // A link copied out of a message may come with the message: the word that holds the code.
  const word = text.split(/\s+/).find((each) => each.includes("pair=")) ?? "";
  let url: URL;
  try {
    url = new URL(word);
  } catch {
    return undefined;
  }
  const payload = pairingFromUrl({ origin: url.origin, search: url.search, hash: url.hash });
  if (payload === undefined) return undefined;
  const named =
    new URLSearchParams(url.hash.replace(/^#/, "")).has("lan") || url.searchParams.has("lan");
  if (url.pathname === RELAY_PAIR_PATH && !named) return undefined;
  return payload;
}

/**
 * The payload in an address: the fragment first, and the query for a link somebody rewrote.
 * Nothing when there is no code. A QR from before M4.1 reads as version 0 with the code and,
 * when the address has an origin, that origin as the network to try.
 */
export function pairingFromUrl(url: {
  readonly origin?: string | undefined;
  readonly search: string;
  readonly hash: string;
}): PairingPayload | undefined {
  const fragment = new URLSearchParams(url.hash.replace(/^#/, ""));
  const query = new URLSearchParams(url.search);
  const field = (name: string) => query.get(name) ?? fragment.get(name);
  const code = field("pair");
  if (code === null || code === "") return undefined;

  const version = field("v");
  const origin =
    url.origin !== undefined && /^https?:\/\//.test(url.origin) ? url.origin : undefined;
  // The network address is the QR's own, unless the fragment names one: a page that is not the
  // server's says where the server is.
  const lan = field("lan") ?? origin;
  const parsed = pairingPayload.safeParse({
    v: version === null ? 0 : Number.parseInt(version, 10),
    code: code.trim().toUpperCase(),
    ...(lan === undefined || lan === null ? {} : { lan }),
    ...(field("relay") === null ? {} : { relay: field("relay") }),
    ...(field("key") === null ? {} : { key: field("key") }),
    candidates: [],
  });
  // A fragment that names a relay this version cannot read is still a code: the phone pairs on
  // the network it is on, which is the path that needs nothing from the fragment.
  if (parsed.success) return parsed.data;
  const plain = pairingPayload.safeParse({ v: 0, code: code.trim().toUpperCase(), candidates: [] });
  return plain.success ? plain.data : undefined;
}
