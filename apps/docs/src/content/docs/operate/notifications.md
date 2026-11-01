---
title: Notifications
description: Three tiers, quiet hours, a word per harness and per space — yours on every device, and a banner raised once.
---

What needs you reaches you in three tiers, the blueprint's: **Decide now** — approvals,
blocked runs, questions without a default — is a banner at once, with Approve and Deny on the
desktop; **Review today** — finished work, summaries, questions the harness will answer for
itself — is batched into one banner an hour at most; **FYI** — checkpoints — is rolled into one
banner a day. The tier is a property of the kind, never a setting; what you set is how each tier
reaches you.

## Your settings

Open **You → Notifications**. Each tier has a word: **Decisions** right away or never,
**Finished work** at most one banner an hour or never, **Checkpoints** at most one a day or never —
the hour and the day are this device's own. **Quiet hours** hold everything else inside a window
each day — 10 PM to 7 AM, say, which runs across midnight — and a decision still gets through
unless you turn **Let decisions through** off. **Agents** sets how much you hear from each
harness — one choice covers every agent it runs: **Everything** (its decisions, finished work,
checkpoints, and messages that @ you), **Decisions only**, or **Nothing**. Whatever you choose,
its spaces still show everything; a reply on its own never notifies anyone.

On the phone, You offers Decisions, Quiet hours and Agents, each with a line saying what it is
about, since a phone is pushed decisions and messages and nothing else; Finished work and
Checkpoints are the desktop's.

**Each space** has its own word, on its sheet's **Notifications** row: **Every message**, agents'
included; **People's messages** (where every space starts): whatever another person writes there,
even to an agent, and what an agent says only when it @s you; **Only @ you**; or **Off**. It says
what that space sends your phone; a decision still comes as Decisions says. Somebody invited to one
space is asked the first time they are in it whether to hear when someone writes, and yes sets that
space to Every message
([ADR 0198](https://github.com/arjungupta99/chips/blob/main/docs/decisions/0198-peoples-messages-reach-the-phone.md),
[ADR 0216](https://github.com/arjungupta99/chips/blob/main/docs/decisions/0216-a-persons-message-reaches-everyone-in-the-room.md)).

The settings are yours, held on the server, and read by every device you have paired: change
them on the laptop and the phone follows. Nobody else reads them, an owner or admin included
([ADR 0037](https://github.com/arjungupta99/chips/blob/main/docs/decisions/0037-notifications-are-per-person-settings-on-the-server-and-one-claim-per-event.md)).
They are separate from a device's own switch (*Banners on this computer*, or *in this browser*,
at the top of the same card), which the server is never told.

## Once, on one device

A banner is raised once per event per person, whichever of your devices gets there first. Every
device claims the banner's key at the server before raising it; the first claim wins and every
later one is told it was taken — another device's, or the same device's after a reload or the
app opened again in the morning — so the app on the mini and the app on the laptop never both
ask about the same approval, and nothing asks twice. A digest is claimed by the hour or the
day, so one device raises it.

## Where the banner shows

- **Chips for Mac**: the notification centre, with Approve and Deny on a decision, and a plain
  banner for a digest.
- **A browser**: the browser's own notifications, once you allow them from **You →
  Notifications → Allow banners here**, which takes effect at once. A tab that has allowed nothing shows nothing, and the
  queue and the menu bar badge still count everything.
- **A phone**: a push to the lock screen, with Approve (which asks for Face ID) and Deny on it.
  Turn it on in **You → Notifications → Notify me on this phone**. The server claims the
  key on the phone's behalf — a sleeping phone can claim nothing — against the same ledger, so
  a laptop that raised the banner leaves the phone quiet and the other way round. Quiet hours
  are worked out in the phone's own time zone, not the server's.

  A push carries three ids and two fixed sentences, and nothing about the ask: not the action,
  the preview, the harness or the space. Chips holds no Apple or Google push credentials, so
  the message passes through Expo's service, and first through the Chips push relay when your
  server has no Expo access token ([ADR 0246](https://github.com/arjungupta99/chips/blob/main/docs/decisions/0246-chips-sends-pushes-for-any-server-through-its-relay.md)).
  What they are handed is worth nothing to them
  ([ADR 0045](https://github.com/arjungupta99/chips/blob/main/docs/decisions/0045-a-push-is-a-claim-the-server-makes-for-the-phone-and-carries-no-words.md)).
  The cost is that a Chips notification cannot be triaged from the lock screen: it tells you
  that you are needed, not what for. See [the phone guide](/operate/mobile/#being-told).

  **When a message @s you**, a person's or an agent's (a reminder at 10, a scheduled answer, "it's
  done"), when another person writes in a space you hear people's messages in, or when it is in a
  space you hear every message in, the phone is pushed too, outside your quiet
  hours, never for your own words, and from an agent only through a harness you hear everything
  from (its word is `all`). Those words are sealed: the phone made a key when it registered, only it holds
  it, and its notification extension opens the words and shows who said them, where, and what.
  Expo and Apple carry ciphertext. A phone that can't open them shows "A message for you", or
  "A new message" for one that did not name you. A message that @s nobody pushes nobody whose space
  is Only @ you, nor an agent's anybody whose space is People's messages, and with that space open on the phone you are not told twice
  ([ADR 0158](https://github.com/arjungupta99/chips/blob/main/docs/decisions/0158-an-agents-at-pushes-the-person-sealed-to-their-phone.md)).

The space is always the whole picture: a banner is a pointer to it, never a substitute. The
Spaces list says which spaces are waiting on a yes.
