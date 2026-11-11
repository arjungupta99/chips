# 0280. An ask is drawn around its command, and answered from a tray

Date: 6 November 2026
Status: Accepted, 6 November 2026, on Arjun's "Build B" after the mock "Ask screen redesign"
(https://claude.ai/artifact/NTpwxYov2etqth7WRsjyjM). Builds on ADR 0239 and its addendum of the
same day, and on ADR 0142.

## Context

Ike's ask in "Chips design and architecture", 6 November 2026, was the screen that started ADR
0239's addendum, and Arjun asked for the screen itself next: "make this screen more cool and
polished. Show mocks first". As built it said the command three times and showed it once: the
headline was the harness's question with the command quoted after it and cut off at 160 characters,
the preview under it was the ask's input as JSON with the command again, escaped, and Always listed
the starts it would remember under Remembers, away from the words they were taken from. The
answer sat under all of that, at the foot of a scroll, and the time left was a line of grey among
the others.

The mock drew Ike's ask four ways: as that build left it, tidied (A), redrawn around the command
with the answer in a tray (B, the pick), and B on a command that writes a file. He picked B.

## Decision

1. **The command is drawn one part to a line, as Chips reads it** (`commandPlate`, core). A line is
   led by how it follows the one before: `›` after `;`, `&&`, `||` or a new line, `|` after a pipe.
   Each keeps its words as they were written, quotes and escapes too. The words a standing yes
   would remember are bold; output thrown away (`2>/dev/null`, `2>&1`) is struck through; a write
   into a file (`> limits.js`) and a part on the never list (`rm -rf`) are red. Under it a caption
   says how many parts Chips read and that thrown-away output writes no file. Protocol's reader
   (`commandParts`) still decides; this one only draws, and draws every command, read or not.
2. **The plate takes the preview's place when the preview says the command again** — a JSON
   preview, or one that holds the command's words (`plateTakesPreview`) — and the headline drops a
   command quoted at its end (`plateHeadline`). A preview that says something else still shows.
   "Just this once" is not drawn on a command, which is once by its nature and whose Approve now
   says how far it reaches; "Until you take it back" still is.
3. **Always lights the words it keeps, in the command.** Remembers is gone: under Always the bold
   words turn gold one after another down the plate, and the line under the choices says "Commands
   made only of the lit words go ahead without a card …".
4. **For an hour draws the hour** as a strip from now to its end ("Now, 11:09 PM" … "Until 12:09
   AM") that fills as it is picked, and its line no longer says the time.
5. **Approve says how far it reaches** — "Approve once", "Approve for an hour", "Approve always" —
   and once pressed turns green with a tick and what was given ("Approved", "Until 12:09 AM",
   "Always, in every space", "Always, in Bakery"). On the phone the screen holds that for 750 ms
   before it goes back, from a copy of the ask as it was, since the log has it answered by then.
   On the web and the Mac the card shows it until the answer comes back and the card cools, or
   for four seconds if it doesn't, and is as wide as either set of words from the start, so it
   does not jump as it turns.
6. **A command kept to once names why by its words**: "This writes to `limits.js`, so you answer it
   each time." (`writesWords`), with a red dot that ties it to the words the plate marks. A command
   that does more than Chips can read and writes nothing says what it said before.
7. **On the phone the answer is a tray of glass at the foot** (`needs/Tray.tsx`), in thumb's reach:
   the choices as a segmented control, what the one picked lets through folding in under it, and
   Deny and Approve. Deny's reason, an edit and Hand to… take the tray's place while they are open;
   the tray grows to them from its foot and rides up with the keys. The ask scrolls under it.
8. **The phone's bar is who asked and how long is left.** The agent's face and name with the space
   under it replace "Ike needs a decision"; at the bar's end a ring drains toward the moment the ask
   lapses, with the minutes in it, and a screen reader hears the sentence the line used to say. The
   web and Mac card draw the same ring, small, beside "expires in".
9. **Motion**, on the phone in `needs/AskMotion.tsx` and on the web in CSS: a pass of light goes
   down the plate once as it opens; the lit words light 70 ms apart; the strip fills over 700 ms;
   the choice's line fades in; Approve's word rises out as the tick rises in and draws itself.
   Reduce Motion gets each where it ends.

## Consequences

- No server or protocol change. Core gains `commandPlate`, `plateCaption`, `plateHeadline`,
  `plateTakesPreview`, `writesWords`, `approveWords`, `answeredWords`, `hourEnds`; `whileWords`
  loses its time, and `reachWords` speaks of the lit words.
- The plate keeps a home folder as written (`/Users/<name>/…`) rather than shortening it to `~` as
  the mock did: a shortened path could hide whose folder a command works in.
- `askStanding` names the file a write goes to, from the plate; the door and the engine still go by
  `commandParts`, which refuses the same commands it did.
- The room's card on the phone draws the plate too, four parts deep and then "and 3 more parts",
  with no caption and no light, in place of the same JSON dump; its Approve and Deny are as
  before. An ask read after it was answered (ADR 0255) draws it whole.
- On the phone a line is the start, as a chip that can light, then the rest of its words as one
  run of text that wraps under itself, so a long path stays beside its `cd`; a redirection and
  its file never part across lines. A walk on an iOS 26.5 simulator against a throwaway server
  (Ike's command, and one that writes `limits.js`) checked the plate, the lit words, the strip,
  the tick, the ring and the tray riding up with the keys.

## Addendum, 8 November 2026: a shorter card on the web and the Mac, and a foot that changes once

Arjun, of the Mac: "these permission screens are extremely large, they need to be bit shorter in
height. also tapping them, makes the whole scrolling window go bouncing", and "bouncy can also
happen when the permission screen appears".

A command of ten lines made a card of 629 pixels, and the answer was below the fold. Now:

- A long command scrolls inside its plate, seven lines and part of an eighth, and a long preview
  inside its box. A shadow at either end says there is more that way. What a write or a never-list
  part would do is still said under the buttons, so it is never only below the cut.
- The choice and the buttons share a line, which wraps where there isn't room; this replaces "on a
  line of its own". Why a yes goes no further, and what the choice lets through, stand under them.
  The switch that lets the agent work is one line, not two. The same ten-line command is now 370
  pixels.

The bounce was the room being told two things at once. Frame by frame in a real room: an ask took
the working row away at once and its card 300 ms later, so the room dropped 56 pixels and rose 548;
and a yes to one of a run of commands went -68, +101, -45, +12 as the card folded with the next one
landing under it. Now the foot of a room (`RoomAsks`) changes once for each thing that happens:

- The working row stands through the ask's beat and goes in the frame its card is drawn.
- It comes back as an answered card starts to fold, not while the card still shows its tick.
- A new ask takes the place of the card answered before it. That card waits for it rather than
  folding first, so a run of asks answered one by one does not move the room at all.

Choosing For an hour or the switch still adds the words saying what it lets through, and the room
glides once, by 34 to 57 pixels, to keep the card in view. The phone's ask is its own screen and is
unchanged.

## Addendum, 10 November 2026: Jacobian's commands on the plate, and the phone's screen tidied

Arjun, of the phone's ask screen opened from a push: "please make this approval screen (opened
from notification) more polished". It was one of Luis's asks in Health, through Jacobian, and it
was drawn as everything this ADR set out to replace:

- **The command was a paragraph.** Jacobian asks `jacobian.shell.shell` with the command line
  itself as the input, where other bridges send `{ command }`. Protocol's reader found no command,
  so there was no plate: the words wrapped as body text under the preview's own title, "shell ·
  shell". Core's `shownCommand` now gives the plate a shell's bare words too, when the action kind
  runs a shell (`shell`, `bash`, `exec`, `terminal` and the like as a part of the kind). That is
  for drawing only. The plate says it is not read part by part (`readable` is false, so no caption
  says Chips reads each part, and nothing lights), and what a yes keeps is still protocol's to say.
  The plate takes the preview's place as it does for any command, so "shell · shell" goes with it.
  The web and the Mac draw the same plate from the same core.
- **Three tags took three lines.** "Just this once", the risk and "Waits for you" each stood on a
  line of their own. They are one row now that wraps, the risk first. "Just this once" was already
  not drawn under a plate.
- **Hand to… and Open the space were two loose words** a few points apart, lined up with nothing.
  They are rows of one inset group under the tags, each with its mark and a chevron, and Open the
  space names the space at its right. The question's screen and a plain item's draw the same row.

Not changed: an Always on one of Jacobian's shell asks is still kept for the whole kind, because
protocol's reader, which the server uses, reads only `{ command }`. Reading bare words there too is
a change to what a yes reaches, not to how the ask looks, and is left for its own decision.
It was taken later the same day (ADR 0239, addendum of 10 November 2026, his "Build A"): protocol's
reader takes a shell's bare input as its command, core's `shownCommand` is gone, and the plate
lights what an Always keeps.
