# 0296. A gold dot says an update waits, and opens About

Date: 12 November 2026
Status: Accepted, 12 November 2026, on Arjun's picks from the mocks (`chips-notes/mocks/update-dot`,
round 2): "Go with your picks", the buttons' ring (3), and on the Mac and the web "show it on the
right side of the bar". Builds on ADR 0295 (About Chips), and changes its Your computer group.

## Context

Nothing in Chips said an update was out. The App Store updates the phone for most people, but the
computer runs whatever the install line put there until somebody runs it again, and Chips for Mac
doesn't update itself. Ten releases came out between 1 and 12 November, so a banner for each would
nag, and with nothing at all a person's computer falls behind while their phone moves on.

The first round of mocks put the update in a card at the top of Spaces. Arjun asked instead for "a
top yellow animated yellow dot in the center of nav. When people tap it, they are taken to about
page … animate the update buttons". The second round showed the dot three ways and the buttons
three ways; he picked the dot that breathes and the buttons that send out a ring.

## Decision

1. **The dot.** A gold dot, 10 points with a 44-point target, at the centre of the nav row under the
   status bar on Spaces, Agents, Search and You. A pushed screen such as a room has its own title
   there, so the dot isn't shown. It arrives once with a ring, then swells and glows about every
   three seconds while it shows; with Reduce Motion it stays still. VoiceOver says "Update available.
   Opens About." On an iPad it stands over the middle of the list's column. On the Mac and the web
   it stands at the right end of a bar, never over a title: in Chips for Mac's window, the strip the
   traffic lights stand in; with no strip (a browser, or the Mac in full screen), the rail's top row,
   a little apart from the +, folding with the workspace's name when the list steps aside; at a
   phone's width, the bar over the page. Tapping it opens About: pushed on a phone, beside You's
   list on an iPad, the Mac and the web.
2. **About's Updates group** takes the place of Your computer (ADR 0295, decision 3). This app's row
   says its version and, when one waits, the version and an Update button: the App Store on a phone
   or an iPad, the download page for Chips for Mac (Install) until it can install itself. The
   computer's row says its machine and version, and for the workspace's owner, when it is behind,
   the version and an Update button that opens the steps. The foot keeps ADR 0295's line about what
   waits for the computer. Under them, an **Update dot** switch, per device, on by default. When
   About opens with an Update button showing, each button sends out the dot's ring twice.
3. **What waits.** The phone is offered the App Store's version; Chips for Mac the newest release;
   a browser nothing of its own, since the computer serves it. The computer waits, for its owner
   only, when a release or this app is newer than it. A computer run from its source says 0.0.0 and
   is left out. The About Chips row in You keeps a small still dot while anything waits, whether or
   not the dot is lit.
4. **When the dot lights.** A release says whether it lights the dot: `dot: true` on its entry in
   `RELEASES` (core), set by the release session with the entry; fix releases leave it out and show
   in About only. The dot lights for an update that holds such a release once that release has been
   out two days, so the fixes that follow roll into it, and names the newest version. Opening About
   puts it out for that version, and a newer one waits two weeks from then. Updating puts it out. Run
   over 1 to 30 November 2026 it lights twice, on 6 November for 1.1.0 and on 20 November for 1.2.4, where a dot for every
   release would have lit nine times.
   The rule is one function in core, `updateDot`, with the November run as a test.
5. **Where the newer versions come from.** The computer reads two things once a day, and once a
   minute after it starts: `https://chipschat.ai/releases.json`, which the site writes from the
   `RELEASES` of the tree it is built from, and the App Store's version for Chips, from Apple's public
   lookup. Neither request carries an account, a device or the workspace. The computer hands the
   result to its clients in `GET /v1/server` as `updates`. The apps never call either address
   themselves. The address is the `server.updates` setting (`CHIPS_UPDATES`): a release sets it to
   the site's; a checkout leaves it unset, and a computer set to `off` or left unset reads neither,
   so only what the app was built with is known. On a phone or an iPad whether the dot is on and
   what About last put it out for are kept on the device; on the Mac and the web, in the page's
   storage.

## Consequences

- The release checklist's `RELEASES` line (ADR 0295) now says whether the release lights the dot.
- A site ship publishes `releases.json`; until the site is shipped from a tree with this change, the
  computer finds no feed, and the dot lights only for a computer older than the phone. A computer
  that finds none tries again after ten minutes, then twice as long after each miss, up to once a
  day, so a missing feed costs a handful of requests and log lines on the first day.
- An older computer has no `updates` in `GET /v1/server`; the apps read its absence as nothing known.
- What the words promise: that an update is out and where to get it, nothing about what it does.

## Addendum, 17 November 2026: the dot becomes the button, and the buttons glow

Arjun, going back to the mocks' first way for the buttons: "I want to go back to the design you
shared, where the dot dropped on the update button", and "I want the update buttons always animate
glowing after once they appear". This replaces decision 2's last sentence, the buttons' ring.

1. **The dot becomes the button.** Tapped or clicked, the dot flies to About's first update button,
   x and y on different curves so its path bends, swelling a little to meet it, and the button grows
   out of it as it lands; a button under it grows a beat later, and a light passes over each once.
   On a phone the flight is drawn on a layer over the whole window, since About is pushed over the
   tabs the dot stood on; on an iPad, over the list's column into the pane beside it; on the Mac and
   the web, from the bar's right end into You's About page. Opened any other way, About shows its
   buttons as they are.
2. **The buttons glow.** Every update button (Update, Install, Restart now) glows on the dot's own
   breath, about every 3.4 seconds, for as long as it shows: from the start when About is opened
   another way, after its light when the dot flew in. The computer's softer button glows less. With
   Reduce Motion nothing flies or grows, and the glow holds still.
3. **One flight, one set of numbers.** The flight is a small store in core, `dotFlights`, that each
   app keeps one of, and the motion's numbers are core's `UPDATE_MOTION` and `updateButtonTimes`, so
   the phone, the iPad, the Mac and the web move alike. A flight no button answers is missed, and
   the buttons grow at once: About says so when it shows no button (a dot lit only for what needs
   the owner, ADR 0297), and otherwise after 900 ms. Each later wait counts from the step before it,
   the dot setting off once the button has answered and landing once it has set off, because opening
   About can hold a page's thread for most of a second and the flight must start late rather than be
   cut short.
