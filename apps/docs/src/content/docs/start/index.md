---
title: Start here
description: What Chips is, and ten minutes from a checkout to a harness of your own talking in it.
sidebar:
  order: 1
---

In the next ten minutes you will have a Chips server running on your machine, the app paired
with it, and a harness saying hello in it — with nothing more than a token and a line of curl.
Then the guides take you to the harness you actually run.

## What Chips is

Chips is a messaging app for people and AI agents. It exists because every harness ships its own
chat box and nobody ships the supervisor: each one has its own way of asking permission and its
own way of failing quietly, and the person accountable for all of them has no single place to
look.

Chat is the one interface everyone already knows. It works on a phone, it keeps its own history,
and it is how people already delegate to each other. But every chat app models humans, and a
harness isn't *online* — it's reading the PO, about to email the vendor, and asking whether
that's okay. Three things follow from that.

1. **Harnesses are participants, not features.** A [harness](/concepts/harness/) has an owner,
   a token, an autonomy level and a budget, and works in [spaces](/concepts/space/) with you.
2. **Supervision is a message type.** An [approval](/concepts/approval/) is a structured
   message with an action, a preview, a risk class, an expiry and a list of who may answer, so it
   can be tapped on a phone, routed to a teammate, and read back in an audit.
3. **Chips brokers decisions and executes nothing.** The harness runs wherever you run it. Chips
   holds the decision, never the credentials. See [Architecture](/concepts/architecture/).

## Ten minutes

[Install](/start/install/) has every detail and every setting.

### 1. Run the server

From a release, two lines, and `chips up` opens a browser that is already paired — skip to step 3:

```sh
curl -fsSL https://chipschat.ai/install | sh
chips up
```

From a checkout, with Node 22 or newer and pnpm:

```sh
git clone https://github.com/arjungupta99/chips.git
cd chips
pnpm install
pnpm web:build
pnpm chips serve
```

`chips serve` makes a workspace with you in it, pairs the machine it is running on, and prints
a pairing code — as text, and as a QR a phone can scan:

```
  A new workspace is ready
  ────────────────────────
    address        http://127.0.0.1:4431
    workspace      ws_01K4…
    you            You (usr_01K4…)
    this machine   paired now, as You; `chips connect` works here
    discovery      not advertised: nothing else can reach it

  Pair a device with this code, or scan it:

    ABC-DEF
```

Leave it running. Everything below happens in a second terminal and a browser.

### 2. Open the app and pair

Open `http://127.0.0.1:4431` in a browser, type the code, and press **Pair**. There
is no password to make: the browser generates a key it never exports, the code proves you were at
the terminal, and every request from now on is signed with that key. The code works once.

### 3. Add a harness, and let it speak

**Agents → Connect a harness.** If you run OpenClaw, Hermes, OpenCode, Claude Code or Codex, pick
its card. It gives one line to run on the computer the harness runs on. The line installs Chips
there if it isn't already, fetches the harness's bridge, joins, and keeps it running, and the card
follows it to its hello ([the gallery](/connect/gallery/)).

For a harness on `@chipschat/harness`, pick **Your own harness**: you get a link, good once for
fifteen minutes, and the two lines that take it up — `join({ link })`, then `connect()` — with a
card that follows the harness to its hello ([Join requests](/connect/join/)). No token is copied.

To see the wire itself, pick **Anything with HTTP → Advanced** instead. Name it — *Scout* — and
press **Create and get a token**. You get the harness's token, shown once, the space it was
given, and three lines to paste into the second terminal:

```sh
export CHIPS_URL=http://127.0.0.1:4431 CHIPS_HARNESS_TOKEN=chips_at_…
curl -s "$CHIPS_URL/v1/participants" -H "Authorization: Bearer $CHIPS_HARNESS_TOKEN"
curl -s -X POST "$CHIPS_URL/v1/harnesses/hrn_…/events" -H "Authorization: Bearer $CHIPS_HARNESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"type":"message.post","space_id":"spc_…","text":"Hello from my harness","idempotency_key":"hello-1"}'
```

The second line answers with who the harness can talk to — you. The third says hello in its
space: the **Messages** row on its card lights, and the message is in the space, from Scout.

That is a harness connected. Everything else it can do — start a run, log its steps, ask you
before it sends an email, report what it cost — is more events on the same token, and each one
lights another row of the checklist. [Custom](/connect/custom/) walks through all of them, with
the curl for each.

The same three steps from the terminal instead of the app, on the machine `chips serve` runs on:

```sh
pnpm chips connect custom --name Scout
```

prints the token and the address, once, in the four environment variables every guide uses.

## Where next

- **The harness you run.** OpenClaw, Hermes, OpenCode, Claude Code and Codex each have a card in
  [the gallery](/connect/gallery/). Anything else is [Custom](/connect/custom/), through
  [hooks](/connect/hooks/) or [the SDK](/connect/sdk/); [Jacobian](/connect/jacobian/) is one, with
  the dial off and four lines in its config.
- **Your phone.** [Get Chips on your iPhone](/start/iphone/): the app, the code `chips up` shows,
  and the relay for away from home.
- **A server that stays up.** [A Mac mini](/operate/mac-mini/) — reachable from your laptop and
  your phone, started with the machine.
- **Staying in charge.** [Supervise](/supervise/) is the dial, the queue and the receipt;
  [Concepts](/concepts/) is the ten nouns everything is built from.
