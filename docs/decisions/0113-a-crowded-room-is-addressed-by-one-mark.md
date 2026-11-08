# 0113. A crowded room is addressed by one mark

Date: 4 October 2026
Status: Accepted, 4 October 2026. Its words for four or more named are "4 agents" since ADR 0114, which also picks several from the list and keeps a pick.

## Context

Arjun: "check the chat text box where we show the agent selector. How does it scale when there are
too many agents in the space? and when we select the "everybody" option".

The faces at the front of the field (ADR 0081), the list they open, and the route over a sent
message all drew one face per agent, with no limit. The list had no height and never scrolled.
On a simulator, ASCII Art was grown from 5 agents to 17 on a scratch copy of the live database:

- **The field.** With Everyone picked, from about 4 agents the empty field said only "Message":
  "Everyone" wrapped to a second line, and an empty field is one line tall. From about 14 the
  faces covered Send and the words, and ran past the field's edge. Nothing could be typed or
  sent.
- **The list.** It grew up over the room and off the top of the screen, the lead first: from about
  14 agents with the keys down, and about 7 with them up. At 17 with the keys up, 6 rows of 17
  could be reached.
- **The Everyone row.** Its own faces squeezed "Everyone" into a column one letter wide from about
  12 agents.
- **A picked Everyone** was kept as the agents in the room at that moment. An agent who joined
  before the send was left out, and the field turned into "Message J0, O1, J1, O2 and J2".
- **The route** over a sent message drew every face too, larger, and would run off the screen.

The mock ("Addressing a Crowded Room", a private Artifact) drew two ways: A, three faces and a
count; B, Everyone as one mark made of the room's colours. Measured, three faces and a count left
the field's words about 126 points, short of the 137 "Message Everyone" needs, so A became two
faces and a count. Arjun: "I like both A and B. So for 4+ let's show the B design, but we also need
to show a number next to it. And tapping the route UI should also provide a scrollable list of all
the agents." Then, for the list: "it's height should not go beyond 3/4 of screen height", and
"actually make that upto 1/2 of screen height".

## Decision

- **Up to three agents are their faces**, overlapped, as before. **Four or more are one mark and a
  number**: a face-sized square of the first four's colours, in an agent face's corner, and how
  many beside it. The same for Everyone and for four or more named by @, wherever a group is
  drawn: the field, the list's Everyone row, the route, a lane's trail. The phone's `Faces`
  (`LaneChain.tsx`) and the desktop's `FaceGroup` (`@chipschat/ui`) draw it alike, from
  `faceGround`, the colour each face already stands on. The mark is seen, never read out: what
  holds it says who, and how many ("To Everyone, 17 agents").
- **The field's words stay on one line.** Core's `aimWords` names up to three, then the first two
  and how many more: "Message J0, O1 and 3 more". On the phone the empty field's words are a line
  of text over the input, ending in "…" where they don't fit, because a field of several lines
  wraps its own placeholder. The input keeps the words, unseen, for a screen reader.
- **The list stands at most half the window**, the field's words included (Arjun: "upto 1/2 of
  screen height"), and never past the room's bar, which binds first with the keys up
  (`listRoom`). The phone measures where the field's words are when the list opens, and again
  when the keys have come or gone. The lead is at the top, Everyone is held at the foot by the
  thumb, apart from the rest, and the rest scroll between, fading at the top while there are more
  above. A row takes the first tap with the keys up. On the desktop the rows scroll in what half
  the window leaves, and the arrow keys walk from them into Everyone.
- **Everyone picked is everyone** (`AimPick`, `"all"`): whoever is in the room when the message
  goes, as a sent message's `to: "all"` already is. An @ still decides over it.
- **A route is a button that lists who the message went to.** On the phone a sheet: "To
  Everyone", how many and which message ("17 agents · “Hello all” at 13:38"), then each agent with
  its harness and the lead marked, scrolling, and Done (`RouteSheet.tsx`). On the desktop the same
  list opens under the route, and Escape, a click elsewhere or the route again closes it. Every
  route opens it, a single agent's included: a route shows faces and never names. A route
  remembers it went to everyone (`MessageTrail.all`), so its words stay "Everyone" whoever has
  come since (`routeWords`). Its name is "Went to …", where the field's is "To …".

## Consequences

- Nothing changes on the server, the protocol, Jacobian or the bridge, and there is no migration.
  Going live is installing the phone and the Mac app, and rebuilding the web copy 4431 serves.
- A room of two or three looks as it did, but for the hairline over Everyone and the lead moving
  to the top of the list.
- The mark shows four colours however many it stands for. The number says how many; the list and
  the route's sheet say who.
- The + window's row of faces and the list share one fade (`ui/Fades.tsx`).

## Addendum, 6 November 2026: Everyone is the mark from two

Arjun: "I want to show the tile icon even for 2+". In a room of two or three, Everyone at the foot
of the column a slide up from the field's faces grows (ADR 0229) was two or three faces
overlapped side by side, wider than the column, and read as a few of them rather than the room.
Everyone is now the mark from two, wherever it is drawn as Everyone: the column's foot, the
list's last row, the field's faces, the send's flight and the route over the message, on the
phone and the desktop (`marked(count, everyone)` in `LaneChain.tsx` and in the ui package's
`trail.tsx`). Two or three named by @ or picked by their circles are still their faces; any other
group is still the mark from four. Where the mark stands for Everyone, the field and the route say
how many, from two ("To Everyone, 2 agents").

The mark is cut for fewer than four, as a group's picture is in Messages: two are halves side by
side, three a half and two quarters (`cellsOf`; on the desktop the first colour spans both rows).
A square of four with two colours had left its foot empty.

And the field moves when who it goes to changes (Arjun: "I am looking for super smooth motion"),
by a pick, a slide up the column or an @: the faces and the empty field's words crossfade in
place (`ui/Swap.tsx`), the capsule grows or shrinks to what it holds and its chevron goes with its
edge (`GROWS`), and the words slide aside on the same clock (`ASIDE` in `ui/growing.tsx`), across
only, so a line typed changes their height at once as before. Walked on a simulator against a
scratch server, at 30 frames a second: the faces, the chevron and the words arrive together in
about 190 ms. The desktop already faded new faces in where the old ones were.

The same night (Arjun: "no need to show number next to everyone option, it makes the icon
misaligned with the rest"): a mark that is a choice, in the list the field opens and at the
column's foot, has no number beside it (`counted`), so it stands on the line its neighbours'
faces stand on and its words start where theirs do; the row's words and the column's tag say who.
At the column's foot it is now as big as the faces above it, where it had been a size down to fit
the number. The field and the route over a message keep the number. Measured on the desktop
against a scratch server: the Everyone row's mark is 20 pixels square at the same left edge as
the agents' faces, and its words start where theirs do.
