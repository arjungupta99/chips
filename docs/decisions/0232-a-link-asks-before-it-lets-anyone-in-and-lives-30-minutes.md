# 0232. A link asks before it lets anyone in, and lives 30 minutes

Date: 25 October 2026
Status: Accepted, 25 October 2026. Arjun, on the second security review's SEC-42: "Invites through
the relay page wait for my Allow, and the Allow sheet shows a short code that must match the one
on the joining device", "Allow plus the matching code" for pairing codes, "I want links only to
stay alive for max 30 minutes", and, after the mocks (`docs/proposals/allow-with-a-code-mocks.html`),
"Go with A: the Allow sheet shows the code and I compare. Six digits, inviter's phones only. Build
Phase 4." It amends [ADR 0207](0207-an-invite-link-opens-at-the-relay-and-in-the-app.md) and
[ADR 0210](0210-a-computer-pairs-by-a-link-at-the-relay.md), and builds on
[ADR 0122](0122-a-harness-or-a-device-asks-to-join-and-a-person-allows-it.md)'s join requests.

## Context

With a relay, every invite and every pairing code a person's device makes goes out as a link to a
page the relay serves (ADRs 0207, 0210): `https://<relay>/join#invite=…` and `/pair#pair=…`. The
secret rides in the fragment, which no request carries, but the script that reads it is the
relay's. The review found that whoever runs the relay host, or breaks into it, can serve a page
that sends the fragment home and then use the code first, with a key of their own, through the
tunnel the server's public key opens (SEC-42). They get a device signed in as the owner, or a person
in the workspace, and the real computer or phone is told the code is not valid.

A link was a bearer credential: whoever held it was let in. Invites lasted a week by default and up
to a month.

## Decision

1. **A link handed out with a relay asks.** An invite, and a pairing code a person's device makes
   (`POST /v1/pairing-codes`), made while the server has its relay on, no longer let anyone in by
   themselves. With a relay that is every one, the QR included: the server can't tell how a code
   travelled. Using one makes a join request (ADR 0122) that waits for a person. The invite
   remembers that it asks (`invites.asks`); the code remembers who made it. A server with no relay
   hands out its own page, and its links work as before.
   - Codes the operator mints (`chips serve`, `chips up`, `pnpm phone`), the dev route's and the
     demo's do not ask: the first device has nothing to allow it, and the operator token is held on
     the server's own machine.
2. **Only the person who handed it out decides.** An invite asks the person who made it; a pairing
   code asks the person whose device made it, whoever it pairs as (ADR 0206). Their devices show
   the request: the phone's sheet, and the web's and the Mac's dialog, since a first phone paired
   from the Mac has no other phone to be allowed on. No other owner or admin sees it, and a member
   who made a code for their own computer allows it themselves. The `join` frame and the push go
   to that person alone.
3. **The Allow shows a code, and the person compares it.** Six digits made from the joining
   device's public key: the first four bytes of its SHA-256, as a number, modulo a million, shown
   `742 913`. The server answers the joining device with the same six digits, and it shows them.
   The sheet says "Priya is asking to join Japan trip" (the link's space, else the workspace), the
   role, and the code; Allow lets her in, Don't allow refuses. Nothing is typed (the mocks' A). A
   device asking over the Wi-Fi still has its code typed (SEC-6); a harness's code is still
   compared.
4. **Until then the joiner holds nothing.** `POST /v1/invites/redeem` and `POST /v1/pair` answer
   `202` with `{ state: "waiting", request_id, secret, code, expires_in, interval }`. Everything a
   link can be refused for is refused first, as before (a wrong name, a key paired already, a link
   spent or withdrawn), so the person is not left waiting for nothing. The joiner polls
   `POST /v1/join/:id/redeem` with its secret, as a device that asked does, and is handed its device
   once allowed: no person, no device and no room exist before that.
   - **An invite is spent when the person it lets in collects it.** Several may wait on one link,
     and the inviter allows the one whose code matches. A request that waited past ten minutes
     (`JOIN_CODE_SECONDS`) has expired, and the person asks again with the same link while it lives.
   - **A pairing code is spent by the first device to use it**, as before. The request holds whom
     it pairs as.
5. **Links live 30 minutes at most.** An invite's default and its limit are both 1,800 seconds
   (`DEFAULT_INVITE_TTL_SECONDS`, `MAX_INVITE_TTL_SECONDS`), and Invite someone's Lasts choice is
   gone; its words say the link lasts 30 minutes. The limit is applied again when a link is used,
   from when it was made, so invites made before this stop at once. Pairing codes (15 minutes),
   harness join links (15) and join codes (10) are inside it already.
6. **What stays is written down.** A dishonest relay page can still send a person to another server
   dressed as this one: the page hands the app the server's key along with the code, and a page that
   swaps both sends the app to a server whoever runs the relay controls, which can ask for and show
   anything. Only trusting the relay, or not opening links in its page (pasting the link into Chips,
   or scanning it there), prevents that. SECURITY.md and ADR 0207 say so.

## Consequences

- **The wire.** Join requests gain the kinds `invite` and `pairing` and, in the registry, the
  columns `asked_of`, `invite_id` and `role` (migration 0053). A view's `code` may be six digits.
  An invite's request carries `role` and, in `space_id`, the room it brings the person into.
  `joinedDevice` gains `role` and `space_id` for an invite.
- **Apps.** Core's `pairDevice` and `joinByInvite` wait for the Allow when the door answers `202`,
  saying the code through `onWaiting`, and poll the way the door was reached. The phone's join card,
  its pairing screen, the web's invite page and Pair a computer show "Waiting for Arjun" with the
  code. An app older than this build reads `202` as joined and fails; phones, Chips for Mac and the
  web update with the server.
- **Tests.** End-to-end specs that redeem an invite or a pairing code through a server with a relay
  allow the request as the person who handed it out.
- **Going live:** 4431 restarted; the web bundle, Chips for Mac and the phone built.

## Addendum: the Allow rises over whatever sheet is up (25 October 2026)

Arjun, pairing Natalie's reinstalled phone: "Code scanned from my chips phone app, and then I get
this approval message on Chips desktop app. Phone showed no popup to approve". His phone was
showing the code in A new phone for Natalie, a sheet, when her request came.

React Native 0.86 presents a `Modal` from the view controller that holds it. `JoinAsks`,
`DirectAsks` and `WaitingForAllow` stand at the app's root, whose controller was already
presenting the sheet, so UIKit refused the Allow sheet without a word. The modal counts itself
presented before it asks, so it never asked again: not when the sheet closed, and not for any later
request, until the app was started again. Every sheet is a `Modal`, so any ask at the root behind
any sheet was lost the same way, the joiner's "Waiting for Arjun" over the join card among them.
The web and the Mac draw modals in portals, which is why no end-to-end spec saw it.

A modal now does what UIKit asks of a presenter: it presents from the topmost controller that is up
and not on its way out. Dismissing gets the other half: a modal with another over it is dismissed
by the controller that presented it, which takes it and everything above; asked of itself, UIKit
takes only the one on top and leaves it up, unseen, over every touch. A sheet's own viewer, drawn
inside it (`RoomFiles`, `RoomMedia`), is presented as before. React Native's core comes prebuilt
(`React-Core-prebuilt`), so a `pnpm` patch of its source builds nothing, which the first walk
showed; the app's own module `modules/modal-over-sheets` puts the two methods of
`RCTModalHostViewComponentView` right as the app loads, and says so in the log if a later React
Native has moved them. Android's modals are dialogs, which stack, and are unchanged.

Walked on an iPhone 17 Pro simulator over a scratch server, a device asking by `POST /v1/join`
with You's Decisions sheet open. Before: no Allow, none when the sheet closed, and none for a
second request with nothing open, until the app was started again. After: the Allow rises over the
sheet, Don't allow leaves the sheet as it was under it, the sheet closes, a request with nothing
open comes up at once, and the tabs answer after.
