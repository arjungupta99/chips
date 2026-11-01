# 0210. A computer pairs by a link at the relay

Date: 20 October 2026
Status: Accepted, 20 October 2026, on Arjun's "go with the relay /pair page, mock it first", then
"go with your picks on both mocks, start building, also do Optional-The sheet sees the computer
arrive". Builds on ADR 0085 (Pair a computer, from the phone), ADR 0191 (the key pinned at
pairing, the tunnel door) and ADR 0207 (an invite link opens at the relay). The mock was
"Pair Through the Relay" (an artifact, kept out of the repo).

## Context

You → Pair a computer on Arjun's phone said: "On the computer, open Chips, choose
adas-mac-mini.tail2f9c1e.ts.net, and type this code." His question: "is this normal. Should we
not be using the Relay?"

Two things were wrong with it.

- **The name can't be chosen.** It is the server's public address, which is on his tailnet. Chips
  for Mac's Find your server lists the servers on its own network by their LAN address (mDNS,
  `apps/desktop/src-tauri/src/discovery.rs`), never by a tailnet name. To follow the words, a
  person had to type the name into "Or an address".
- **A typed code can't reach the relay.** `POST /v1/pairing-codes` has answered with the relay and
  the server's key beside the code since M4.1, and the phone dropped both. A computer off the
  tailnet had nothing it could type that would reach the server.

Chips for Mac already pairs from a link that carries all of it, `chips://pair?…&relay=…&key=…`: it
tries the server's own address first and goes through the relay when that is out of reach. That
is how `pnpm desktop` pairs it. Nothing on the phone ever sent such a link.

## Decision

1. **The server makes a link beside every code.** The code's answer gains `link`. With a relay it
   is the relay's page,
   `https://<relay>/pair#pair=…&v=1&lan=<server>&relay=…&key=…&until=<seconds>`
   (`pairRelayUrl` in `@chipschat/protocol`). Without one it is the server's own page,
   `<server>/#pair=…`, as `chips serve`'s QR is. `lan` follows `linkBase`, as an invite's does. The
   server makes the link, as it does an invite's, so every device that issues a code sends the
   same thing (`codeOnTheWire`, so `chips pair --issue` and the operator's route too).
2. **The relay serves `/pair`** (`relay/src/pair-page.ts`), a sibling of `/join` built from the same
   parts (`relay/src/page-parts.ts`): same bytes for everybody, no requests, a CSP that allows only
   its own hashed script and style, and every field checked before a button points anywhere. On a
   computer it shows the code again, so the person can see it is the one on their phone, with:
   - **Open in Chips**, the `chips://pair?…` link Chips for Mac takes, with the relay and the key;
   - a line for a computer with no Chips ("Chips for Mac is in testing. Ask whoever runs your
     Chips for a copy");
   - **Pair in this browser**, the server's own page, which opens on the server's network.

   When `until` has passed it says the code has run out and to send a new link, before anyone
   presses anything. On a phone it says the link is for a computer, with **Copy the link** first
   and Open in Chips for an iPad.
3. **The iPhone app does not claim `/pair`.** A pairing link tapped on the phone that made it must
   not try to pair the phone. The association file still names `/join` alone.
4. **The phone's sheet leads with the link.** The code stays as large as it was: it is read
   across a desk, and the page shows it again. The words say "Send the link to the computer and
   open it there. It reaches your Chips from any network." **Send the link** shares the link
   alone. The foot says "At home? You can type the code in Chips on the computer instead." A
   server with no relay gets "It opens on the same network as your server", and a server too old
   to make a link keeps the old words and Send the code.
5. **The sheet sees the computer arrive.** While the code is good, the sheet reads the person's
   devices every three seconds (`ARRIVAL_POLL_MS`). The first device paired since the code was
   made turns it to "*Chips for Mac* is paired · Just now. It's under Devices now.", with a tick
   that springs in, a success haptic, an announcement for VoiceOver, and the Devices list read
   again. "Paired since" is a device that was not there when the code was made, not this one, not
   signed out, and paired no earlier than the code, give or take a minute for the two clocks.
6. **The web and the Mac send it too.** You → Devices shows the link under the code's QR, with
   **Copy link**, so one computer can pair another the same way. Find your server's paste box is
   now "Or a link somebody sent you" and takes a pairing link as well as an invite: it goes
   straight to pairing with the relay and the key (`pairingFromLink`).

## Consequences

- **A computer pairs from any network** with a link and one press. A computer on the server's
  network can still type the code.
- **Security does not change.** The link carries the same single-use, 15-minute code that Send the
  code shared before. The relay never sees it: it rides in the fragment. Anyone who holds the
  link in those 15 minutes could pair as you, as anyone holding the code could.
- **The sheet reads `/v1/devices` every three seconds while it is open with a good code.** That
  is one small read through the tunnel. It stops when the sheet closes, the code runs out, or a
  device arrives.
- **Not changed:** the QR on the web and the Mac is still the server's own page with the relay and
  key in its fragment, for a phone's scanner inside the app. A phone's Camera app still opens it
  in Safari (ADR 0164's note stands).
- **A relay serves `/pair` from this release on.** A server pointed at an older relay sends links
  to a page that is not there; the hosted relay is updated with this change.
- **Going live:**
  - the relay rebuilt and redeployed on its box;
  - 4431 restarted, for the link;
  - the web build, Chips for Mac, and the phone (`pnpm phone ship`).

## Addendum, 25 October 2026: a code that went out with the relay asks

"The relay never sees it: it rides in the fragment" holds only while the relay serves honest bytes,
since the script that reads the fragment is the relay's (SEC-42). From [ADR 0232](0232-a-link-asks-before-it-lets-anyone-in-and-lives-30-minutes.md)
a pairing code a person's device makes while the relay is on asks: the computer that uses it shows
"Waiting for your other device" with six digits from its key, and the person's own devices show
"Studio is asking to pair as you" with the same six, to compare before Allow. The first device to
use the code still spends it. Codes the operator mints (`chips serve`, `chips up`, `pnpm phone`) do
not ask.
