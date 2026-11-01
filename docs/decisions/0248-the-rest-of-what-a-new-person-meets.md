# 0248. The rest of what a new person meets

Date: 30 October 2026
Status: Accepted. Arjun, 30 October 2026, on the new-person sweep's findings 6 to 23 after
[ADR 0247](0247-what-a-new-person-meets-says-where-it-works.md) took the first five: "Proceed with
open items". Amends [ADR 0121](0121-chips-up-is-the-first-run.md) (what `chips up` keeps and says),
[ADR 0207](0207-an-invite-link-opens-at-the-relay-and-in-the-app.md) (the relay's join page), and
[ADR 0216](0216-a-persons-message-reaches-everyone-in-the-room.md) (the phone's words about it).

## Context

The same sweep found eighteen more places where a new owner, or a person they invite, is told
something untrue or left without a next step. They fall into four groups.

- **`chips up` and `chips doctor`.** A second `chips up` dropped every setting the shell no longer
  exported, and with no `--reach` wrote nothing, though the docs and doctor said to run it again to
  write a setting in. Run in a terminal, it gave advice that led back to itself. Over SSH it said a
  browser had opened. On a VPS it called Docker's bridge "this Wi-Fi" and bound every address for a
  tailnet. Doctor told a new owner to run `chips serve`, looked only at port 4431, and skipped the
  ffmpeg and whisper checks on most servers. `--yes` turned on the hosted relay, which ADR 0245
  leaves for the owner to choose. With no user systemd bus it said only that `systemctl` failed.
- **The phone and the invite.** Saying no to iOS's Local Network prompt left a home code failing
  for ever with no word why. A 30-minute invite said "until October 30" and was amber at once; it
  never said that the inviter would be asked to allow the joiner, and a used link still offered
  Copy. The relay's join page told a stranger to ask for a place in testing, which only one person
  can give. The Relay page said On while the server wasn't connected. The push switch said On when
  the server had no token. The notification words predated ADR 0216. An invited person who signed
  out, or whose phone was removed, was told to use a computer they don't have.
- **The web and Chips for Mac.** The phone panel sent people to a command when the relay was a
  click away, and asked them to scan a code it didn't show. A card already marked Connected made a
  second harness without a word. On this Mac spun for ever when a kept bridge never said hello.
  Beside a Chips already on loopback, it said nothing was running and named `chips serve`.
- **Packaging and the pages.** A harness kept on a Linux box stopped at logout. `chips uninstall`
  run through Chips for Mac's link deleted part of the app, and a dangling link blocked the
  installer. Bridges run from a checkout broke on `brew upgrade node`. `chips help` hid the
  bridge cards. No page told someone with the app how to pair it, and several pages described
  screens and steps that are gone.

## Decision

1. **`chips up` keeps what its service has.** Every setting in the service file it wrote is
   carried forward unless the shell sets it, and a setting set empty is taken out. An exported
   `CHIPS_PUBLIC_URL` wins over the reach answer's. The values an answer writes (the bind host,
   Chips's relay, a bare home address) are worked out again each time, so an address frozen by an
   older `chips up` goes. With no `--reach`, a running service is rewritten and restarted when its
   file would change, and its port and data folder are kept.
2. **`chips up` says where Chips runs and what can change it.** Run beside a Chips in a terminal or
   a service it didn't write, it says so and what to do, once. With no display, or over SSH, it
   opens nothing and prints the link, with the `ssh -L` line for a remote shell. With no user
   systemd bus it says so and offers `--no-service`. `--yes` takes the first answer that isn't the
   hosted relay. The QR's heading says to scan it in the Chips app, and codes come from the server
   here before this machine's device.
3. **Virtual interfaces aren't a home network.** Docker, bridge, VM and container interfaces are
   skipped by `chips up` and by the server alike. With no home network, the tailnet's answer binds
   the tailnet address.
4. **Doctor reads the service it checks.** Before `chips up` has run it says `chips up`. It takes
   the port, the PATH and "a server runs here" from this machine's service file. A relay that
   turns the server away as `busy` is named.
5. **The server keeps why it isn't connected to its relay** (`busy`, `not_allowed`, `refused`,
   `unreachable`), cleared once it connects, and `GET /v1/relay` carries it. The phone's Relay page
   and the web's Relay card say "On, but not connected" and why.
6. **An invite says its own time and what comes next.** A link ending today shows the time. Amber
   comes in the last quarter of the link's own life. A relay link says the inviter will be asked to
   allow whoever opens it. A used link shows as used, with nothing to copy. The relay's join page
   says when the link ends, and to ask for a new one if it ran out while Chips was installed; the
   relay link carries `until` for that.
7. **The phone says what's true about itself.** A home-address pairing failure says where Local
   Network is allowed. The push switch is On only once the server has the token, and a launch with
   permission and no setting registers again. The notification words say what ADR 0216 sends. A
   person who isn't an owner is told to ask an owner to reconnect them.
8. **The web asks before it repeats, and says where it waits.** The phone panel offers an owner
   Turn on the relay and shows the scan line only with a code. A Connected card asks first, with
   the phone's words, now in core. On this Mac shows the join card's stall words. Beside a Chips on
   loopback, Chips for Mac offers it, with a code from `chips pair --issue`.
9. **Removing and keeping work outside the happy path.** The SDK's keep turns lingering on, or
   says the one command that does. `chips uninstall` never deletes inside an `.app` and says to drag
   Chips for Mac to the Trash; the installer replaces a link to an app that's gone. A checkout's
   bridges get a Node path that survives an upgrade. `chips help` lists the cards.
10. **The pages match the product.** A new "Get Chips on your iPhone" page; building the app
    moves to Contribute; the own-domain, Tailscale and Mac mini pages use `chips up`; the SSH line,
    the firewall line, `busy`, and the five bridge cards first, where the start pages offer a
    harness.

## Consequences

- A setting written by `chips up` survives the next `chips up`, so the docs' "run it again"
  holds. A service file edited by hand outside `chips up` (its comment gone) is treated as not
  ours, as before, and isn't touched.
- The hosted relay's join page changes only when the relay box runs this release. Until then a
  link carries `until` that the live page ignores.
- The SDK's lingering and unreachable words reach a harness's computer with each bridge's next
  release, since each carries its own copy of the SDK.
- Doctor doesn't read the relay's new `why` yet; it points at the server's log and You → Relay.
- The web's sidebar keeps "Harnesses" over the list of harnesses, as the phone's shelf does.
