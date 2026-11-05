# 0244. A server that cannot push says so, and claims no banner

Date: 30 October 2026
Status: Accepted. Arjun, 30 October 2026, on the readiness list's M3 ("Wow major issues, yes
proceed with R1 and M3"). Amends [ADR 0045](0045-a-push-is-a-claim-the-server-makes-for-the-phone-and-carries-no-words.md):
the claim the server makes for a phone is made only when the push can go. Amended by
[ADR 0246](0246-chips-sends-pushes-for-any-server-through-its-relay.md): a server without the access
token sends through Chips's push relay, so it can push.

## Context

Pushes to the Chips app go through Expo, and the app's Expo project has enhanced security on
(SEC-29, security review of 25 October 2026). Expo then sends a push only for a request that
carries an access token from the project's account. Arjun's server has one. Anyone else's server
does not, and every push it sends is refused with a 401 or 403.

Nothing said so. The phone's switch stood on, because it checks only that Expo issued the phone a
token. The server logged "push refused" and then "a decision was pushed". Worse, before sending,
the server claimed the banner for the phone in the claim ledger (ADR 0045), so the person's Mac or
browser, asking for the same key, was told it was taken: an approval raised no banner anywhere.

## Decision

1. **The push sender knows whether it can send** (`readiness`: `ready`, `no_access_token` or
   `refused`). A sender posting to Expo with no access token is `no_access_token` from the start,
   and says so once in the log as the server starts. A 401 or 403 makes it `refused`, said once;
   nothing more is sent until Chips restarts. Another push service (`CHIPS_PUSH_URL`) needs no
   token. One sender serves every kind of push, so what it learns holds for all of them.
2. **A push that cannot go claims nothing.** Every use case that claims a banner for a phone and
   then pushes asks first, and stops when the sender is not ready. The person's computer claims
   the banner and raises it, as it would for a person with no phone.
3. **The server says it.** `GET /v1/server` carries `pushes`, and so does `GET /v1/health` asked
   on the server's own machine.
   - On the phone, the line under *Notify me on this phone* says why, on or off: "Your server
     can't send notifications yet. It needs an access token for Expo…", or that Expo turned its
     token down. The switch still works, so the phone is pushed to the day the server can.
   - The setup card leaves Notifications undone, with *your server can't send them yet* and no
     Turn on.
   - The sheet that asks to turn notifications on at an agent's first question doesn't open, and
     doesn't count as asked, so it asks once the server can.
   - `chips doctor` says it on the server's machine.

## Consequences

- An approval on a server that can't push raises the banner on the person's computer, as it
  should.
- Push from a server other than Chips's own still doesn't work. What this changes is that it is
  said, where people look. Making it work needs a push service Chips runs that holds the token and
  sends for any server that proves its key (the plan's push relay). That is its own piece of work.
- A token Expo refuses costs one banner: the claim for the first push after the token went bad
  was already made when the refusal came. Every push after it claims nothing.
- A server older than this one sends no `pushes`, and the phone takes it to push as it always did.

## Addendum, 2 November 2026: a push that didn't go gives its banner back

A push can still fail after its claim is made. That happens on the first 401 or 403, while the
push relay is down or answers `push_unavailable` (ADR 0246), at a rate limit, or for a phone
that's gone. Each time, the person's computer was told the banner was taken, and the log still
said "a decision was pushed".

- **The server gives the claim back.** When a decision's push doesn't go, the server releases
  its claim for that phone (`release` on the claim ledger). It releases only what that phone
  holds. Today only `decision:` keys are claimed both by a phone and by a computer, so only
  decisions give a claim back. Messages, join requests, direct asks, the agents' talk and the
  relay's ask are claimed only by phones.
- **The computer asks once more.** On the web and on the Mac, a decision the ledger said was
  taken is asked about again 15 seconds later. That is past the 10 seconds the server waits for
  the push service. If the decision is still waiting and was given back, this device gets it and
  raises the banner. It asks once and no more.
- **The log says what happened.** Every push says `push.sent` with the phones it reached. For
  the rest it says `push.not_sent` and why ("… could not be pushed").

So the consequence above, "a token Expo refuses costs one banner", no longer holds. The banner
comes up on the person's computer up to 15 seconds late. A computer that was offline when the
claim was given back asks as it would for any decision. The phone's switch still says nothing
while the push relay is down: that would mean a new value for `pushes`, which is still open.

## Addendum, 2 November 2026: the phone says when pushes aren't getting through

Arjun, 2 November 2026: "do 1 and 3 now, then 2". This is 2.

- **`pushes` has a fourth value, `failing`.** The sender is `failing` from a batch the push
  service didn't answer or didn't take until a later batch gets its tickets. That covers the
  push relay down or answering `push_unavailable` (ADR 0246), Expo down, and a 5xx. A ticket that
  says one phone is gone isn't the service's trouble and changes nothing. `GET /v1/server` and
  `/v1/health` say it, from the sender's `standing()`. A sender that can't push at all still
  says `no_access_token` or `refused`.
- **A failing sender keeps sending.** `readiness()` is unchanged, so the push use cases still
  claim and send. That is how the server learns the service is back, and the claim of a push that
  doesn't go is given back (above).
- **The phone says it under its switch**: "Your server's last notifications didn't get through…
  The next one will try again." The setup card's Notifications step isn't blocked by it, and the
  phone still asks to turn notifications on. Both stop only for `no_access_token` and `refused`
  (`serverCantPush` in core). `chips doctor` warns, and points at `push.not_sent` in the log.

An iPhone build from before this drops a value it doesn't know and says nothing, as it did. The
phone reads `pushes` when You → Notifications opens, so the line says what the server's last
pushes did at that moment.
