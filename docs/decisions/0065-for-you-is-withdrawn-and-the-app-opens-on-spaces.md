# 0065 — For you is withdrawn, and the app opens on Spaces

**Status:** Accepted, 22 September 2026.

## Context

*For you* was the queue of everything waiting on a person across every room, in the blueprint's
three tiers: Decide now, Review today, FYI. It was the first tab on the phone and the first item
in the desktop's rail, with a count on each; the phone opened on it. Beside it the web had
keyboard shortcuts (`j`, `k`, `a`, `d`, `o`, and `x` to approve several at once, M5.5), and the
phone had the swipe hint.

Since 9 September 2026 every ask has also stood at the foot of its own room, as the same card, and
since 15 September a question is answered there and nowhere else. The queue had become a second
place to answer what the room already holds. Arjun asked for it to go: "rip it out completely and
delete it. When we open the app it should land on the Spaces page", on every platform.

## Decision

For you is removed from the desktop and web app and from the phone (iOS, Android and the phone's
web target): the rail's entry and its count, the queue component and its styles, the keyboard
shortcuts and the batch decision, the phone's tab and its count, the queue screen, the swipe hint
and the preference flags that only it used, and the phone's copy of the tier labels.

The app opens on Spaces. The web already did; on the phone the Spaces tab is now the tab group's
index route, so launching the app, pairing, and a pairing link all land there with no redirect.

What stays is what does not need the queue:

- The model's `needsYou` and the tiers, in core and on the wire. They decide how a thing reaches a
  person (a banner at once, an hourly or a daily digest) and feed the harness cards' *N waiting on
  you*, the phone's app-icon badge, the desktop's menu-bar count, and the workspace switcher.
- The ask's card, at the foot of its room, with Approve, Deny, the swipe and Details.
- The ask's own screen on the phone (`/needs/<id>`), which Details and a push open. It keeps its
  route name.
- The Spaces list's *Needs a yes* on a room that is waiting, which is now the at-a-glance view.

## Consequences

An ask is answered in one place, its room.

The phone shows no banner while the app is in front (its setting from M4.3). The Spaces list says
which room needs a yes, and the app-icon badge still counts. The tab count is gone with the tab.

A person named on an ask in a room they are not in (ADR 0042) no longer has a card in a browser
tab: the room is not theirs to list, and For you was where the card stood. The phone's push
reaches them and opens the ask's own screen, and the desktop app's banner carries Approve and
Deny, so they can still answer on those. The two `outsider` e2e specs now check that the ask is
addressed to them and that nothing of the room reaches their list; they no longer answer it. If a
browser tab has to reach them again, the smallest fix is to list a glimpsed room in Spaces as a
room holding that one card.
