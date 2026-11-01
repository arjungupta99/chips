# 0037. Notifications are per person: settings on the server, theirs alone, and one claim per event

6 September 2026 · Status: accepted

Decided in Phase 5 · People, for M5.6 (notifications per person): tiers, quiet hours, digest,
per-harness settings; exactly one notification per event per person.

## Context

Since M2.2 the desktop shell has raised a banner with Approve and Deny for every approval in
the Needs-you queue, once per app instance, from a set kept in memory. That is one notification
per event per *window*: a person with the app on a laptop and on the mini hears every ask
twice, a reload hears it again, and a browser tab hears nothing at all. There were no settings
beyond M5.3's per-device mute, and no tiers beyond the queue's: the blueprint's "Review today
is batched, one an hour at most; FYI is silent, rolled into a daily digest" was a description of
the queue, not of anything a person was told.

Two questions: where a person's settings live on a server other people share, and what makes
"exactly one notification per event per person" true across their devices.

## Decision

1. **Settings live on the server, per person, private to them.** `notification_settings` is a
   registry table (ADR 0018: a person's private data is not a projection): one row per person
   per workspace, holding the protocol's `notificationSettings` — the three tiers (`decide`:
   now or off; `review`: hourly or off; `fyi`: daily or off), quiet hours (`from`, `to`, and
   whether a decision breaks through), and a word per harness (all, only its decisions, none).
   `GET` and `PUT /v1/me/notifications` are the person's own; no route reads another person's,
   an owner's or admin's included, which is the answer to Gate 5's "privacy of per-person data
   on shared servers": the server holds them and shows them to nobody. Every device of the
   person reads the same settings. The per-device mute (M5.3) stays what it is: a device's own
   word, never sent to the server.

2. **One notification per event per person is a claim ledger, not a memory.** Before raising a
   banner a device claims its key — `decision:<approval id>`, `digest:review:<hour>`,
   `digest:fyi:<day>` — at `POST /v1/me/notifications/claims`. The `notification_claims`
   table's primary key (workspace, person, key) lets one claim through; the answer is the keys
   this device holds, and never one another device holds. Two devices racing for a key both
   insert and one finds the row there. The claim is per person, so Dana's banner about the same
   ask is her own. Claims are pruned after a week by the sweep, which is long enough for every
   device to have seen the week's banners and short enough that the ledger never grows.

3. **The plan is pure and the raising is the page's.** `planNotices` in the core takes what
   needs the person (already narrowed to the unread and the undecided, as the queue does),
   their settings and the moment — the clock, and the device's local time of day for quiet
   hours — and answers the notices to raise now: a decision each, through quiet hours unless
   the person said nothing breaks through; one digest per tier per bucket, held in quiet
   hours. Buckets are UTC hours and days, so every device of a person names the same one. The
   web app claims and raises: on the desktop, `ask` with Approve and Deny for a decision and
   the new `tell` for a digest; in a browser, the Notifications API once the person has
   allowed it from You; in a tab that has allowed nothing, nothing.

4. **What is not here.** Push to a phone is Phase 4's relay (M4.3): a phone claims the same
   keys through the same route, so the ledger already covers it. A decision on a digest's item
   is the queue's. The desktop's `tell` was type-checked, not run against the notification
   centre, which is M2.2's standing note.

## Consequences

- Two registry tables in migration 0011; the routes in the authorization matrix as a person's
  own; the sweep prunes claims. `approverRef`-style privacy: a harness has no notifications.
- The core grows `notifications.ts` (planner) and four store calls (settings read and saved,
  claims); the web app grows `useNotifications`, which took the banner half of `useDesktop`,
  and a Notifications section in You with a button to allow browser banners.
- Notifying the *new* approvers of an ask handed on (M5.5) falls out: the routed ask names
  them, the queue lists it for them, and the planner raises it with a key of its own per
  person.

## Addendum, Gate 5 (6 September 2026)

Decision 2 answered a claim with "the keys this device now holds — granted now, or granted to
the same device before", so a device that reloaded, or the app opened in the morning, was granted
the same keys again and raised the same banners again: one notification per event per person
across devices, and two on one. Now a claim answers only what this call granted (`returning`
from the insert); a key claimed before, by this device or another, is not among them. The
queue is the whole picture and a banner is one word about it, once. The Phase 5 review,
finding 5.

