/**
 * An invite link, opened on the web or the Mac (ADR 0034, ADR 0164): asked of its server once per
 * page, and joined by the same way it was read.
 *
 * In a browser the server is the one that served the page, reached as it always is. In the Mac
 * app the page is the app's own, so the server is the one the link names, reached the way the
 * phone reaches one: inside a tunnel to the key the link carries, through the door on the
 * server's network first and the relay when the network does not answer (ADR 0191).
 */

import {
  browserStorage,
  type Device,
  directLink,
  establishLink,
  type InvitePeek,
  joinByInvite,
  type Link,
  PairingError,
  peekInvite,
  type ServerReach,
  waitForAllow,
} from "@chipschat/core";
import { type InviteLink, inviteAppUrl } from "@chipschat/protocol";

/** The server's one answer for a link that is spent, withdrawn, expired or never was. */
export const NOT_VALID = "That invite is not valid.";

/** What opening a link found: still asking, a link to join by, one that is no good, or trouble. */
export type Opened =
  | { readonly kind: "asking" }
  | { readonly kind: "ready"; readonly invite: InvitePeek; readonly link: Link }
  | { readonly kind: "dead" }
  | { readonly kind: "trouble"; readonly message: string };

/** Where a link's server is: `""` for the server that served this page. */
export interface InviteReach extends ServerReach {
  readonly serverUrl: string;
}

/** The reach a link gives: this page's server in a browser, the link's own in the Mac app. */
export function reachOf(invite: InviteLink, inShell: boolean): InviteReach {
  if (!inShell || invite.lan === undefined) return { serverUrl: "" };
  return {
    serverUrl: invite.lan,
    ...(invite.key === undefined ? {} : { serverKey: invite.key }),
    ...(invite.key === undefined || invite.relay === undefined ? {} : { relayUrl: invite.relay }),
  };
}

/**
 * What each link was found to be, asked once per page: a second ask of the same link — React
 * running the effect again in development, a remount — would count again at the server, which
 * turns an address away after five links that are no good in a minute.
 */
const opening = new Map<string, Promise<Opened>>();

/** Ask the server what a link is for, once, and say what it found. */
export function openInvite(token: string, reach: InviteReach = { serverUrl: "" }): Promise<Opened> {
  let found = opening.get(token);
  if (found === undefined) {
    found = askAbout(token, reach);
    opening.set(token, found);
  }
  return found;
}

async function askAbout(token: string, reach: InviteReach): Promise<Opened> {
  let link: Link = directLink;
  try {
    if (reach.serverUrl !== "") link = await establishLink(reach);
    return { kind: "ready", invite: await peekInvite(token, reach.serverUrl, link), link };
  } catch (problem) {
    link.close();
    // Asked again next time: a server that could not be reached may be reachable later.
    opening.delete(token);
    if (!(problem instanceof PairingError)) {
      return {
        kind: "trouble",
        message: "Can't reach the server. Check your connection, then open the link again.",
      };
    }
    // Spent, withdrawn and expired are one answer, so the page cannot be asked which (ADR 0034);
    // anything else — too many tries from here — is said as the server said it.
    return problem.message === NOT_VALID
      ? { kind: "dead" }
      : { kind: "trouble", message: problem.message };
  }
}

/**
 * Join by a link that was read: the device that comes out of it goes the way the link went. A link
 * that asks waits for its sender's Allow, showing its six digits over the page (ADR 0232).
 */
export async function joinBy(
  token: string,
  name: string,
  deviceName: string,
  reach: InviteReach,
  link: Link,
  about: { readonly inviter?: string | undefined; readonly place?: string | undefined } = {},
): Promise<Device> {
  const wait = waitForAllow("invite", about);
  try {
    return await joinByInvite(
      token,
      name.trim(),
      deviceName,
      reach.serverUrl,
      browserStorage,
      reach.serverUrl === ""
        ? undefined
        : { link, serverKey: reach.serverKey, relayUrl: reach.relayUrl },
      wait,
    );
  } finally {
    wait.done();
  }
}

/**
 * Whether this browser might have the Chips app beside it to hand the link to: an iPhone, an iPad
 * (which says it is a Mac) or a Mac. Nobody can tell from a page whether the app is installed, so
 * the offer says "Have the Chips app?".
 */
export function mayHaveTheApp(agent: string): boolean {
  return /iPhone|iPad|Macintosh/.test(agent);
}

/** The link "Open in Chips" hands the app: the same invite, with this page as its server. */
export function appLinkForInvite(invite: InviteLink, origin: string): string {
  return inviteAppUrl({ ...invite, lan: invite.lan ?? origin });
}
