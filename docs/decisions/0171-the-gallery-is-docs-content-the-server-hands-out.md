# 0171. The gallery is docs content that the server hands out

Date: 15 October 2026
Status: Accepted, 15 October 2026. Settles the install plan's §3.4 for a docs site that isn't
public yet ([ADR 0122](0122-a-harness-or-a-device-asks-to-join-and-a-person-allows-it.md) built the
gallery with its two generic cards). Adds `GET /v1/connectors` and `CHIPS_CONNECTORS`.

## Context

Bringing a first agent is choosing it from a gallery. The plan made the gallery docs content: the
docs say what each connector is and how it connects, and the app fetched
`https://chipschat.ai/connectors.json`. Chips names no harness in what it ships
(`tools/guardrails/no-harness-named.test.ts`, ADR 0051), so the app itself carries only "Your own
harness" and "Anything with HTTP". But nothing is public yet (the install plan's §0a), so there is
no `chipschat.ai/connectors.json` to fetch, and a phone or a Mac app asking a third party for it
would be a request from every client rather than one from the server.

## Decision

1. **The docs hold a card per connector** and `connectors.json` is built from them: name, one
   line, kind (`one-line`, `sdk`, `http`, `guide`), the command to run with `{link}` where the join
   link goes, the sentence a person pastes to their agent so it connects itself, its face, its page,
   and whether it is published.
2. **The server hands it out.** `GET /v1/connectors`, a person's, answers the cards it was given by
   `CHIPS_CONNECTORS`: a file, or an `https:` URL (or `http:` on this machine). A URL is read at most
   once a day, and a failed read is tried again after ten minutes, keeping what it had. A bad card
   costs that card; anything unreadable is no cards, never an error. Nothing but the GET is sent.
3. **With no cards, the gallery is the two the apps carry.** Unset is the default until the docs
   are public; then the default can become `https://chipschat.ai/connectors.json` without any
   client changing.

## Consequences

- The clients ask their own server, through the relay where that is the way, and never a third
  party.
- His live server is pointed at the checkout's `apps/docs/public/connectors.json`.
- A connector that isn't published says so on its card, and its command is the one that works
  for him until it is.

## Addendum, 16 October 2026: a card runs only what is ours

Every card's command said `npx chips-…`, and OpenClaw's sentence said it too: names nobody had
published on npm, so the first stranger to take one would have been run by the gallery with a live
join link in its environment. Until a connector is published, its command runs it from its checkout
(`cd ~/Work/chips-openclaw/bridge && npm run connect -- '{link}'`), as the consequences above meant.
OpenClaw's sentence is gone until there is a package an agent can fetch, so its card is a line to
run. `tools/guardrails/gallery-runs-only-ours.test.ts` fails on a card that fetches any package not
in its list of the ones we have published, which is empty.

## Addendum, 16 October 2026: a card says what its connector needs

A link made from a card granted only the autonomy dial, and the welcome folds the switches away,
so a connector joined unable to do its job: Hermes and OpenCode need `agents`, chips-acp also new
spaces, new agents, forks and restarts (ON-3). A card can now list `capabilities`, and the link
made from it starts with those switches on (core's `linkStarts`), in the order the switches show;
a person can still turn any of them off. The four cards list theirs: OpenClaw's eight, as its
harness on 4431 holds them, chips-acp's five, and `agents` for Hermes and OpenCode.

## Addendum, 18 October 2026: a card has no face

A card no longer carries a face (point 1). It wears the face its harness will, drawn by its name,
so the face picked in the gallery is the one that arrives (ADR 0190's addendum of this day).
