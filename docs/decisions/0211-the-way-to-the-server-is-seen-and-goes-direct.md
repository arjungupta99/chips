# 0211. The way to the server is seen, and goes direct

Date: 20 October 2026
Status: Accepted, 20 October 2026, on Arjun's "I want to discuss how do we allow someone to switch
to VPN (should they choose). The experience should be easy, informative and delightful", his
answers ("guests too", "also an owner switch"), then "go with your picks on both mocks, start
building". All four phases are built. Builds on ADR 0085 (You, This
phone), ADR 0191 (the key pinned at pairing, the tunnel door), ADR 0207 (invite links at the
relay) and ADR 0210 (a computer pairs by a link at the relay). The mock was "Going Direct" (an
artifact, kept out of the repo).

## Context

A device reaches its server one of two ways. It tries the server's own address first, the door
(`establishLink`, 1.5 s), and goes through the relay when the door does not answer. On Arjun's
setup the server's address is on his tailnet, so a phone with Tailscale on goes direct and one
without goes through the relay.

Three things were missing.

- **Which way was a word.** This phone's group on You said "Direct" or "Relay" and nothing else:
  not why the relay is slower, not what it can see, not since when.
- **A socket on the relay stayed there.** The way was chosen when the socket opened. A phone that
  came home, or turned Tailscale on, kept going through the relay until something closed the
  socket, which could be hours.
- **Nobody could choose the tailnet**, for themselves or for a guest, and an owner could not turn
  the relay off.

## Decision

The way is drawn and said, it moves to the door by itself when the door answers, and a person can
choose to go direct: their own devices, guests by asking an owner, and the whole workspace by the
owner's switch.

### Phase 1 · The way seen, the way moves (built)

1. **Core leaves the relay by itself** (`Transport.goDirect`, `packages/core/src/transport.ts`).
   While the socket is on the relay, the transport dials the door with the pinned key, asks for a
   ticket through it and opens a socket there, while the relay's socket goes on carrying
   everything. Only once the door's socket is open is the relay's let go, and the new one
   subscribes from the last `seq` heard: make-before-break, nothing missed, nothing blinks. A door
   that does not answer in the probe's time changes nothing. It tries when the app comes back to
   the front, when the network comes back, and every two minutes (`DIRECT_CHECK_MS`).
2. **The store keeps the way's history.** The snapshot gains `linkSince` (when the socket began
   going the way it goes) and `linkBefore` (the way before, with its start and end). `roundTrip()`
   times one signed read of `/v1/health` over whatever way the socket goes.
3. **The words are core's** (`packages/core/src/wayWords.ts`), so the phone and the desktop say the
   same: "Through the relay" / "Direct" / "Connecting…" / "Can't reach Arjun's Mac mini", what
   each means ("The relay passes sealed traffic along. It sees that this device connected and
   when, never what's said."), "over Tailscale" only for a `*.ts.net` address, a round trip as the
   middle of the last three, "Since 9:43 AM" (the way is the title above it), "Before that Relay,
   2 h".
4. **The phone's Connection page** (`apps/mobile/src/you/ConnectionPage.tsx`, `/connection`),
   opened from the Connection row on You. It draws the route: this phone, the relay's stop when
   the socket goes through it, the server by the name it gives itself, and traffic running along
   the line (`ConnectionRoute.tsx`, the one file of it on Reanimated, shapes in viewBox units and
   the names under them in the app's own type, in thirds, the relay's centred on its stop). Under it
   the round trip, measured every five seconds while the page is in front, the words, and Since /
   Before that. When the socket leaves the relay while the page is open, the relay's stop fades,
   the line straightens, a tap of success, and "Direct now · 38 ms, was 410 ms" for four seconds.
   Reduce Motion stills the traffic and changes the line at once.
5. **The desktop's Connection card** on You (`apps/web/src/app/you/ConnectionCard.tsx`): the same
   words, the round trip and the history. A browser on the server's own page has no relay to go
   through and says "Direct, from this browser"; the Mac app says "Direct now" as the phone does.

### Phase 2 · Go direct, your own devices (built)

On Arjun's "push, merge the tailnet fixes and start Phase 2".

1. **Go direct**, for an owner on the relay whose server's address is on a tailnet: a row under
   the route ("Faster, nothing in between, and it keeps working if the relay is down. Needs
   Tailscale on this phone.") opens a guide, a sheet on the phone (`GoDirectSheet.tsx`) and a
   dialog on the Mac (`you/GoDirectDialog.tsx`). Three steps: Get Tailscale (Tailscale's own
   download page), Sign in with your server's account ("Arjun's Mac mini is in tail2f9c1e. Sign
   in to the same one."), Turn Tailscale on ("Waiting for Arjun's Mac mini to answer directly…",
   its number breathing). Chips cannot see the first two, so they are said, not ticked. While the
   guide is open the store is asked to go direct every three seconds; when the socket has moved
   over, every step goes green ("answered directly. Moving over…") and the guide goes by itself
   after 1.5 s, leaving the page's "Direct now". Members and guests get their own guide (Phase 3).
2. **Only direct**, for a device with a relay to leave, offered once it has reached its server at
   its own address (`wentDirect`, kept on the device from the first such link): before then it
   could only stop the device connecting ("Connect directly once to turn this on."). On, it is
   kept on the device (`onlyDirect`, `rememberOnlyDirect`), `establishLink` does not try the relay,
   and the transport moves off a relay socket it holds, or lets it go if the door is shut. Off, a
   transport that could not connect tries again at once. When it cannot connect, the page says
   why: "Only direct is on, so this phone won't use the relay, and Arjun's Mac mini didn't answer
   at its own address. Turn Tailscale on, or turn Only direct off." The route then draws the
   straight line it is holding to, still.
3. **Small fixes from the walk:** "Direct now" is said only while it is still so (back on the
   relay or lost within its four seconds, it goes); the names under the middle stop fade one out
   before the other in; "Before that" says "Relay, briefly" for a stretch under a minute.

### Phase 3 · Guests (built)

On Arjun's "go, archive it and start Phase 3".

A guest asks from their Connection page. Owners get the ask as a notification; one pastes a
Tailscale share link for the server (node sharing: the guest reaches it at the owner's name), and
it reaches the guest with the guide. **Arjun's pick:** owners are asked each time; after the
first, "Give this same link to the next guest" is offered, ticked.

1. **Who.** Anybody in the workspace but an owner asks: an owner signs in to their own tailnet,
   which Phase 2's guide says. Only an owner answers, since the machine and the Tailscale are
   theirs; an admin asks like anybody else.
2. **The guest's guide.** On the relay, with the server on a tailnet, the Go direct row says "An
   owner shares the server with you in Tailscale on this phone." and opens the guide with three
   steps of its own: Ask an owner ("Chips asks the owners to share Arjun's Mac mini with you.",
   then "Asked at 4:12 PM. You'll hear when it's shared.", then "Natalie shared it."), Get
   Tailscale, open the invite (the invite button once shared), and Turn Tailscale on, waiting on
   the server's own address once there is something to open. The ask carries the round trip the
   page measured. While the ask waits the guide reads it again every three seconds.
3. **The owner's sheet** (`DirectAskSheet.tsx`, `you/DirectAskDialog.tsx`), opened wherever the
   app is for the oldest ask this device has not shown, as a join request's: who asks and their
   round trip through the relay, how to share ("In Tailscale's Machines, open Arjun's Mac mini's
   menu, then Share, Copy invite link. Paste it here.", with Open Tailscale), the link's field,
   and "Send to Dana", held until the field holds Tailscale's link (`shareLinkOf`, protocol's:
   https, tailscale.com or one of its names). Once it does, "Give this same link to the next
   guest" is offered, ticked, with "Turn on Reusable link in Tailscale's Share for this."; kept,
   the next owner to answer finds it filled in and still sends it themselves. Then "Sent to Dana",
   or "Already answered" when another owner was first.
4. **What sharing gives**, said on the owner's sheet: "Sharing gives them Arjun's Mac mini and
   nothing else on your tailnet, but all of it: anything else it serves there, they can reach
   too, unless your Tailscale access rules limit them." Tailscale's own page says a share reaches
   the one machine and that access rules limit it further; it names no ports, so the earlier
   "port 443" was not said.
5. **The wire.** `/v1/direct-asks` (ask, mine, the waiting list, one, share), a `direct_asks`
   table and a `direct_links` row per workspace for the kept link (migration 0051), never the
   event log: a share link is a key to the machine. Three pushes, fixed words and an id each
   (ADR 0045), one phone per person: the owners hear an ask waits, the guest hears it was
   shared, and the owner who shared hears when the guest's socket arrives other than through
   the relay (the hub's `opened`, for every socket). A push in front of an open app shows no
   banner, so the phone reads the ask it names instead and the owner's sheet opens; the store
   reads an owner's waiting asks at each hello and whenever the app comes back to the front.
   No socket frame: a client naming a frame in its `hello` that an older server does not know
   is refused by that server, so one would have cut every new app off from every older server.
   Since then (on Arjun's "go, do the accepts fix"), a server takes any name in `accepts` and
   ignores the ones it does not know (protocol's `SERVER_EXTENSIONS` lists the known), so a
   frame added later can be named by new apps once the servers they meet are this new.

### Phase 4 · The owner's relay switch (built)

On Arjun's "go, do the accepts fix then start Phase 4".

A workspace setting, at run time: with the relay off the server stops dialling it and its health
says so. Before it goes, every device is told, and the switch lists who would lose the server (the
devices whose last socket came through the relay, by the hub's `via`). **Arjun's pick:** with the
relay off, new invites and pairing links still work but open only on the tailnet, and the invite
sheet says so.

1. **Where.** An owner's Relay row in the workspace's group on You, on the phone a page of its own
   (`you/RelayPage.tsx`, "Relay, On"), on the web and the Mac a card under the workspace's heading
   (`you/Relay.tsx`). The row is there where the device knows a relay or an owner has turned one;
   the card draws itself only where the server has one. Admins do not see it: the relay is the
   server's, and its traffic is the owner's to route.
2. **The page.** "Use the relay", with "relay.chipschat.ai carries sealed traffic for devices that
   can't reach Arjun's Mac mini directly. With it off, Chips is reachable only over Tailscale." (or
   "only on its own network", off a tailnet) under it. Then every device of the workspace in three
   lists, by the way its socket goes now: Through the relay now (each saying when it was last
   direct, or "never direct"), Direct now, and Not connected ("relay, 2 h ago"). A device is named
   with whose it is when it is somebody else's ("iPhone 16 · Natalie"), and the one reading as
   itself ("This phone", "This computer"), so an owner on the relay sees their own among the lost. The page reads them again
   every five seconds while it is open. Under them, Phase 3's kept share link, to forget.
3. **Turning it off** asks first: "2 devices last reached Chips through the relay. They would lose
   their connection until they go direct.", which they are, and "New invite and pairing links will
   open only on your tailnet. Devices on the relay now are told why before it goes." Then "Ask them
   to go direct first", while somebody else would lose it, and "Turn off now". On again is one tap.
4. **Asking first** pushes the people with a device that would lose the server (two fixed
   sentences, ADR 0045: "The relay is going off" / "Go direct to keep reaching the server."), one
   phone each by the claim ledger, and a tap opens Connection, where Go direct is. The owner sees
   "Asked 1 person to go direct" and the list moving as they go. **Simpler than the mock:** the
   switch does not turn itself off once the list is empty; the owner turns it.
5. **Off.** `relay.set` is written to the log first, so every device connected hears it, those on
   the relay too; the owner is answered at once, and the relay is let go two seconds later
   (`TELL_MS`), so an owner who turned it off from a device on the relay hears it done. Turned on
   again inside those two seconds, nothing is let go. Health then says `status: "off"` and names no
   relay, so pairing codes and invite links carry none and open only where the server's own
   address does; devices keep the relay they knew, for when it comes back. It stays off across a
   restart. A server holding several workspaces turns it for all of them, and tells the workspace
   of the owner who turned it.
6. **What a device on it says.** Lost or trying again, with the relay off, Connection says
   "Natalie turned the relay off at 9:05 AM, so Chips reaches Arjun's Mac mini only over Tailscale
   now. What you send waits here and goes once it is connected.", and Go direct stays offered.
   "You turned the relay off" on the owner's own devices, and "An owner" for one still under the
   server's first name for them (JR-17). The machine is named as the server last named it to that
   app, so a page opened once it is lost does not fall back to the address. An invite made while
   it is off says "The relay is off, so this link opens only on your tailnet." under the link.
7. **The wire.** `GET`/`PUT /v1/relay` (the switch, each device's way in, the kept link),
   `POST /v1/relay/ask`, `DELETE /v1/direct-asks/kept-link`, all an owner's; a `relay_switch` row
   and each device's last way in and last direct time on `devices` (migration 0052); the
   `relay.set` event (`{ on }`, a person's).

## Consequences

- A phone on the relay that comes home goes direct within two minutes, at once when it comes back
  to the front, with no reconnect seen.
- The Connection page reads the server's health every five seconds while it is open, and only
  then.
- The About row ("Direct" / "Relay") stays as the summary; the page is where the way is explained.
- `apps/mobile/e2e/goDirect.spec.ts` walks the guide with the suite's server given a tailnet name
  the browser resolves here (`--host-resolver-rules`), the door refused then let through; the
  third test in `connection.spec.ts` walks Only direct on, the server lost, and off.
- `apps/mobile/e2e/relaySwitch.spec.ts` turns the relay off from a phone on it: answered, the
  relay gone from the relay's own count, and Connection saying who turned it off.
- `apps/mobile/e2e/connection.spec.ts` proves the move in the phone's web build: paired through
  the relay with the server's door refused, the page says so; the door let through and the network
  back, it says "Direct now · 6 ms, was 8 ms" without passing through Connecting.
