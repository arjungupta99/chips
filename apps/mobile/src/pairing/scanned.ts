/**
 * What a scanned QR — or a pasted line — means.
 *
 * `pairingFromUrl` in `@chipschat/protocol` reads the payload, and it wants an object with an
 * origin, a query and a fragment. In a browser that is `location`; here it has to come from a
 * string, and `new URL` is the obvious way to get one. React Native's `URL` is a regex over a
 * string rather than the WHATWG parser — its `hash` stops at the first `/` — so the string is
 * split here instead, plainly, where it can be tested without a phone.
 *
 * A bare code is accepted too: somebody reads six characters off a screen and types them, and
 * the server address comes from the field beside it.
 */

import type { ServerReach } from "@chipschat/core";
import { type PairingPayload, pairingFromUrl } from "@chipschat/protocol";

const CODE = /^[A-Za-z2-9]{3}-[A-Za-z2-9]{3}$/;

/** `http://host:4431/path?q#frag` → the three parts `pairingFromUrl` reads. */
export function partsOf(text: string): {
  readonly origin?: string | undefined;
  readonly search: string;
  readonly hash: string;
} {
  const hashAt = text.indexOf("#");
  const hash = hashAt === -1 ? "" : text.slice(hashAt);
  const head = hashAt === -1 ? text : text.slice(0, hashAt);
  const queryAt = head.indexOf("?");
  const search = queryAt === -1 ? "" : head.slice(queryAt);
  const origin = /^https?:\/\/[^/?#]+/.exec(head)?.[0];
  return { ...(origin === undefined ? {} : { origin }), search, hash };
}

/**
 * The payload in whatever was scanned or typed. Nothing when it is not a pairing offer at all —
 * a phone points its camera at a great many QR codes that are not this.
 */
export function scanned(text: string): PairingPayload | undefined {
  const trimmed = text.trim();
  if (trimmed === "") return undefined;
  if (CODE.test(trimmed)) {
    return pairingFromUrl({ search: "", hash: `#pair=${trimmed.toUpperCase()}` });
  }
  return pairingFromUrl(partsOf(trimmed));
}

/**
 * The pairing link in a pasted message, when there is one: the line an owner sends from a
 * person's page for that person's new phone (ADR 0206), with words around it. A link only, never a
 * bare code: six characters in a message say nothing about where the server is.
 */
export function pairingLinkIn(text: string): string | undefined {
  return text
    .split(/\s+/)
    .find((word) => /[?#&]pair=/.test(word) && pairingFromUrl(partsOf(word)) !== undefined);
}

/**
 * What `pairDevice` is called with, or what to tell the person instead: the code, the server's
 * address, and beside it the key to shake hands against and the relay when there is one.
 */
export type Offer =
  | ({
      readonly ok: true;
      readonly code: string;
      readonly lan: string;
    } & ServerReach)
  | { readonly ok: false; readonly problem: string };

/**
 * The scanned or typed text, and the address beside it, resolved into the four arguments
 * pairing takes. The QR carries its own address and the server's key (ADR 0191); a typed code
 * carries neither, which is the only reason the field beside it exists, and the key comes with
 * the pairing's answer. A key is kept on its own; a relay only with a key, since a relay cannot
 * be asked for a server without one.
 */
export function offerFrom(text: string, typedAddress = ""): Offer {
  const payload = scanned(text);
  if (payload === undefined) {
    return { ok: false, problem: "That is not a Chips pairing code." };
  }
  const lan = payload.lan ?? typedAddress.trim();
  if (lan === "") {
    return { ok: false, problem: "Add the server's address — the QR usually carries it." };
  }
  return {
    ok: true,
    code: payload.code,
    lan,
    ...(payload.key === undefined ? {} : { serverKey: payload.key }),
    ...(payload.key === undefined || payload.relay === undefined
      ? {}
      : { relayUrl: payload.relay }),
  };
}
