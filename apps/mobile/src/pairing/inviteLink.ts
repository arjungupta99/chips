/**
 * An invite link, as the phone's routes take it: the params `/join` opens with, and the route a
 * link the system opens the app with goes to.
 *
 * Three links reach `/join`. `chips://join?…` (ADR 0164) is a route already, by its host and
 * query. A link pasted or scanned is read by `inviteFromLink` and pushed with `joinParams`. And
 * the relay's page, `https://relay.chipschat.ai/join#…` (ADR 0207), which iOS opens the app with
 * once it has read the relay's association file: the router would read its path and drop the
 * fragment the invite is in, so `app/+native-intent.tsx` sends it to `/join` with the invite as
 * params first, with `joinPathFor`.
 */

import { type InviteLink, inviteFromLink, RELAY_INVITE_PATH } from "@chipschat/protocol";

/** The params `/join` is opened with, from a link: what `chips://join` carries, by name. */
export function joinParams(link: InviteLink): Record<string, string> {
  return {
    invite: link.token,
    ...(link.lan === undefined ? {} : { lan: link.lan }),
    ...(link.key === undefined ? {} : { key: link.key }),
    ...(link.key === undefined || link.relay === undefined ? {} : { relay: link.relay }),
  };
}

/**
 * The route for a link the system opens the app with, when it is an invite at a relay's page:
 * `/join?invite=…&lan=…&key=…&relay=…`. Nothing for every other link, which goes on as it came.
 */
export function joinPathFor(url: string): string | undefined {
  const head = /^https:\/\/[^/?#]+(\/[^?#]*)?/i.exec(url.trim());
  if (head?.[1] !== RELAY_INVITE_PATH) return undefined;
  const link = inviteFromLink(url.trim());
  if (link === undefined) return undefined;
  return `/join?${new URLSearchParams(joinParams(link)).toString()}`;
}
