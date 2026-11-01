# 0200. Pressing a message lifts it, and Not right? replaces the thumbs

Date: 18 October 2026
Status: Accepted, 18 October 2026, on Arjun's "Let's go with B lifted. And also enable it for the
harness which ignore feedback as well" after the mock. Replaces the phone's message sheet (M3.4,
ADR 0050's receipt in it, ADR 0167's deletions in it) with a lifted menu, and the thumbs and *What
went wrong?* of ADR 0031 with one *Not right?*, on both apps. ADR 0031's wire is unchanged.

## Context

Arjun, 18 October 2026: "Message bubble long press → Thumbs up thumbs down, and what went wrong
flow. I am not sure the purpose of thumbs up, and the difference between thumbs down and what went
wrong. Should we remove Thumbs up? Also need this message long press sheet to look more cooler and
functional."

What the three did, read from the code that day:

| In the sheet | The room saw | Jacobian did | OpenClaw, Hermes, OpenCode, ACP |
| --- | --- | --- | --- |
| 👍 | 👍 1 under the bubble, for good | dropped it (`onFeedback` returns on anything but 👎) | nothing: no bridge listened for `feedback` |
| 👎 | 👎 1 under the bubble, for good | asked what went wrong, *answer with `/wrong`* (`fixFlaggedTurn`, no note) | nothing |
| What went wrong? | the sheet closed, a field opened under the bubble, the note showed in amber | the same fix turn, with the note | nothing |

So the thumbs down and the note were one act, *redo this*, and the thumbs down alone only got a
question back, in Telegram's words; the thumbs up was a reaction nobody read, and with no
un-reacting (ADR 0031) a stray tap stayed on the line. The
sheet itself was seven blocks tall: Copy text, Select and Share, Message details, the thumbs and the
note, the deletions, and the run's receipt below the fold. The phone offered neither Pin nor Edit,
which the web's menu and core have had since M5.4.

The mock (<https://claude.ai/artifact/FZ43VHR4QQt1d3vv84R24u>) drew the sheet as built, **A ·
Tidy** (the same sheet, four discs, one Not right? row) and **B · Lifted** (the room blurs, the
bubble lifts out of it, a glass capsule of quick actions above it and a glass menu below), and the
Not right? page both share. He picked B, and asked that the harnesses that ignored feedback act on
it too.

## Decision

1. **A press and hold lifts the message.** The room behind blurs, and the bubble you pressed rises
   out of it a little, at its own place, on the spring: a copy of it drawn over the room, as the
   send's flight draws one (`SendFlight.tsx`). (The bubble in the room was first kept out of
   sight; see the addendum.)
   Above it, on a capsule of the system's glass, what is done to the words: **Copy**, **Select**,
   **Share** (on your own message **Edit** in its place) and **Pin** (**Unpin** on a pinned
   line). Below it, on a glass card, the rest: its title (who said it, and when), **Not right?**
   on an agent's message, **What the run did** with the run's one line on the line that closed a
   run, then **Delete for me** and, where the reader may, **Delete for everyone**, in red. The
   bubble moves up only as far as the card needs to stay on the glass, and a bubble taller than
   the room left for it shows as much of itself as fits, from the part that was seen. A tap on the
   blur, the back button or a screen reader's escape puts it down: the copy settles back onto the
   bubble. VoiceOver's *Message actions* opens it as the hold does.
2. **The quick actions are done where they are.** Copy turns to *Copied* and puts the menu down a
   beat later; Share opens the share sheet; Pin pins and puts the menu down, and the room's pinned
   strip shows it. Pin follows the door: anyone in the room but a guest (`mayPin`).
3. **What wants a page opens the sheet at that page**, as the menu goes: Select (the formatted
   reader, ADR 0123), Edit (the words in a field, Save), Not right?, What the run did (the
   receipt, ADR 0050), and Delete for everyone's question (ADR 0167). The sheet has no menu page
   of its own any more; its X and a pull put it away. The sheet rises only once the lifted menu's
   own modal has gone: one presented while the other was still going went with it (the walk,
   PM-2), and the copy goes down onto wherever the bubble is then, which the keys going moves.
4. **Not right? is one page, in place of the thumbs and the note.** Four reasons, each one tap
   (*Wrong facts*, *Missed what I asked*, *Too long*, *Not finished*), a field for anything else,
   and *Send to <name>*, which waits for a reason or words; the sheet rides the keys (ADR 0112).
   The reasons go in front of the words as a sentence, and the two are a `correction` (core's
   `notRight`). Nothing sends a reaction any more; a 👍 or 👎 already on a line keeps drawing, and
   the note lands under the bubble in amber as before. The field that opened under the bubble is
   gone from the phone. The web keeps its popover menu and its form under the bubble, which loses
   the thumbs and gains the reasons, and the menu item says *Not right?*.
5. **Message details goes.** The card's title says who and when, and the bubble already says when
   it was edited.
6. **Every harness answers it.** The bridges for OpenClaw, Hermes, OpenCode and ACP take a
   correction on one of their agents' messages as Jacobian does: a run in that room, by the agent
   who said the message (found by its id in the room's context), in the session its turns in that
   room go to, with a turn that quotes its reply and what was not right and asks it to look again
   and answer properly, or to ask in one line when it cannot tell. The run's goal is *Looking
   again: <the note>*. A 👎 from an older device is the same turn with no note; a 👍, or any other
   reaction, is still nothing. Each feedback is answered once.
7. **Where there is no glass** — Reduce Transparency, Android, the web target — the room is dimmed
   instead of blurred and the capsule and the card are painted on the page's surface, as every
   capsule is there (`Glass.tsx`). Reduce Motion takes the travel out: the copy, the capsule and
   the card stand where they go at once.

## Consequences

- No protocol, server or migration change: `feedback` is ADR 0031's. Going live is the web build,
  `pnpm desktop`, `pnpm phone ship`, and a restart of each bridge with its new code. Jacobian is
  unchanged: it already answers a correction.
- The phone's `LineMenu` becomes the sheet of pages (`LinePages`), and the lifted menu is
  `LiftedMenu`, its motion Reanimated in a file of its own (`LiftedMotion.tsx`), which Jest stands
  in for, as it does the room's other motion. The capsule and the card grow from a speck and are
  never hidden by opacity: glass that comes into being at nought opacity draws its shadow alone
  (the walk, PM-1). The walk is `testing/scenarios/rooms/press-a-message.md`.
- A device older than this still offers 👍 and 👎; they still land and draw, and a 👎 now gets a
  second look from every harness but Jacobian, which still asks what went wrong.
- Mocks are out of the repo, as asked on 28 September 2026.

## Addendum, 18 October 2026: a tall message starts and ends as the room shows it

Arjun, the same evening: "we need to refine the experience with tall message bubbles — the nav and
bottom abruptly disappear and appear." Filmed on the simulator, a reply running up under the bar
lifted as a copy drawn whole, over the back button, the room's name and the status bar, in its
first frame; the next frame cut it short, and the reply's foot, which the room had shown, was gone,
because the bubble was out of sight. Going down, the copy sat over the bar with the foot missing
for some twenty frames, and then the bar and the foot came back at once. The photo flight had met
the same thing on 23 September and is clipped to what the chrome leaves (`uncovered`, `media/tiles.ts`).

- **The copy starts and ends as what the room showed of the bubble**: cut where the bar, the pinned
  strip and the band's ramp under them stand over the room, and where the composer does
  (`RoomSeen`, a view of that size in the room, measured on the UI thread with the bubble, so it
  follows the keys). As it rises the cut opens to what the menu leaves room for, with a bubble's
  corners where it is cut, and as it goes down it closes again. The cut is two clipping views moved
  by transforms, never sized.
- **The bubble stays in the room.** It is not put out of sight: under the copy it cannot be seen,
  and the rest of it goes soft with the room as the blur comes up and sharp again as it goes. Where
  a copy moves to make room for the card, the card stands over where it was.
- **A tall message lifts from where it was seen**, not from the screen's top under the bar.

The finding is PM-6 (`testing/scenarios/rooms/press-a-message.md`).

## Addendum, 19 October 2026: the menu is drawn on the window, and lets go of the room as it goes

Arjun, after the tall-message fix: "if I long press to show sheet, dismiss and then long press on
the same message again, the sheet does not show up." The menu was a modal, and a modal holds the
whole screen until it is dismissed: the copy had to settle and the system to take the modal away,
590 ms after the tap beside it on the simulator, while the menu looked gone well before that (the
copy at rest is what the room shows). A press in that time went to the modal's backdrop, which put
down a menu already going down, and the message did not lift. On the simulator, with the put-down
slowed to some ten seconds, a second hold during it was lost with the modal and lifted the message
with the layer.

- **On iOS the menu is drawn on a layer laid on the window** (`FullWindowOverlay`, react-native-
  screens; `LiftLayer.tsx`), over the bar and the status bar as the modal was. It takes every touch
  while the menu is up, and none once it is put down, so the room behind takes the next press while
  the copy is still going back. A hold then lifts the message again at once.
- **The menu has gone as soon as its copy has settled.** There is no modal to dismiss, so no
  `onDismiss` to wait for; a page a choice opened (decision 3) still waits for that, and is a sheet
  presented over the room with nothing going that could take it away (PM-2 cannot happen).
- **Elsewhere the menu stays a modal**, as there is no such layer: on Android a press during the
  put-down is still the modal's.
- **Nothing in what is held up comes or goes on Reanimated's layout animations** (`LiftStill`).
  The copy is drawn by the line's own parts, its time among them, which fades as it goes (`Leaving`).
  On the layer, that fade kept alive as the menu went put the room's own bubble out of sight for some
  eight frames, its words and its colour gone and back (Arjun, the same night: "the actual message
  bubble blinks"; PM-8). The menu goes as one, at once, once the copy is back on the bubble.

The findings are PM-7 and PM-8 (`testing/scenarios/rooms/press-a-message.md`).
