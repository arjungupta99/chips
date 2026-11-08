---
title: Chips on your phone
description: Approve, deny and steer from a phone, over your own network or through the relay. Pairing, invites, getting around, and notifications.
---

The phone is where supervision actually happens. A decision that takes one thumb and no reading
gets made in a queue at a coffee shop; the same decision waiting for a laptop gets made an hour
later, or not at all. So the phone app is the whole product, not a viewer: the spaces, the fleet,
and the two buttons that matter.

The app is on TestFlight until it is in the App Store. [Get Chips on your
iPhone](/start/iphone/) is the short way in: installing it, the code `chips up` shows, and the
relay for away from home. This page is everything after that. To build the app yourself from a
checkout, on your own phone or a simulator, see [Building the phone app](/contribute/phone/).

## Pair it

On the computer that runs Chips, `chips up` shows a QR code for the phone, and running it again
shows a new one. On a computer already paired, **You → Devices → Pair another device…** shows one,
and `chips pair --issue` prints one in a terminal on the server's machine. In the app, tap **Scan a
QR code** on the first screen and point the camera at it. That is the whole of it, because the QR
carries the server's address and the code, and, when the relay is on, the relay and the key to ask
for there.

Scan it from inside the app, not with the Camera app. A QR shown in a browser is a web address,
and the Camera opens it in Safari, where a plain-HTTP page cannot pair: a browser makes its device
key only on a secure address, and your server's address on a home network or a tailnet is not one.
The page says so, and offers the code to the Chips app instead. The same is true of a browser on a
laptop: open Chips at `http://127.0.0.1:4431` on the machine that runs it, or put the server behind
HTTPS, which [Tailscale Serve](/operate/tailscale/) does in one command.

The address in that QR comes from the server, not from the browser drawing it. A browser only
knows the origin it loaded from, which is `127.0.0.1` on the machine chipsd runs on, or a dev
server on another port — and `127.0.0.1` names the one device in the room that is not holding
the camera. So the server says where it answers: what `CHIPS_PUBLIC_URL` was set to, else the
address it bound, else the network it is on. Where a machine is on two networks at once, a home
Wi-Fi and a tailnet, it picks the home one, because that is where the phone in the room usually
is.

That address is the direct way in. Away from that network, the phone uses the relay, and the QR
carries one only once the relay is on: Chips's own after an owner turns on **Use the relay**, or
`chips up --reach relay` does, and one of your own, set with `CHIPS_RELAY_URL`, from the start.
Then a phone reaches Chips from anywhere, with no VPN on the phone and nothing forwarded on your
router. See [the relay](/operate/relay/) and [away from home](#away-from-home).

[Tailscale](/operate/tailscale/) is a direct path beside the relay. `chips up --reach tailnet`
puts the tailnet's address in the QR, and a phone with the Tailscale app connected reaches it at
home and away.

If the QR will not scan, tap **Type a pairing code instead**, or **Have a pairing code?** on the
first screen, and enter the code and the server's address by hand: six characters say nothing
about where the server is.

A code is single use and expires. If pairing fails, issue a fresh one.

### With an invite instead

Somebody who was sent an invite joins on the phone without a computer (ADR 0164). On the first
screen, **Have an invite link?** pastes a link that was copied, **Scan a QR code** takes one shown
as a QR (an owner's **Invite someone** shows the link's QR beside it), and **Open in Chips** on the
join page in Safari hands it over. Each opens the join card: who sent it, the workspace, the role
and what it may do, a name, and **Join**. When the relay is on, the link carries it and the
server's key, so this works off the server's network too, and the card says when it went through
the relay. Without it, the link opens only where the server's own address does, and the invite
says so. A link that was used, withdrawn or has expired says so, with who to ask.

A phone already in a workspace is asked first, on a sheet over wherever it was. The same workspace
says "You're already in Acme" and leaves the link unused. Another says "Join Studio too?", and
joining puts Studio beside Acme on this phone (ADR 0197): the workspace's name at the top of
Spaces switches between them, and its **Join another workspace** takes the next link, pasted or
scanned.

A link to a space (ADR 0168) names it on the card ("Arjun invited you to Bakery in Demo as a
guest"), and joining opens the space. In the workspace already, the sheet is about the space: "Join
Bakery?" puts you in it and leaves the link unused, "You're already in Bakery" opens it, and a
guest in another space is told a guest is in one. An owner makes such a link from the space's sheet:
**Add → Invite someone new**, the last row under People.

`chips://join?invite=…&lan=…&relay=…&key=…` opens the same screens, which is how to try them on a
simulator: `xcrun simctl openurl booted "chips://join?invite=…&lan=http%3A%2F%2F127.0.0.1%3A4598"`.

## Away from home

Away from home the phone reaches Chips through the relay, which an owner turns on: **You**, then
**Relay** under the workspace's name, then **Use the relay**. Until then, a phone away from home
has no way to the server, and the setup card's **Away from home** says so with **Set up**, which
opens the same page. A phone already paired learns of the relay from the server, on its next
connection or at once while it is connected, so nobody scans again.

A phone holding both addresses tries the network first, on a short timeout, and falls back to
the relay on its own. It never asks which network you are on, and there is no setting for it.
When it goes through the relay the header says *Connected through the relay*, so you always
know which way you got in.

If the relay answers and your server is not registered with it, the phone says **your server is
not reachable — it may be asleep**, rather than *Reconnecting…*. That is a different
instruction: a dropped network is worth waiting two seconds for; a laptop that shut its lid is
worth going home and opening, and the relay cannot help, because there is nothing awake on the
far side to reach. See [when your machine sleeps](/operate/mac-mini/).

## Getting around

Four tabs at the foot of the screen: **Spaces**, **Agents**, **Search** and **You**, with the **+**
for a new space beside them. The app opens on Spaces. (There was a fourth, **For you**, a queue of everything waiting on you across every
space; it was withdrawn on 22 September 2026, and an ask is answered in its space.) The bar is the
phone's own, so it shrinks out
of the way as a list goes up and comes back as it comes down, and a press feels like every other
tab bar on the phone. A development build has a fourth tab, **Runtime**, which is a report and not
part of the app.

A space, an ask or a harness opens over the whole screen with a bar of its own: the chevron takes
you back, and a space's bar says what the space is called with, underneath, the harness working in
it — or how many people are in it, where there are more than the name can hold.

On an iPad, in a window 700 points wide or more, the app stands in columns instead
([ADR 0256](https://github.com/arjungupta99/chips/blob/main/docs/decisions/0256-an-ipad-gets-a-sidebar-and-its-room-a-column.md),
[ADR 0276](https://github.com/arjungupta99/chips/blob/main/docs/decisions/0276-an-ipads-tabs-float-and-a-third-level-opens-beside-the-second.md)):
the tab's list, what a row in it opens, and a third column one level deeper. The four tabs and the
gold **+** are a bar across the foot of the list, level with a space's message field. Held upright
with a third column open, the bar folds to the round of the tab in front; press it to open the four
out again.

For the workspace's owner, Spaces starts with a card while setting up is unfinished (ADR 0170):
six steps — Chips running, a computer paired, the first agent's hello, this phone, notifications,
and a way to reach Chips from away — ticked from what is already true, each step left with the
thing to do beside it. When the last is ticked it says **You're set up** and folds away; the ×
puts it away on this phone.

**Spaces** is a list of spaces, each a row with the space's face, its name, the time it was last
live and the last thing said in it. A number on the right of a row is how many lines in it you
have not read. A space waiting on a yes says **Needs a yes** instead of quoting itself.

**Search** finds a space, an agent or something said. Spaces are found by their names and by who
is in them, agents by their names and by their harness's, both on the phone as you type; messages,
voice notes' words and the steps of runs come from the server once you have typed two letters and
paused. What matched is marked in gold. All shows three spaces and three agents, then the messages;
the chips under the field show one kind at a time. A space opens, an agent opens its page, and
a message opens its space already at that message, however far up, lit for a moment with the words you
searched for marked in it. With the server out of reach, spaces and
agents are still found, and the messages say why they aren't. What you searched for is kept on
this phone under Recent: tap one to run it again, × to forget it. With nothing typed, the faces of
your spaces and your agents (with their pins) drift slowly up behind the recents and the empty tab,
each in a softly breathing glow of its own colour, and go when you type; with Reduce Motion on, they
stand still. Before you have searched for anything, the tab says **Find** and a word
that rolls over from spaces to agents to anything said, with the whole sentence under it; with Reduce
Motion on, it stays on spaces.

**Agents** is every harness in the workspace, one card each: what it is doing, how far it is
trusted, how many spaces it works in, and how much of its context and its budget have gone. A
harness says what it is doing only while it is doing something. One that is idle, or that has
finished, says nothing at all — the reply in the space is the proof that it finished, and a
screen of green **Done** labels is a fleet that looks busy while doing nothing.

**You** is a settings list, the way the phone's own Settings is one: your face, name and role at
the top (tap it to change the name you go by), then Appearance, Notifications, the workspace's own
settings if you are an owner or an admin, and About — the server, how much the phone keeps, and
which build it is. Devices and Sign out are at the foot, one above the other, and **Delete your
account** under them ([People](/operate/people/#delete-your-account)). Every row says what it is
set to, and a row with a chevron opens its setting in a sheet.

Under the workspace's name, an owner finds **Relay** ([away from home](#away-from-home)), and an
owner or an admin finds **People**: everyone in the workspace,
the longest here first, with their role and who let them in. A person's page shows their role,
which changes from a sheet that asks first (Guest is off for somebody in more than one space), the
spaces you share with them, and **Remove from *the workspace*…**, which asks in the same words as
the computer. **Invite someone**, an owner's alone, makes a link: as what, and once or by several,
for 30 minutes; the link is shown once, with its QR code, **Share…** and **Copy**, and the
open links are listed under it, each sliding left on **Withdraw**.

In **Devices**, this phone comes first and the rest by when each was last seen; those not seen for
a month are folded under one row. Push a device left to sign it out: it is refused from its next
request. **Pair a computer** makes a code and a link: **Send the link** shares it, and opened on the
computer it pairs Chips for Mac from any network, through the relay (the `/pair` page). Typing the
code in Chips works too, on the server's own network. Leave the sheet open and it says when the
computer has arrived. **Sign out**, at
the foot, withdraws this phone at the server first, then forgets its key.

## In a space

A space reads from the bottom, like every chat. What you send rises into its place, and what
the harness sends does the same; if you have scrolled up to read, a line landing below does not
move what you are reading, and the space follows the end only when you are already there. Your own
message is the exception: sending one takes you to the foot of the space, where it is landing, from
wherever in the history you were.

While the harness works, a bubble from it sits under the newest line: three dots, then what it
is thinking and which tool it has in hand, as the harness reports them. It is one line and the
same height throughout, so the space does not move while the words in it change. It goes the
moment the answer lands — and it does not come at all while a lane's own row above it is already
breathing, which is the same waiting said once. The calls it made are under the answer afterwards, folded, one line saying how
many.

The field grows with your words, up to six lines or so, and shrinks back when you send. Send is
the blue circle inside the right edge of the field, dim until there is something to send. What
you typed and did not send stays with the space while the app runs, so a space left mid-sentence
to check something in another is a space come back to with the sentence still there.

The phone keeps its own copy of the workspace's log, so a space opens at once, offline too, and
the copy is the workspace's: it stays through an unpairing and a pairing again. When the server
lists a space the copy never saw opened, the phone reads that space again from its beginning as it
connects, so a hole in the copy closes itself; and the phone resumes from a mark it records only
behind what it has safely written, so a copy from before the mark was kept is read again from the
start once, and a write that fails is written again rather than skipped past.

## Reading a space

Your messages sit on the right in teal, everyone else's on the left. Messages one person says
close together close up into a turn, with the time inside the last of them, and a line saying
the day and the hour stands over the first message and after any silence of a quarter of an
hour.

A lane a harness routed to one of its Spaces is one row in the space: the two faces, and the
Space the work went to named beside them — three dots breathing at its right edge while the work
is going, **Failed** if it ended badly, and nothing once it is done. Files the work came back with
are under the row: a lane asked for photographs answers with the photographs, in the space you
asked in, and not only in the space it did the work in. Tap the row to go to the other end of the
lane; press and hold it for what was asked, its bounds, what it cost and what came back. A lane
with no other end — a Space handing work to a part of itself, *Chess Game → Engineer*, in the one
space — opens those details on the tap, since there is nowhere to cross to. In the specialist's
space the same lane is the faces alone, over your own words and on their side: the space is already
named after the last face and the words under it are already the first one's, so the names — and
the *via* that used to sit under the bubble — are left to a screen reader there.

What the space is waiting on is a card at its foot, under the newest line: an approval with
**Approve** and **Deny**, and a question with its form on the card itself — the options, a field
for your own words where the harness takes them, and **Send the answer**. A question is answered
there, under the message it asks about, and not on a screen of its own. A harness may ask and end its turn at once, as Jacobian
does; the answer still reaches it. When the server turns an answer or a decision away, the card
says why in red — *Not sent: that question was already answered by Dana* — rather than looking as
if nothing happened.

Press and hold any message and it lifts out of the space: **Copy**, **Select**, **Share** (or
**Edit**, on your own) and **Pin** above it; below it, **Not right?** on an agent's words, which
asks for a reason or a few words and sends them to the agent to look again, the deletions, and,
on the message that closed a run, **What the run did**: the steps, how long they took, what the
run cost, and the model and tokens when the harness said them. The receipt is never drawn in the
space itself.

The app follows the text size set in **Settings → Display & Brightness → Text Size**, and the
accessibility sizes above it. A message stops growing at half again its size, so that the time
under it and the name over it stay on their own lines; everything outside a bubble follows the
setting the whole way. For more than that, iOS's own Zoom magnifies the screen.

## Sending a photo, a video or a file

The **+** beside the composer opens a sheet: **Photo or video from your library**, **Take a
photo or video**, or **A file**, which is the Files app. What you pick appears as a chip above
the field, uploading as it arrives — the message goes the moment you send it, because the
bytes already have — and the × takes one out. Where a photo or a video was taken is stripped
on the server, as it is for the desktop; the desktop's *Keep location* box is not on the phone.

Tap a photo's chip to look at it before it goes. It grows out of the chip onto the black stage,
where it pinches, zooms and drags as a sent photo does; the bottom says its name, its size and
*Not sent yet*, and **Send** stands exactly where it stands in the composer, dimmed while the
photo is still uploading. Send from there and the message goes; **Close**, a drag down or the back
gesture put the photo back in its chip, still waiting.

**Voice note** is the sheet's fourth row. Tap the microphone to record, and tap again to stop
and add it; a note stops by itself at five minutes. Its chip says *uploading and transcribing…*
while the server writes down what was said, and the message carries the sound and the words, so a
harness hears both. The space shows a voice note as a round **Play** and the words under it, and
search finds it by them. The row needs a build of the app made since voice notes went in; an
older one shows the words and opens the sound through the share sheet.

A message's photos, and the videos the server measured, arrive as one album under the bubble, in
the order they were sent. A photo alone keeps its own shape and stops at 200 points tall, so a
portrait receipt does not take the screen; two sit side by side; three are one tall beside two;
four or more are two by two, with **+2** on the fourth for the ones past it. A video is a tile of
the album like any photo: its poster, a play mark and how long it runs, and a tap opens the viewer
on it, where it plays. One the server could not measure is a row under the album whose **Play**
does the same. An HTML file — a harness's mock, a report — opens
as a page over the space, with **Done** and the file's name at the top and **Share** beside them.
The page runs its own scripts, so a mock's switches work, and it can reach nothing of the app's: no
files, no key, no storage that outlives it. A link you tap in it opens in Safari, or Mail for an
email address; a page that tries to leave on its own, send a form, or open a `chips://` link stays
where it is. A page over 5 MB goes to the share sheet instead, and so does every HTML file on a
build of the app made before pages went in. Anything else is a row that opens on a tap into the
share sheet — Quick Look, Save to Files, and every app that takes the file. A file is fetched
through the phone's own signature and kept once, so a second look costs no request.

### What a tap on a photo or a video does

The photo grows out of its tile to fill the screen, over a black stage, and the bars come in a
moment after: **Close** at the top left, where it stands in the deck (*3 of 8*), **Share** and
**⋯** at the top right, and who sent it, when, its name, its size and its pixels along the
bottom.

- **The deck is the photos and videos of the twenty messages around the one you tapped**, in the
  order they were said: the space's last twenty if you tapped near the foot, and ten either side
  if you tapped further up. An album's photos are all in it,
  even the ones past the four the grid shows. Voice notes and files are not; they stay rows in
  the space.
- **Swipe** left or right for the next or the previous. The ends hold, and nothing wraps.
- **Pinch** to zoom, up to three times or to the photo's own pixels, whichever is more, and drag
  to move around while zoomed. **Double-tap** zooms to two and a half times where you tapped, and
  double-tap again fits it back. A pinch let go at under three quarters of the size closes it.
- **Drag down** (or up), and the space shows through behind as the photo shrinks. Past a line
  you feel as a click, let go and it flies back into its tile; let go before the line and it
  comes back. **Close**, and the back gesture or Android's back button, do the same.
- **Tap** once to hide the bars, and again to bring them back.
- **Press and hold**, or **⋯**, for the menu: **Share**, **Save** into Photos (or the gallery on
  Android), **Copy** the picture, **Go to message**, which closes the viewer onto the message and
  flashes it, **Details**, and **Open original**. The viewer shows a copy made for the screen,
  and Open original swaps in the file as it was sent; it is not offered while the file itself is
  what is showing: a GIF, a photo the server could not read, or anything from a server from before
  15 September 2026, which makes no such copy.
- A photo that would not come keeps its thumbnail and says why, with **Try again**.

A video in the viewer is an item like any other: you swipe to it and away, and drag it down to
close. It is not zoomed.

- **It plays when you land on it**, from the start, and pauses when you swipe away. Swipe back
  and it goes on from where it was.
- **On your own network or tailnet it streams**: it starts in about a second, and you can move
  through it at once, while the rest comes as it plays. A spinner shows while it starts, or while
  it catches up after you move. Nothing is kept on the phone.
- **Through the relay it downloads first**: its poster shows a ring with how much has come, and
  the bars say how many megabytes of how many. The whole copy comes to the phone before it plays,
  and is kept, so a second look starts at once. So does a server from before 15 September 2026,
  wherever you are.
- **The bars** carry its controls: play and pause, a line you drag along to move through it, the
  time, mute, and Picture in Picture. They go by themselves three seconds into playing. Tap
  while they are hidden, or while it is paused, to play or pause it and bring them back; tap
  while it plays with them showing to hide them.
- **Dragging it down** pauses it; if it comes back, it plays on.
- **System player**, in the menu, hands it to the phone's own full-screen player, where AirPlay
  and captions are. On Android that is the player's own controls, with speed, and captions when
  the video has them.
- **The server makes a copy that plays everywhere** a little after a video arrives. Until it
  exists the original plays, and the bars say *the copy that plays everywhere is being made*. A
  server from before 14 September 2026 does not say, and the bars say nothing.
- **An original this phone cannot play**, such as an iPhone's HDR video on an Android phone,
  keeps its poster until the copy is made. It says *This phone cannot play the original* and *the
  copy that plays everywhere is being made*, with **Try again**, which plays the copy once it
  exists.
- **On Android**, Picture in Picture pins the video alone, in a window shaped like it, and the
  status bar hides with the bars.

### On an iPad or an Android tablet

The viewer is the same, sized to the window. Where the window is wide — at least 768 points
across and 600 down, which is an iPad or an Android tablet held either way, or a foldable opened —
it covers the whole window, the list and the space beside it both, and adds two things:

- **A filmstrip** under the caption: a thumbnail of everything in the deck, the one on the stage
  ringed in gold and kept in the middle as you go. Tap one to go straight there. A video's has a
  play mark. It goes with the bars, so a zoomed photo or a playing video has the stage to itself.
- **Arrows** at the left and right, for the one before and the one after, with none at an end.
  They rest a little dim and come up under a mouse or a trackpad's pointer. A swipe still works.

**Turn the tablet** and the picture fits the new shape. A zoomed photo keeps its zoom and keeps what
was in the middle of the screen in the middle, so the line of a receipt you were reading is still
the one in front of you.

A narrow window is the phone's viewer, with no strip and no arrows: an iPad app in a split or Slide
Over, a small Stage Manager window, or a tablet app shrunk to a third. Making the window narrow
while the viewer is up closes the space and the viewer with it, and puts you back on the list.

With **Reduce Motion** on, the photo fades in and out where it stands instead of flying. With
VoiceOver, the photo is one element named for it — *Photo 3 of 8, site-02.jpg, from Dana, today
at 11:02* — and swiping up or down moves through the deck. **Save** asks once for permission to
add to your library, and never to read it.

How big a file may be is the workspace's to say: an owner or an admin sets the caps on photos,
videos and files in **You → *the workspace's name* → Attachment limits**, in megabytes, under the
server's own limit. Nobody else sees that group. A file over its cap is refused at the chip, before a byte of it leaves the
phone, in the words the server would have used.

## Being told

The phone asks the first time it matters: when the first ask from an agent arrives, a sheet says
**Hear when an agent needs you?** with **Turn on notifications**, which brings iOS's own alert,
and the sheet's X for not now. It asks once; after that it is yours to turn on here:

**You → Notifications → Notify me on this phone.** Turn it on and the phone asks iOS for
permission, gets a push token, and tells your server where to reach it. From then on, a decision
that needs you lights the lock screen within a few seconds, with **Approve** and **Deny** on it.
Approve asks for Face ID first. Neither opens the app. On Android, where a notification's button
cannot ask for the unlock, the button reads **Approve…** and opens the ask once the phone is
unlocked, and you approve on the card. Deny still answers from the lock screen.

The rows under the switch are the ones that decide who hears what, each with a line under it
saying what it is about. **Decisions** — an approval, or a question with no default answer, that
an agent is stopped on — come right away, or are off. **Quiet hours** are a window set on the
phone's own time wheel, and whether a decision still gets through. **Agents** is one choice per
harness, covering every agent it runs: **Everything** (its decisions, and messages that @ you),
**Decisions** (only those), or **Nothing**; the sheet says under each harness what its choice lets
through. They live on the server and are yours alone, so the phone and the desktop app obey the
same ones — and you are told **once**, on one device, not once per screen you own. The phone is
pushed decisions, messages that @ you, and what other people write in your spaces, since every
space starts on **People's messages**; each space's sheet changes that, and an agent's reply
reaches the phone only from a space set to **Every message**
([Notifications](/operate/notifications/)). Finished work and checkpoints are the desktop's to
raise, and it has the settings for them.

Quiet hours are worked out in *this phone's* time zone, not the server's. A phone in Kolkata and
a laptop in California belonging to the same person are night and day apart, and the server knows
which is which.

### What a push carries

Three ids and two fixed sentences: *A decision is waiting* / *Approve or deny from here.* It does
**not** carry the action, the preview, the risk classes, the harness's name or the space's title.
Chips has no Apple or Google push credentials of its own, so a push goes through Expo's service
on the way to your phone, and through the Chips push relay before that when your server has no
Expo access token. What they are handed is a token, those two sentences and an opaque
identifier. The words appear only when you open the card, over your phone's own
authenticated connection. [ADR 0045](https://github.com/arjungupta99/chips/blob/main/docs/decisions/0045-a-push-is-a-claim-the-server-makes-for-the-phone-and-carries-no-words.md)
records the reasoning.

The cost is real and worth saying out loud: a Chips notification cannot be triaged from the lock
screen the way a mail notification can. You are told that you are needed, not what for.

### What push needs

A push reaches a lock screen only through Apple, and Apple delivers only to a build of the app that
carries the push entitlement. The app from TestFlight does. A build of your own needs a paid Apple
team and the app's APNs key with Expo ([push on a build of your
own](/contribute/phone/#push-on-a-build-of-your-own)).

Your server needs nothing. The Chips app's Expo project has enhanced security on, so Expo
takes its pushes only with the project's access token. A server without it sends its pushes
through the Chips push relay at `relay.chipschat.ai`, which has the token and passes them on to
Expo ([ADR 0246](https://github.com/arjungupta99/chips/blob/main/docs/decisions/0246-chips-sends-pushes-for-any-server-through-its-relay.md)). The relay checks that each is a Chips push, pushes one phone at most
thirty times a minute, logs no token or words, and counts how many it sent each day. A server
with the token (`CHIPS_PUSH_ACCESS_TOKEN`) posts to Expo itself. A build of the app under your own
Apple team pushes through an Expo project of your own, so the server it pairs with needs that
project's token ([push, with a paid team](/contribute/phone/#push-with-a-paid-team)).

A server that can't push leaves the banner to your computer
([ADR 0244](https://github.com/arjungupta99/chips/blob/main/docs/decisions/0244-a-server-that-cannot-push-says-so-and-claims-no-banner.md)).
That is one pointed at Expo, with `CHIPS_PUSH_URL`, without the token, or one whose token Expo
refused. The phone says so under the switch, the setup card leaves Notifications undone with
*your server can't send them yet*, the phone doesn't ask to turn them on, and `chips doctor` says
it on the server's machine. What needs you still waits in Chips.

### If the switch will not turn on

It says what is wrong rather than failing quietly:

- **This build has no Expo project id.** A build from this checkout has Chips' own, in `app.json`;
  a build under your own Apple team needs one of its own ([push, with a paid
  team](/contribute/phone/#push-with-a-paid-team)).
- **This phone is not allowing notifications.** Settings → Notifications → Chips.
- **This build cannot receive push.** It was signed by a free team, so it has no push
  entitlement and iOS will not issue a token. The switch stays off until the build changes: the
  fix is [a paid team](/contribute/phone/#push-on-a-build-of-your-own).
- **This phone could not get a push token**, and why, in iOS's words or Expo's — a dropped
  connection, usually. Try again.
- **The server did not take it**, and what it said.
- **Your server can't send notifications**, with the switch on or off: it has no access token
  for Expo, or Expo refused the one it has ([above](#what-push-needs)). The switch still works,
  and the phone is pushed to the day the server can.
- **Your server's last notifications didn't get through**: the service that delivers them,
  Expo or the Chips relay, didn't answer or didn't accept them. The next one tries again, and the
  line goes once one gets through. A decision the phone missed comes up on your computer instead.

## What is not there yet

**The App Store.** The app is on TestFlight for now ([Get Chips on your iPhone](/start/iphone/)).

**Android.** The app has been walked on an Android emulator, not on a phone, and push on Android
waits for a Firebase project for Expo's service to send through. [Building the phone
app](/contribute/phone/#on-android) says how to build it.

**Passkeys.** Signing in with a passkey is not built on the phone. When it is, it needs the
Associated Domains entitlement, which a free team cannot sign either, and a server at an HTTPS
address the app can name. Pairing with a code is how you get in on a phone.
