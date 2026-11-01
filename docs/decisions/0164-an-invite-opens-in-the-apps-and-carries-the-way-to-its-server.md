# 0164. An invite opens in the apps, and carries the way to its server

Date: 14 October 2026
Status: Accepted. Builds on ADR 0034 (joining by invite) and ADR 0038 (a phone takes the network it
is on, then the relay). This is Phase 2 of `docs/proposals/people-first-class-review.md` (G4), on
his "A for both" after the mock (<https://claude.ai/artifact/EHEgKszLHzhAb3JdyM2qUb>).

## Context

An invite link opened in a browser and nowhere else (ADR 0034). Somebody who had Chips on their
phone joined in Safari, then paired the phone with a code from that browser. The Mac app's Pair
screen ignored `#invite=`. A browser already in a workspace ignored the link: it showed the
workspace it knew and said nothing.

The link also named only the page that made it. A phone off the server's network could not reach
the server even with the app, though a pairing QR has carried the relay and the server's key since
the relay was built, which is how a paired phone reaches its server from anywhere.

## Decision

1. **The link carries the relay and the server's key, as a pairing QR does.** When the server has
   a relay, `POST /v1/invites` answers with `#invite=TOKEN&relay=…&key=…`. The token is still the
   only secret. The key is the server's public key, which the relay's handshake already shows.
   Protocol's `invite-link.ts` makes the link (`inviteUrl`) and reads it back (`inviteFromLink`)
   from either form, page or app. Peeking at and redeeming an invite are unchanged on the server
   and need no migration: the app reaches the server the way pairing does (network first, the relay
   when the network does not answer), and both requests go over that one link. The device that
   comes out of the join keeps that link.
2. **`chips://join?invite=…&lan=…&relay=…&key=…` hands an invite to the app.** It is not
   `chips://invite`, which the review proposed: the phone's `/invite` is the owner's Invite
   someone screen (Phase 1). `lan` is the server's own address: the page's origin, or the link's.
3. **Safari's join page offers the app (his 1A).** On an iPhone, an iPad or a Mac, the web's join
   card says "Have the Chips app?" with **Open in Chips**, which hands it `chips://join`. A page
   cannot tell whether the app is installed, so it asks. Off the server's network the page does not
   load (until Phase 5); there, the link is pasted into the app.
4. **The phone takes an invite three ways:** opened by `chips://join`, pasted (**Paste** on the
   pairing screen, now "Welcome to Chips"), or scanned by the same camera that scans a pairing QR.
   Each opens `/join`:
   - **In no workspace**: a card, the web's in the phone's hand. It shows who sent the link, to
     which workspace, as what role and what that role may do, then a name field and **Join**. It
     says "Through the relay" when the server answered that way.
   - **A dead link** (used, withdrawn or lapsed): one answer for all three, as on the web, with who
     to ask, **Paste another link** and **Pair with your computer**.
   - **In the same workspace**: a sheet over where you were, "You're already in Acme", and **Open
     Acme**. The link stays unused, so it can go to somebody else.
   - **In another workspace (his 2A)**: "Join Studio?". The phone holds one workspace at a time,
     so joining signs it out of the one it is in, and the sheet says so. **Sign out of Acme and
     join** (red) or **Stay in Acme**. The join happens first, so a join that fails signs nothing
     out. Then the sheet closes, the old device is withdrawn on its server (best effort) and
     forgotten with its drafts, and the phone opens the new workspace.
5. **The Mac app takes an invite** opened by `chips://join` or pasted on its Pair screen. Joining
   happens in the app, on the server the link names, reached as the phone reaches it.
6. **A browser or a Mac already in Chips asks** when an invite reaches it: in the address it was
   opened at, pasted into an open tab, or by `chips://join`.
   - **One of its workspaces**: "You're already in Demo" and **Open Demo**. One person to a device.
     Joining as somebody else is a sign-out first.
   - **Another**: "Join Studio too?". It joins alongside, as pairing with a second server does,
     under the name you go by in the workspace in front, then switches to the new one.
   - **Dead, or unreachable**: why, and OK. The link is taken out of the address once read, so a
     reload does not ask again.
7. **An owner on the phone can show the link as a QR code** (Invite someone → Show QR code), for
   somebody standing beside them to scan with Chips. It is drawn with `qrcode`, the package the
   desktop draws its pairing QR with, which is JavaScript only.
8. **Every word is core's** (`people.ts`): `invitedWords`, `DEAD_INVITE`, `alreadyInAsking`,
   `joinInsteadAsking` and `joinAlongsideAsking`. The phone and the desktop say the same thing.

## Consequences

- **An app joins from anywhere; a browser still does not.** A phone or Mac with the link pasted
  in reaches the server through the relay. Safari's page, and so its Open in Chips, still needs the
  tailnet until Phase 5 (reach C).
- **Links made before this carry no relay.** They work on the server's network, as they did.
- **Signing out to join loses the old workspace on that phone.** If it was the only way in, a new
  invite is the way back, and the sheet says so before anything happens.
- **Later, on his word ("I want 1B and 2B later"):**
  - **1B, universal links.** The `https://` link opens the app directly. Apple checks the domain
    from the open internet, so this waits for Phase 5's public address.
  - **2B, several workspaces on the phone.** Switched from You, as the Mac does. When it lands,
    the "Join Studio?" sheet becomes "Join Studio too?".
- **Going live:**
  - 4431 is restarted for the link (no migration);
  - `pnpm build`, for protocol's `dist` and the web;
  - `pnpm desktop`;
  - `pnpm phone build`, for the `qrcode` dependency.

  An older phone build opened by `chips://join` finds no such screen.

## Addendum, 17 October 2026: Share says to paste the link

People outside the tailnet can now install the phone app (TestFlight external testing,
`docs/proposals/testflight-external-plan.md`, his call 4). The link they are sent still opens the
server's own page when tapped, and off the tailnet that page does not load. Pasted into the app,
the same link joins through the relay. So the phone's **Share…** on Invite someone sends core's
`inviteShareWords(url)`, "Copy this link, open Chips and tap Paste:", with the link on its own line
below. **Copy** still copies the link alone. Paste already finds the invite in a whole message
(`inviteFromLink` takes the word that holds `invite=`), so copying the message works too. This
lasts until 1B: once the `https://` link opens the app itself, the words go.

## Addendum, 19 October 2026: 1B lands at the relay

1B is ADR 0207. With a relay, the link a person is sent is the relay's page,
`https://relay.chipschat.ai/join#invite=…&lan=…&relay=…&key=…`. A tap on it opens the iPhone app
at the invite, and anywhere else the page opens. The relay's own address was the public address
1B waited for. Share sends the link alone again.
