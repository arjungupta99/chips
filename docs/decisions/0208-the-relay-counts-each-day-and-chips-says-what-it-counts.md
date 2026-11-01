# 0208. The relay counts each day, and Chips says what it counts

Date: 20 October 2026
Status: Accepted, 20 October 2026, on Arjun's "We'll have relay available from start. So do need 1
and 2", answering how Chips learns about its use once it is public without being invasive. Builds
on ADR 0015 (no telemetry by default) and ADR 0144 (the hosted relay logs counts, never which);
it is R5 of [the hosted relay plan](../proposals/hosted-relay-plan.md), counted by day. Revised
the same day: the docs site's page counter, built with the rest, came out on his "leave this out",
so the docs site counts nothing.

## Context

Once Chips is public, Arjun wants to know whether people use it: how many servers run, how many
are reached from a phone, whether that grows. ADR 0015 settles the product's side. Nothing is sent
from a server or an app, and any opt-in report is "a Phase 7 decision, made in the open". It also
says "we learn about usage by asking people, which is slower and correct."

He was offered three steps, from least to most:

1. **What already exists, with no code:** App Store Connect's analytics (Apple's totals, from
   people who chose to share with developers), GitHub's and npm's download counts, and a
   cookieless counter on the docs site.
2. **Daily counts from the hosted relay.** The relay already logs how many servers and sessions it
   holds, once a minute, never which (ADR 0144). Its terms say it keeps nothing else, and journald
   deletes that log after seven days, so nothing about use outlives a week.
3. **An opt-in weekly report from a server**, on the model of Syncthing's and Debian's popcon.

He chose 1 and 2, since the hosted relay is there from the first public day, and then left the
docs counter out of 1. Step 3 stays ADR 0015's Phase 7 decision.

The relay only knows servers by key and phones by session; a phone has no identity at the relay,
and its address is personal data. A server with `CHIPS_RELAY_URL` set keeps its link to the relay
open all day, used or not, so "listed" means running and "a phone came through" means used away
from home.

## Decision

1. **The relay counts each UTC day** (`relay/src/tally.ts`): servers listed that day (distinct, by
   key), servers a phone came through to (`reached`), sessions opened, the most servers and
   sessions at once, and the bytes forwarded each way. The keys are held in memory for the day,
   as the switchboard holds them while connected, and dropped when the day is written. What is
   written is numbers: no key, no session id, no address.
2. **Written when the day ends, and when the relay stops.** One line of JSON at info (`relay day`)
   and, when `CHIPS_RELAY_COUNTS_FILE` is set, appended to that file. A restart splits a day into
   two lines, each with its `from` and `to`. Neither knows the other's servers, so the day's
   servers are at least the larger. The keys are not kept on disk to join them, because that
   would be keeping which. A new day starts with whoever is still connected.
3. **The hosted box keeps them.** The unit gets `StateDirectory=chips-relay`, its only writable
   place, and `CHIPS_RELAY_COUNTS_FILE=/var/lib/chips-relay/counts.jsonl`. The file is kept until
   it is deleted. It is read over SSH (`packaging/relay/README.md`). It is not served: a page on the
   relay would answer the internet.
4. **The terms say so.** `operate/relay-terms.md` gains the sentence that it keeps a count for each
   day, never which server, phone or address, and that the counts are kept.
5. **The docs site counts nothing.** A page counter was built (GoatCounter's pixel, asked for by
   a few lines of ours rather than their `count.js`, since a third party's script on a page that
   shows `curl … | sh` could change that line) and taken out the same day on his word.
6. **One page says all of it.** `operate/what-chips-counts.md`: the server and the apps send
   nothing; the relay's daily counts; Apple's totals and how to turn them off; download counts;
   that the docs site has no analytics; and that anything more would be opt-in and decided in the
   open first.

## Consequences

- The counts see only people on the hosted relay. Someone on their own relay, Tailscale or only
  their home network is not in them. That is the price of counting nothing in the product.
- "Servers" is servers running with the relay on, not people. A person with two servers is two,
  and a workspace of five people on one server is one.
- No retention by cohort: without an id there is nothing to follow from one day to the next. The
  numbers are totals over time. Step 3 would carry its cohort in the report if it is ever built.
- A relay restart (each redeploy) splits that day. Reading a month means taking each day's
  largest `servers`, and summing `sessions` and bytes over its lines.
- Bytes per day are what ADR 0038's threshold (10 TB a month, or $100) is watched with.
- Step 1 needs no code: App Store Connect's numbers are under Analytics, and GitHub's release
  counts begin once the repository and its releases are public.
- The terms' "Not running yet" note is already untrue for the two servers on the list. It comes
  off when the relay opens to everyone.

## Addendum, 25 October 2026: a day holds only so many keys

The second security review (SEC-54) found the day's two sets of keys unbounded. A relay with no
list lists any key proved to it, and a key costs nothing to make, so a stranger could prove a new
one, drop it and prove another all day, and each stayed in memory until midnight. Each set now
holds at most 100,000 keys (`MOST_KEYS`, some 9 MB full). A day that fills one writes the most it
holds and names that count in `at_least`: `"servers": 100000, "at_least": ["servers"]` reads "at
least 100,000". Every other day's line is as it was, so whatever reads the file reads it as before.
The hosted relay has a list, so its sets hold the servers on it and no more.
