# 0247. What a new person meets says where it works

Date: 30 October 2026
Status: Accepted. Arjun, 30 October 2026, on the new-person sweep's top five: "Take all 5". Amends
[ADR 0245](0245-every-server-has-the-chips-relay-behind-its-switch.md) (how the apps read a relay
switch nobody has turned) and [ADR 0121](0121-chips-up-is-the-first-run.md) (the Wi-Fi's answer).

## Context

A sweep of Chips as a new person meets it found five places where something works only from where
it was made, and nothing says so:

1. Since ADR 0245 the switch starts off for Chips's relay, but the phone and the web read a switch
   nobody had turned as on. An invite link on the server's own address went out with no note, and
   an owner's phone had no Relay row until somebody had turned it once.
2. A phone learned the server's relay only as its socket opened, so one connected when the relay
   was turned on went away from home without it, and was told the server was asleep.
3. A first agent's card said to paste its line "on the computer where it runs" with a link on
   Chips's own address, often `127.0.0.1`. From a computer that can't reach that address, the
   bridge died with a stack and the card counted down. Only Chips for Mac said what had to be
   installed first.
4. `chips up`'s Wi-Fi answer wrote that Wi-Fi's address into the service as `CHIPS_PUBLIC_URL`. A
   new lease or a new network left every new code, invite and link pointing at an address nobody
   held. Chips for Mac's Run Chips here always takes this answer.
5. Chips for Mac started bridges with Finder's PATH, `/usr/bin:/bin:/usr/sbin:/sbin`, so none of
   Claude Code, Codex, OpenCode, Node or the adapter just installed could be found.

## Decision

1. **An invite says where it opens from the link itself.** A link that isn't the relay's page
   carries the note, whatever the switch says, and an owner is offered **Turn on the relay** beside
   it. On a server's loopback address it says the link opens only on the computer Chips runs on.
   Every owner has the Relay row on the phone. Until somebody turns the switch, it is as the
   server started it: on when the server gave the phone a relay, off for Chips's own.
2. **A device asks again when the relay is turned on.** Hearing `relay.set` on, it asks the server
   for its relay, as it does when a socket opens. The server dials the relay before it tells the
   devices, so the answer names it. A phone that knows no relay and can't connect says it reaches
   the server only on the server's own network, and where an owner turns the relay on.
3. **A connect card says where its link works, and what that computer needs.** On loopback, that
   it works only on the computer Chips runs on. Otherwise, that the computer has to reach Chips at
   the link's address. Every card gives its `needs`. The harness SDK turns a request that never
   reached Chips into one line naming the address (`unreachable`), which every bridge prints as it
   prints a refusal.
4. **`chips up`'s Wi-Fi answers name no address.** The Wi-Fi's answer, and the Chips relay's with a
   Wi-Fi, bind every address and leave `CHIPS_PUBLIC_URL` unwritten, so the server says the home
   network's address it has at the time. The tailnet's answer still names its address, which
   doesn't change.
5. **Chips for Mac gives bridges a Terminal's PATH.** It asks the login shell for its PATH once,
   with three seconds to answer, and adds Homebrew's, `/usr/local/bin`, `~/.local/bin` and the
   system's after it. The Run Chips here card names `~/.local/bin/chips down`, which works where
   `chips` isn't on the PATH.

## Consequences

- A link that opens only at home says so, on every sheet that makes one, and the way to the relay
  is beside it for the one person who can turn it on.
- Turning the relay on from the Mac reaches a phone that's already connected, and a phone away
  from home with no relay says why.
- A bridge's clearer words reach a harness's computer only with that bridge's next release, since
  each carries its own copy of the SDK.
- A server installed with the old Wi-Fi answer keeps its frozen address until `chips up --reach`
  runs again, which Run Chips here does.
- Asking the login shell costs up to three seconds, once, the first time Chips for Mac connects a
  bridge.
