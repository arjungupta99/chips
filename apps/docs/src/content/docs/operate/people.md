---
title: People
description: More than one person in a workspace — invites with a role, passkeys to come back by, and the devices each person holds.
sidebar:
  order: 5
---

A workspace is a server. Whoever ran it owns it. Everyone else joins by an invite, gets a role,
and is added to spaces the way you would add someone to a group chat — by whoever is already in
them. No accounts, no passwords, no email round trip.

## Invite somebody

Only an owner invites. From the **You** tab, on a computer or the phone, an owner makes a link
under the workspace's own heading: a role attached, with what
that role may do under it, once or by several, and good for 30 minutes. On the phone
**Invite someone** sends it out through the share sheet, or shows it as a QR code for somebody
beside you to scan with Chips; on a computer, Copy. Send it however you like.

Whoever opens it sees which workspace it is for and as what, types their name, and is in: the
browser that opened the link makes a key it keeps to itself, and the invite is what tells the
server whose key it is — the same thing a pairing code does for a second device of your own. A
single-use link is spent by the first person it lets in; an open one works until it expires or
you withdraw it, and the list in You says how many times it has been used.

With a relay, the link opens at the relay's page, and it asks before it lets anyone in
([ADR 0232](https://github.com/arjungupta99/chips/blob/main/docs/decisions/0232-a-link-asks-before-it-lets-anyone-in-and-lives-30-minutes.md)):
the person sees "Waiting for Arjun" and six digits, and your phone, browser or Mac asks "Priya is
asking to join Japan trip" with six digits of its own. Ask what they see, and Allow only if the two
match. The same goes for a pairing code your device makes for another of your devices. Nothing of
the workspace is theirs until you allow it, and a request waits ten minutes.

The link points where the person you send it to can open it: the server's public address when
it has one (`CHIPS_PUBLIC_URL`), and never `127.0.0.1` when the server is reachable from other
machines — a link made on the server's own machine, or in Chips for Mac, opens elsewhere too.

### Joining with the app

Somebody who has Chips joins in the app rather than a browser (ADR 0164). The link carries the
relay's address and the server's key beside the token, as a pairing QR does, so the app reaches
the server on its network, or through the relay from anywhere else.

- **On a phone**, the link goes in by **Paste** on the first screen, by the camera, or by
  **Open in Chips** on the join page Safari shows. The card is the browser's: who sent it, the
  workspace, the role, a name, **Join**.
- **On a Mac**, paste it on the Pair screen, or use **Open in Chips** in the browser.
- **A browser or a Mac already in Chips** asks: "You're already in Demo" if it is one of its
  workspaces (the link stays unused), or "Join Studio too?", which joins alongside under the name
  you go by and switches to it.
- **A phone already in a workspace** asks too: "Join Studio too?" joins alongside the one it
  holds, and the workspace's name at the top of Spaces switches between them (ADR 0197). Its
  **Join another workspace**, under that name, takes a link pasted or a code scanned.

Safari's page loads only where the server can be reached, which is the tailnet until the relay
carries browsers. Off it, paste the link into the app.

### Into a space

A link can bring somebody straight into a space (ADR 0168). In the space, open its sheet, then
**Add**: **Invite someone new**, under People, is an owner's alone. Its form is You's, but the
link makes a **Guest** of that space (the first choice) or a **Member** who starts in it, and says
what each means there.

- **Whoever opens it** reads "Arjun invited you to Bakery in Demo as a guest", joins, and lands in
  Bakery. The space says "Priya joined by your link" to you, "by Arjun's link" to everybody else,
  and "You joined by Arjun's link" to her.
- **Somebody already in Demo** who opens it is asked, "Join Bakery?", and joining puts them in
  the space as you would. The link stays unused, for whoever it was made for. Somebody in the space
  already is told so and it opens; a guest who is in another space is told a guest is in one.
- **The link goes with the space.** Archive or delete the space, or leave it yourself, and the link
  stops working: the next time anybody uses it, or you look at the list, it is withdrawn. A space
  locked against changes still takes people in.
- **The open links** in You name the space each brings people into.

An admin changes roles and removes people, but invites nobody. The link is shown once: Chips
keeps only a digest of the token in it, so a link nobody wrote down cannot be recovered, only
remade. The open links are listed under it, each with how often it has been used and until when;
**Withdraw** (on the phone, slide the row left) ends one.

## Your name

You change the name you go by in **You**, on the desktop or the phone: on the desktop the name at
the top is the field — Enter saves it, Escape puts it back — and on the phone a tap on your name
opens it in a sheet. It is yours alone to change. It can be up to 120 characters and must be
nobody else's here, since an @ is a name ([ADR 0082](https://github.com/arjungupta99/chips/blob/main/docs/decisions/0082-a-person-names-themselves.md)).
Everything you said reads under the new name, and every agent hears it: the socket sends
[`person.renamed`](/reference/events/person-renamed/).

## Roles

Owner, admin, member, guest — per workspace, as [Participant](/concepts/participant/#roles)
lays them out. An owner or admin changes a role from **People** in You (on the phone, a person's
page): it asks first, saying what the new role may do. An admin cannot touch an owner's or make
one, and the last owner stays an owner until there is another. Every
joining and every change is in the [audit](/concepts/audit-event/): who let whom in, as what, and
who changed it.

A guest is in one space at most. The first space they are added to is theirs; a second is
refused, and somebody already in several spaces is not made a guest until they are out of all but
one. A guest answers an approval only when it names them by id — never as "anyone in the space".
That is the shape for a vendor, or a family member who is there to talk.

## In and out of a space

Joining puts nobody in a space. Somebody in a space adds a person from its sheet (the space's
name, then **Add**, then their row under People) or with `/add @name`; a guest is offered only
until they are in a space. The person's app opens the space at once, from its beginning, and the space
says who added whom. A member makes nobody else a space's owner: that takes the space's owner, or an
owner or admin of the workspace.

The space's owner, or an owner or admin of the workspace who is in the space, takes somebody out:
**Remove** on their row (on the phone, swipe it), which asks first, or `/remove @name`. They are
told where the space was, by whom, until they press OK, and the space says so. Anybody leaves a space
with **Leave** on its sheet, which asks first, or `/leave`; somebody alone in a space archives or
deletes it instead. A guest is offered no Add. The sheet names the workspace's owners and admins as
such. Added back, a person finds the space whole, with what was said while they were out.

## Passkeys

A device's key never leaves the device, which is what makes it safe and what makes it useless
on a new phone. A passkey is the way back: made from a device that is already paired — **You →
Passkeys → Add a passkey**, in a browser, where one can be made — and kept by the platform, synced or not, as its own rules say. On a
new device, **Sign in with a passkey** on the pairing screen pairs that device for you, with no
code from anywhere.

A passkey is yours alone: nobody else in the workspace, owner included, can see it or remove it.
Removing somebody from the workspace withdraws theirs with everything else (below).

Passkeys need a secure address with a name: the server's own machine as `localhost` — not
`127.0.0.1`, which a browser refuses as a passkey's home — or an `https://` address. You offers
**Passkeys** only where one can be made, so it is not there in the desktop app or at an IP
address. A Mac mini reached over plain `http://` on a LAN takes passkeys on the mini
itself and not from the laptop across the room, until it has a TLS address, which [Tailscale
Serve](/operate/tailscale/) gives it in one command; the pairing code covers everything else. The origins a passkey may be used from are the server's public
address, loopback, and whatever `CHIPS_PASSKEY_ORIGINS` names — the desktop app's, say.

Chips verifies a passkey itself, with the platform's own cryptography and no dependency: the
challenge, the origin, the relying-party id, that the authenticator checked for a person, the
signature, and a counter that must move forward. The make of authenticator — attestation — is
not checked: a home server has no list to check it against.

## Harnesses have owners

Every harness belongs to a named person: the one its approvals default to, whose tokens they
are. Whoever added it owns it. An owner hands it on from the harness's card — to any person in
the workspace who is not a guest — and so can a workspace owner or admin, which is how a harness
outlives the person who set it up. The handover is in the audit as `harness.transferred`, and
from that moment the new owner's decisions are the ones policy asks for and the old owner's
tokens screen is closed to them, unless they run the workspace.

The same people may remove a harness from the workspace: *Remove harness…* on its card or its
profile on the phone, or `chips remove`. Its tokens are withdrawn and its sockets close; it leaves
Harnesses, the + and every space's Add, and can be given no token, space or new space again. What it said
stays in its spaces, under its name, and a space that was its home becomes one you can archive or
delete. The audit has it as `harness.removed`. There is no undoing it: to use it again, connect it
as a new harness.

A guest of the workspace neither adds a harness nor owns one.

## Devices

Every browser, laptop, phone and CLI a person has paired holds a key of its own, and You lists
them: this one first, then by when each was last seen, and those not seen for a month folded under
one row with **Sign out all**. **Sign out** one you lost — on the phone, push its row left — and it
is refused from its next request and its sockets close now. **Sign out of this computer** (or *of
this browser*, or the phone's **Sign out**) withdraws the one you are on and forgets its key; the
next visit pairs again, by a code or a passkey. A new device names itself usefully — "Safari on
Mac", "iPhone 15 Pro" — and the phone can give a computer its code: **You → Devices → Pair a
computer**.

Through the API (`DELETE /v1/devices/:id`), an owner can withdraw anybody's device by its id, and
an admin anybody's but an owner's — the rank that keeps an admin from changing an owner's role keeps
them from locking an owner out. A person's page under **You → People** lists their devices and when
each was last seen, for an owner or an admin. A device is not a person, though: to show somebody
out, remove them (below).

## Remove somebody

An owner or admin removes a person from the People list in You: **Remove…** on their row, and a
dialog that says what happens before anything does, **Keep** or **Remove**. An admin cannot remove
an owner, and nobody removes themselves here: that is deleting your account (below). On the phone,
**People** under the workspace's name in You opens everyone, and a person's page has **Remove from
*the workspace*…**; **Invite someone** is beside People, for an owner.

Removing somebody, at once:

- signs them out on every device, and closes their open tabs and sockets: each one says
  "You're no longer in Demo" rather than asking them to pair again;
- withdraws their passkeys, any pairing code waiting for them, and the invites they made that
  could still be used, so nothing they hold lets them back in;
- takes them out of every space, each of which says so: "Priya Nair was removed from the
  workspace by Arjun";
- hands the harnesses they own to you, as a handover would.

What they said stays where it was said, under their name. Their name is free again, and the only
way back is a new invite, which makes a new person who starts with nothing. The audit has it as
`person.removed`, beside a `membership.removed` for each space
([ADR 0160](https://github.com/arjungupta99/chips/blob/main/docs/decisions/0160-a-person-can-be-removed-and-what-they-said-keeps-their-name.md)).

## Delete your account

Anybody can delete their own account in a workspace: on the phone, **Delete your account** under
Sign out at the foot of You; on a computer, the **Your account** card in You. It says what goes and
what stays, and Delete wakes once you type the workspace's name.

- **Goes:** your devices and their sign-ins, and push to them; your face; the invites you made.
- **Stays:** what you said, in its spaces, under your name. The harnesses you connected go to an
  owner, as do the approvals only you could answer.

Each space says "Dana left the workspace", and the audit has it as `person.removed` with you as
the one who did it. The only way back is a new invite, which makes a new person. Signing out is
different: it leaves this device and nothing else, and the workspace keeps you.

The only owner can't delete their account: the workspace is theirs, on the computer it runs on.
To delete it, run `chips uninstall --remove-data` there. To leave it running without you, make
someone else an owner first, and then delete your account as anybody does
([ADR 0243](https://github.com/arjungupta99/chips/blob/main/docs/decisions/0243-you-can-delete-your-own-account.md)).

## What is where

| | Lives in | Because |
| --- | --- | --- |
| A person's role | The log: `person.joined`, `role.changed`, `person.removed` | Who let whom in, and who showed them out, are decisions, and the audit records decisions |
| A person's name | The registry, recorded as `person.renamed` | A person is identity; the log says when it changed, and to what |
| An invite | The registry, as a digest | A token in an exportable log would be a credential in an exportable log |
| A passkey | The registry, as a public key | Likewise |
| A device | The registry, as a public key | Likewise |
