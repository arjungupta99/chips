# 0139. A face may be letters, and you choose your own

Date: 7 October 2026
Status: Accepted, 7 October 2026.

## Context

Arjun, in one message:

- "In the you tab, I want to be able to change my icon. Show the same icon selector bottomsheet as
  we do for space and agent icons."
- "I want to make another addition to the bottom sheet (applicable to all icon consumers), we want
  to be able to add upto two letters as icons as well (like AA, AB, X...). The letters could be
  emoji as well".

Then, while it was being built: "when you are done, I need to be able to edit the name in place
(as we do in other places) instead of new bottom sheet", and "the experience should be very
polished".

What was there:

- **A face is `{icon, ground}`** (`spaceIcon` in the protocol): a mark's name from Chips' library,
  or empty for a colour alone, and the index of one of the 27 grounds. A space's is each person's
  own setting (`/v1/me/space-icons`, the `space_icons` table, one column per field). An agent's is
  the agent's, one for everybody, on `agent.updated` and in `participants.face` as JSON (ADR 0089).
- **A person had no face of their own.** Every screen drew a person's initials on the hue their
  name hashes to.
- **One sheet chooses every face** (`IconSheet`): the face at its head, the 27 grounds, the
  library's families, the marks. A tap applies; *Use the default* takes the choice back.
- **Your name was changed on a sheet of its own** (`NameSheet`, ADR 0082), while a room's title and
  an agent's name are edited where they stand (ADR 0112).

## Decision

### Letters are a third field of the one face

- **`spaceIcon` gains `letters`**, optional: one or two letters, or an emoji or two, which the face
  wears on its ground in place of a mark. With letters the mark is empty. One shape for every face,
  so a space's, an agent's and a person's each take letters with no route or event of their own.
- **"Two letters" is two letters as a reader sees them.** `lettersIn` splits text into what a reader
  counts as one: a base and whatever joins it (a combining accent, a skin tone, a variation selector
  or keycap, a flag's tags, another emoji after a zero-width joiner), and a flag's two regional
  indicators. So "👨‍👩‍👧" is one letter and "é" is one, however it was typed. It is a regular
  expression with Unicode property escapes rather than `Intl.Segmenter`, which Hermes does not have
  (checked in the phone's engine binary): the phone, the server and the web count alike, and a face
  one of them takes the others take. What it leaves out (Hangul typed jamo by jamo) counts as more
  letters, which is a refusal, never a face drawn wrong.
- **The server refuses** three letters, a space, a control character, an empty string, and more than
  32 code units (`422`). `faceLetters` is what a field keeps as it is typed: no spaces, the first two.
- **Case is as typed.** The field opens on capitals, and a person who wants "ab" can have it.
- **A space's letters need a column**: migration **0040** adds `space_icons.letters`. An agent's and a
  person's face are JSON in `participants.face` and take them as they are.
- **A client older than this draws the initials on the chosen ground**: zod drops the field it does
  not know, and the ground holds as it does for a mark the client has never heard of.

### How letters are drawn

- Where the initials were, in the same white and weight. **`lettersScale`** (protocol, beside
  `lettersIn`, since `packages/ui` may not import core) sizes them against the initials: letters at
  the initials' own size; a single emoji a quarter larger, as one capital fills a face; two emoji, an
  emoji and a letter, or two wide (CJK) characters smaller, so they stand inside the face. On the
  phone the letters no longer grow with Dynamic Type: they are part of a drawn face, not a line to
  read.
- **Every renderer**: the phone's `Avatar` and `AgentFace`, and `@chipschat/ui`'s `Avatar` and its agent
  face on the Mac and the web. Search's backdrop, the room's lines and member list, the media viewer
  and the rest all draw faces through these.

### The sheet takes letters

- **A field between the colours and the marks** (`LettersField`): a tile at its start that is the
  face the letters will make ("Aa" in the quiet tone until something is typed, then the letters lit
  on the chosen ground, as a chosen mark's cell is), a field with a placeholder in the regular weight
  and the letters in the bold one, and a clear button.
- **The head wears the letters as each one lands**, and the grid lets go of the mark it wore at
  once. The face saves when the typing stops for 0.6 s, or at once on the keyboard's done, on
  leaving the field, or on closing the sheet. One save for a word, not one per letter: every save of
  an agent's or a person's face is a line in the log, and a space's saves are not serialised.
- **A mark tapped takes the letters' place** and empties the field, dropping letters typed and not
  yet saved rather than saving them on the blur that follows. *Use the default* does the same.
- **A colour keeps the letters.** With the keys up, the colours stay in sight above the field, so a
  ground can be tried under the letters without putting the keys away.
- **The sheet rides the keys** (`Sheet`'s `keyboard`, ADR 0112): at three quarters of the window it
  rises until its top reaches the top; the head, the colours, the field, the family chips and two
  rows of marks stay above the keys.

### Your own face

- **`person.face_set`**, a workspace event: `{ participant_id, face }`, `face` `null` for the
  initials. Projected onto the person's `participants.face`, the registry's row, which a rebuild
  keeps and the replay writes again. `PUT`/`DELETE /v1/people/:id/face`, yours only, a guest's too
  (it changes nothing about the workspace). The same face again records nothing.
- **Not sent to a harness** (`FACE_EVENTS`): a harness draws nobody, and Jacobian and the bridge were
  never taught the event. A person who sees the directory is sent it, as a join's outcome is; a
  guest reads it the next time it reads who is who. The replay's predicate leaves it out the same
  way.
- **The directory carries it** (`GET /v1/participants`, `face` on a person's row), core reads it into
  `Participant.face`, reads the directory again on the event, and `store.setMyFace` applies it at
  once and puts the old face back on a refusal, as an agent's face does (one write path for both).
- **Every screen that draws a person by id wears it**: a person's lines in a room, the room sheet's
  members, the media viewer, Search's message results (which now carry agents' faces too), and on
  the Mac and the web the sidebar's foot, You, and the workspace's people list.
- **On You, the face is a button** with a pen across its lower right, as the name has one beside it.
  It opens the icon sheet with you at its head in your circle and your role under your name.

### Your name, where it stands

- **A tap on your name makes it a field in place**, as a room's title and an agent's name are (ADR
  0112): the keys come up, the keyboard's done saves and keeps the field until the server answers, a
  name it turns away stays as typed with the reason in red, and a tap anywhere else puts the name
  back. Under the field, in place of your role, what the name is for.
- **Nothing under it moves.** The field's frame stands out round the name's own line, and the hint
  sits on the role's line height, so the list below does not shift by a point (measured on the
  simulator: identical pixel rows open and closed).
- `NameSheet` stays for the Agents tab's card, which still names an agent on a sheet (until the
  next day: see the addendum).

## Consequences

- Going live needs 4431 restarted, for migration 0040 and the new routes; a phone or Mac on this
  build against an older server says the face was not saved, as an icon on a server older than the
  app always has.
- No picker on the Mac or the web, as there is none there for a space's or an agent's face: they
  draw what was chosen on the phone.
- A person's face is one for everybody. A space's stays each person's own.
- Not walked on Android.

## Addendum, 8 October 2026: an agent's name in place on its card too

Arjun: "rename agents in place on the Agents tab too". The card in the Agents tab named an agent on
`NameSheet`, the last thing that did; it is deleted.

- **One component for a name changed where it stands, `ui/NameInPlace.tsx`**, taken from You's: the
  card's name, the room sheet's agent page (ADR 0112) and your own on You use it, where each had its
  own copy before. The same rules everywhere: a tap opens the field on the name as it is called (a
  fork's own name, without " · fork"), the keyboard's done saves and keeps the field until the
  server answers, a refusal stays as typed with the reason in red, a tap anywhere else puts the name
  back, and the keys take the screen's light or dark.
- **The room sheet's agent page no longer moves when its name opens.** Its field had padding of its
  own and pushed the page down; it now stands out round the name's line as You's does.
- **On the card the field stands at the start of the column beside the face**, its frame standing
  out to the left so the words do not move, and ending where the column does. The face sits at the
  top of the head rather than its middle: a name and the line under it are the face's height, so
  nothing changes while it is a name, and the face stays put while the field's words wrap.
- **What the name is for takes three lines beside the face** where the harness's name took one, so
  the rest of the card moves down for it on `GROWS` (Reanimated's layout transition, on the UI
  thread) and back up when the name closes. `LayoutAnimation` was tried first and moved it in one
  frame on the simulator, as it once did for the keyboard's padding in a sheet. Filmed: the close
  runs over about 170 ms, a step each frame; the open skips most of the way in one frame while the
  keys come up on the simulator, to be seen on the iPhone.
- **"@‑name" is written with a non-breaking hyphen**, since the narrow column broke it as "@-" and
  "name".

## Addendum, 9 October 2026: the sheet wears what it asked for

Arjun: "when I type into the text box, I see a flicker in the displayed icon". Filmed on the
simulator: at each save (the typing stopping for 0.6 s) the sheet's head went back to the face from
before for about 150 ms, then to the letters again. The store takes a pick at once, before the
server answers, but hands it to the screen on its next frame or later (`notify` coalesces a burst),
while the field let go of what it had typed at the save.

- **The sheet wears the face it last asked for until the store's face is a different one**
  (`IconSheet`'s `asked`, beside the store's face when it asked). Whatever the store says next, the
  pick itself or the old face after a refusal, is worn from then on. One rule for every pick:
  letters saved, a mark, a colour, the default.
- It also mends a colour tapped right after a mark, before the store had the mark: the colour was
  laid under the face from before, and the mark was lost.
- Filmed again: the head goes from the mark to the letters as each is typed, and nothing else.
