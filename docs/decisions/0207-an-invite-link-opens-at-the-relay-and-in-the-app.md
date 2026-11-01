# 0207. An invite link opens at the relay, and in the app

Date: 19 October 2026
Status: Accepted, 19 October 2026, on Arjun's "Yes: front invite links with relay.chipschat.ai/join,
add the fallback page and the universal link, and get it to Natalie on TestFlight." It is ADR
0164's 1B, which waited on a public address. Builds on ADR 0164 (an invite opens in the apps and
carries the way to its server) and ADR 0191 (the tunnel door and the key pinned at pairing).

## Context

Natalie joined Primal on 19 October 2026 from an invite Arjun shared to Messages. The link was
`https://adas-mac-mini.tail2f9c1e.ts.net/#invite=…&relay=…&key=…`: the server's own page, named
by the server's public address, which is on Arjun's tailnet. Tapped, it opened Safari at a page
her phone could not reach. Arjun: "so the link starts with adas-mac-mini.tail ... why are we
giving man mini / tailscale link and not the relay link?"

The relay was already in the link, after the `#`, where the apps read it: pasted or scanned, the
link joins from anywhere (ADR 0164), which is how her QR got her in. What a tap opens is the part
before the `#`, and only the server's own page was there to open, since the relay served nothing
but its two doors and `/health`. ADR 0164 kept 1B (the `https://` link opens the app) for later,
because Apple checks a universal link's domain from the open internet and the server had no
public address. The relay has had one since 12 October: `relay.chipschat.ai`.

## Decision

1. **With a relay, an invite link is the relay's page.** `POST /v1/invites` answers with
   `https://<relay>/join#invite=…&lan=<server>&relay=…&key=…` when the server has a relay
   (`inviteRelayUrl` in `@chipschat/protocol`). `lan` is the server's origin, as the server's own
   page link named it (`linkBase`). Without a relay the link is the server's own page, as before.
   The fragment never reaches the relay: a browser does not send it.
2. **The relay serves that page** (`relay/src/join-page.ts`). The page is the same bytes for
   everybody. It reads the fragment in the browser and offers:
   - **Open in Chips**, the `chips://join?…` link the apps already take;
   - a line for somebody with no Chips yet ("It's in testing on iPhone. Ask whoever sent you this
     link to add you"), until TestFlight has a public link;
   - **Join in this browser**, the server's own join page, which opens on the server's network.

   It makes no request of its own. Its Content-Security-Policy allows the one script and the one
   style it was served with. What it passes on is checked first: a token as the server makes
   them, a server by its http(s) origin, a relay on ws(s), a key of the server's length. A link
   with no invite says it has lost it on the way.
3. **The iPhone app claims the page.** The relay serves `/.well-known/apple-app-site-association`
   for `/join`, naming the App Store app (`W9K648WB82.chat.chips.app`, a test holds it to
   `app.json`). The app has `applinks:relay.chipschat.ai`. A tap on the link in Messages opens
   Chips, and `app/+native-intent.tsx` sends the link to `/join` with the invite as params, the
   route `chips://join` reaches. Without that rewrite the router would read the page's path and
   drop the fragment the invite is in. The join card is unchanged.
4. **Share sends the link alone.** "Copy this link, open Chips and tap Paste" goes, as ADR 0164's
   addendum said it would once the link opens the app itself. Copy, the QR and Paste are
   unchanged.

## Consequences

- **A tap works everywhere.** On an iPhone with Chips, the app opens at the join card. Elsewhere
  the page opens. Open in Chips works on a Mac with the desktop app, and on an iPhone whose build
  is older than this one (Natalie's 202610190718 among them). Paste and the QR read the new link
  on every build since ADR 0164: `lan` in the fragment wins over the link's own origin.
- **Links sent before this keep working** as they did: pasted or scanned, through the relay.
- **A browser on the server's network takes one more tap**, at Join in this browser. The web's
  end-to-end tests and the people suite (`testing/join-and-remove`) go that way (`openInvite` in
  `apps/web/e2e/support.ts`).
- **The tailnet name is still in the link**, after the `#`, as `lan`, since an app on the
  server's network goes to it directly first (ADR 0191). It is no longer what a person sees or
  taps.
- **A relay serves the page from this release on.** A server pointed at an older relay sends
  links to a page that is not there; such a relay should be updated with its server. The hosted
  relay is.
- **Not claimed:** Android (no `assetlinks.json`; there is no Android build anybody installs) and
  the Mac app (a Tauri app, which takes `chips://`). Both open the page, and Open in Chips.
- **Messages' preview** fetches `/join` without the fragment and shows "Join on Chips".
- **Going live:**
  - the relay rebuilt and restarted on its box, which drops every relayed session for a second;
  - 4431 restarted, for the link;
  - a native build of the phone, for the entitlement (`pnpm phone` prebuilds from `app.json`);
  - a TestFlight build for the Friends group, still on version 0.0.0.

## Addendum, 25 October 2026: the relay's page reads the token, so a link asks

The second security review found that the page the relay serves reads the invite's token from the
link's fragment (SEC-42): an honest relay is part of what keeps it. [ADR 0232](0232-a-link-asks-before-it-lets-anyone-in-and-lives-30-minutes.md)
makes an invite that went out as the relay's page ask: redeeming it waits for the Allow of the
person who made it, who compares six digits made from the joining device's key with the six that
device shows. And no invite lasts more than 30 minutes.

What stays: a dishonest relay page can still send a person to another server dressed as this one.
The page hands the app the server's key along with the token, and a page that swaps both sends the
app to a server whoever runs the relay controls, which can ask for and show anything. Only trusting
the relay, or not opening links in its page (pasting the link into Chips, or scanning it there),
prevents that. SECURITY.md says so too.
