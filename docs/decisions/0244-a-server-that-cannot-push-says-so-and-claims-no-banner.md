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
