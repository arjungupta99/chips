# 0190. Connect a harness walks to its hello, and a harness's page makes a new agent

Date: 17 October 2026
Status: Accepted, 17 October 2026, on Arjun's "proceed" to the mock's B and N. Adds to ADR 0122
(join links), ADR 0171 (the gallery), ADR 0185 and its addendum (the shelf's last tile and You's
row) and ADR 0108 (a new agent asked of a harness).

## Context

Arjun, 17 October 2026: "This 'Add an agent' in the agents tab feels completely off. What is the
goal of this? We need a refined, delightful and polished experience. And is this add an agent or
add a Harness?"

It added a harness. On the phone the tile made a join link and handed it to the share sheet as a
paragraph of text, with `join({ link })` and `eval "$(chips join …)"` in it, and that was all: it
never asked which harness, so it could not give the line to run, and nothing followed the link, so
the phone never showed whether anything arrived. The desktop's dialog already had the gallery, the
line and the steps. Meanwhile the thing the old name promised, a new agent, was on no page of the
Agents tab: only the + and a room's Add made one.

The mock (a private Artifact, "Agent or Harness") drew today, A (the right words and a waiting
tile), B (pick, paste, watch it arrive), C (hand it to the Mac) and N (New agent on a harness's
page). Placement was settled first, in ADR 0185's addendum: the tile stays last on the shelf and
You has a row. Then he took B and N.

## Decision

1. **On the phone, Connect a harness opens a sheet of three pages** (`harnesses/Connect.tsx`, on
   `SheetPages`, ADR 0110), from the shelf's last tile, the foot of View all and You's row alike.
   - **The gallery**: the docs' cards (`GET /v1/connectors`, ADR 0171), then the two ways the app
     carries, Your own harness and Anything with HTTP: the desktop's cards in the desktop's words,
     each tagged with what bringing it in asks of you. A card for a harness that is here already
     says Connected, and stays a way in for a second one.
   - **The connect page**: the link is made as the page opens, allowed already with what the
     card asks for (`linkStarts`), as the desktop's is. Under the card's face and "Connect
     OpenClaw", the one line to run, or the code for your own harness, or the curl line, in a box;
     Copy first, and Send… (the share sheet, with today's words) beside it. Copy says Copied, and
     that with Handoff on it is on the Mac's clipboard too. Under that, three steps in core's words
     (`connectSteps`): Link ready; OpenClaw connects, with the link's minutes counting down while
     it waits; Says hello. Where it stops, the stall's own words (`stallWords`), and Make a new link
     where a new link is the fix. What it may do folds the switches, which change the link's grant
     until it is used. A card for a harness here already says so under the head, with New
     <harness> agent (point 4).
   - **The arrival**: when the harness says hello (`saidHello`), the sheet turns to it on its own.
     The harness's face lands with a sweep of light, and its Main agent's face comes in at its
     corner; "OpenClaw is here"; "Connected from <machine>. Its Main agent is waiting in its
     room." Say hello opens that room; Done puts the sheet away.
2. **Put away before the hello, the shelf's last tile waits.** Its + wears a ring that empties
   over the link's minutes, and its words are "Waiting / 14:12"; a tap opens the sheet on the
   connect page again. The link is this phone's and is kept while the app runs, not across a
   launch. Expired, stalled or answered, the tile is Connect a harness again. A harness that says
   hello while the sheet is away is not announced by the sheet: its tile comes onto the shelf, as
   any new harness's does.
3. **The desktop keeps its dialog** (the gallery, the connect card and its five steps) and gains
   the same arrival: on the hello the card gives way to the face, "OpenClaw is here", the line,
   Say hello and Done.
4. **A harness's page has New agent**, on the phone and the desktop, for whoever may ask a harness
   for a new agent (ADR 0108, point 4: its owner, or an owner or admin of the workspace) of a
   harness that makes them (`new_agents`). It asks for the agent's name, offering the first name
   it would be given (ADR 0150), and makes a space named after it with the ask in it
   (`askIntoNewRoom`: the room is made by its name, then ADR 0108's ask; the room is erased if the
   ask is refused, as `forkIntoNewRoom`'s is). The room then says "Asking Hermes for Ivy…" and "Ivy
   joined", as any ask does. The mock drew the + window with the harness picked; it is not that,
   because the + asks only harnesses that take new spaces, which Hermes and OpenCode do not, and
   it names a space, where this names an agent.
5. **The words are core's** (`packages/core/src/connect.ts`): the two ways, the cards' tags and
   heads, the lines to copy, which harnesses are here, the three steps, the minutes left and the
   arrival. The desktop's Join.tsx reads them from there.

## Consequences

- The share sheet is now one way out of the connect page, not the whole of it. `joinShareText`
  stays, for Send….
- The phone still makes no token: Anything with HTTP shows the curl line that trades the link for
  a key, and the token form stays on the desktop (a desk job, `harnesses/Profile.tsx`).
- A link made on the phone and put away is followed only while the app runs. One made on the
  desktop is followed there.
- Option C (Open on the Mac) is not built: it needs the server to ask one paired device to open a
  page, which waits for a pick of its own.

## Addendum, 18 October 2026: walked on a simulator, and Cancel link

The phone's sheet was first looked at on an iPhone 17 Pro simulator after it shipped, against a
scratch server, with a real `@chipschat/harness` joining by each link and saying hello, and filmed.
Four faults were fixed:

- **A card's page grew in three pieces a few frames apart** ("Making a link…", then the line, then
  the steps and What it may do), and the sheet's glide chased each: on every card the panel fell
  about 50 points in one frame and climbed back. The page now has its shape from its first frame:
  core's `makingSteps` stand the three steps with the first under way, What it may do stands with
  the link's starting grant, and a stand-in link of the server's shape (`linkStandIn`, from the
  phone's own server address) holds the line's place unseen under "Making a link…". The first step
  now ticks where it was seen spinning.
- **The tile's countdown ring emptied from three o'clock**, where iOS starts a rounded `Rect`'s
  outline. It is a path from twelve o'clock (`countdownPath`), so its gap grows clockwise from the
  top.
- **What it may do wore a chevron shut and an arrow open.** One chevron turns over, as a room
  file's versions do.
- **The arrival's words waited for the face's spring to be still**, 0.97 s after the face landed.
  They come on the face's first swing to its place (`LANDED_MS`, 220 ms), with the Main agent's
  face.

A card for a harness here already no longer says "Run this where Claude Code runs." over a page with
nothing to run; its head is the harness's name.

**Cancel link.** Arjun, while it was being walked: "do we have a way to cancel connect your own
harness?" There was none: the X, Back and the dialog's close put a link away and it worked for its
fifteen minutes. On his "Phone + desktop": while a link waits to be used, a quiet Cancel link under
its steps (core's `CANCEL_LINK`) withdraws it (`DELETE /v1/join/:id`, a refusal of `denied` to the
harness that comes with it after) and the page is the gallery again; the phone's tile stops waiting.
It is not offered once the harness has taken the link, nor once the link has stopped. Putting the
sheet or the dialog away still leaves the link working, since its line may already be running.

## Addendum, 18 October 2026: a card wears its harness's face

The walk left one thing for Arjun to judge. A docs card wore the docs' face (OpenClaw a red O,
ground 12 in `connectors.json`), and the harness that came in by its link landed in its name's
colour, as every harness does: a brown O on the arrival, the shelf and every list, on the phone and
the desktop alike. Its Main agent takes the harness's name (ADR 0183), so it wore the name's colour
too. Hermes went from violet to blue, Claude Code from orange to orchid.

He was shown four ways, cheapest first (a private Artifact, "Which face arrives"): leave it; the
arrival lands the card's face; the link carries the card's face and the server gives it to the
harness and its Main agent; or the card wears the face its harness will. He took the last.

- **A docs card has no face of its own.** The gallery and the connect page draw it by its name
  (`connectHead`'s face is none for a card), so the face picked is the face that arrives, and a
  card for a harness here already wears its tile's face. The two ways keep their wafer and plug:
  they are ways in, not harnesses.
- **The docs' `face` is gone**: from a connector's schema, from `connectors.json` and so from
  `GET /v1/connectors`, and core's `cardFace` with it. A docs file from before still reads; its
  face is left out.
- The docs' colours go with it. Claude Code is orchid, and Codex and OpenCode are both pink, as C
  and O where the docs had Cx and </>. A harness that names itself differently from its card
  arrives in that name's colour.

## Addendum, 18 October 2026: the page says where its line goes

"Run this where OpenClaw runs." left Arjun asking whether it was a copy and paste to the terminal,
then: "please be more clear in the instructions shown in the phone / web". The line under a card's
name now says where what the page shows goes and what to press (core's `connectHead`): "Paste this
into a terminal on the computer where OpenClaw runs, then press Return." A sentence goes into your
chat with the agent, your own harness's lines into its code where it starts, and the curl line into
a terminal, its key to your harness.

Under the box, both apps say core's `connectNote`: how long the link lasts and, for a connector not
published yet, the folder that computer needs, read from the card's `cd <folder> &&`. On the phone
it starts with how a copy reaches the computer (Handoff), and it no longer trades places with
"Copied…" when Copy is pressed: the button says so, and the page keeps its height.
