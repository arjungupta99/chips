/**
 * An invite as a link carries it (ADR 0164): the token, and beside it what an app needs to reach
 * the server, as a pairing code's QR carries them (ADR 0038): the server's tunnel key, which the
 * tunnel door on its network answers to (ADR 0191), and the relay the server dials out to when it
 * has one, for an app that is not on that network. Two shapes:
 *
 *   https://host/#invite=chips_inv_…&relay=wss://…&key=…    the server's page, which a browser opens
 *   chips://join?invite=chips_inv_…&lan=https://host&key=…  the apps' own, from "Open in Chips"
 *
 * And a third, the one sent when the server has a relay (ADR 0207): the relay's page, `/join`,
 * which opens from anywhere and opens the iPhone app.
 *
 * The page's link names its server by its origin; the apps' link and the relay's have another
 * origin or none, so the server travels as `lan`. In the fragment rather than the query, as a pairing code's is: a
 * fragment never reaches a server's log, and the token is a key to the workspace.
 *
 * Read with a plain split rather than `new URL`: React Native's `URL` stops a hash at its first
 * `/`, and a relay's address in the fragment has several (`apps/mobile/src/pairing/scanned.ts`).
 */

/** An invite in a link: the token, and where its server is when the link says. */
export interface InviteLink {
  readonly token: string;
  /** The server on its network: the page's origin, or `lan` in the apps' link. */
  readonly lan?: string | undefined;
  /** The server's tunnel key (ADR 0191): what the tunnel door and the relay both answer to. */
  readonly key?: string | undefined;
  /** The relay the server dials out to, when it has one. Never without the key to ask for there. */
  readonly relay?: string | undefined;
}

/** What a link carries beside the token. */
export interface InviteReach {
  readonly relay?: string | undefined;
  readonly key?: string | undefined;
}

/**
 * What a link carries beside the token. A key alone is carried: the tunnel door on the server's
 * network needs nothing else (ADR 0191). A relay rides only with a key, since a relay without the
 * key to ask for there reaches nothing.
 */
function reach(fields: URLSearchParams, invite: InviteReach): void {
  if (invite.key === undefined || invite.key === "") return;
  if (invite.relay !== undefined && invite.relay !== "") fields.set("relay", invite.relay);
  fields.set("key", invite.key);
}

/** The link a person is sent: the server's page, with the invite in its fragment. */
export function inviteUrl(base: string, token: string, invite: InviteReach = {}): string {
  const fields = new URLSearchParams({ invite: token });
  reach(fields, invite);
  return `${base.replace(/\/$/, "")}/#${fields.toString()}`;
}

/** Where an invite opens at a relay (ADR 0207): its page, and the path the iPhone app claims. */
export const RELAY_INVITE_PATH = "/join";

/**
 * The link a person is sent when the server has a relay (ADR 0207): the relay's own page, with the
 * invite in its fragment and the server beside it as `lan`, as the apps' link carries it. The
 * relay is on the open internet where the server may not be, so the link opens for everybody, and
 * on an iPhone with Chips it opens the app. The fragment never reaches the relay. `lan` is the
 * server's origin, as the server's own page link named it. `until` is when the link runs out, in
 * seconds, so the page can say so, as the pairing page does (ADR 0210).
 *
 *   https://relay.chipschat.ai/join#invite=chips_inv_…&lan=https://host&relay=wss://…&key=…&until=…
 */
export function inviteRelayUrl(
  relay: string,
  token: string,
  invite: { readonly lan: string; readonly key: string; readonly until?: number | undefined },
): string {
  const page = /^https?:\/\/[^/?#]+/i.exec(relay.replace(/^ws(s?):\/\//i, "http$1://"))?.[0];
  if (page === undefined) throw new Error(`not a relay's address: ${relay}`);
  const lan = /^https?:\/\/[^/?#]+/i.exec(invite.lan)?.[0] ?? invite.lan.replace(/\/$/, "");
  const fields = new URLSearchParams({ invite: token, lan });
  reach(fields, { relay, key: invite.key });
  if (invite.until !== undefined) fields.set("until", String(Math.floor(invite.until)));
  return `${page}${RELAY_INVITE_PATH}#${fields.toString()}`;
}

/** The same invite as a link the installed app opens: `chips://join?invite=…&lan=…`. */
export function inviteAppUrl(invite: InviteLink & { readonly lan: string }): string {
  const fields = new URLSearchParams({ invite: invite.token, lan: invite.lan.replace(/\/$/, "") });
  reach(fields, invite);
  return `chips://join?${fields.toString()}`;
}

/**
 * The invite in a link somebody pasted, scanned or opened: either shape, or the page's with the
 * invite moved to the query by something that rewrote it. Nothing when it carries no invite, which
 * is most of what a camera sees.
 */
export function inviteFromLink(text: string): InviteLink | undefined {
  // A link copied out of a message may come with the message: the word that holds the invite.
  const trimmed = text.split(/\s+/).find((word) => word.includes("invite=")) ?? "";
  const hashAt = trimmed.indexOf("#");
  const head = hashAt === -1 ? trimmed : trimmed.slice(0, hashAt);
  const queryAt = head.indexOf("?");
  const fragment = new URLSearchParams(hashAt === -1 ? "" : trimmed.slice(hashAt + 1));
  const query = new URLSearchParams(queryAt === -1 ? "" : head.slice(queryAt + 1));
  const field = (name: string) => {
    const found = query.get(name) ?? fragment.get(name);
    return found === null || found.trim() === "" ? undefined : found.trim();
  };
  const token = field("invite");
  if (token === undefined) return undefined;
  const origin = /^https?:\/\/[^/?#]+/.exec(head)?.[0];
  const app = /^chips:/i.test(head);
  const lan = field("lan") ?? (app ? undefined : origin);
  const relay = field("relay");
  const key = field("key");
  return {
    token,
    ...(lan === undefined ? {} : { lan: lan.replace(/\/$/, "") }),
    ...(key === undefined ? {} : { key }),
    ...(relay === undefined || key === undefined ? {} : { relay }),
  };
}
