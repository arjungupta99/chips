# 0170. A newcomer is walked through setup, and the setup card says what's left

Date: 15 October 2026
Status: Accepted, 15 October 2026. Phase 3 of the [install plan](../proposals/install-onboarding-plan.md),
built to the [first-run build plan](../proposals/first-run-build.md). Adds `GET /v1/server`, names a
new workspace's first person from the account that started Chips, and adds the welcome and the
setup card to every client.

## Context

After `chips up` the browser was paired and showed "No spaces yet". Nothing said where Chips was
running, the first person was called "You" until they found You → Profile, and what was left to
do (an agent, the phone, notifications, reaching Chips away from home) was spread across four
screens nobody had a reason to open. Arjun asked what would make the first installation "super
easy, and delightful", was shown a running mock of the whole first run, and said: "build all seven
steps, Phase 3 first".

## Decision

1. **The server says which machine it runs on.** `GET /v1/server`, a person's, answers
   `{ machine, version, public_url, relay }`. `machine` is the Mac's computer name from Sharing
   settings (`scutil --get ComputerName`), else the host name without `.local`, asked of the system
   once, when first wanted. Not on `/v1/health`, which a stranger can read.
2. **A new workspace's first person is named from the account that started Chips**: the first
   word of its full name (`id -F` on a Mac, the passwd comment elsewhere), else "You". A workspace
   that has a person keeps theirs.
3. **The welcome** is for the workspace's owner, on a device that hasn't been through it, while
   no agent has joined (`showsWelcome`): "Chips is running on Arjun's Mac mini", their name already
   filled in, then the gallery, then the connect card, then the agent's room. Each device keeps that
   it has been through it. Skip leaves the setup card to say what's left.
4. **The setup card** sits at the top of Spaces on every client for the owner, with six steps, all
   read from what the client already knows (`setupSteps`): Chips is running (and where); a computer
   is paired; an agent has said hello; a phone is paired; notifications are on, on this device;
   Chips is reachable away from home (its relay is up, or the address it hands out is a tailnet's
   or a public `https:` one). The CLI doesn't count as a computer. It isn't drawn until the server
   and the devices have answered, so it never shows "0 of 6" for a moment. It folds away when all
   six are done, and Hide puts it away on that device.

## Consequences

- The server keeps no setup state: a step is done when what it reads is true, and undone if that
  stops being true (a phone withdrawn, the relay down) — the card comes back only if it was never
  hidden.
- An owner's existing devices see the card once, at whatever it counts, and can hide it.
- A workspace's first person on a machine whose account has no full name is still "You", and the
  welcome asks.
