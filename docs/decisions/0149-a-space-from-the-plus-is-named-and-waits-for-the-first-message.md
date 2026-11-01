# 0149. A space from the + is named, and waits for the first message

Date: 11 October 2026
Status: Accepted, 11 October 2026, on Arjun's "go with A, copy 1, build it". Amends ADR 0084 (the +
asks a harness with first words) and ADR 0148 (decision 8: the first message is the brief).

## Context

Arjun, 10 October 2026: "From the creation box we only name the space, and I do not want agent to
start speaking until I send the first message. For this flow the center of the screen should show
something like 'what would you like to do'."

The + made a room asked of a harness by sending the person's first words with it. The words were
the brief: the harness heard `space.created` with `asked_of`, then the words, and its turn on them
made its agent, claimed the room, named it, and answered. So the room started work the moment it
was made, and its name was the harness's.

Both harnesses already wait for a room's first message before they do anything with it. Jacobian's
`onSpaceCreated` only notes the ask, and the OpenClaw bridge's `asksMe` only records it. Each
claims and makes its agent in the turn on the first words. The server already keeps a person's
name over a claim: `title_by` is "person" when `space.created` carries a title, and a claim's title
is dropped then.

Mocks at phone width: <https://claude.ai/artifact/BXxextijtzxt88vic7BaT3>.
- **A**: the + asks every pick for a name and sends nothing, and the room shows who waits. About a
  day, in Chips only.
- **B**: the harnesses make their agents when the room is made, before any message. Two to three
  days, in Jacobian, the bridge and Chips.

He picked A, with copy 1 ("What would you like to do?"). FIG 2 showed A with Jacobian and OpenClaw
both picked.

## Decision

1. **The + asks for a name, whoever is picked.** On the phone and the desktop, the field always
   says "Name the space" (`NEW_SPACE_NAMED`). "What's this space for?" (`NEW_SPACE_FOR`) is gone.
   The line under the faces says who joins and that they wait: "Jacobian joins · waits for your
   first message", or "Jacobian and OpenClaw join · they wait for you" (`newSpaceLine`). The
   words become the room's name, on one line.
2. **The room is asked of the harnesses by that name, and nothing is said.** `createSpace` takes a
   `title` beside `askedOf` and `alsoAskedOf`. The first face picked is `asked_of`, the rest
   `also_asked_of` (ADR 0087's addendum of 30 September). Each harness is added, and no message is
   sent. The person's name holds when the first harness claims the room.
3. **The room asks what the person would like to do.** In an open room, neither a Main room nor a
   thread, with agents or harnesses in it and nothing said, the middle shows their faces (up to
   three), "What would you like to do?", and "Jacobian is here and waits for your first message."
   (or "Jacobian and OpenClaw are here and wait…", or "A, B and 2 more…"). The words are core's
   (`WAITING_ROOM`, `waitingIn`, `waitingRoomWords`). An Empty room once filled shows the same
   middle. A room of people alone keeps ADR 0148's "Nobody's here yet".
4. **The field is the room's field.** In a room with agents and nothing said, it says what it says
   in any room: "Message Everyone" in a room of several (ADR 0081), else the room's own words.
   ADR 0148's `startWords` is gone, since the middle already asks.
5. **The first message makes the agents, as before.** Each harness makes its agent in the turn on
   the person's first message. The first claims the room and its agent leads (ADR 0104). The
   others answer beside it, and any may pass (ADR 0109).
6. **On the phone, nothing flies.** The window fills the screen, the room is made under it, and the
   window dissolves into the room, as an Empty room's does (ADR 0148, decision 4). The words'
   flight to a first bubble, its landing and the bubble held out of sight are deleted. The bubble
   watch the room's own send uses moved to `spaces/BubbleWatch.tsx`.

## Consequences

- No server, protocol or harness change, and no restart.
- One send no longer makes a room and starts its work. That takes a name, then a first message.
  `pnpm live new` still makes a room with a brief, for scripted runs.
- The + no longer says who leads. The first face picked does, as before, but the line names them
  all alike.
- Jacobian still names its agent from the first message, not the room's name, and its first reply
  still says what it made. Changing that is Jacobian's, for his word.
- Rooms asked before this, with no title, still read "New space" until claimed, and are named by
  the harness (`useNamed` counts only those).

## Addendum, 11 October 2026: the lead is picked by its name, and the window waits for the room

On his "make the window wait for the room to draw and fix the lead pick as well", and his pick
"Tap the lead's name" of three ways to pick the lead.

1. **The line says who leads, and its name hands the lead on.** With several picked the line is
   "Jacobian leads ⇄ · OpenClaw joins · they wait for you" (core `newSpaceLine`: `leads`, `next`).
   "Jacobian leads ⇄" is a button: a tap hands the lead to the next one picked, the one that led
   going to the back (core `newSpaceNextLead`), and the faces stay as they are. The lead is
   `asked_of`; it claims the room on the first message and leads it (ADR 0104). Picking faces is
   unchanged (ADR 0084: the first tap chooses), so the face the window opened on no longer takes
   three taps to keep the lead. On the phone the button's target reaches a thumb's height past the
   line's 19 points, so the card keeps its height; on the desktop it stays mounted as the lead
   changes, so it keeps the keyboard.
2. **The window dissolves into the room once the room has drawn itself.** The room's screen says
   so a frame after its list has laid out (`useDrawnUnderWindow`, SpaceView's `onListed`), and the
   window, filled, waits for that before it dissolves. Under Reduce Motion its fade waits too. A
   room that never says so is gone into after a second and a half (`DRAWN_WAIT_MS`). Before, the
   window dissolved as it filled, and the simulator showed six tenths of a second of blank page
   with the room then appearing all at once.
3. **The room marks that lead from the start.** Until the first message, the room's lead was
   nobody: `space.lead_set` comes with the claim, twenty seconds after it in "Test space" (11
   October 2026), so "Lead" showed in the room's agent list only then. Core's `roomLeadOf` now
   reads the harness the room was asked of as its lead while nobody has been chosen and it is
   still there, which is until its agent takes its place on the claim. That is the lead the server
   will set (`leadFromClaim`, which also passes over a "No lead" said before the claim), so the
   room's agent list, its sheet, its routes and the desktop's members show one lead from the room
   being made. A lead chosen in the room stands over it, as before.

## Addendum, 15 October 2026: more than one beside the lead are counted

On his "fix the + create space box layout odd truncation", with a screenshot of the phone's window
with Claude Code, Codex, Jacobian and OpenClaw picked: the line read "Codex leads ⇄ · Claude Code,
Jacobian and OpenClaw…", cut before "join · they wait for you", and "Claude Code" under its face
read "Claude…".

1. **The line names one beside the lead, and counts more.** "Jacobian leads ⇄ · OpenClaw joins ·
   they wait for you" as before; with two or more beside the lead, "Codex leads ⇄ · 3 more join ·
   they wait for you" (core `newSpaceLine`, so the desktop says the same). The gold rings already
   show which. All four named took 470 points at the phone's 13; the card gives the line 349 on an
   iPhone 17, and the counted line takes 281 to 322 with these names.
2. **A name of two words takes two lines under its face on the phone**, as a person's does in the
   share sheet: "Claude / Code" (75 points against the tile's 60). A name of one word stays on one
   line, which a second line would only break inside. The row is as tall as its tallest name, which
   depends on who is offered, not on who is picked, so it still never moves under the thumb. The
   desktop's names have 74 pixels and "Claude Code" fits there.
