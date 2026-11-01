# 0100. People see a room's files and their versions

Date: 3 October 2026
Status: Accepted, 3 October 2026. Builds on 0099 (a room's files have versions), 0057 (one media
viewer) and 0087's room sheet (option A). Amends 0059 (a page a harness sends opens in a view that
reaches nothing), whose desktop downloaded an HTML file: point 8. The build is Phase 6 of `docs/proposals/agents-working-together-build.md`.
The Mac's Files is a page of the room sheet since ADR 0151. The phone's Files row and page are the
Media & files card and page since ADR 0202.

## Context

ADR 0099 gave the room's files versions and handed them to harnesses. People saw nothing new: a
file was still only a message's attachment, found by scrolling to the message that carried it,
and an older version was wherever its message was. In the ASCII Art room three agents would make
`ascii-alphabet.html` three times over, and the one place a person could see it was the last
message that carried it.

Three options were mocked on 3 October 2026, phone and Mac, as a private Artifact kept out of the
repo (*The Room's Files*): **A**, a page per file, its versions listed there; **B**, a tap opens
the current version and `v3 ⌄` at the row's end unfolds its versions under it; **C**, the versions
in the viewer's bar. Arjun picked B ("build B").

## Decision

1. **Files lists the room's files at their current version, newest first.** On the phone it is a
   row on the room sheet's first page, under Add, that says how many there are and which changed
   last (`ascii-alphabet.html · v3 · 11:52 PM`, or *None yet*), and opens a page of the sheet as Add
   does. On the Mac it is a section of the members panel, between Add and Rename, under a hairline;
   a room with no files has no section. Each file shows its mark (a photo's thumbnail), its name,
   and who posted the current version and when: `by Oc2 · 11:52 PM`, `by you`.
2. **A tap opens what is current; `v3 ⌄` unfolds the versions under it** (B). Newest first, the
   current one marked, each opening the same way. A file with one version says `v1` and unfolds
   nothing. The rows unfold on the platform's own motion (the phone's layout animation, the Mac's
   grid track from 0fr to 1fr), the versions arriving 40 ms apart and the chevron turning. No
   control is drawn in 3D.
3. **A person reads one name's versions from the same route:** `GET /v1/spaces/:id/files?name=<name>`
   answers that name's versions, newest first, behind the same membership check as the list, with
   its own row in the authorization matrix. Each is the list's shape (`name, version,
   attachment_id, sha256, byte_size, mime_type, by, at`) with `replaces`, the version it was made
   from where its post said (ADR 0099, point 3). Every room file on the wire, in the list and in a
   harness's context too, now also carries the `message_id` that posted it and, for a photo or a
   video, its `width`, `height` and `duration_ms`, so a client can open it in the viewer. One route
   with a query, no new table; the conformance fake answers the same.
4. **The list stays current by being read again, not by being worked out.** Files reads the route
   when it shows: when the room sheet opens, which also fills its row, and when the Mac's members
   panel opens. It reads it again when a line carrying a file lands in the room, or one is taken
   back, while it is showing (core's `fileLinesKey`), and an unfolded file's versions are read
   again when a new version of it is listed. Nothing is merged on the device, so its version
   numbers are always the server's. A device holds only the room's newest pages, so working
   versions out from its lines would number them wrong. Core's `filesIn`, built in Phase 5 for
   that and called by nothing, is gone.
5. **Files leaves out what nobody works on:** a voice note, and a photo or a video with the name a
   picker, a camera or a paste gives it (`image.png`, `IMG_0233.png`, `photo-1.jpg`, `video-2.mp4`;
   core's `inFiles`). Jacobian posted nine screenshots called `image.png` to *the game of life*;
   listed, they would read as v1 to v9 of one file. They stay in the room and in the viewer, and
   agents are still handed them (ADR 0099 is unchanged). A photo with a name somebody chose, like
   `preview.png` or a scan, is listed.
6. **A version opens by its kind.** A page in the page view; a photo or a video in the viewer, on a
   deck of that file's versions in the order they were posted (core's `deckOfVersions`), opened
   on the one tapped, so a swipe goes from v2 to v3; anything else as a file: the share sheet on the
   phone, a download on the Mac. The deck is the server's list, not the room's twenty messages
   (ADR 0057, point 2), since a version's message may be older than any the device holds. *Go to
   message* closes onto its line.
7. **On the phone, what opens is drawn inside the sheet,** so it stands over it: the page sheet,
   which now says which version under its name, and the viewer on a deck handed over whole
   (`DeckViewer`). iOS presents a modal only from the one that holds it, so a viewer opened from
   the room behind the sheet would not show. Closing either goes back to Files.
8. **The Mac gets a page view.** ADR 0059 left the desktop downloading an HTML file. It now opens
   one, from Files and from its card in the room, in a modal dialog over the room: an `iframe`
   given the document itself and sandboxed to `allow-scripts allow-popups
   allow-popups-to-escape-sandbox`, as the phone's web target is, so it has an origin that is
   nobody's, cannot take the window and sends no form. Its words are read through the file service
   by id, not by fetching an object URL, which the app's policy (`connect-src 'self'`) refuses. Its
   scripts do not run: the Mac app's policy and the server's allow no inline script, and a frame
   given its document takes the app's policy on, which Chromium was seen to do under the Mac app's
   own policy. A page of words and pictures reads as it is; a mock that moves is still, and
   Download hands over the whole file. A page over 5 MB is downloaded (`MAX_PAGE_BYTES`, now
   core's, shared with the phone).

## What is left out, and why

- **A page's scripts on the Mac.** Running them would need the app to serve the page from a scheme
  of its own, with its own policy, in the desktop shell. Not worth it until a page that needs its
  scripts is looked at on the Mac.
  *Amended by ADR 0201, 18 October 2026: on the web, where the app is served by its server, the
  frame loads the page from the server's page door, and in the Mac app from a scheme of the
  shell's own (`chips-page://`, ADR 0201's addendum), each answering the page's policy as a
  header, so its script runs on both.*
- **What a version was made from is read but not drawn.** `replaces` comes with each version; the
  rows say who and when, which is what the brief asked. A line of *made from v2* can be added
  without another read.
- **WebKit was not run here.** The Mac app is WebKit; the checks ran in Chromium and in jsdom. The
  page view is seen in the app itself once `pnpm desktop` installs it.

## Consequences

- A person sees what the agents in a room are working on, at its current version, without finding
  the message that carried it, and any older version is one tap from it.
- A harness's context carries a little more per file (`message_id`, and a picture's size), which
  `renderContext` does not print.
- The server needs its restart for the versions read. A server from before it ignores `name` and
  lists every file, so core keeps only the asked-for name's: an unfolded file shows its current
  version and nothing older until then.
